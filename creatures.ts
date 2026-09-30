import * as THREE from "three";
import { SPECIES, SPECIES_LIST, type Species, statAtLevel, type Biome } from "../data/species";
import { CONFIG } from "../core/config";
import { Container, type ItemStack } from "../systems/container";
import { buildCreature, buildSaddle, type CreatureRig } from "./models";
import { animateDoedicurus } from "./doedicurus";
import { animateArgentavis } from "./argentavis";
import type { Terrain } from "../world/terrain";
import type { Physics } from "../world/physics";
import { raySphere } from "../world/physics";
import { toolClass } from "../world/resources";
import type { ToolKind } from "../data/items";
import { ITEMS } from "../data/items";
import { effective, type Rules } from "../core/settings";

export type AIState = "idle" | "wander" | "flee" | "chase" | "unconscious" | "dead" | "follow" | "stay";
export type Command = "follow" | "stay" | "wander";
export type Stance = "passive" | "neutral" | "aggressive";

export interface Taming {
  affinity: number;
  needed: number;
  effectiveness: number;
  eatTimer: number;
  foodEaten: number;
  tamer: "player";
}

/** Anything that can be attacked by creatures. */
export interface Target {
  kind: "player" | "creature";
  pid?: string; // multiplayer: remote player id (undefined = local player)
  creature?: Creature;
}

export interface CreatureHooks {
  terrain: Terrain;
  physics: Physics;
  playerPos: () => THREE.Vector3;
  playerAlive: () => boolean;
  /** Vertical extent [bottom, top] of what wild creatures can hit: the player, or the whole mount while riding. */
  playerBox?: () => [number, number];
  damagePlayer: (amount: number, from: THREE.Vector3, source: string, pid?: string) => void;
  /** Multiplayer (host): all living players to consider for AI targeting / despawn radius. */
  players?: () => { pid: string; pos: THREE.Vector3; alive: boolean; inWater: boolean }[];
  notify: (text: string, kind?: "info" | "warn" | "good") => void;
  onTamed: (c: Creature) => void;
  onKilled: (c: Creature, byPlayer: boolean) => void;
  sound: (name: string, pos: THREE.Vector3, vol?: number) => void;
  structureBlocked: (x: number, z: number) => boolean;
  easySpawnDistance: (x: number, z: number) => number;
  now: () => number;
  isNight: () => boolean;
  attackStructure: (c: Creature, dmg: number) => boolean;
  layEgg: (mother: Creature, father: Creature) => void;
  playerInWater: () => boolean;
  torporPlayer: (amount: number, pid?: string) => void;
  rules: () => Rules;
}

let NEXT_ID = 1;

export class Creature {
  id = NEXT_ID++;
  sp: Species;
  name: string;
  pos = new THREE.Vector3();
  vel = new THREE.Vector3();
  yaw = Math.random() * Math.PI * 2;
  home = new THREE.Vector3();
  level: number;
  maxHealth: number;
  health: number;
  damageMult: number;
  maxTorpor: number;
  torpor = 0;
  torporRecoverDelay = 0;
  food: number;
  maxFood: number;
  state: AIState = "idle";
  stateTimer = 0;
  target: Target | null = null;
  lastAttacker: Target | null = null;
  moveTo = new THREE.Vector3();
  attackCd = 0;
  attackAnim = 0;
  hurtFlash = 0;
  walkPhase = Math.random() * 10;
  onGround = true;
  stuckTimer = 0;
  chaseTimer = 0;
  tamed = false;
  ownerId = "host"; // recorded with tames for recovery and multiplayer ownership
  command: Command = "follow";
  stance: Stance = "neutral";
  inventory = new Container(12);
  taming: Taming | null = null;
  deadAt = 0;
  harvestLeft: Record<string, number> = {};
  corpseHp = 100;
  rig: CreatureRig;
  soundTimer = 5 + Math.random() * 15;
  xp = 0;
  fleeFrom = new THREE.Vector3();
  animT = 0;
  turnRate = 0;
  roarTimer = 0;
  grazeTimer = 0;
  lookTarget: THREE.Vector3 | null = null;
  swimming = false;
  // --- Part 3: breeding, growth, leveling, riding
  gender: "M" | "F" = Math.random() < 0.5 ? "M" : "F";
  mating = false;
  mateProgress = 0;
  mateCooldown = 0;
  age = 1; // 0 = newborn, 1 = adult
  imprint = 0;
  imprintTimer = 90;
  imprintRequest: "cuddle" | "feed" | null = null;
  stamina = 100;
  maxStamina = 100;
  rider = false;
  flying = false;
  cruiseAlt = 18;
  statLv: Record<"health" | "damage" | "stamina" | "speed" | "weight", number> = { health: 0, damage: 0, stamina: 0, speed: 0, weight: 0 };
  statPoints = 0;
  baseScale = 1;
  saddleVer = -1;
  structTimer = 0;
  enraged = 0; // seconds of retaliation sprint (Pachy)
  quadT = 0; // Spinosaurus quadrupedal blend
  // ---- multiplayer
  netSaddle: boolean | undefined = undefined; // guest: saddle flag from host snapshot
  netPos = new THREE.Vector3(); // guest: interpolation target
  netYaw = 0;
  netSeen = 0;
  netAtk = 0;
  talonPid: string | null = null; // host: player currently held in this flyer's talons
  talonPilot: string | null = null; // host: player piloting it ("host" for the host player)
  talonHeld = false; // every client: a player hangs from its talons (drives the leg pose)
  remoteRider: string | null = null; // host: id of the remote player riding this creature
  annoy = 0; // Kentrosaurus: seconds the player has been too close
  rage = 0; // Giganotosaurus rage meter 0..1
  landedT = 0; // wild flyer resting on the ground
  wantLand = false;
  carried = false; // held in a flyer's talons
  rollT = 0; // barrel roll (ridden flyer)
  rolling = false; // Doedicurus armoured ball roll
  rollSpin = 0;
  rollBlend = 0; // 0..1 smooth transition into the ball
  rollDust = 0;
  rollTimer = 0;
  attackSide = 0; // which side the tail-club swing comes from
  scavTarget: Creature | null = null; // carcass a wild scavenger is heading to
  scavT = 0; // re-scan timer
  scavCd = 0; // cooldown after a meal
  scavEat = 0; // seconds spent eating the current meal
  unreachT = 0; // seconds the current target has been out of vertical reach (flyer above / ground below)
  sleeping = false; // Megalosaurus day sleep
  nightNow = false;
  irisMats: THREE.MeshStandardMaterial[] = [];

  constructor(species: string, level: number) {
    this.sp = SPECIES[species];
    this.level = level;
    this.name = this.sp.name;
    this.maxHealth = statAtLevel(this.sp.health, level, 0.12);
    this.health = this.maxHealth;
    this.damageMult = 1 + 0.03 * (level - 1);
    this.maxTorpor = statAtLevel(this.sp.torpor, level, 0.07);
    this.maxFood = 100 + level * 5;
    this.food = this.maxFood * (0.6 + Math.random() * 0.3);
    this.baseScale = 1 + level * 0.006;
    this.rig = buildCreature(this.sp.model, this.sp.id + (this.sp.id === "dodo" && this.gender === "F" ? "_f" : ""), this.baseScale);
    this.maxStamina = this.stamina = this.sp.stamina ?? 150;
    this.rig.root.traverse((o) => { if (o.name === "iris") this.irisMats.push((o as THREE.Mesh).material as THREE.MeshStandardMaterial); });
    this.rig.root.userData.creature = this;
  }

  get alive() {
    return this.state !== "dead";
  }
  get conscious() {
    return this.state !== "dead" && this.state !== "unconscious";
  }
  get centerY() {
    return this.pos.y + this.sp.height * 0.55 * (0.3 + 0.7 * this.age);
  }
  get enragedMult() {
    return this.enraged > 0 ? 1.35 : 1;
  }
  get growth() {
    return 0.3 + 0.7 * this.age;
  }
  hitRadius() {
    return Math.max(this.sp.radius * 1.25, this.sp.height * 0.42) * this.growth;
  }
  speedFor(running: boolean) {
    if (this.rolling && this.sp.rollSpeed) return this.sp.rollSpeed * (1 + this.statLv.speed * 0.03) * (0.6 + 0.4 * this.age);
    return (running ? this.sp.runSpeed * this.enragedMult : this.sp.speed) * (this.sp.nocturnal && !this.nightNow && !this.tamed ? 0.7 : 1) * (1 + this.statLv.speed * 0.03) * (0.6 + 0.4 * this.age) * (this.swimming && this.sp.waterSpeed ? this.sp.waterSpeed : 1);
  }
  hasSaddle() {
    if (this.netSaddle !== undefined) return this.netSaddle;
    return this.inventory.slots.some((s) => s && ITEMS[s.id]?.saddle?.species === this.sp.id);
  }
  saddleArmor() {
    const s = this.inventory.slots.find((x) => x && ITEMS[x.id]?.saddle?.species === this.sp.id);
    return s ? ITEMS[s.id].saddle!.armor : 0;
  }
  maxWeight() {
    return (this.sp.weight ?? 150) * (1 + this.statLv.weight * 0.05);
  }
  xpToNext() {
    return 60 + this.level * 12;
  }
  /** Re-derive stats from level, stat allocation, imprinting and growth. */
  recompute(tamedBonus = true) {
    const ratio = this.maxHealth > 0 ? this.health / this.maxHealth : 1;
    const imp = 1 + this.imprint * 0.2;
    this.maxHealth = statAtLevel(this.sp.health, this.level, 0.12) * (tamedBonus && this.tamed ? 1.1 : 1) * (1 + this.statLv.health * 0.06) * imp * (0.2 + 0.8 * this.age);
    this.health = Math.max(1, this.maxHealth * ratio);
    this.damageMult = (this.tamed ? 1.1 : 1) + 0.03 * (this.level - 1) + this.statLv.damage * 0.05 + this.imprint * 0.2;
    this.maxStamina = (this.sp.stamina ?? 150) * (1 + this.statLv.stamina * 0.08) * imp;
    this.maxTorpor = statAtLevel(this.sp.torpor, this.level, 0.07);
  }
}

export interface SavedCreature {
  species: string;
  ownerId?: string;
  level: number;
  name: string;
  pos: [number, number, number];
  yaw: number;
  health: number;
  food: number;
  command: Command;
  stance: Stance;
  inv: (ItemStack | null)[];
  xp: number;
  gender?: "M" | "F";
  age?: number;
  imprint?: number;
  mating?: boolean;
  mateCooldown?: number;
  statLv?: Creature["statLv"];
  statPoints?: number;
}

