import * as THREE from "three";
import Peer, { type DataConnection } from "peerjs";
import type { Game } from "../game";
import { Player, type Appearance } from "../entities/player";
import { Creature } from "../entities/creatures";
import { SPECIES } from "../data/species";
import { ITEMS } from "../data/items";
import type { SavedStructure } from "../systems/building";
import type { Rules } from "../core/settings";
import type { WeatherKind } from "../systems/weather";
import type { DevNetAction, DevRpcArg, DevRpcMethod } from "../systems/developer";
import { DEV_UNLOCK_CODE } from "../core/developer";

/**
 * Online multiplayer (WebRTC via PeerJS, host-authoritative).
 *
 * - The HOST runs the full simulation (creatures, resources, structures, time, weather).
 * - GUESTS build the same island from the seed, but their creatures are puppets driven by
 *   host snapshots; every world-changing action (hit a creature, break a node, build, demolish,
 *   open doors, mount, feed...) is sent to the host, which applies it and broadcasts the result.
 * - Every client streams its own survivor state (~15 Hz) so everyone sees everyone move, jump,
 *   swim, attack, hold items, wear armor and ride.
 */

const PREFIX = "arkm2-room-";
const STATES = ["idle", "wander", "flee", "chase", "unconscious", "dead", "follow", "stay"] as const;

export interface PlayerNet {
  id: string; n: string;
  x: number; y: number; z: number; yaw: number;
  vx: number; vy: number; vz: number;
  g: number; sw: number; sp: number; s: number; h: string; r: number; d: number; im: number;
  cr?: number; // id of the flyer whose talons hold this player
  eq: (string | null)[]; hp: number; mhp: number;
  lk?: Appearance;
}

interface JoinInit {
  seed: number; rules: Rules; time: number; clock: number; day: number;
  structures: SavedStructure[]; nodes: [number, number][];
  weather: { kind: WeatherKind; timer: number };
  hostName: string;
}

type Msg =
  | { t: "hello"; name: string; look: Appearance }
  | { t: "init"; you: string; data: JoinInit }
  | { t: "p"; st: PlayerNet } // player state (client → host, host relays inside "s")
  | { t: "s"; pl: PlayerNet[]; c: (number | string)[][]; clk: number; tm: number; w?: [WeatherKind, number]; ss?: [number, number, number][] }
  | { t: "hit"; id: number; dmg: number; tor: number }
  | { t: "corpse"; id: number; tool?: string; pw: number; dmg: number }
  | { t: "give"; items: { item: string; qty: number }[]; xp?: number; why?: string }
  | { t: "nh"; id: number; dmg: number }
  | { t: "n"; id: number; a: number }
  | { t: "pl"; def: string; p: { x: number; y: number; z: number; rot: number; bottom: number } }
  | { t: "sa"; id: number; def: string; p: { x: number; y: number; z: number; rot: number; bottom: number } }
  | { t: "sr"; ids: number[] }
  | { t: "dm"; id: number; ni?: number }
  | { t: "door"; id: number }
  | { t: "mnt"; id: number }
  | { t: "mntNo"; id: number }
  | { t: "dmt"; id: number }
  | { t: "ride"; id: number; x: number; y: number; z: number; yaw: number; vx: number; vy: number; vz: number; fl: number }
  | { t: "grab"; cid: number; pid: string } // pilot → host: grab that player with the talons
  | { t: "grabbed"; cid: number } // host → player: you were grabbed
  | { t: "grabOk"; pid: string; name: string } // host → pilot
  | { t: "grabNo"; why: string } // host → pilot
  | { t: "drop"; cid: number } // pilot → host: release the passenger
  | { t: "dropped"; cid: number } // host → player: you were released
  | { t: "letgo"; cid: number } // player → host: I wriggled free
  | { t: "freed"; name: string } // host → pilot: passenger is gone
  | { t: "feed"; id: number; item: string }
  | { t: "cmd"; id: number; cmd?: string; stance?: string }
  | { t: "hurt"; to: string; dmg: number; x: number; z: number; src: string }
  | { t: "tor"; to: string; amt: number }
  | { t: "pvp"; to: string; dmg: number; from: string }
  | { t: "chat"; from: string; text: string }
  | { t: "dev"; action: DevNetAction } // host -> guest
  | { t: "devAuth"; key: string } // guest -> host; explicit DEV authorization
  | { t: "devReq"; method: DevRpcMethod; args: DevRpcArg[] } // guest -> host; allow-listed RPC
  | { t: "devResult"; ok: boolean; text: string } // host -> guest
  | { t: "bye"; id: string };