const tmpV = new THREE.Vector3();

export class CreatureManager {
  list: Creature[] = [];
  private spawnTimer = 0;
  stagger = true;
  /** Multiplayer guest: creatures are puppets driven by host snapshots (no AI/spawn/damage locally). */
  puppet = false;
  netHook: { hit: (id: number, dmg: number, torpor: number) => void; corpse: (id: number, tool: string | undefined, power: number, dmg: number) => void } | null = null;
  private curPid: string | undefined = undefined;
  private frame = 0;
  constructor(private scene: THREE.Scene, private h: CreatureHooks) {}

  get(id: number) {
    return this.list.find((c) => c.id === id);
  }

  add(c: Creature) {
    this.list.push(c);
    this.scene.add(c.rig.root);
    c.rig.root.position.copy(c.pos);
  }

  remove(c: Creature) {
    const i = this.list.indexOf(c);
    if (i >= 0) this.list.splice(i, 1);
    this.scene.remove(c.rig.root);
    c.rig.root.traverse((o) => {
      if ((o as THREE.Mesh).geometry) (o as THREE.Mesh).geometry.dispose();
    });
    for (const m of c.rig.materials) m.dispose();
  }

  spawn(species: string, x: number, z: number, level?: number): Creature {
    const lvl = level ?? rollLevel(effective(this.h.rules()).maxLevel);
    const c = new Creature(species, lvl);
    c.pos.set(x, this.h.terrain.heightAt(x, z), z);
    if (c.sp.movement === "fly") { c.pos.y += 15; c.flying = true; }
    c.home.copy(c.pos);
    this.add(c);
    return c;
  }

  clear() {
    for (const c of [...this.list]) this.remove(c);
  }

  // ------------------------------------------------------------ damage & taming
  /** Returns true if killed. */
  damage(c: Creature, dmg: number, torpor: number, from: Target | null, fromPos: THREE.Vector3 | null): boolean {
    if (!c.alive) return false;
    if (from?.pid && !c.tamed) c.ownerId = from.pid;
    if (c.sleeping) { c.sleeping = false; c.roarTimer = 1; } // woken up angry
    if (this.puppet) { c.hurtFlash = 0.25; this.netHook?.hit(c.id, dmg, torpor); return false; } // guest → host is authoritative
    if (c.sp.packBonus && this.packSize(c) >= 2) dmg *= 0.75; // pack resistance
    if (c.sp.armorMult) dmg *= c.sp.armorMult; // thick armor (Ankylosaurus)
    if (c.sp.rage && dmg > 0) {
      c.rage = Math.min(1, c.rage + (dmg / c.maxHealth) * 6);
      if (c.rage >= 0.5 && c.enraged <= 0) { c.enraged = 25; c.roarTimer = 1.2; this.h.sound("roar", c.pos, 1); if (!c.tamed) this.h.notify(`${c.name} está enfurecido!`, "warn"); }
    }
    if (c.landedT > 0) c.landedT = 0; // startled flyers take off
    c.health -= dmg;
    c.hurtFlash = 0.25;
    if (torpor > 0 && c.conscious) {
      c.torpor = Math.min(c.maxTorpor, c.torpor + torpor);
      c.torporRecoverDelay = 4;
    }
    if (c.taming && dmg > 0) c.taming.effectiveness = Math.max(0, c.taming.effectiveness - (dmg / c.maxHealth) * 40);
    if (c.health <= 0) {
      this.kill(c, from?.kind === "player");
      return true;
    }
    this.h.sound(c.sp.sounds.hurt, c.pos, 0.8);
    if (c.conscious && c.torpor >= c.maxTorpor) {
      this.knockOut(c);
      return false;
    }
    if (c.conscious && from) {
      c.lastAttacker = from;
      this.react(c, from, fromPos);
    }
    return false;
  }

  private react(c: Creature, from: Target, fromPos: THREE.Vector3 | null) {
    if (c.tamed) {
      if (c.stance !== "passive" && !(from.kind === "player")) this.setTarget(c, from);
      return;
    }
    const t = c.sp.temperament;
    // anything that can't / won't fight back runs away (Dodo, Gallimimus, Parasaur, Diplodocus, Pteranodon...)
    const harmless = c.sp.damage <= 0 || t === "oblivious" || t === "skittish" || (t === "passive" && !c.sp.retaliates) || (t === "curious" && this.packSize2(c) < 1);
    if (harmless) {
      this.startFlee(c, fromPos ?? this.targetPos(from));
    } else {
      // defensive / docile / territorial / aggressive / retaliating-passive: fight back
      this.setTarget(c, from);
      if (c.sp.retaliates) c.enraged = 20; // (don't clear rage built by other mechanics, e.g. Giganotosaurus)
      // herd defence: nearby docile/defensive members of the same species join in
      if (t === "docile" || t === "defensive" || c.sp.retaliates) for (const o of this.list) if (o !== c && o.sp.id === c.sp.id && !o.tamed && o.conscious && o.pos.distanceTo(c.pos) < 20 && o.state !== "chase") this.setTarget(o, from);
    }
  }

  private startFlee(c: Creature, from: THREE.Vector3) {
    c.state = "flee";
    c.stateTimer = 6 + Math.random() * 4;
    c.fleeFrom.copy(from);
    c.target = null;
  }

  private setTarget(c: Creature, t: Target) {
    if (t.kind === "player" && t.pid === undefined && this.curPid) t = { ...t, pid: this.curPid };
    if (t.kind === "creature" && (!t.creature || t.creature === c)) return;
    const fresh = c.state !== "chase";
    c.target = t;
    c.state = "chase";
    c.chaseTimer = 0;
    if (fresh && !c.tamed && c.sp.temperament === "aggressive" && t.kind === "player") {
      c.roarTimer = 1.0;
      this.h.sound(c.sp.sounds.attack, c.pos, 1);
      // pack hunting: nearby same-species join
      for (const o of this.list) {
        if (o === c || o.sp.id !== c.sp.id || o.tamed || !o.conscious || o.state === "chase") continue;
        if (o.pos.distanceTo(c.pos) < 22) { o.target = t; o.state = "chase"; o.chaseTimer = 0; o.roarTimer = 0.6 + Math.random() * 0.4; }
      }
    }
  }

  knockOut(c: Creature) {
    c.state = "unconscious";
    c.target = null;
    c.vel.set(0, 0, 0);
    c.torpor = c.maxTorpor;
    if (!c.tamed && !c.taming) {
      c.taming = {
        affinity: 0,
        needed: c.sp.tameAffinity * (1 + 0.04 * (c.level - 1)),
        effectiveness: 100,
        eatTimer: c.sp.eatInterval,
        foodEaten: 0,
        tamer: "player",
      };
    }
    this.h.notify(`${c.name} (Nv ${c.level}) desmaiou! Alimente-o para domar.`, "good");
  }

  private wakeUp(c: Creature) {
    c.state = "idle";
    c.torpor = 0;
    if (c.taming) {
      c.taming = null;
      // lost taming food; keep inventory for dropping
      c.inventory.slots.fill(null);
      c.inventory.touch();
      this.h.notify(`${c.name} acordou! A domesticação falhou.`, "warn");
    }
    if (!c.tamed && c.sp.temperament !== "passive") {
      if (c.sp.temperament === "skittish") this.startFlee(c, this.h.playerPos());
      else this.setTarget(c, { kind: "player" });
    }
  }

  kill(c: Creature, byPlayer: boolean) {
    c.state = "dead";
    c.health = 0;
    if (c.flying || c.sp.movement === "fly") { c.flying = false; c.pos.y = Math.max(0, this.h.terrain.heightAt(c.pos.x, c.pos.z)); }
    if (c.sp.movement === "swim") c.pos.y = -0.4;
    c.rider = false;
    c.deadAt = this.h.now();
    c.target = null;
    c.taming = null;
    c.harvestLeft = {};
    for (const hv of c.sp.harvest) c.harvestLeft[hv.item] = Math.round(hv.amount * (1 + c.level * 0.02));
    c.corpseHp = 100 + c.sp.health * 0.2;
    this.h.sound(c.sp.sounds.hurt, c.pos, 1);
    this.h.onKilled(c, byPlayer);
  }

  /** Harvest a corpse; returns yields. */
  harvestCorpse(c: Creature, tool: ToolKind | undefined, power: number, dmg: number): { item: string; qty: number }[] {
    if (this.puppet) { c.hurtFlash = 0.1; this.netHook?.corpse(c.id, tool, power, dmg); return []; }
    const tc = toolClass(tool);
    const out: { item: string; qty: number }[] = [];
    for (const hv of c.sp.harvest) {
      const left = c.harvestLeft[hv.item] ?? 0;
      if (left <= 0) continue;
      const mult = hv.tool[tc] ?? hv.tool.other ?? 0;
      const raw = mult * power * (1 + Math.random()) * Math.max(1, hv.amount / 10);
      let q = Math.floor(raw);
      if (Math.random() < raw - q) q++;
      q = Math.min(q, left);
      if (q > 0) {
        c.harvestLeft[hv.item] = left - q;
        out.push({ item: hv.item, qty: q });
      }
    }
    c.corpseHp -= dmg;
    const empty = Object.values(c.harvestLeft).every((v) => v <= 0);
    if (empty || c.corpseHp <= 0) this.remove(c);
    else c.hurtFlash = 0.1;
    return out;
  }

  forceFeed(c: Creature, itemId: string, from: Container): boolean {
    const def = ITEMS[itemId];
    if (!def || from.count(itemId) <= 0) return false;
    from.remove(itemId, 1);
    if (def.torpor) {
      c.torpor = Math.max(0, Math.min(c.maxTorpor, c.torpor + def.torpor));
      if (c.state === "unconscious" && c.torpor <= 0) this.wakeUp(c);
    }
    if (def.food) c.food = Math.min(c.maxFood, c.food + def.food);
    if (def.health && def.health > 0) c.health = Math.min(c.maxHealth, c.health + def.health);
    return true;
  }

  private tameTick(c: Creature, dt: number) {
    const t = c.taming!;
    t.eatTimer -= dt;
    if (t.eatTimer > 0) return;
    t.eatTimer = c.sp.eatInterval;
    // eat preferred food
    for (const f of c.sp.foods) {
      if (c.inventory.count(f.item) > 0) {
        c.inventory.remove(f.item, 1);
        t.affinity += f.affinity * effective(this.h.rules()).taming;
        t.foodEaten++;
        const kibble = f.item.startsWith("kibble");
        t.effectiveness = Math.max(10, t.effectiveness * (kibble ? 0.995 : 0.975));
        c.food = Math.min(c.maxFood, c.food + f.food);
        c.hurtFlash = 0; // head bob anim uses attackAnim
        c.attackAnim = 0.5;
        break;
      }
    }
    if (t.affinity >= t.needed) this.completeTame(c);
  }