/** Visual-only survivor for another player. Reuses the Player rig + animation code. */
class RemoteAvatar {
  p = new Player();
  target = new THREE.Vector3();
  targetYaw = 0;
  st: PlayerNet | null = null;
  tag: THREE.Sprite;
  private tagText = "";
  lastSeen = performance.now();
  constructor(public id: string, scene: THREE.Scene) {
    scene.add(this.p.rig.root);
    this.tag = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, transparent: true }));
    this.tag.renderOrder = 31;
    scene.add(this.tag);
  }
  apply(st: PlayerNet) {
    this.st = st;
    this.lastSeen = performance.now();
    this.target.set(st.x, st.y, st.z);
    this.targetYaw = st.yaw;
    const p = this.p;
    if (st.lk) p.appearance = { ...p.appearance, ...st.lk };
    p.vel.set(st.vx, st.vy, st.vz);
    p.onGround = !!st.g;
    p.swimming = !!st.sw;
    p.sprinting = !!st.sp;
    if (st.s > p.swing + 0.3) p.swing = st.s; // new swing started
    p.dead = !!st.d;
    p.implantT = st.im;
    p.riding = st.r || null;
    // held item + armor pieces
    p.bar.slots[0] = st.h ? { id: st.h, qty: 1 } : null;
    p.selected = st.h ? 0 : -1;
    st.eq.forEach((id, i) => { p.equip.slots[i] = id && ITEMS[id] ? { id, qty: 1, dur: 1 } : null; });
    const label = `${st.n}`;
    if (label !== this.tagText) this.setTag(label);
  }
  private setTag(label: string) {
    this.tagText = label;
    const cv = document.createElement("canvas");
    cv.width = 256; cv.height = 48;
    const ctx = cv.getContext("2d")!;
    ctx.font = "bold 26px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.lineWidth = 5;
    ctx.strokeStyle = "rgba(0,0,0,0.85)";
    ctx.strokeText(label, 128, 32);
    ctx.fillStyle = "#9fe8ff";
    ctx.fillText(label, 128, 32);
    const m = this.tag.material as THREE.SpriteMaterial;
    m.map?.dispose();
    m.map = new THREE.CanvasTexture(cv);
    m.map.colorSpace = THREE.SRGBColorSpace;
    m.needsUpdate = true;
  }
  update(dt: number, time: number, game: Game, cam: THREE.Vector3) {
    const p = this.p;
    const st = this.st;
    if (!st) return;
    let riddenBy: Creature | undefined;
    if (st.r) riddenBy = game.creatures.get(st.r);
    const holder = st.cr ? game.creatures.get(st.cr) : undefined;
    if (holder?.rig.talonMount) {
      holder.rig.root.updateMatrixWorld(true);
      const at = new THREE.Vector3();
      holder.rig.talonMount.getWorldPosition(at);
      p.pos.copy(at).add(new THREE.Vector3(0, -1.55, 0));
      p.yaw = holder.yaw;
      p.onGround = false;
    } else if (riddenBy) {
      riddenBy.rig.root.updateMatrixWorld(true);
      const seat = new THREE.Vector3();
      riddenBy.rig.saddleMount.getWorldPosition(seat);
      p.pos.copy(seat).add(new THREE.Vector3(0, 0.12 - 0.55, 0));
      p.yaw = riddenBy.yaw;
    } else {
      if (p.pos.distanceTo(this.target) > 10) p.pos.copy(this.target);
      else p.pos.lerp(this.target, Math.min(1, dt * 12));
      let d = this.targetYaw - p.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      p.yaw += d * Math.min(1, dt * 12);
    }
    p.swing = Math.max(0, p.swing - dt * 3);
    p.updateHeld();
    p.animate(dt, time, 0);
    this.tag.visible = !p.dead && p.pos.distanceTo(cam) < 80;
    this.tag.position.set(p.pos.x, p.pos.y + 2.15 * p.appearance.height, p.pos.z);
    const k = Math.max(1, p.pos.distanceTo(cam) * 0.06);
    this.tag.scale.set(2 * k, 0.38 * k, 1);
  }
  dispose(scene: THREE.Scene) {
    scene.remove(this.p.rig.root);
    scene.remove(this.tag);
  }
}

export type NetRole = "off" | "host" | "guest";

export class Net {
  role: NetRole = "off";
  peer: Peer | null = null;
  code = "";
  myId = "local";
  conns = new Map<string, DataConnection>(); // host: guestId → conn ; guest: "host" → conn
  names = new Map<string, string>();
  avatars = new Map<string, RemoteAvatar>();
  status = "";
  private tick = 0;
  private slow = 0;
  private lookSentAt = 0;
  private pendingJoin: ((init: JoinInit) => void) | null = null;
  private localDevUnlocked = false;
  private devAuthorizedGuests = new Set<string>();
  private devReqWindow = new Map<string, number[]>();
  onChange: (() => void) | null = null;
  chat: { from: string; text: string; t: number }[] = [];

  constructor(private game: Game) {}

  get active() { return this.role !== "off"; }
  playerCount() { return 1 + this.avatars.size; }
  private emit() { this.onChange?.(); }

  // ------------------------------------------------------------------ lifecycle
  private newCode() {
    const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let s = "";
    for (let i = 0; i < 6; i++) s += A[Math.floor(Math.random() * A.length)];
    return s;
  }

  /** Open the current single-player world to other devices. Resolves with the room code. */
  host(): Promise<string> {
    if (this.role === "host") return Promise.resolve(this.code);
    this.close();
    return new Promise((resolve, reject) => {
      const code = this.newCode();
      const peer = new Peer(PREFIX + code, { debug: 1 });
      this.peer = peer;
      this.status = "Abrindo sala...";
      this.emit();
      peer.on("open", () => {
        this.role = "host";
        this.code = code;
        this.myId = "host";
        this.status = "Sala aberta";
        this.wireHostWorld();
        this.emit();
        resolve(code);
      });
      peer.on("connection", (conn) => this.acceptGuest(conn));
      peer.on("error", (e) => {
        console.warn("peer error", e);
        if (this.role !== "host") { this.status = "Falha ao abrir sala: " + (e.type ?? e.message); this.emit(); reject(e); this.close(); }
      });
      peer.on("disconnected", () => { try { peer.reconnect(); } catch { /* ignore */ } });
    });
  }

  /** Connect to a room. Resolves with the world init data once the host accepts. */
  join(code: string, name: string, look: Appearance): Promise<JoinInit> {
    this.close();
    code = code.trim().toUpperCase();
    return new Promise((resolve, reject) => {
      const peer = new Peer({ debug: 1 });
      this.peer = peer;
      this.status = "Conectando ao servidor...";
      this.emit();
      const fail = (why: string) => { this.status = why; this.emit(); reject(new Error(why)); this.close(); };
      const timer = setTimeout(() => fail("Tempo esgotado. Verifique o código da sala."), 20000);
      peer.on("error", (e) => { clearTimeout(timer); fail(e.type === "peer-unavailable" ? "Sala não encontrada. Confira o código." : "Erro de conexão: " + (e.type ?? e.message)); });
      peer.on("open", () => {
        this.status = "Entrando na sala " + code + "...";
        this.emit();
        const conn = peer.connect(PREFIX + code, { reliable: true, serialization: "json" });
        conn.on("open", () => {
          this.role = "guest";
          this.code = code;
          this.conns.set("host", conn);
          this.send(conn, { t: "hello", name, look });
          if (this.localDevUnlocked) this.send(conn, { t: "devAuth", key: DEV_UNLOCK_CODE });
        });
        conn.on("data", (d) => this.onGuestMsg(d as Msg));
        conn.on("close", () => { if (this.role === "guest") { this.game.notify("Conexão com o anfitrião perdida.", "warn"); this.game.leaveMultiplayer(); } });
        this.pendingJoin = (init) => { clearTimeout(timer); resolve(init); };
      });
    });
  }

  close() {
    if (this.role === "guest") { const c = this.conns.get("host"); if (c) this.send(c, { t: "bye", id: this.myId }); }
    for (const c of this.conns.values()) { try { c.close(); } catch { /* ignore */ } }
    this.conns.clear();
    this.devAuthorizedGuests.clear();
    this.devReqWindow.clear();
    for (const a of this.avatars.values()) a.dispose(this.game.scene);
    this.avatars.clear();
    this.names.clear();
    try { this.peer?.destroy(); } catch { /* ignore */ }
    this.peer = null;
    if (this.role === "host" && this.game.resources) this.game.resources.onChange = null;
    this.role = "off";
    this.code = "";
    this.status = "";
    this.emit();
  }

  private send(conn: DataConnection, m: Msg) {
    try { if (conn.open) conn.send(m); } catch (e) { console.warn("send failed", e); }
  }
  /** host → all guests (optionally except one) */
  broadcast(m: Msg, except?: string) {
    for (const [id, c] of this.conns) if (id !== except) this.send(c, m);
  }
  /** guest → host */
  toHost(m: Msg) {
    const c = this.conns.get("host");
    if (c) this.send(c, m);
  }
  setDeveloperUnlocked(v: boolean) {
    this.localDevUnlocked = !!v;
    if (this.role === "guest" && this.localDevUnlocked) this.toHost({ t: "devAuth", key: DEV_UNLOCK_CODE });
  }
  devRequest(method: DevRpcMethod, args: DevRpcArg[]) {
    if (this.role !== "guest" || !this.localDevUnlocked) throw new Error("Desbloqueie o DEV primeiro.");
    this.toHost({ t: "devReq", method, args });
  }
  private sendTo(pid: string, m: Msg) {
    const c = this.conns.get(pid);
    if (c) this.send(c, m);
  }
  devSend(pid: string, action: DevNetAction) {
    if (this.role === "host") this.sendTo(pid, { t: "dev", action });
  }
  devBroadcast(action: DevNetAction) {
    if (this.role === "host") this.broadcast({ t: "dev", action });
  }

  // ------------------------------------------------------------------ host side
  private wireHostWorld() {
    const g = this.game;
    g.resources.onChange = (n) => this.broadcast({ t: "n", id: n.id, a: n.respawnAt > 0 ? 0 : 1 });
  }

  private acceptGuest(conn: DataConnection) {
    const pid = "g" + Math.random().toString(36).slice(2, 8);
    conn.on("data", (d) => this.onHostMsg(pid, conn, d as Msg));
    conn.on("close", () => this.dropGuest(pid));
    conn.on("error", () => this.dropGuest(pid));
  }

  private dropGuest(pid: string) {
    if (!this.conns.has(pid)) return;
    this.conns.delete(pid);
    this.devAuthorizedGuests.delete(pid);
    this.devReqWindow.delete(pid);
    const name = this.names.get(pid) ?? "Jogador";
    this.names.delete(pid);
    const a = this.avatars.get(pid);
    if (a) { a.dispose(this.game.scene); this.avatars.delete(pid); }
    // release any talon grip involving them
    for (const c of this.game.creatures.list) if (c.talonPid === pid || c.talonPilot === pid) { c.talonPid = null; c.talonPilot = null; }
    // release any creature they were riding
    for (const c of this.game.creatures.list) if (c.remoteRider === pid) { c.remoteRider = null; c.rider = false; c.command = "stay"; c.state = "stay"; }
    this.game.notify(`${name} saiu da sala.`, "info");
    this.broadcast({ t: "bye", id: pid });
    this.emit();
  }