  completeTame(c: Creature) {
    const eff = c.taming ? c.taming.effectiveness : 100;
    const bonus = Math.floor(c.level * 0.5 * (eff / 100));
    const oldLvl = c.level;
    c.level += bonus;
    const hpRatio = c.health / c.maxHealth;
    c.maxHealth = statAtLevel(c.sp.health, c.level, 0.12) * 1.1;
    c.health = c.maxHealth * Math.max(0.5, hpRatio);
    c.damageMult = 1.1 + 0.03 * (c.level - 1);
    c.maxTorpor = statAtLevel(c.sp.torpor, c.level, 0.07);
    c.tamed = true;
    c.taming = null;
    c.state = "follow";
    c.command = "follow";
    c.stance = "neutral";
    c.torpor = 0;
    this.h.notify(`${c.sp.name} domesticado! Nível ${oldLvl} + ${bonus} (eficiência ${Math.round(eff)}%)`, "good");
    this.h.onTamed(c);
  }

  // ------------------------------------------------------------ queries
  raycast(o: THREE.Vector3, d: THREE.Vector3, maxDist: number, includeDead = true): { c: Creature; dist: number } | null {
    let best: { c: Creature; dist: number } | null = null;
    for (const c of this.list) {
      if (!includeDead && !c.alive) continue;
      const dist = raySphere(o, d, c.pos.x, c.alive && c.state !== "unconscious" ? c.centerY : c.pos.y + c.sp.height * 0.3, c.pos.z, c.hitRadius());
      if (dist >= 0 && dist <= maxDist && (!best || dist < best.dist)) best = { c, dist };
    }
    return best;
  }