  private onHostMsg(pid: string, conn: DataConnection, m: Msg) {
    const g = this.game;
    try {
      switch (m.t) {
        case "devAuth": {
          if (m.key === DEV_UNLOCK_CODE && this.conns.get(pid) === conn) {
            this.devAuthorizedGuests.add(pid);
            this.sendTo(pid, { t: "chat", from: "Sistema", text: "DEV autorizado nesta sala." });
          }
          break;
        }
        case "devReq": {
          if (!this.devAuthorizedGuests.has(pid)) break;
          const now = Date.now();
          const recent = (this.devReqWindow.get(pid) ?? []).filter((t) => now - t < 1000);
          if (recent.length >= 25) {
            this.sendTo(pid, { t: "devResult", ok: false, text: "Muitos comandos DEV em pouco tempo." });
            break;
          }
          recent.push(now);
          this.devReqWindow.set(pid, recent);
          try {
            g.dev.applyHostRequest(pid, m.method, m.args);
            this.sendTo(pid, { t: "devResult", ok: true, text: "Comando DEV aplicado no mundo." });
          } catch (e) {
            this.sendTo(pid, { t: "devResult", ok: false, text: e instanceof Error ? e.message : "Não foi possível aplicar o comando DEV." });
          }
          break;
        }
        case "hello": {
          this.conns.set(pid, conn);
          this.names.set(pid, m.name || "Sobrevivente");
          const init: JoinInit = {
            seed: g.seed, rules: g.rules, time: g.time, clock: g.clock, day: g.day,
            structures: g.building.serialize(), nodes: g.resources.serialize(), weather: g.weather.serialize(),
            hostName: g.player.appearance.name,
          };
          this.send(conn, { t: "init", you: pid, data: init });
          g.notify(`${m.name || "Sobrevivente"} entrou na sala!`, "good");
          this.emit();
          break;
        }
        case "p": {
          m.st.id = pid;
          this.avatarFor(pid).apply(m.st);
          break;
        }
        case "hit": {
          const c = g.creatures.get(m.id);
          const av = this.avatars.get(pid);
          if (!c || !c.alive || !av) break;
          const killed = g.creatures.damage(c, m.dmg, m.tor, { kind: "player", pid }, av.p.pos);
          if (c.sp.reflect) this.sendTo(pid, { t: "hurt", to: pid, dmg: m.dmg * c.sp.reflect, x: c.pos.x, z: c.pos.z, src: `Espinhos do ${c.sp.name}` });
          if (killed) this.sendTo(pid, { t: "give", items: [], xp: c.sp.xp * (1 + c.level * 0.25), why: `Abateu ${c.name}` });
          break;
        }
        case "corpse": {
          const c = g.creatures.get(m.id);
          if (!c || c.alive) break;
          const got = g.creatures.harvestCorpse(c, m.tool as never, m.pw, m.dmg);
          this.sendTo(pid, { t: "give", items: got, xp: got.reduce((a, x) => a + x.qty, 0) * 0.4 });
          break;
        }
        case "nh": {
          const n = g.resources.byId(m.id);
          if (!n || n.respawnAt > 0) break;
          n.hp -= m.dmg;
          if (n.hp <= 0) g.resources.deplete(n, g.time);
          break;
        }
        case "pl": {
          const s = g.building.create(m.def, m.p);
          g.grass?.forceRefresh();
          this.broadcast({ t: "sa", id: s.id, def: m.def, p: m.p });
          break;
        }
        case "dm": {
          const s = g.building.get(m.id);
          if (!s) break;
          const removed = g.building.remove(s);
          this.broadcast({ t: "sr", ids: removed.map((r) => r.id) });
          const items: { item: string; qty: number }[] = removed.map((r) => ({ item: r.def.item, qty: 1 }));
          for (const r of removed) if (r.inv) for (const st of r.inv.slots) if (st) items.push({ item: st.id, qty: st.qty });
          this.sendTo(pid, { t: "give", items });
          break;
        }
        case "door": {
          const s = g.building.get(m.id);
          if (s && s.def.interact === "door") { g.building.toggleDoor(s); this.broadcastStructState(); }
          break;
        }
        case "mnt": {
          const c = g.creatures.get(m.id);
          const ok = !!c && c.tamed && c.alive && c.conscious && !!c.sp.rideable && c.age >= 1 && c.hasSaddle() && !c.rider && !c.remoteRider;
          if (!ok || !c) { this.sendTo(pid, { t: "mntNo", id: m.id }); break; }
          c.remoteRider = pid;
          c.rider = true;
          c.target = null;
          break;
        }
        case "dmt": {
          const c = g.creatures.get(m.id);
          if (c && c.remoteRider === pid) { c.remoteRider = null; c.rider = false; c.flying = false; c.command = "stay"; c.state = "stay"; c.home.copy(c.pos); }
          break;
        }
        case "ride": {
          const c = g.creatures.get(m.id);
          if (!c || c.remoteRider !== pid) break;
          c.pos.set(m.x, m.y, m.z);
          c.yaw = m.yaw;
          c.vel.set(m.vx, m.vy, m.vz);
          c.flying = !!m.fl;
          break;
        }
        case "grab": this.hostGrab(pid, m.cid, m.pid); break;
        case "drop": this.hostRelease(m.cid, pid); break;
        case "letgo": {
          const c = g.creatures.get(m.cid);
          if (c && c.talonPid === pid) this.hostRelease(m.cid, pid);
          break;
        }
        case "feed": {
          const c = g.creatures.get(m.id);
          if (!c || !c.alive) break;
          const def = ITEMS[m.item];
          if (!def) break;
          if (!c.tamed) c.ownerId = pid;
          if (def.torpor || (c.tamed && def.food)) {
            if (def.torpor) { c.torpor = Math.max(0, Math.min(c.maxTorpor, c.torpor + def.torpor)); }
            if (def.food) c.food = Math.min(c.maxFood, c.food + def.food);
          } else c.inventory.add(m.item, 1);
          break;
        }
        case "cmd": {
          const c = g.creatures.get(m.id);
          if (!c || !c.tamed) break;
          if (m.cmd) g.setCommand(c, m.cmd as never);
          if (m.stance) g.setStance(c, m.stance as never);
          break;
        }
        case "pvp": {
          if (m.to === "host") g.damagePlayer(m.dmg, this.avatars.get(pid)?.p.pos ?? null, this.names.get(pid) ?? "Jogador");
          else this.sendTo(m.to, { ...m, from: pid });
          break;
        }
        case "chat": {
          const msg = { t: "chat" as const, from: this.names.get(pid) ?? "?", text: String(m.text).slice(0, 140) };
          this.pushChat(msg.from, msg.text);
          this.broadcast(msg);
          break;
        }
        case "bye": this.dropGuest(pid); break;
      }
    } catch (e) {
      console.error("host msg failed", m, e);
    }
  }

  /** Host hooks: creature AI damages a remote player. */
  hurtRemote(pid: string, dmg: number, from: THREE.Vector3, src: string) {
    this.sendTo(pid, { t: "hurt", to: pid, dmg, x: from.x, z: from.z, src });
  }
  torporRemote(pid: string, amt: number) {
    this.sendTo(pid, { t: "tor", to: pid, amt });
  }
  // ------------------------------------------------------------------ talon passenger (Argentavis)
  private nameOf(pid: string) { return pid === this.myId ? this.game.player.appearance.name : this.names.get(pid) ?? "Jogador"; }

  /** Closest other player that a flyer could snatch from below (null when there is none). */
  nearestPlayerBelow(c: Creature): { pid: string; d: number; name: string } | null {
    if (!this.active) return null;
    const from = c.pos.clone().setY(c.pos.y - 1.6);
    let best: { pid: string; d: number; name: string } | null = null;
    for (const [pid, a] of this.avatars) {
      if (!a.st || a.st.d || a.st.r || a.st.cr) continue;
      const d = from.distanceTo(a.target.clone().setY(a.target.y + 0.9));
      if (d <= 4.5 && a.target.y < c.pos.y - 0.4 && (!best || d < best.d)) best = { pid, d, name: this.nameOf(pid) };
    }
    return best;
  }
  grabPlayer(c: Creature, pid: string) {
    if (this.role === "host") this.hostGrab(this.myId, c.id, pid);
    else this.toHost({ t: "grab", cid: c.id, pid });
  }
  dropPlayer(cid: number) {
    if (this.role === "host") this.hostRelease(cid, this.myId);
    else this.toHost({ t: "drop", cid });
  }
  /** The held player struggles free. */
  letGo(cid: number) {
    if (this.role === "host") this.hostRelease(cid, this.myId);
    else this.toHost({ t: "letgo", cid });
  }
  private tell(pid: string, m: Msg) { if (pid === this.myId) return false; this.sendTo(pid, m); return true; }