  nearest(pos: THREE.Vector3, r: number, filter: (c: Creature) => boolean): Creature | null {
    let best: Creature | null = null, bd = r;
    for (const c of this.list) {
      if (!filter(c)) continue;
      const d = c.pos.distanceTo(pos) - c.sp.radius;
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  private playerOf(pid: string | undefined) {
    if (!pid || !this.h.players) return null;
    return this.h.players().find((p) => p.pid === pid) ?? null;
  }
  private targetPos(t: Target): THREE.Vector3 {
    if (t.kind === "player") return this.playerOf(t.pid)?.pos ?? this.h.playerPos();
    return t.creature!.pos;
  }

  /** Nearest carcass within smelling range for a wild scavenger (re-scanned about once a second). */
  private corpseFor(c: Creature, dt: number): Creature | null {
    if (c.scavCd > 0) { c.scavCd -= dt; return null; }
    c.scavT -= dt;
    if (c.scavT <= 0) {
      c.scavT = 1.2;
      let best: Creature | null = null, bd = 60;
      for (const o of this.list) {
        if (o.alive || o === c) continue;
        const d = o.pos.distanceTo(c.pos);
        if (d < bd) { best = o; bd = d; }
      }
      c.scavTarget = best;
    }
    const sc = c.scavTarget;
    if (sc && (sc.alive || !this.list.includes(sc))) { c.scavTarget = null; return null; }
    return sc;
  }

  /** Vertical extent [bottom, top] of a target. */
  private targetBox(t: Target): [number, number] {
    if (t.kind === "player") {
      const rp = this.playerOf(t.pid);
      if (rp) return [rp.pos.y, rp.pos.y + 1.8];
      return this.h.playerBox ? this.h.playerBox() : [this.h.playerPos().y, this.h.playerPos().y + 1.8];
    }
    const o = t.creature!;
    return [o.pos.y, o.pos.y + o.sp.height * o.growth];
  }
  /** Gap in metres between the attacker's body and a vertical range (0 when they overlap in height). */
  private vGap(c: Creature, y0: number, y1: number): number {
    const a0 = c.pos.y, a1 = c.pos.y + c.sp.height * c.growth;
    return Math.max(0, y0 - a1, a0 - y1);
  }
  /** Can this creature actually touch something at that height? Ground animals cannot hit a flyer high above (and vice-versa). */
  private vReach(c: Creature, y0: number, y1: number, extra = 0): boolean {
    return this.vGap(c, y0, y1) <= c.sp.attackRange * 0.45 + 0.7 + extra;
  }
  private targetVReach(c: Creature, t: Target, extra = 0): boolean {
    const [y0, y1] = this.targetBox(t);
    return this.vReach(c, y0, y1, extra);
  }

  private targetValid(c: Creature, t: Target): boolean {
    if (t.kind === "player") {
      if (t.pid) { const rp = this.playerOf(t.pid); return !c.tamed && !!rp && rp.alive && (c.sp.movement !== "swim" || rp.inWater); }
      return !c.tamed && this.h.playerAlive() && (c.sp.movement !== "swim" || this.h.playerInWater());
    }
    const o = t.creature!;
    return o.alive && o.conscious && this.list.includes(o) && o !== c;
  }

  // ------------------------------------------------------------ update
  update(dt: number) {
    this.frame++;
    if (this.puppet) { this.puppetUpdate(dt); return; }
    const hostPos = this.h.playerPos();
    const ppos = hostPos;
    const players = this.h.players ? this.h.players().filter((p) => p.alive) : [];
    const activeR = CONFIG.creatures.activeRadius;
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = CONFIG.creatures.spawnInterval;
      // alternate spawning around the host and each remote player
      const around = players.length && this.frame % 2 === 0 ? players[Math.floor(Math.random() * players.length)].pos : ppos;
      this.spawnTick(around);
    }
    for (let i = this.list.length - 1; i >= 0; i--) {
      const c = this.list[i];
      // nearest player (local or remote) drives this creature's awareness
      let ppos = hostPos, dist = c.pos.distanceTo(hostPos);
      this.curPid = undefined;
      for (const pl of players) { const d = c.pos.distanceTo(pl.pos); if (d < dist) { dist = d; ppos = pl.pos; this.curPid = pl.pid; } }
      if (c.remoteRider) { c.state = "follow"; c.target = null; this.animate(c, dt); continue; }
      // despawn far wild creatures (not while being tamed)
      if (!c.tamed && !c.taming && dist > CONFIG.creatures.despawnRadius) { this.remove(c); continue; }
      if (c.state === "dead") {
        if (this.h.now() - c.deadAt > CONFIG.creatures.corpseSeconds) { this.remove(c); continue; }
        this.animate(c, dt);
        continue;
      }
      if (dist > activeR && !c.tamed) { c.rig.root.visible = false; continue; }
      c.rig.root.visible = true;
      // animation staggering: distant creatures animate every other frame
      const skipAnim = this.stagger && dist > 45 && (this.frame + c.id) % 2 === 0;
      if (c.rider) { this.riderTick(c, dt); this.animate(c, dt); continue; }
      if (c.carried) { c.vel.set(0, 0, 0); c.walkPhase += dt * 6; this.animate(c, dt); continue; }
      this.think(c, dt, ppos, dist);
      this.physicsStep(c, dt);
      if (!skipAnim) this.animate(c, this.stagger && dist > 45 ? dt * 2 : dt);
    }
  }

  private think(c: Creature, dt: number, ppos: THREE.Vector3, pdist: number) {
    c.attackCd = Math.max(0, c.attackCd - dt);
    c.attackAnim = Math.max(0, c.attackAnim - dt * 2.5);
    c.roarTimer = Math.max(0, c.roarTimer - dt);
    c.grazeTimer = Math.max(0, c.grazeTimer - dt);
    const prevYaw = c.yaw;
    c.nightNow = this.h.isNight();
    this.lifeTick(c, dt);
    // Megalosaurus: sleeps through the day unless disturbed (chasing/fleeing/being tamed keeps it awake)
    if (c.sp.sleepsByDay && !c.tamed && c.conscious && !c.taming) {
      if (!c.nightNow && c.state !== "chase" && c.state !== "flee") {
        if (!c.sleeping && Math.random() < dt * 0.5) { c.sleeping = true; c.animT = 0; }
      } else c.sleeping = false;
      if (c.sleeping) {
        c.state = "idle";
        c.target = null;
        c.vel.x *= 0.8; c.vel.z *= 0.8;
        c.lookTarget = null;
        return;
      }
    } else c.sleeping = false;
    c.lookTarget = pdist < 12 && c.conscious ? ppos : c.target ? this.targetPos(c.target) : null;
    if (c.state === "idle" && c.sp.diet === "herbivore" && c.grazeTimer <= 0 && Math.random() < dt * 0.15) c.grazeTimer = 3 + Math.random() * 3;
    c.hurtFlash = Math.max(0, c.hurtFlash - dt);
    c.stateTimer -= dt;
    // torpor recovery (conscious)
    if (c.state !== "unconscious") {
      c.torporRecoverDelay -= dt;
      if (c.torporRecoverDelay <= 0 && c.torpor > 0) c.torpor = Math.max(0, c.torpor - c.maxTorpor * 0.06 * dt);
    }
    // hunger (tamed)
    if (c.tamed) {
      c.food -= dt * 0.08;
      if (c.food < c.maxFood * 0.7) {
        for (const f of c.sp.foods) {
          if (c.inventory.count(f.item) > 0) { c.inventory.remove(f.item, 1); c.food = Math.min(c.maxFood, c.food + f.food); break; }
        }
      }
      if (c.food <= 0) { c.food = 0; c.health -= dt * 0.5; if (c.health <= 0) { this.kill(c, false); return; } }
      else if (c.health < c.maxHealth) c.health = Math.min(c.maxHealth, c.health + c.maxHealth * 0.004 * dt);
    } else if (c.conscious && c.health < c.maxHealth) {
      c.health = Math.min(c.maxHealth, c.health + c.maxHealth * 0.002 * dt);
    }
    // sounds
    c.soundTimer -= dt;
    if (c.soundTimer <= 0 && c.conscious) {
      c.soundTimer = 8 + Math.random() * 20;
      if (pdist < 50) this.h.sound(c.sp.sounds.idle, c.pos, 0.5);
    }

    if (c.state === "unconscious") {
      c.vel.x = c.vel.z = 0;
      c.torpor -= c.sp.torporDrain * dt;
      if (c.taming) this.tameTick(c, dt);
      if (c.torpor <= 0) this.wakeUp(c);
      return;
    }

    let desired: THREE.Vector3 | null = null;
    let running = false;

    // ---------- target acquisition ----------
    if (!c.target || !this.targetValid(c, c.target)) {
      if (c.state === "chase") { c.state = c.tamed ? "follow" : "idle"; }
      c.target = null;
      if (!c.tamed) {
        const temp = c.sp.temperament;
        const nightBoost = c.sp.nocturnal ? (c.nightNow ? 1.6 : 0.25) : c.nightNow ? 1.3 : 1;
        const swimmer = c.sp.movement === "swim";
        const rp0 = this.curPid ? this.playerOf(this.curPid) : null;
        const pBox = rp0 ? [rp0.pos.y, rp0.pos.y + 1.8] : this.h.playerBox ? this.h.playerBox() : [ppos.y, ppos.y + 1.8];
        // flyers change altitude to reach their prey, so only ground creatures are limited by height here
        const pInReach = c.sp.movement === "fly" || this.vReach(c, pBox[0], pBox[1], 3.5);
        const nearWater = (temp === "territorial" && this.nearWater(c.pos, 28)) || (temp === "ambush" && (pdist < 9 || (this.h.playerInWater() && this.nearWater(c.pos, 15))));
        if ((temp === "aggressive" || nearWater) && this.h.playerAlive() && pInReach && pdist < c.sp.aggroRange * nightBoost && (!swimmer || this.h.playerInWater())) {
          this.setTarget(c, { kind: "player" });
        } else if ((temp === "aggressive" || nearWater) && Math.random() < dt * 0.3) {
          // predators avoid picking fights with docile giants and with bigger territorial carnivores
          const prey = this.nearest(c.pos, c.sp.aggroRange, (o) => o !== c && o.conscious && o.sp.diet === "herbivore" && o.sp.temperament !== "docile" && o.sp.health < c.maxHealth * 1.6);
          if (prey) this.setTarget(c, { kind: "creature", creature: prey });
          else {
            const tame = this.nearest(c.pos, c.sp.aggroRange * 0.8, (o) => o.tamed && o.conscious);
            if (tame) this.setTarget(c, { kind: "creature", creature: tame });
          }
        } else if (temp === "skittish" && pdist < c.sp.aggroRange && c.state !== "flee" && this.h.playerAlive()) {
          this.startFlee(c, ppos);
        } else if (temp === "curious" && this.h.playerAlive() && pdist < c.sp.aggroRange) {
          // Compy: friendly alone, hostile once 2+ are together near you
          if (this.packSize2(c) >= 1 && pInReach) this.setTarget(c, { kind: "player" });
          else if (pdist > 3.5 && c.state !== "flee") { c.state = "wander"; c.moveTo.copy(ppos); c.stateTimer = 2; }
        } else if (temp === "shorttempered" && this.h.playerAlive()) {
          // Kentrosaurus: attacks after you linger nearby for a few seconds; herds widen the range
          const range = c.sp.aggroRange * (1 + 0.4 * Math.min(3, this.packSize2(c)));
          if (pdist < range) { c.annoy += dt; c.lookTarget = ppos; c.state = "idle"; c.stateTimer = 0.6; c.yaw += Math.atan2(Math.sin(Math.atan2(ppos.x - c.pos.x, ppos.z - c.pos.z) - c.yaw), Math.cos(Math.atan2(ppos.x - c.pos.x, ppos.z - c.pos.z) - c.yaw)) * Math.min(1, dt * 4); if (c.annoy > 3) { c.annoy = 0; this.setTarget(c, { kind: "player" }); for (const o of this.list) if (o !== c && o.sp.id === c.sp.id && !o.tamed && o.conscious && o.pos.distanceTo(c.pos) < 16) this.setTarget(o, { kind: "player" }); } }
          else c.annoy = Math.max(0, c.annoy - dt);
        } else if (temp === "angry") {
          // Giganotosaurus: attacks anything and everything
          if (this.h.playerAlive() && pInReach && pdist < c.sp.aggroRange * nightBoost) this.setTarget(c, { kind: "player" });
          else {
            const any = this.nearest(c.pos, c.sp.aggroRange, (o) => o !== c && o.conscious && o.sp.id !== c.sp.id);
            if (any) this.setTarget(c, { kind: "creature", creature: any });
          }
        }
      } else if (c.stance === "aggressive" && Math.random() < dt * 2) {
        const enemy = this.nearest(c.pos, 18, (o) => !o.tamed && o.conscious);
        if (enemy) this.setTarget(c, { kind: "creature", creature: enemy });
      }
    }

    // wild scavengers (Argentavis) look for carcasses when nothing else is going on
    const corpse = c.sp.scavenger && !c.tamed && c.conscious && c.state !== "chase" && c.state !== "flee" ? this.corpseFor(c, dt) : null;

    // ---------- behaviours ----------
    if (c.state === "chase" && c.target) {
      const tp = this.targetPos(c.target);
      const d = Math.hypot(tp.x - c.pos.x, tp.z - c.pos.z);
      const reach = c.sp.attackRange + c.sp.radius + (c.target.kind === "creature" ? c.target.creature!.sp.radius : 0.35);
      c.chaseTimer += dt;
      const leash = c.tamed ? c.pos.distanceTo(ppos) > 45 : c.pos.distanceTo(c.home) > 70 || ((c.sp.temperament === "territorial" || c.sp.temperament === "ambush") && !this.nearWater(c.pos, 40));
      if (leash || c.chaseTimer > 30) {
        c.target = null;
        c.state = c.tamed ? "follow" : "wander";
        if (!c.tamed) c.moveTo.copy(c.home);
      } else if (d > reach) {
        desired = tp;
        running = true;
        c.enraged = Math.max(0, c.enraged - dt);
        if (c.stuckTimer > 0.8 && !c.tamed && c.sp.diet === "carnivore") {
          c.structTimer -= dt;
          if (c.structTimer <= 0 && this.h.attackStructure(c, c.sp.damage * c.damageMult)) {
            c.structTimer = c.sp.attackCooldown;
            c.attackAnim = 1;
            this.h.sound(c.sp.sounds.attack, c.pos, 0.9);
          }
        }
      } else if (!this.targetVReach(c, c.target)) {
        // right underneath (or above) the target but out of reach in height: it cannot be hit from here
        c.yaw = Math.atan2(tp.x - c.pos.x, tp.z - c.pos.z);
        c.unreachT += dt;
        if (c.unreachT > (c.sp.movement === "fly" ? 14 : 4)) {
          c.target = null;
          c.state = c.tamed ? "follow" : "wander";
          c.unreachT = 0;
          if (!c.tamed) c.moveTo.copy(c.home);
        }
      } else {
        c.unreachT = 0;
        c.yaw = Math.atan2(tp.x - c.pos.x, tp.z - c.pos.z);
        if (c.attackCd <= 0) {
          c.attackCd = c.sp.attackCooldown;
          c.attackAnim = 1;
          c.chaseTimer = 0;
          const dmg = c.sp.damage * c.damageMult * this.packMult(c) * (c.sp.rage && c.enraged > 0 ? 1.4 : 1) * (0.85 + Math.random() * 0.3);
          const tor = c.sp.attackTorpor ?? 0;
          this.h.sound(c.sp.sounds.attack, c.pos, 0.9);
          if (c.sp.aoe) this.sweep(c, dmg, tor);
          if (c.target.kind === "player") { if (!c.sp.aoe) this.h.damagePlayer(dmg, c.pos, c.name, c.target.pid); if (tor && !c.sp.aoe) this.h.torporPlayer(tor, c.target.pid); }
          else {
            const o = c.target.creature!;
            const killed = c.sp.aoe ? !o.alive : this.damage(o, dmg, tor, { kind: "creature", creature: c }, c.pos);
            if (killed) {
              this.giveCreatureXp(c, o.sp.xp * o.level);
              c.target = null;
              c.state = c.tamed ? "follow" : "idle";
            }
          }
        }
      }
      if (c.roarTimer > 0) desired = null; // intimidation pause before charging
    } else if (c.state === "flee") {
      tmpV.set(c.pos.x - c.fleeFrom.x, 0, c.pos.z - c.fleeFrom.z).normalize().multiplyScalar(12);
      desired = tmpV.add(c.pos);
      running = true;
      if (c.stateTimer <= 0) c.state = "idle";
    } else if (corpse) {
      const dxz = Math.hypot(corpse.pos.x - c.pos.x, corpse.pos.z - c.pos.z);
      if (c.flying) {
        // circle in and land next to the carcass
        desired = corpse.pos;
        running = false;
        if (dxz < 26) c.wantLand = true;
      } else if (dxz > 2.8) {
        desired = corpse.pos;
        running = dxz > 10;
        c.landedT = Math.max(c.landedT, 4);
      } else {
        // feeding: peck at the carcass and regenerate quickly
        c.landedT = Math.max(c.landedT, 4);
        c.yaw = Math.atan2(corpse.pos.x - c.pos.x, corpse.pos.z - c.pos.z);
        c.grazeTimer = Math.max(c.grazeTimer, 0.7);
        c.health = Math.min(c.maxHealth, c.health + c.maxHealth * 0.05 * dt);
        c.scavEat += dt;
        if (c.scavEat > 16 || c.health >= c.maxHealth) {
          c.scavEat = 0;
          c.scavCd = 90 + Math.random() * 60;
          c.scavTarget = null;
        }
      }
    } else if (c.tamed) {
      if (c.command === "follow") {
        const d = c.pos.distanceTo(ppos);
        if (d > 4 + c.sp.radius) { desired = ppos; running = d > 10; }
      } else if (c.command === "wander") {
        this.wander(c, dt);
        if (c.state === "wander") desired = c.moveTo;
      }
      if (c.command !== "wander") c.state = c.command === "follow" ? "follow" : "stay";
    } else {
      this.wander(c, dt);
      if (c.state === "wander") desired = c.moveTo;
    }

    // ---------- steering ----------
    const speed = desired ? c.speedFor(running) : 0;
    if (desired) {
      const dx = desired.x - c.pos.x, dz = desired.z - c.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.3) {
        let want = Math.atan2(dx, dz);
        // avoid water: probe ahead
        const ax = c.pos.x + Math.sin(want) * 3, az = c.pos.z + Math.cos(want) * 3;
        if (c.sp.movement !== "swim" && c.sp.movement !== "fly" && !c.sp.waterSpeed && this.h.terrain.heightAt(ax, az) < 0.2 && c.state !== "chase") {
          // (semi-aquatic species like Spino/Sarco are allowed into the water)
          want += Math.PI * (0.5 + Math.random() * 0.5);
          if (c.state === "wander") c.moveTo.set(c.pos.x + Math.sin(want) * 10, 0, c.pos.z + Math.cos(want) * 10);
        }
        let dy = want - c.yaw;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        c.yaw += dy * Math.min(1, dt * 5);
      } else if (c.state === "wander") {
        c.state = "idle";
        c.stateTimer = 2 + Math.random() * 6;
      }
    }
    // steep terrain avoidance
    if (desired && c.state !== "chase") {
      const ax = c.pos.x + Math.sin(c.yaw) * 2, az = c.pos.z + Math.cos(c.yaw) * 2;
      if (this.h.terrain.normalAt(ax, az).y < 0.62 && this.h.terrain.heightAt(ax, az) > c.pos.y + 0.5) c.yaw += dt * 3;
    }
    let dYaw = c.yaw - prevYaw;
    while (dYaw > Math.PI) dYaw -= Math.PI * 2;
    while (dYaw < -Math.PI) dYaw += Math.PI * 2;
    c.turnRate += (dYaw / Math.max(dt, 1e-3) - c.turnRate) * Math.min(1, dt * 5);
    const acc = Math.min(1, dt * 6);
    const sp2 = c.grazeTimer > 0 && c.state === "idle" ? 0 : speed;
    c.vel.x += (Math.sin(c.yaw) * sp2 - c.vel.x) * acc;
    c.vel.z += (Math.cos(c.yaw) * sp2 - c.vel.z) * acc;
    if (!desired) { c.vel.x *= 0.85; c.vel.z *= 0.85; }
  }