  private hostGrab(pilot: string, cid: number, target: string) {
    const g = this.game;
    const c = g.creatures.get(cid);
    const no = (why: string) => { if (!this.tell(pilot, { t: "grabNo", why })) g.notify(why, "warn"); };
    const piloting = !!c && c.rider && c.alive && (pilot === this.myId ? g.riding === c : c.remoteRider === pilot);
    if (!c || !piloting || !c.sp.carryPlayers || !c.flying) return no("Só é possível agarrar um jogador em pleno voo.");
    if (c.talonPid) return no("As garras já estão ocupadas.");
    if (target === pilot) return;
    let pos: THREE.Vector3 | null = null;
    if (target === this.myId) {
      const p = g.player;
      if (!p.dead && !g.riding && !g.grabbedBy) pos = p.pos;
    } else {
      const a = this.avatars.get(target);
      if (a?.st && !a.st.d && !a.st.r && !a.st.cr) pos = a.target;
    }
    if (!pos) return no("Esse jogador não pode ser agarrado agora.");
    const d = c.pos.clone().setY(c.pos.y - 1.6).distanceTo(pos.clone().setY(pos.y + 0.9));
    if (d > 5.5 || pos.y > c.pos.y - 0.2) return no("Jogador fora de alcance: voe mais perto, por cima dele.");
    c.talonPid = target;
    c.talonPilot = pilot;
    const name = this.nameOf(target);
    if (target === this.myId) g.gotGrabbed(c);
    else this.sendTo(target, { t: "grabbed", cid });
    if (pilot === this.myId) { g.carriedPlayer = target; g.carriedPlayerName = name; g.notify(`Agarrou ${name}!`, "good"); }
    else this.sendTo(pilot, { t: "grabOk", pid: target, name });
  }
  /** Release whoever hangs from this flyer (pilot request, passenger request or automatic). */
  private hostRelease(cid: number, _by: string) {
    const g = this.game;
    const c = g.creatures.get(cid);
    if (!c || !c.talonPid) return;
    const target = c.talonPid, pilot = c.talonPilot;
    c.talonPid = null;
    c.talonPilot = null;
    const name = this.nameOf(target);
    if (target === this.myId) g.gotDropped();
    else this.sendTo(target, { t: "dropped", cid });
    if (pilot === this.myId) { g.carriedPlayer = null; g.carriedPlayerName = null; g.notify(`Soltou ${name}.`, "info"); }
    else if (pilot) this.sendTo(pilot, { t: "freed", name });
  }
  /** Host, ~15×/s: let go when the flyer lands, dies, loses its rider, or the passenger leaves / dies. */
  private checkTalons() {
    const g = this.game;
    for (const c of g.creatures.list) {
      if (!c.talonPid) continue;
      const t = c.talonPid;
      const alive = t === this.myId ? !g.player.dead : (() => { const a = this.avatars.get(t); return !!a?.st && !a.st.d; })();
      const low = c.pos.y - g.terrain.heightAt(c.pos.x, c.pos.z) < 1.4;
      if (!c.alive || !c.rider || !alive || (!c.flying && low)) this.hostRelease(c.id, this.myId);
    }
  }

  remotePlayers() {
    const out: { pid: string; pos: THREE.Vector3; yaw: number; alive: boolean; inWater: boolean }[] = [];
    for (const [pid, a] of this.avatars) if (a.st) out.push({ pid, pos: a.target, yaw: a.targetYaw, alive: !a.st.d, inWater: !!a.st.sw || a.target.y < 0.1 });
    return out;
  }

  private broadcastStructState() {
    const ss: [number, number, number][] = this.game.building.list.filter((s) => s.def.interact === "door" || s.def.interact === "campfire" || s.def.interact === "forge").map((s) => [s.id, s.lit ? 1 : 0, s.open ? 1 : 0]);
    this.broadcast({ t: "s", pl: [], c: [], clk: this.game.clock, tm: this.game.time, ss });
  }

  // ------------------------------------------------------------------ guest side
  private onGuestMsg(m: Msg) {
    const g = this.game;
    try {
      switch (m.t) {
        case "dev": g.dev.applyRemote(m.action); break;
        case "devResult": g.notify(m.text, m.ok ? "good" : "warn"); break;
        case "init":
          this.myId = m.you;
          this.names.set("host", m.data.hostName);
          this.pendingJoin?.(m.data);
          this.pendingJoin = null;
          break;
        case "s": {
          if (g.state !== "playing") break;
          const seen = new Set<string>();
          for (const st of m.pl) {
            if (st.id === this.myId) continue;
            seen.add(st.id);
            this.names.set(st.id, st.n);
            this.avatarFor(st.id).apply(st);
          }
          if (m.pl.length) for (const [id, a] of this.avatars) if (!seen.has(id) && performance.now() - a.lastSeen > 4000) { a.dispose(g.scene); this.avatars.delete(id); }
          this.applyCreatures(m.c);
          if (m.clk !== undefined) {
            if (Math.abs(g.clock - m.clk) > 3) g.clock = m.clk;
            g.time = m.tm;
          }
          if (m.w && g.weather.kind !== m.w[0]) g.weather.load({ kind: m.w[0], timer: m.w[1] });
          if (m.ss) for (const [id, lit, open] of m.ss) {
            const s = g.building.get(id);
            if (!s) continue;
            s.lit = !!lit;
            if (s.open !== !!open) g.building.toggleDoor(s);
          }
          break;
        }
        case "n": {
          const n = g.resources.byId(m.id);
          if (n) g.resources.setAlive(n, !!m.a, g.time);
          break;
        }
        case "sa": {
          if (!g.building.get(m.id)) { g.building.create(m.def, m.p, m.id); g.grass?.forceRefresh(); }
          break;
        }
        case "sr": {
          for (const id of m.ids) { const s = g.building.get(id); if (s) g.building.remove(s, false); }
          break;
        }
        case "give": {
          if (m.items.length) g.giveItems(m.items.filter((x) => ITEMS[x.item]));
          if (m.xp) g.giveXp(m.xp, m.why);
          break;
        }
        case "hurt": {
          g.damagePlayer(m.dmg, new THREE.Vector3(m.x, g.player.pos.y, m.z), m.src);
          break;
        }
        case "tor": {
          g.player.torpor = Math.min(g.player.max("torpor"), g.player.torpor + m.amt);
          break;
        }
        case "pvp": {
          g.damagePlayer(m.dmg, this.avatars.get(m.from)?.p.pos ?? null, this.names.get(m.from) ?? "Jogador");
          break;
        }
        case "grabbed": {
          const c = g.creatures.get(m.cid);
          if (c) g.gotGrabbed(c);
          break;
        }
        case "dropped": g.gotDropped(); break;
        case "grabOk": g.carriedPlayer = m.pid; g.carriedPlayerName = m.name; g.notify(`Agarrou ${m.name}!`, "good"); break;
        case "grabNo": g.notify(m.why, "warn"); break;
        case "freed": g.carriedPlayer = null; g.carriedPlayerName = null; g.notify(`${m.name} foi solto.`, "info"); break;
        case "mntNo": {
          if (g.riding && g.riding.id === m.id) { g.dismount(true); g.notify("Não foi possível montar (ocupada ou sem sela).", "warn"); }
          break;
        }
        case "chat": this.pushChat(m.from, m.text); break;
        case "bye": {
          const a = this.avatars.get(m.id);
          if (a) { a.dispose(g.scene); this.avatars.delete(m.id); g.notify(`${this.names.get(m.id) ?? "Jogador"} saiu.`, "info"); }
          break;
        }
      }
    } catch (e) {
      console.error("guest msg failed", m, e);
    }
  }