  private wander(c: Creature, _dt: number) {
    if (c.sp.temperament === "ambush" && !c.tamed && Math.random() > 0.002) { c.state = "idle"; c.stateTimer = 2; return; }
    if (c.state === "idle" && c.stateTimer <= 0) {
      const base = c.tamed ? c.home : c.home;
      const a = Math.random() * Math.PI * 2, r = 5 + Math.random() * 18;
      c.moveTo.set(base.x + Math.cos(a) * r, 0, base.z + Math.sin(a) * r);
      const hh = this.h.terrain.heightAt(c.moveTo.x, c.moveTo.z);
      if (c.sp.movement === "swim" ? hh > -2.5 : c.sp.movement !== "fly" && hh < 0.3) { c.stateTimer = 1; return; }
      c.state = "wander";
      c.stateTimer = 15;
    } else if (c.state === "wander" && c.stateTimer <= 0) {
      c.state = "idle";
      c.stateTimer = 3;
    } else if (c.state !== "wander" && c.state !== "idle") {
      c.state = "idle";
      c.stateTimer = 1 + Math.random() * 3;
    }
  }

  private physicsStep(c: Creature, dt: number) {
    const mv = c.sp.movement ?? "ground";
    if (mv === "swim") { this.swimStep(c, dt); return; }
    if (mv === "fly" && (!c.tamed || c.command === "wander" || c.state === "flee") && c.conscious && c.landedT <= 0) {
      this.flyStep(c, dt);
      return;
    }
    if (c.flying) { c.flying = false; }
    c.vel.y -= CONFIG.player.gravity * dt;
    const step: number = Math.max(0.5, c.sp.height * 0.3);
    const res = this.h.physics.moveBody(c.pos, c.vel, dt, c.sp.radius * 0.8, c.sp.height, step);
    c.onGround = res.onGround;
    // swim: float at surface
    c.swimming = c.pos.y < -c.sp.height * 0.4;
    if (c.swimming) { c.pos.y = -c.sp.height * 0.4; c.vel.y = Math.max(0, c.vel.y); c.onGround = true; }
    if (res.hitWall && (c.state === "wander" || c.state === "follow" || c.state === "chase")) {
      c.stuckTimer += dt;
      if (c.stuckTimer > 1.2) {
        c.stuckTimer = 0;
        if (c.onGround && c.sp.height < 2) c.vel.y = 6;
        if (c.state === "wander") { c.state = "idle"; c.stateTimer = 0.2; }
        else c.yaw += (Math.random() - 0.5) * 2;
      }
    } else c.stuckTimer = Math.max(0, c.stuckTimer - dt);
    // separation between creatures
    for (const o of this.list) {
      if (o === c || !o.alive) continue;
      const dx = c.pos.x - o.pos.x, dz = c.pos.z - o.pos.z;
      const m = c.sp.radius + o.sp.radius;
      const d2 = dx * dx + dz * dz;
      if (d2 < m * m && d2 > 1e-6) {
        const d = Math.sqrt(d2), push = (m - d) * 0.5;
        c.pos.x += (dx / d) * push;
        c.pos.z += (dz / d) * push;
      }
    }
  }

  // ------------------------------------------------------------ Part 3 behaviours
  private flyStep(c: Creature, dt: number) {
    const ground = this.h.terrain.heightAt(c.pos.x, c.pos.z);
    const landing = c.wantLand && c.state !== "flee" && c.state !== "chase" && ground > 0.4;
    const chasing = c.state === "chase" && !!c.target;
    const g0 = Math.max(ground, 0);
    const want = landing ? g0 : chasing ? Math.max(g0 + 2.5, this.targetPos(c.target!).y + 0.8) : g0 + (c.state === "chase" ? 2.5 : c.cruiseAlt);
    if (landing && c.pos.y - ground < 0.9) { c.wantLand = false; c.landedT = 12 + Math.random() * 18; c.flying = false; c.vel.set(0, 0, 0); c.state = "idle"; c.stateTimer = 2; return; }
    if (c.wantLand && ground <= 0.4 && Math.random() < dt) c.yaw += 0.6; // look for land
    if (c.state === "chase" && c.target) c.cruiseAlt = 2.5;
    else if (Math.random() < dt * 0.05) c.cruiseAlt = 10 + Math.random() * 22;
    c.flying = true;
    const vyMax = chasing ? 9 : 5;
    const tgtVy = THREE.MathUtils.clamp((want - c.pos.y) * 0.8, -vyMax, vyMax);
    c.vel.y += (tgtVy - c.vel.y) * Math.min(1, dt * 2);
    const sp = Math.max(c.sp.runSpeed * 0.7, Math.hypot(c.vel.x, c.vel.z));
    c.vel.x = Math.sin(c.yaw) * sp;
    c.vel.z = Math.cos(c.yaw) * sp;
    c.pos.addScaledVector(c.vel, dt);
    const lim = this.h.terrain.half - 10;
    if (Math.abs(c.pos.x) > lim || Math.abs(c.pos.z) > lim) { c.yaw += Math.PI * dt; c.moveTo.set(0, 0, 0); }
    if (c.pos.y < ground + 0.5) c.pos.y = ground + 0.5;
    c.onGround = false;
  }

  private swimStep(c: Creature, dt: number) {
    const ground = this.h.terrain.heightAt(c.pos.x, c.pos.z);
    const ox = c.pos.x, oz = c.pos.z;
    c.pos.x += c.vel.x * dt;
    c.pos.z += c.vel.z * dt;
    const g2 = this.h.terrain.heightAt(c.pos.x, c.pos.z);
    if (g2 > -1.6) { c.pos.x = ox; c.pos.z = oz; c.yaw += Math.PI * (0.5 + Math.random() * 0.5); c.state = c.state === "chase" ? "chase" : "idle"; c.stateTimer = 0.5; }
    const want = c.state === "chase" ? -1.2 : Math.max(ground + 1, -4 + Math.sin(this.h.now() * 0.3 + c.id) * 1.5);
    c.pos.y += (Math.min(-0.9, want) - c.pos.y) * Math.min(1, dt * 1.5);
    c.vel.y = 0;
    c.swimming = true;
    c.onGround = true;
    if (c.state === "wander" && this.h.terrain.heightAt(c.moveTo.x, c.moveTo.z) > -2) { c.state = "idle"; c.stateTimer = 0.1; }
    void ground;
  }

  /** Aging, breeding, imprint requests and stamina. */
  private lifeTick(c: Creature, dt: number) {
    if (c.sp.rage) {
      c.rage = Math.max(0, c.rage - dt * 0.02);
      c.enraged = Math.max(0, c.enraged - dt);
      if (c.enraged > 0 && (!c.target || c.state !== "chase") && !c.rider && c.conscious) {
        const any = this.nearest(c.pos, 24, (o) => o !== c && o.conscious && (!c.tamed || !o.tamed));
        if (any) this.setTarget(c, { kind: "creature", creature: any });
      }
    }
    // wild flyers occasionally land and rest, then take off again
    if (c.sp.movement === "fly" && !c.tamed && c.conscious) {
      if (c.landedT > 0) { c.landedT -= dt; if (c.state === "flee" || c.state === "chase") c.landedT = 0; }
      else if (!c.wantLand && c.state === "idle" && Math.random() < dt * 0.015) c.wantLand = true;
    }
    if (!c.rider) c.stamina = Math.min(c.maxStamina, c.stamina + c.maxStamina * 0.08 * dt);
    c.mateCooldown = Math.max(0, c.mateCooldown - dt);
    if (c.age < 1) {
      const prev = c.age;
      c.age = Math.min(1, c.age + (dt * effective(this.h.rules()).mature) / (c.sp.matureSeconds ?? 900));
      c.food -= dt * 0.25 * (1 - c.age); // babies are hungry
      if (Math.floor(prev * 10) !== Math.floor(c.age * 10)) c.recompute();
      if (c.age >= 1) this.h.notify(`${c.name} atingiu a idade adulta! Impressão: ${Math.round(c.imprint * 100)}%`, "good");
      // imprint requests
      c.imprintTimer -= dt;
      if (c.imprintTimer <= 0 && !c.imprintRequest && c.imprint < 1) {
        c.imprintRequest = Math.random() < 0.5 ? "cuddle" : "feed";
        this.h.notify(`${c.name} quer ${c.imprintRequest === "cuddle" ? "carinho" : "comer ração"} (impressão).`, "info");
      }
    }
    if (c.tamed && c.mating && c.age >= 1 && c.gender === "F" && c.mateCooldown <= 0 && c.conscious) {
      const mate = this.list.find((o) => o !== c && o.tamed && o.sp.id === c.sp.id && o.gender === "M" && o.mating && o.age >= 1 && o.conscious && o.pos.distanceTo(c.pos) < 6 + c.sp.radius * 2);
      if (mate) {
        const ovi = this.list.some((o) => o.tamed && o.sp.eggBoost && o.conscious && o.pos.distanceTo(c.pos) < 15);
        c.mateProgress += (dt / 40) * (ovi ? 2 : 1);
        if (Math.random() < dt * 0.5) this.h.sound("chirp", c.pos, 0.4);
        if (c.mateProgress >= 1) {
          c.mateProgress = 0;
          c.mateCooldown = 420 + Math.random() * 240;
          this.h.layEgg(c, mate);
        }
      } else c.mateProgress = Math.max(0, c.mateProgress - dt / 80);
    }
  }

  /** Allosaurus pack bonus: +12% damage per nearby same-species ally on the same side (max 3). */
  /** Same-species wild allies within 14 m (used by curious packs like Compy / herds like Kentro). */
  packSize2(c: Creature): number {
    let n = 0;
    for (const o of this.list) if (o !== c && o.sp.id === c.sp.id && o.conscious && !o.tamed && o.pos.distanceTo(c.pos) < 14) n++;
    return n;
  }
  packSize(c: Creature): number {
    if (!c.sp.packBonus) return 0;
    let n = 0;
    for (const o of this.list) if (o !== c && o.sp.id === c.sp.id && o.conscious && o.tamed === c.tamed && o.pos.distanceTo(c.pos) < 18) n++;
    return n;
  }
  /** Alpha pack buff (as in the original): with 2+ allies nearby, +50% damage. */
  packMult(c: Creature): number {
    return this.packSize(c) >= 2 ? 1.5 : 1;
  }
  nearWater(p: THREE.Vector3, r: number): boolean {
    const t = this.h.terrain;
    for (let a = 0; a < 8; a++) {
      const ang = (a / 8) * Math.PI * 2;
      for (const d of [r * 0.4, r]) if (t.heightAt(p.x + Math.cos(ang) * d, p.z + Math.sin(ang) * d) < -0.3) return true;
    }
    return t.heightAt(p.x, p.z) < 0.5;
  }

  /** Area attack (Brontosaurus tail sweep): damages every enemy within reach. Returns hit creatures. */
  sweep(c: Creature, dmg: number, torpor = 0): Creature[] {
    const reach = c.sp.attackRange + c.sp.radius * c.growth + 1;
    const hit: Creature[] = [];
    for (const o of [...this.list]) {
      if (o === c || !o.alive) continue;
      if (c.tamed ? o.tamed : !o.tamed) continue; // only the opposing side
      if (Math.hypot(o.pos.x - c.pos.x, o.pos.z - c.pos.z) - o.sp.radius > reach) continue;
      if (!this.vReach(c, o.pos.y, o.pos.y + o.sp.height * o.growth)) continue;
      this.damage(o, dmg, torpor, { kind: "creature", creature: c }, c.pos);
      hit.push(o);
    }
    if (!c.tamed) {
      const pp = this.h.playerPos();
      const pb = this.h.playerBox ? this.h.playerBox() : [pp.y, pp.y + 1.8];
      if (this.h.playerAlive() && this.vReach(c, pb[0], pb[1]) && Math.hypot(pp.x - c.pos.x, pp.z - c.pos.z) < reach) { this.h.damagePlayer(dmg, c.pos, c.name); if (torpor) this.h.torporPlayer(torpor); }
      for (const rp of this.h.players ? this.h.players() : []) if (rp.alive && this.vReach(c, rp.pos.y, rp.pos.y + 1.8) && Math.hypot(rp.pos.x - c.pos.x, rp.pos.z - c.pos.z) < reach) { this.h.damagePlayer(dmg, c.pos, c.name, rp.pid); if (torpor) this.h.torporPlayer(torpor, rp.pid); }
    }
    return hit;
  }

  /** Guest: interpolate host-driven creatures and run their animation only. */
  private puppetUpdate(dt: number) {
    const now = performance.now();
    for (let i = this.list.length - 1; i >= 0; i--) {
      const c = this.list[i];
      if (now - c.netSeen > 2500 && !c.rider) { this.remove(c); continue; }
      c.hurtFlash = Math.max(0, c.hurtFlash - dt);
      c.attackAnim = Math.max(0, c.attackAnim - dt * 2.5);
      c.roarTimer = Math.max(0, c.roarTimer - dt);
      if (!c.rider) {
        const k = Math.min(1, dt * 10);
        if (c.pos.distanceTo(c.netPos) > 12) c.pos.copy(c.netPos);
        else c.pos.lerp(c.netPos, k);
        let d = c.netYaw - c.yaw;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        c.turnRate = d / Math.max(dt, 1e-3) * 0.2;
        c.yaw += d * k;
      }
      this.animate(c, dt);
    }
  }

  giveCreatureXp(c: Creature, amount: number) {
    if (!c.tamed) { c.xp += amount; return; }
    c.xp += amount;
    let n = 0;
    while (c.xp >= c.xpToNext() && c.level < 250) { c.xp -= c.xpToNext(); c.level++; c.statPoints++; n++; }
    if (n) { c.recompute(); this.h.notify(`${c.name} subiu para o nível ${c.level}! Distribua pontos no painel.`, "good"); }
  }

  /** Called every frame for a ridden creature (movement handled by the game). */
  private riderTick(c: Creature, dt: number) {
    c.attackCd = Math.max(0, c.attackCd - dt);
    c.attackAnim = Math.max(0, c.attackAnim - dt * 2.5);
    c.hurtFlash = Math.max(0, c.hurtFlash - dt);
    c.roarTimer = Math.max(0, c.roarTimer - dt);
    c.food -= dt * 0.1;
    c.state = "follow";
    c.target = null;
    c.lookTarget = null;
    c.turnRate *= 0.9;
  }