  private applyCreatures(list: (number | string)[][]) {
    const g = this.game;
    const now = performance.now();
    for (const r of list) {
      const [id, sp, lvl, x, y, z, yaw, vx, vz, st, hp, mhp, tor, mtor, flags, name, age, atk] = r as [number, string, number, number, number, number, number, number, number, number, number, number, number, number, number, string, number, number];
      if (!SPECIES[sp]) continue;
      let c = g.creatures.get(id);
      if (!c) {
        c = new Creature(sp, lvl);
        c.id = id;
        c.pos.set(x, y, z);
        c.yaw = yaw;
        g.creatures.add(c);
      }
      if (g.riding === c) { c.netSeen = now; continue; } // I'm driving this one
      c.netPos.set(x, y, z);
      c.netYaw = yaw;
      c.netSeen = now;
      c.vel.set(vx, 0, vz);
      const ns = STATES[st] ?? "idle";
      if (ns !== c.state) { if (ns === "dead") c.deadAt = g.time; c.state = ns; }
      c.health = hp; c.maxHealth = mhp; c.torpor = tor; c.maxTorpor = mtor;
      c.level = lvl;
      c.tamed = !!(flags & 1);
      c.flying = !!(flags & 2);
      c.swimming = !!(flags & 4);
      const saddle = !!(flags & 8);
      if (c.netSaddle !== saddle) { c.netSaddle = saddle; c.inventory.touch(); }
      c.rider = !!(flags & 16);
      c.gender = flags & 32 ? "F" : "M";
      if (!!(flags & 128) !== c.sleeping) { c.sleeping = !!(flags & 128); c.animT = 0; }
      c.nightNow = this.game.dayFactor() < 0.3;
      if (flags & 64) c.taming = c.taming ?? { affinity: 0, needed: 1, effectiveness: 100, eatTimer: 0, foodEaten: 0, tamer: "player" };
      else c.taming = null;
      if (c.taming) c.taming.affinity = (flags >> 8) / 100;
      c.name = name;
      c.age = age;
      if (atk !== c.netAtk) { c.netAtk = atk; c.attackAnim = 1; }
    }
  }

  // ------------------------------------------------------------------ both
  private avatarFor(pid: string) {
    let a = this.avatars.get(pid);
    if (!a) { a = new RemoteAvatar(pid, this.game.scene); this.avatars.set(pid, a); this.emit(); }
    return a;
  }

  private pushChat(from: string, text: string) {
    this.chat.push({ from, text, t: performance.now() });
    if (this.chat.length > 20) this.chat.shift();
    this.game.notify(`${from}: ${text}`, "info");
    this.emit();
  }
  sendChat(text: string) {
    text = text.trim().slice(0, 140);
    if (!text) return;
    const me = this.game.player.appearance.name;
    this.pushChat(me, text);
    if (this.role === "host") this.broadcast({ t: "chat", from: me, text });
    else this.toHost({ t: "chat", from: me, text });
  }

  private myState(): PlayerNet {
    const g = this.game, p = g.player;
    const st: PlayerNet = {
      id: this.myId, n: p.appearance.name,
      x: +p.pos.x.toFixed(2), y: +p.pos.y.toFixed(2), z: +p.pos.z.toFixed(2), yaw: +p.yaw.toFixed(3),
      vx: +p.vel.x.toFixed(2), vy: +p.vel.y.toFixed(2), vz: +p.vel.z.toFixed(2),
      g: p.onGround ? 1 : 0, sw: p.swimming ? 1 : 0, sp: p.sprinting ? 1 : 0, s: +p.swing.toFixed(2),
      h: p.heldId && p.heldId !== "__rebuild" ? p.heldId : "", r: g.riding ? g.riding.id : 0, cr: g.grabbedBy ? g.grabbedBy.id : 0, d: p.dead ? 1 : 0, im: +p.implantT.toFixed(2),
      eq: p.equip.slots.map((s) => s?.id ?? null), hp: Math.round(p.health), mhp: p.max("health"),
    };
    const now = performance.now();
    if (now - this.lookSentAt > 2000) { this.lookSentAt = now; st.lk = p.appearance; }
    return st;
  }