  /** Mounted attack: bite/strike the best target in front. Returns what was hit. */
  riderAttack(c: Creature): Creature | null {
    if (c.attackCd > 0 || c.stamina < 5) return null;
    c.attackCd = c.sp.attackCooldown;
    c.attackAnim = 1;
    c.stamina -= 5;
    this.h.sound(c.sp.sounds.attack, c.pos, 1);
    const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
    let best: Creature | null = null, bd = Infinity;
    for (const o of this.list) {
      if (o === c || (o.tamed && o.alive)) continue;
      const dx = o.pos.x - c.pos.x, dz = o.pos.z - c.pos.z;
      const d = Math.hypot(dx, dz) - o.sp.radius * o.growth;
      if (d > c.sp.attackRange + c.sp.radius * c.growth + 0.8) continue;
      if ((dx * fx + dz * fz) / (Math.hypot(dx, dz) || 1) < 0.3) continue;
      if (!this.vReach(c, o.pos.y, o.pos.y + o.sp.height * o.growth, 0.6)) continue;
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  private animate(c: Creature, dt: number) {
    const r = c.rig;
    const sp = r.spec;
    r.root.scale.setScalar(c.baseScale * c.growth);
    if (c.saddleVer !== c.inventory.version) {
      c.saddleVer = c.inventory.version;
      const want = c.hasSaddle();
      if (want && !r.saddle) {
        r.saddle = buildSaddle(sp);
        r.saddleMount.add(r.saddle);
        const gear = r.saddle.userData.headGear as THREE.Object3D | undefined;
        if (gear) r.head.add(gear);
      } else if (!want && r.saddle) {
        (r.saddle.userData.headGear as THREE.Object3D | undefined)?.removeFromParent();
        r.saddleMount.remove(r.saddle);
        r.saddle = null;
      }
    }
    if (sp.extras?.includes("argent")) { animateArgentavis(c, dt); return; }
    if (r.wingJoints && r.wingJoints.length) {
      const t0 = performance.now() * 0.001 + c.id;
      const hs0 = Math.hypot(c.vel.x, c.vel.z);
      if (c.flying) {
        // powered flap when climbing / slow, long glides otherwise (ARK pteras mostly glide)
        const climb = c.vel.y > 0.6 || hs0 < c.sp.runSpeed * 0.5;
        const flap = climb ? Math.sin(t0 * 7) * 0.75 : Math.sin(t0 * 1.6) * 0.08;
        for (const w of r.wingJoints) {
          w.sh.rotation.set(0, 0, w.side * (flap + 0.05));
          w.el.rotation.set(0, 0, w.side * (climb ? Math.sin(t0 * 7 - 0.6) * 0.25 : 0));
          w.wr.rotation.set(0, 0, w.side * (climb ? Math.sin(t0 * 7 - 1.1) * 0.2 : 0.03));
        }
        const bank = THREE.MathUtils.clamp(-c.turnRate * 0.3, -0.7, 0.7);
        const roll = c.rollT > 0 ? (1 - c.rollT / 0.7) * Math.PI * 2 : 0;
        r.body.rotation.set(THREE.MathUtils.clamp(-c.vel.y * 0.06, -0.45, 0.45), 0, bank + roll);
        r.legs.forEach((l) => { l.hip.rotation.x = 1.25; l.knee.rotation.x = 0.2; });
      } else {
        // folded wings used as front legs (quadrupedal walk on the wrists)
        const hs = Math.min(1, hs0 / Math.max(1, c.sp.speed));
        for (const w of r.wingJoints) {
          const ph = c.walkPhase + (w.side > 0 ? 0 : Math.PI);
          w.sh.rotation.set(Math.sin(ph) * 0.35 * hs, w.side * 0.35, -w.side * 1.05);
          w.el.rotation.set(0, w.side * 0.9, -w.side * 0.25);
          w.wr.rotation.set(0.2, -w.side * 2.7, w.side * 0.35);
        }
        r.body.rotation.x = -0.25; // chest raised: wrists on the ground, like the ARK walk cycle
      }
    }
    if (r.wings.length) {
      const t0 = performance.now() * 0.001 + c.id;
      const flap = c.flying ? Math.sin(t0 * (c.vel.y > 0.5 ? 9 : 4)) * (c.vel.y > 0.5 ? 0.8 : 0.35) : 0;
      const fold = c.flying ? 0 : 1;
      r.wings.forEach((w, i) => {
        const sd = i === 0 ? -1 : 1;
        w.rotation.z = sd * (flap - 0.1) + sd * fold * 1.2;
        w.rotation.y = sd * fold * 0.9;
        w.scale.x = 1 - fold * 0.55;
      });
      if (c.flying) { r.body.rotation.x = THREE.MathUtils.clamp(-c.vel.y * 0.06, -0.4, 0.4); r.body.rotation.z = THREE.MathUtils.clamp(-c.turnRate * 0.25, -0.6, 0.6); r.legs.forEach((l) => (l.hip.rotation.x = 1.1)); }
    }
    if (sp.form === "fish") {
      const t0 = performance.now() * 0.001 * (1 + Math.hypot(c.vel.x, c.vel.z) * 0.4) + c.id;
      r.tail.forEach((s, i) => (s.rotation.y = Math.sin(t0 * 3 - i * 0.8) * (0.15 + i * 0.1)));
      r.body.rotation.y = Math.sin(t0 * 3 + 1) * 0.06;
      const lunge = Math.sin(Math.min(1, c.attackAnim) * Math.PI);
      r.jaw.rotation.x = 0.1 + lunge * 0.6;
      for (const m of r.materials) m.emissive.setRGB(c.hurtFlash > 0 ? 0.6 : 0, 0, 0);
      if (c.state === "dead") r.body.rotation.z = Math.PI;
      r.root.position.copy(c.pos);
      r.root.rotation.y = c.yaw;
      return;
    }
    if (c.flying) {
      r.root.position.copy(c.pos);
      r.root.rotation.y = c.yaw;
      for (const m of r.materials) m.emissive.setRGB(c.hurtFlash > 0 ? 0.6 : 0, 0, 0);
      return;
    }
    r.root.position.copy(c.pos);
    r.root.rotation.y = c.yaw;
    // Doedicurus has its own rig + animation set (waddle walk, tail-club swing, armoured ball roll)
    if (sp.extras?.includes("doedicurus")) { animateDoedicurus(c, dt); return; }
    const t = performance.now() * 0.001 + c.id * 1.7;
    const hs = Math.hypot(c.vel.x, c.vel.z);
    const stride = Math.max(0.35, sp.legLen) * (sp.form === "biped" ? 1.35 : 1.6);
    c.walkPhase += (hs / stride) * dt * Math.PI;
    const amp = Math.min(1, hs / Math.max(1, c.sp.speed)) * (hs > c.sp.speed * 1.5 ? 1.25 : 1);
    const k = Math.min(1, dt * 10);
    const lerp = (o: THREE.Object3D, axis: "x" | "y" | "z", v: number, s = k) => { o.rotation[axis] += (v - o.rotation[axis]) * s; };
    // ---- Doedicurus ball roll: limbs tuck in, shell rounds out and spins like a wheel
    const wantRoll = c.rolling && !!c.sp.rollSpeed;
    c.rollBlend += ((wantRoll ? 1 : 0) - c.rollBlend) * Math.min(1, dt * 6);
    if (wantRoll) {
      const speed = Math.hypot(c.vel.x, c.vel.z);
      // radians == distance / radius, so the shell rolls without slipping
      c.rollSpin = (c.rollSpin + (speed * dt) / Math.max(0.3, sp.bodyW * 0.52)) % (Math.PI * 2);
    } else if (c.rollSpin !== 0) {
      // ease the ball back to a standing pose instead of snapping
      c.rollSpin *= Math.max(0, 1 - dt * 3.2);
      if (c.rollSpin < 0.02) c.rollSpin = 0;
    }
    if (c.rollBlend > 0.002 || c.rollSpin > 0.002) {
      const b = Math.min(1, c.rollBlend);
      r.body.rotation.set(c.rollSpin, -c.turnRate * 0.22 * b, Math.sin(c.rollSpin * 2) * 0.02 * b);
      r.body.scale.set(1 + 0.13 * b, 1 - 0.27 * b, 1 + 0.13 * b); // squashes into a ball
      r.body.position.y = sp.bodyW * 0.42 * b + Math.abs(Math.sin(c.rollSpin)) * 0.035 * b;
      r.torso.rotation.set(0, 0, 0);
      r.legs.forEach((l) => {
        lerp(l.hip, "x", 1.85 * b, 0.3);
        lerp(l.knee, "x", -2.0 * b, 0.3);
        lerp(l.ankle, "x", 0.5 * b, 0.3);
        l.hip.scale.setScalar(1 - 0.34 * b);
      });
      r.arms.forEach((a) => { lerp(a.hip, "x", -1.25 * b, 0.3); lerp(a.knee, "x", 1.15 * b, 0.3); a.hip.scale.setScalar(1 - 0.34 * b); });
      r.neck.forEach((n) => lerp(n, "x", -1.05 * b, 0.35));
      lerp(r.head, "x", 1.35 * b, 0.35);
      lerp(r.jaw, "x", 0, 0.35);
      r.tail.forEach((s2, i) => lerp(s2, "x", (-0.95 - i * 0.32) * b, 0.35));
      r.root.position.copy(c.pos);
      r.root.rotation.y = c.yaw;
      for (const m of r.materials) m.emissive.setRGB(c.hurtFlash > 0 ? 0.6 : 0, 0, 0);
      return;
    }
    if (r.body.scale.x !== 1) r.body.scale.set(1, 1, 1);


    // hurt flash (emissive on skin materials)
    for (const m of r.materials) m.emissive.setRGB(c.hurtFlash > 0 ? 0.6 : 0, c.hurtFlash > 0 ? 0.05 : 0, 0);

    if (c.sp.nocturnal && c.irisMats.length) {
      const glow = c.nightNow && c.alive && !c.sleeping ? 1.6 : 0;
      for (const m of c.irisMats) { if (!m.emissiveMap) { m.emissiveMap = m.map; m.emissive.set(sp.eye ?? "#ffd23a"); m.needsUpdate = true; } m.emissiveIntensity += (glow - m.emissiveIntensity) * Math.min(1, dt * 3); }
    }
    if (c.state === "dead" || c.state === "unconscious" || c.sleeping) {
      c.animT = Math.min(1, c.animT + dt * 1.8);
      const e = 1 - Math.pow(1 - c.animT, 3);
      r.body.rotation.z = (Math.PI / 2) * 0.92 * e;
      r.body.position.y = -r.hipY * 0.55 * e + sp.bodyW * 0.35 * e;
      for (const l of r.legs) { lerp(l.hip, "x", l.rest[0] + (l.front ? -0.4 : 0.5), 0.1); lerp(l.knee, "x", -0.2, 0.1); }
      r.neck.forEach((n, i) => lerp(n, "x", i === 0 ? 0.1 : 0.15, 0.08));
      r.tail.forEach((s) => lerp(s, "y", 0, 0.1));
      // breathing / feeding bob while unconscious
      const breath = c.state === "unconscious" || c.sleeping ? Math.sin(t * (c.sleeping ? 0.9 : 1.4)) * 0.03 : 0;
      r.torso.scale.set(1 + breath, 1 + breath, 1);
      const eat = Math.sin(Math.min(1, c.attackAnim) * Math.PI);
      r.jaw.rotation.x = eat * 0.4;
      return;
    }
    c.animT = Math.max(0, c.animT - dt * 2);
    r.body.rotation.z = (Math.PI / 2) * 0.92 * c.animT;
    r.torso.scale.set(1 + Math.sin(t * 1.8) * 0.012, 1 + Math.sin(t * 1.8) * 0.018, 1);

    // Spinosaurus (ARK): drops to all fours when moving on land, rears up when idle, attacking or swimming
    if (sp.extras?.includes("quadwalk")) {
      const want = !c.swimming && hs > 0.4 && c.attackAnim <= 0 && c.roarTimer <= 0 ? 1 : 0;
      c.quadT += (want - c.quadT) * Math.min(1, dt * 2.5);
      r.torso.rotation.x = 0.42 * c.quadT;
      r.torso.position.y = r.hipY + sp.bodyH * 0.2 - sp.legLen * 0.18 * c.quadT;
      // Neck pitch is applied to the *target* below. Subtracting from the
      // current rotation every frame accumulated a multi-radian bend on Spino.
      r.arms.forEach((a, i) => {
        a.hip.rotation.x = a.rest[0] - 0.9 * c.quadT + Math.sin(c.walkPhase + (i ? 0 : Math.PI)) * 0.5 * amp * c.quadT;
        a.knee.rotation.x = a.rest[1] * (1 - c.quadT) + 0.2 * c.quadT;
      });
    }
    // gait: body bob and pitch
    const bob = Math.abs(Math.sin(c.walkPhase)) * amp * sp.legLen * 0.05;
    r.body.position.y = bob - (c.swimming ? sp.legLen * 0.8 : 0);
    r.body.rotation.x = c.onGround ? Math.sin(c.walkPhase * 2) * 0.02 * amp : -0.1;

    // legs: two-segment cycle with knee lift, diagonal pairs for quadrupeds
    r.legs.forEach((l, i) => {
      const phaseOff = sp.form === "quad" ? (i === 0 || i === 3 ? 0 : Math.PI) : i === 0 ? 0 : Math.PI;
      const ph = c.walkPhase + phaseOff;
      const swing = Math.sin(ph) * 0.55 * amp;
      const lift = Math.max(0, Math.cos(ph)) * 0.9 * amp;
      l.hip.rotation.x = l.rest[0] + swing;
      l.knee.rotation.x = l.rest[1] + lift * (l.front && sp.form === "quad" ? -0.6 : 1);
      l.ankle.rotation.x = l.rest[2] - lift * 0.5 - swing * 0.3;
      if (c.swimming) { l.hip.rotation.x = l.rest[0] + Math.sin(t * 4 + i) * 0.5; }
    });
    r.arms.forEach((a, i) => {
      a.hip.rotation.x = a.rest[0] + Math.sin(c.walkPhase + i * Math.PI) * 0.2 * amp + Math.sin(t * 2) * 0.04;
      a.knee.rotation.x = a.rest[1] - (c.attackAnim > 0 ? Math.sin(c.attackAnim * Math.PI) * 0.8 : 0);
    });

    // ---- attack curve: wind-up, fast strike, overshoot then settle
    const atkP = c.attackAnim > 0 ? Math.min(1, 1 - c.attackAnim) : 1;
    const curve = (p: number) => (p < 0.25 ? -0.62 * (p / 0.25) : p < 0.55 ? -0.62 + 1.82 * ((p - 0.25) / 0.3) : 1.2 * (1 - ((p - 0.55) / 0.45) ** 2));
    const atk = c.attackAnim > 0 ? curve(atkP) : 0;
    const atkAbs = Math.abs(atk);
    const clubbed = sp.extras?.includes("doedicurus") || sp.extras?.includes("ankylo") || sp.extras?.includes("clubtail");
    if (c.attackAnim > 0.98 && c.attackSide === 0) c.attackSide = c.id % 2 ? 1 : -1;
    if (c.attackAnim <= 0) c.attackSide = 0;
    const swing = clubbed ? atk * c.attackSide : 0;

    // tail: follows turning with lag + idle sway; club tails whip through the swing
    if (clubbed) {
      // hips twist against the club, then the body lunges into the strike
      lerp(r.torso, "y", swing * 0.38, Math.min(1, dt * 11));
      lerp(r.torso, "x", -0.18 * atkAbs, Math.min(1, dt * 11));
      lerp(r.body, "z", swing * -0.12, Math.min(1, dt * 11));
      lerp(r.body, "y", -swing * 0.16, Math.min(1, dt * 11));
    } else {
      lerp(r.torso, "y", 0, Math.min(1, dt * 9));
      lerp(r.body, "y", 0, Math.min(1, dt * 9));
    }
    const turn = THREE.MathUtils.clamp(c.turnRate * 0.15, -0.4, 0.4) + swing * 0.5;
    r.tail.forEach((s, i) => {
      const sway = Math.sin(t * 1.6 - i * 0.6) * (0.06 + 0.04 * i) * (1 + amp);
      // segments lag and overshoot along the sweep → a proper whip motion
      const lag = Math.max(0, atkP - i * 0.07);
      const whip = clubbed ? curve(Math.min(1, lag)) * c.attackSide * (0.55 + i * 0.34) : 0;
      lerp(s, "y", -turn * (i + 1) * 0.35 + sway + whip, Math.min(1, dt * 10));
      lerp(s, "x", (i === 0 ? -0.08 : 0.03) + Math.sin(c.walkPhase * 2 - i) * 0.03 * amp - atkAbs * 0.12 * (clubbed ? 1 : 0));
    });

    // neck & head: look-at, grazing, roar, and the bite/bite-brace of the attack
    const lunge = Math.max(0, atk); // 0 → overshoot 1.2 → 0 (strike through)
    const recoil = Math.max(0, -atk); // wind-up / recover
    const roar = c.roarTimer > 0 ? Math.sin(Math.min(1, c.roarTimer / 1.0) * Math.PI) : 0;
    const graze = c.grazeTimer > 0 ? Math.min(1, c.grazeTimer, 1) : 0;
    const lift = sp.form === "biped" ? sp.neckRise * 0.78 : sp.neckRise;
    const brace = clubbed ? atkAbs * 0.22 : 0;
    const neck0 = -lift * 0.62 - (sp.extras?.includes("quadwalk") ? 0.25 * c.quadT : 0) + lunge * 0.3 - roar * 0.2 + graze * (lift * 0.5 + 0.55) - brace;
    lerp(r.neck[0], "x", neck0, Math.min(1, dt * 6));
    for (let i = 1; i < r.neck.length; i++) lerp(r.neck[i], "x", -lift * (i === 1 ? 0.26 : 0.12) + graze * 0.18 - roar * 0.06 - brace * 0.5);
    let look = 0;
    if (c.lookTarget) {
      const a = Math.atan2(c.lookTarget.x - c.pos.x, c.lookTarget.z - c.pos.z) - c.yaw;
      look = THREE.MathUtils.clamp(Math.atan2(Math.sin(a), Math.cos(a)), -0.9, 0.9);
    }
    const per = look / r.neck.length;
    r.neck.forEach((n) => lerp(n, "y", per + Math.sin(t * 0.7) * 0.03, Math.min(1, dt * 4)));
    lerp(r.head, "x", sp.neckRise * 0.85 - lunge * 0.25 - roar * 0.25 - graze * 0.5 + recoil * 0.12 + brace * 0.5, Math.min(1, dt * 6));
    const jawOpen = Math.max(lunge * 0.62, roar * 0.8, graze > 0 ? Math.max(0, Math.sin(t * 6)) * 0.2 : 0, c.state === "chase" ? 0.12 : 0) * (clubbed ? 0.35 : 1);
    lerp(r.jaw, "x", jawOpen, Math.min(1, dt * 14));
    if (r.frill) {
      const open = c.state === "chase" || roar > 0 ? 1 : 0.05;
      const setOpen = r.frill.userData.setOpen as ((v: number) => void) | undefined;
      if (setOpen) {
        // Dilophosaurus: a real rib-and-membrane frill that folds against the neck and spreads out when angry
        const prev = (r.frill.userData.open as number) ?? 0.05;
        const cur = prev + (open - prev) * Math.min(1, dt * 7);
        if (Math.abs(cur - prev) > 0.002) setOpen(cur);
      } else {
        const cur = r.frill.scale.x + (open - r.frill.scale.x) * Math.min(1, dt * 6);
        r.frill.scale.setScalar(cur);
      }
    }
  }

  // ------------------------------------------------------------ spawning
  private spawnTick(ppos: THREE.Vector3) {
    const wild = this.list.filter((c) => !c.tamed && c.alive).length;
    if (wild >= this.h.rules().maxWildCreatures) return;
    const a = Math.random() * Math.PI * 2;
    const d = 55 + Math.random() * 70;
    const x = ppos.x + Math.cos(a) * d, z = ppos.z + Math.sin(a) * d;
    const t = this.h.terrain;
    if (!t.isInside(x, z)) return;
    const biome = t.biomeAt(x, z);
    if (biome === "water") {
      if (this.h.easySpawnDistance(x, z) < 160) return;
      if (t.heightAt(x, z) < -5 && this.list.filter((c) => c.sp.movement === "swim").length < 4 && Math.random() < 0.35) this.spawn("megalodon", x, z, rollLevel(effective(this.h.rules()).maxLevel)).pos.y = -3;
      return;
    }
    if (this.h.structureBlocked(x, z)) return;
    const night = this.h.isNight();
    // variety: species already present nearby become much less likely (1 ptero, 1 trike... per region)
    const nearCount = new Map<string, number>();
    for (const o of this.list) if (!o.tamed && o.alive && Math.hypot(o.pos.x - x, o.pos.z - z) < 120) nearCount.set(o.sp.id, (nearCount.get(o.sp.id) ?? 0) + 1);
    const easyDistance = this.h.easySpawnDistance(x, z);
    const weights = SPECIES_LIST.map((s) => {
      // Easy southern shores remain a real beginner biome. Dilos are the only
      // wild predators inside the protected region; further inland danger ramps up.
      const dangerous = s.temperament === "aggressive" || s.temperament === "angry" || s.temperament === "territorial" || s.temperament === "ambush" || s.temperament === "shorttempered";
      if (dangerous && s.id !== "dilo" && easyDistance < 175) return 0;
      if (dangerous && s.id !== "dilo" && easyDistance < 240) return 0.08 * (s.spawn[biome as Biome] ?? 0);
      return (s.spawn[biome as Biome] ?? 0) * (night ? s.nightMult ?? 1 : 1) / (1 + (nearCount.get(s.id) ?? 0) * 2.5);
    });
    const total = weights.reduce((a2, b) => a2 + b, 0);
    if (total <= 0) return;
    let r = Math.random() * total;
    let sp = SPECIES_LIST[0];
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r <= 0) { sp = SPECIES_LIST[i]; break; }
    }
    const already = nearCount.get(sp.id) ?? 0;
    const cap = sp.packBonus ? 3 : sp.id === "dodo" ? 3 : 2;
    const n = Math.max(0, Math.min(cap - already, sp.packSize[0] + Math.floor(Math.random() * (sp.packSize[1] - sp.packSize[0] + 1))));
    if (n <= 0) return;
    const lvl = rollLevel(effective(this.h.rules()).maxLevel);
    for (let i = 0; i < n; i++) {
      const px = x + (Math.random() - 0.5) * 6, pz = z + (Math.random() - 0.5) * 6;
      if (t.heightAt(px, pz) < 0.3) continue;
      this.spawn(sp.id, px, pz, Math.max(1, lvl + Math.floor((Math.random() - 0.5) * 4)));
    }
  }

  /** Initial population around the island when a new game starts. */
  populate(center: THREE.Vector3) {
    if (this.puppet) return;
    for (let i = 0; i < 40; i++) this.spawnTick(center);
    // a few dodos near spawn so the player can hunt early
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * Math.PI * 2;
      const x = center.x + Math.cos(a) * 18, z = center.z + Math.sin(a) * 18;
      if (this.h.terrain.heightAt(x, z) > 0.4) this.spawn("dodo", x, z, 1 + Math.floor(Math.random() * 5));
    }
  }

  serializeOne(c: Creature): SavedCreature {
    return {
      species: c.sp.id, ownerId: c.ownerId, level: c.level, name: c.name, pos: [c.pos.x, c.pos.y, c.pos.z], yaw: c.yaw,
      health: c.health, food: c.food, command: c.command, stance: c.stance, inv: c.inventory.serialize(), xp: c.xp,
      gender: c.gender, age: c.age, imprint: c.imprint, mating: c.mating, mateCooldown: c.mateCooldown, statLv: { ...c.statLv }, statPoints: c.statPoints,
    };
  }

  serializeTamed(): SavedCreature[] {
    return this.list.filter((c) => c.tamed && c.alive).map((c) => ({
      species: c.sp.id, ownerId: c.ownerId, level: c.level, name: c.name, pos: [c.pos.x, c.pos.y, c.pos.z], yaw: c.yaw,
      health: c.health, food: c.food, command: c.command, stance: c.stance, inv: c.inventory.serialize(), xp: c.xp,
      gender: c.gender, age: c.age, imprint: c.imprint, mating: c.mating, mateCooldown: c.mateCooldown, statLv: { ...c.statLv }, statPoints: c.statPoints,
    }));
  }

  loadTamed(list: SavedCreature[] | undefined) {
    if (!list) return;
    for (const s of list) {
      if (!SPECIES[s.species]) continue;
      const c = new Creature(s.species, s.level);
      c.tamed = true;
      c.ownerId = s.ownerId ?? "host";
      c.name = s.name;
      c.pos.set(s.pos[0], s.pos[1], s.pos[2]);
      c.home.copy(c.pos);
      c.yaw = s.yaw;
      c.maxHealth = statAtLevel(c.sp.health, c.level, 0.12) * 1.1;
      c.health = Math.min(c.maxHealth, s.health);
      c.damageMult = 1.1 + 0.03 * (c.level - 1);
      c.food = s.food;
      c.command = s.command;
      c.stance = s.stance;
      c.state = s.command === "stay" ? "stay" : s.command === "follow" ? "follow" : "idle";
      c.inventory.load(s.inv);
      c.xp = s.xp ?? 0;
      c.gender = s.gender ?? c.gender;
      c.age = s.age ?? 1;
      c.imprint = s.imprint ?? 0;
      c.mating = s.mating ?? false;
      c.mateCooldown = s.mateCooldown ?? 0;
      if (s.statLv) c.statLv = { ...c.statLv, ...s.statLv };
      c.statPoints = s.statPoints ?? 0;
      const hp = s.health;
      c.recompute();
      c.health = Math.min(c.maxHealth, hp);
      this.add(c);
    }
  }
}

function rollLevel(max = 30): number {
  // weighted towards low levels
  const r = Math.random();
  return Math.max(1, Math.min(max, Math.floor(1 + Math.pow(r, 2.2) * max)));
}