  private creatureRow(c: Creature): (number | string)[] {
    const flags = (c.tamed ? 1 : 0) | (c.flying ? 2 : 0) | (c.swimming ? 4 : 0) | (c.hasSaddle() ? 8 : 0) | (c.rider ? 16 : 0) | (c.gender === "F" ? 32 : 0) | (c.taming ? 64 : 0) | (c.sleeping ? 128 : 0)
      | (c.taming ? Math.round(Math.min(1, c.taming.affinity / c.taming.needed) * 100) << 8 : 0);
    if (c.attackAnim > 0.95) c.netAtk = (c.netAtk + 1) % 1000;
    return [c.id, c.sp.id, c.level, +c.pos.x.toFixed(2), +c.pos.y.toFixed(2), +c.pos.z.toFixed(2), +c.yaw.toFixed(3), +c.vel.x.toFixed(2), +c.vel.z.toFixed(2),
      Math.max(0, STATES.indexOf(c.state as (typeof STATES)[number])), Math.round(c.health), Math.round(c.maxHealth), Math.round(c.torpor), Math.round(c.maxTorpor), flags, c.name, +c.age.toFixed(3), c.netAtk];
  }

  /** Called every frame while playing. */
  update(dt: number) {
    if (!this.active) return;
    const g = this.game;
    this.tick += dt;
    this.slow += dt;
    const cam = g.camera.position;
    for (const a of this.avatars.values()) a.update(dt, g.time, g, cam);
    // which flyers currently hold somebody (drives the leg pose on every client)
    const held = new Set<number>();
    if (g.grabbedBy) held.add(g.grabbedBy.id);
    for (const a of this.avatars.values()) if (a.st?.cr) held.add(a.st.cr);
    for (const c of g.creatures.list) if (c.sp.carryPlayers) c.talonHeld = held.has(c.id);
    if (this.tick < 1 / 15) return;
    this.tick = 0;
    if (this.role === "host") this.checkTalons();
    const me = this.myState();
    if (this.role === "guest") {
      this.toHost({ t: "p", st: me });
      if (g.riding) {
        const c = g.riding;
        this.toHost({ t: "ride", id: c.id, x: +c.pos.x.toFixed(2), y: +c.pos.y.toFixed(2), z: +c.pos.z.toFixed(2), yaw: +c.yaw.toFixed(3), vx: +c.vel.x.toFixed(2), vy: +c.vel.y.toFixed(2), vz: +c.vel.z.toFixed(2), fl: c.flying ? 1 : 0 });
      }
      return;
    }
    // host: per-guest snapshot (players + creatures near that guest)
    if (g.resources.onChange === null) this.wireHostWorld();
    const players: PlayerNet[] = [me];
    for (const [pid, a] of this.avatars) if (a.st) players.push({ ...a.st, id: pid });
    const withW = this.slow > 2;
    let ss: [number, number, number][] | undefined;
    if (withW) {
      this.slow = 0;
      ss = g.building.list.filter((s) => s.def.interact === "door" || s.def.interact === "campfire" || s.def.interact === "forge").map((s) => [s.id, s.lit ? 1 : 0, s.open ? 1 : 0]);
    }
    for (const [pid, conn] of this.conns) {
      const av = this.avatars.get(pid);
      const center = av ? av.target : g.player.pos;
      const cs = g.creatures.list.filter((c) => c.pos.distanceTo(center) < 150 && c.remoteRider !== pid).map((c) => this.creatureRow(c));
      // include the creature this guest rides so it keeps existing on their side
      this.send(conn, { t: "s", pl: players.filter((x) => x.id !== pid).map((x) => (withW ? x : { ...x, lk: undefined })), c: cs, clk: g.clock, tm: g.time, w: withW ? [g.weather.kind, 300] : undefined, ss });
    }
  }

  /** Melee against another survivor (PvP). Returns true if someone was hit. */
  tryMeleePlayer(from: THREE.Vector3, yaw: number, range: number, dmg: number): boolean {
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    for (const [pid, a] of this.avatars) {
      if (!a.st || a.st.d) continue;
      const dx = a.p.pos.x - from.x, dz = a.p.pos.z - from.z;
      const d = Math.hypot(dx, dz);
      if (d > range + 0.4 || Math.abs(a.p.pos.y - from.y) > 2) continue;
      if ((dx * fx + dz * fz) / (d || 1) < 0.5) continue;
      const m: Msg = { t: "pvp", to: pid, dmg, from: this.myId };
      if (this.role === "host") this.sendTo(pid, m);
      else this.toHost(m);
      this.game.fx.burst("blood", a.p.pos.clone().add(new THREE.Vector3(0, 1.2, 0)), 8);
      return true;
    }
    return false;
  }

  players() {
    const list = [{ id: this.myId, name: this.game.player.appearance.name + " (você)", host: this.role === "host" }];
    if (this.role === "guest") list.push({ id: "host", name: (this.names.get("host") ?? "Anfitrião") + " (anfitrião)", host: true });
    for (const [pid, a] of this.avatars) if (pid !== "host") list.push({ id: pid, name: a.st?.n ?? this.names.get(pid) ?? "Jogador", host: false });
    return list;
  }
}
