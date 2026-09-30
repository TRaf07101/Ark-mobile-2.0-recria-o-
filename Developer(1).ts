import * as THREE from "three";
import type { Game } from "../game";
import { CONFIG, engramPointsForLevel, xpForLevel } from "../core/config";
import { ITEMS } from "../data/items";
import { SPECIES } from "../data/species";
import { ENGRAMS } from "../data/engrams";
import { STRUCTURES } from "../data/structures";
import { RULE_DEFS, type Rules } from "../core/settings";
import { Creature, type Creature as CreatureType, type SavedCreature } from "../entities/creatures";
import type { Command, Stance } from "../entities/creatures";
import type { WeatherKind } from "./weather";

export interface RecoveryRecord {
  key: number;
  creature: SavedCreature;
  diedAt: number;
}

export type DevRpcMethod =
  | "giveItem" | "setLevel" | "addXp" | "addPoints" | "setVitals" | "teleport"
  | "spawnCreature" | "forceTame" | "tameNearby" | "kill" | "killWild" | "setCreatureLevel"
  | "setCreatureHealth" | "healCreature" | "equipSaddle" | "addCreatureXp" | "addCreaturePoints"
  | "giveCreatureItem" | "setCreatureBehavior" | "teleportCreature" | "setCreatureAge" | "removeWild"
  | "revive" | "reviveCorpse" | "setRule" | "setWorldRule" | "setTime" | "setWeather" | "healEveryone"
  | "refillNodes" | "restoreAllNodes" | "spawnStructure" | "repairAll" | "dropSupply" | "rename"
  | "unlockAllEngrams" | "revivePlayer";

const GUEST_RPC_METHODS = new Set<DevRpcMethod>([
  "giveItem", "setLevel", "addXp", "addPoints", "setVitals", "teleport",
  "spawnCreature", "forceTame", "tameNearby", "kill", "killWild", "setCreatureLevel",
  "setCreatureHealth", "healCreature", "equipSaddle", "addCreatureXp", "addCreaturePoints",
  "giveCreatureItem", "setCreatureBehavior", "teleportCreature", "setCreatureAge", "removeWild",
  "revive", "reviveCorpse", "setRule", "setWorldRule", "setTime", "setWeather", "healEveryone",
  "refillNodes", "restoreAllNodes", "spawnStructure", "repairAll", "dropSupply", "rename",
  "unlockAllEngrams", "revivePlayer",
]);

export type DevRpcArg = string | number | boolean | null | { creatureId: number };

export type DevNetAction =
  | { op: "item"; id: string; count: number }
  | { op: "xp"; amount: number }
  | { op: "level"; level: number }
  | { op: "points"; stats: number; engrams: number }
  | { op: "teleport"; x: number; y: number; z: number }
  | { op: "rule"; key: "harvestAmount" | "xpMult" | "tamingSpeed" | "craftingSpeed"; value: number }
  | { op: "worldRule"; key: keyof Rules; value: number | boolean }
  | { op: "engrams" }
  | { op: "vitals"; health: number; stamina: number; food: number; water: number }
  | { op: "revive" }
  | { op: "heal" }
  | { op: "repair" }
  | { op: "invincible" | "flying" | "needs" | "weight"; value: boolean };

/** Developer controls. Player-local effects can run on each client; world effects are host-authoritative. */
export class DeveloperTools {
  invincible = false;
  flying = false;
  infiniteNeeds = false;
  infiniteItem = "";
  killOnTap = false;
  recent: RecoveryRecord[] = [];
  private nextRecovery = 1;
  private refillTimer = 0;
  private remoteActor: { pid: string; pos: THREE.Vector3; yaw: number } | null = null;

  constructor(private game: Game) {
    // Guest-side DEV uses a small, explicit RPC allow-list. No arbitrary function/code
    // can cross the network; the host receives only whitelisted method names + JSON-safe args.
    return new Proxy(this, {
      get: (target, prop, receiver) => {
        const value = Reflect.get(target, prop, receiver);
        if (typeof prop === "string" && GUEST_RPC_METHODS.has(prop as DevRpcMethod) && typeof value === "function") {
          return (...args: unknown[]) => {
            if (target.game.isGuest) return target.requestHost(prop as DevRpcMethod, args);
            return (value as (...a: unknown[]) => unknown).apply(target, args);
          };
        }
        return value;
      },
    }) as DeveloperTools;
  }

  private requestHost(method: DevRpcMethod, args: unknown[]) {
    const serialized: DevRpcArg[] = args.map((arg): DevRpcArg => {
      if (arg instanceof Creature) return { creatureId: arg.id };
      if (arg === null || typeof arg === "string" || typeof arg === "number" || typeof arg === "boolean") return arg;
      throw new Error("Comando DEV inválido.");
    });
    this.game.net.devRequest(method, serialized);
  }

  /** Executa uma solicitação DEV enviada por um convidado, sempre no host. */
  applyHostRequest(pid: string, method: DevRpcMethod, args: DevRpcArg[]) {
    if (!this.allowed || this.game.net.role !== "host") throw new Error("Console DEV indisponível.");
    if (!GUEST_RPC_METHODS.has(method)) throw new Error("Comando DEV não permitido.");
    const actor = this.game.net.remotePlayers().find((p) => p.pid === pid);
    this.remoteActor = actor ? { pid, pos: actor.pos.clone(), yaw: actor.yaw } : null;
    try {
      const creature = (arg: DevRpcArg, required = true): CreatureType | null => {
        if (!arg || typeof arg !== "object" || !("creatureId" in arg)) {
          if (required) throw new Error("Criatura inválida.");
          return null;
        }
        const c = this.game.creatures.get(arg.creatureId);
        if (!c && required) throw new Error("Criatura não está mais disponível.");
        return c ?? null;
      };
      const num = (arg: DevRpcArg, fallback = 0) => typeof arg === "number" && Number.isFinite(arg) ? arg : fallback;
      const guestSelfTarget = (index: number) => {
        const raw = args[index];
        if (raw === undefined || raw === "self") return pid;
        throw new Error("Um convidado só pode aplicar comandos de jogador em si mesmo.");
      };
      switch (method) {
        case "giveItem": this.giveItem(String(args[0] ?? ""), num(args[1], 1), guestSelfTarget(2)); break;
        case "setLevel": this.setLevel(num(args[0], 1), guestSelfTarget(1)); break;
        case "addXp": this.addXp(num(args[0], 1), guestSelfTarget(1)); break;
        case "addPoints": this.addPoints(num(args[0], 0), num(args[1], 0), guestSelfTarget(2)); break;
        case "setVitals": this.setVitals(num(args[0], 100), num(args[1], 100), num(args[2], 100), num(args[3], 100), guestSelfTarget(4)); break;
        case "teleport": this.teleport(num(args[0]), num(args[1]), args[2] === null || typeof args[2] === "number" ? (args[2] as number | null) ?? undefined : undefined, guestSelfTarget(3)); break;
        case "unlockAllEngrams": this.unlockAllEngrams(guestSelfTarget(0)); break;
        case "revivePlayer": this.revivePlayer(guestSelfTarget(0)); break;
        case "spawnCreature": {
          this.requireRemoteActor();
          this.spawnCreature(String(args[0] ?? ""), num(args[1], 1), !!args[2], !!args[3]);
          break;
        }
        case "forceTame": this.forceTame(creature(args[0])!, pid); break;
        case "tameNearby": { this.requireRemoteActor(); this.tameNearby(num(args[0], 70)); break; }
        case "kill": this.kill(creature(args[0])!); break;
        case "killWild": { this.requireRemoteActor(); this.killWild(num(args[0], 70)); break; }
        case "setCreatureLevel": this.setCreatureLevel(creature(args[0])!, num(args[1], 1)); break;
        case "setCreatureHealth": this.setCreatureHealth(creature(args[0])!, num(args[1], 100)); break;
        case "healCreature": this.healCreature(creature(args[0])!); break;
        case "equipSaddle": this.equipSaddle(creature(args[0])!); break;
        case "addCreatureXp": this.addCreatureXp(creature(args[0])!, num(args[1], 1)); break;
        case "addCreaturePoints": this.addCreaturePoints(creature(args[0])!, num(args[1], 1)); break;
        case "giveCreatureItem": this.giveCreatureItem(creature(args[0])!, String(args[1] ?? ""), num(args[2], 1)); break;
        case "setCreatureBehavior": {
          const command = String(args[1] ?? "");
          const stance = String(args[2] ?? "");
          if (!["follow", "stay", "wander"].includes(command)) throw new Error("Comando de comportamento inválido.");
          if (!["passive", "neutral", "aggressive"].includes(stance)) throw new Error("Postura inválida.");
          this.setCreatureBehavior(creature(args[0])!, command as never, stance as never);
          break;
        }
        case "teleportCreature": { if (args[1]) this.requireRemoteActor(); this.teleportCreature(creature(args[0])!, !!args[1]); break; }
        case "setCreatureAge": this.setCreatureAge(creature(args[0])!, !!args[1]); break;
        case "removeWild": { this.requireRemoteActor(); this.removeWild(num(args[0], 70)); break; }
        case "revive": { this.requireRemoteActor(); this.revive(num(args[0], 0)); break; }
        case "reviveCorpse": this.reviveCorpse(creature(args[0])!, !!args[1], pid); break;
        case "setRule": {
          const key = String(args[0] ?? "");
          if (!["harvestAmount", "xpMult", "tamingSpeed", "craftingSpeed"].includes(key)) throw new Error("Multiplicador inválido.");
          this.setRule(key as never, num(args[1], 1));
          break;
        }
        case "setWorldRule": this.setWorldRule(String(args[0]) as keyof Rules, args[1] as number | boolean); break;
        case "setTime": this.setTime(num(args[0], 0)); break;
        case "setWeather": {
          const kind = String(args[0] ?? "");
          if (!["clear", "cloudy", "rain", "storm", "fog"].includes(kind)) throw new Error("Clima inválido.");
          this.setWeather(kind as WeatherKind);
          break;
        }
        case "healEveryone": this.healEveryone(); break;
        case "refillNodes": { this.requireRemoteActor(); this.refillNodes(num(args[0], 70)); break; }
        case "restoreAllNodes": this.restoreAllNodes(); break;
        case "spawnStructure": { this.requireRemoteActor(); this.spawnStructure(String(args[0] ?? "")); break; }
        case "repairAll": this.repairAll(); this.game.net.devBroadcast({ op: "repair" }); break;
        case "dropSupply": { this.requireRemoteActor(); this.dropSupply(num(args[0], 3)); break; }
        case "rename": this.rename(creature(args[0])!, String(args[1] ?? "")); break;
      }
    } finally {
      this.remoteActor = null;
    }
  }

  private requireRemoteActor() {
    if (!this.remoteActor) throw new Error("A posição do convidado ainda não foi sincronizada. Tente novamente.");
  }

  private actorPos() { return this.remoteActor?.pos ?? this.game.player.pos; }
  private actorYaw() { return this.remoteActor?.yaw ?? this.game.player.yaw; }

  record(c: CreatureType) {
    if (!c.tamed) return;
    this.recent.unshift({ key: this.nextRecovery++, creature: this.game.creatures.serializeOne(c), diedAt: this.game.time });
    this.recent = this.recent.slice(0, 40);
  }

  load(records: RecoveryRecord[] | undefined) {
    this.recent = (records ?? []).filter((r) => !!SPECIES[r.creature.species]).slice(0, 40);
    this.nextRecovery = Math.max(1, ...this.recent.map((r) => r.key + 1));
  }

  /** Accepted only by the guest's connection to its host, never from another guest. */
  applyRemote(action: DevNetAction) {
    if (!this.game.isGuest) return;
    const p = this.game.player;
    switch (action.op) {
      case "item":
        if (ITEMS[action.id]) this.game.giveItems([{ item: action.id, qty: Math.min(10000, Math.max(1, action.count)) }]);
        break;
      case "xp": p.addXp(Math.max(0, Math.min(1e7, action.amount))); break;
      case "level": DeveloperTools.applyLevel(this.game, action.level); break;
      case "points": p.statPoints += action.stats; p.engramPoints += action.engrams; break;
      case "teleport":
        if (this.game.riding) this.game.dismount();
        p.pos.set(action.x, action.y, action.z); p.vel.set(0, 0, 0);
        break;
      case "rule": this.game.rules[action.key] = action.value; break;
      case "worldRule": (this.game.rules as unknown as Record<string, number | boolean>)[action.key] = action.value; break;
      case "engrams":
        for (const e of ENGRAMS) p.learned.add(e.id);
        break;
      case "vitals":
        p.health = p.max("health") * THREE.MathUtils.clamp(action.health / 100, 0, 1);
        p.stamina = p.max("stamina") * THREE.MathUtils.clamp(action.stamina / 100, 0, 1);
        p.food = p.max("food") * THREE.MathUtils.clamp(action.food / 100, 0, 1);
        p.water = p.max("water") * THREE.MathUtils.clamp(action.water / 100, 0, 1);
        break;
      case "revive":
        p.resetForRespawn();
        p.health = p.max("health"); p.food = p.max("food"); p.water = p.max("water");
        break;
      case "repair":
        for (const structure of this.game.building.list) structure.hp = structure.def.hp;
        break;
      case "heal":
        p.health = p.max("health"); p.stamina = p.max("stamina");
        p.food = p.max("food"); p.water = p.max("water"); p.torpor = 0;
        break;
      case "invincible": this.invincible = action.value; break;
      case "flying": this.flying = action.value; p.vel.set(0, 0, 0); break;
      case "needs": this.infiniteNeeds = action.value; break;
      case "weight": p.weightInfinite = action.value; break;
    }
    this.game.events.emit("inventory", undefined);
  }

  get allowed() { return this.game.state === "playing" && (this.game.net.role === "host" || this.game.devUnlocked); }

  private requireLocalDev() {
    if (!this.allowed) throw new Error("Desbloqueie o console DEV (senha) antes de usar os comandos.");
  }

  /** Whoever owns the world may run world-level commands: the host in multiplayer, or the
   *  player in a solo game (net.role === "off"). Guests never reach this; they go through RPC. */
  private requireHost() {
    if (this.game.net.role === "guest") throw new Error("Apenas o anfitrião pode executar este comando.");
    if (!this.allowed) throw new Error("Desbloqueie o console DEV (senha) antes de usar os comandos.");
  }

  private announce(text: string) {
    this.game.notify(text, "good");
    this.game.events.emit("inventory", undefined);
  }

  resetForWorld() {
    this.invincible = false;
    this.flying = false;
    this.infiniteNeeds = false;
    this.game.player.weightInfinite = false;
    this.infiniteItem = "";
    this.killOnTap = false;
    this.load(undefined);
  }

  tick(dt: number) {
    if (this.game.state !== "playing") return;
    const p = this.game.player;
    if (this.infiniteNeeds && !p.dead) {
      p.health = p.max("health"); p.stamina = p.max("stamina");
      p.food = p.max("food"); p.water = p.max("water"); p.torpor = 0;
      p.unconscious = false; p.exhausted = false;
    }
    if (!this.allowed || !this.infiniteItem || !ITEMS[this.infiniteItem]) return;
    this.refillTimer -= dt;
    if (this.refillTimer > 0) return;
    this.refillTimer = 0.5;
    const id = this.infiniteItem;
    const target = ITEMS[id].stack > 1 ? ITEMS[id].stack : 1;
    if (p.count(id) < target) {
      const missing = target - p.count(id);
      const left = p.inv.add(id, missing);
      const overflow = left > 0 ? p.bar.add(id, left) : 0;
      if (overflow < missing) this.game.events.emit("inventory", undefined);
    }
  }

  toggleInvincible(v: boolean) { this.requireLocalDev(); this.invincible = v; this.announce(`Invencibilidade ${v ? "ativada" : "desativada"}.`); }
  toggleAllInvincible(v: boolean) { this.toggleInvincible(v); this.game.net.devBroadcast({ op: "invincible", value: v }); }
  toggleFlying(v: boolean) {
    this.requireLocalDev();
    if (v && this.game.riding) this.game.dismount();
    this.flying = v; this.game.player.vel.set(0, 0, 0);
    this.announce(`Voo livre ${v ? "ativado" : "desativado"}.`);
  }
  toggleNeeds(v: boolean) { this.requireLocalDev(); this.infiniteNeeds = v; this.announce(`Necessidades infinitas ${v ? "ativadas" : "desativadas"}.`); }
  toggleAllNeeds(v: boolean) { this.toggleNeeds(v); this.game.net.devBroadcast({ op: "needs", value: v }); }
  toggleWeight(v: boolean) { this.requireLocalDev(); this.game.player.weightInfinite = v; this.announce(`Peso infinito ${v ? "ativado" : "desativado"}.`); }
  toggleAllWeight(v: boolean) { this.toggleWeight(v); this.game.net.devBroadcast({ op: "weight", value: v }); }
  setPlayerFlag(flag: "invincible" | "flying" | "needs" | "weight", value: boolean, target: string) {
    if (this.game.isGuest) {
      if (target !== "self") throw new Error("Convidados só podem alterar os próprios poderes locais.");
      if (flag === "invincible") this.toggleInvincible(value);
      else if (flag === "flying") this.toggleFlying(value);
      else if (flag === "needs") this.toggleNeeds(value);
      else this.toggleWeight(value);
      return;
    }
    this.requireHost();
    if (target === "host" || target === "all") {
      if (flag === "invincible") this.toggleInvincible(value);
      else if (flag === "flying") this.toggleFlying(value);
      else if (flag === "needs") this.toggleNeeds(value);
      else this.toggleWeight(value);
    }
    if (target === "all") this.game.net.devBroadcast({ op: flag, value });
    else if (target !== "host") {
      if (!this.game.net.conns.has(target)) throw new Error("Jogador desconectado.");
      this.game.net.devSend(target, { op: flag, value });
    }
    this.announce(`${flag === "weight" ? "Peso infinito" : flag} ${value ? "ativado" : "desativado"} para ${target === "all" ? "todos" : target === "host" ? "você" : "o jogador"}.`);
  }
  toggleKillTap(v: boolean) { this.requireLocalDev(); this.killOnTap = v; this.announce(`Eliminar ao tocar ${v ? "ativado" : "desativado"}.`); }

  giveItem(id: string, count: number, target = "host") {
    this.requireHost();
    if (!ITEMS[id]) throw new Error("Item desconhecido.");
    count = Math.max(1, Math.min(10000, Math.floor(Number(count) || 1)));
    if (target !== "host" && target !== "all") {
      if (!this.game.net.conns.has(target)) throw new Error("Jogador desconectado.");
      this.game.net.devSend(target, { op: "item", id, count });
    } else if (target === "all") {
      this.game.giveItems([{ item: id, qty: count }]);
      this.game.net.devBroadcast({ op: "item", id, count });
    } else this.game.giveItems([{ item: id, qty: count }]);
    this.announce(`${count} × ${ITEMS[id].name} enviado(s).`);
  }

  setInfiniteItem(id: string) {
    this.requireLocalDev();
    if (id && !ITEMS[id]) throw new Error("Item desconhecido.");
    this.infiniteItem = id;
    this.announce(id ? `${ITEMS[id].name} será reposto automaticamente.` : "Reposição de itens desligada.");
  }

  setLevel(level: number, target = "host") {
    this.requireHost();
    level = Math.max(1, Math.min(CONFIG.player.maxLevel, Math.floor(Number(level) || 1)));
    if (target !== "host") {
      if (target === "all") this.game.net.devBroadcast({ op: "level", level });
      else if (this.game.net.conns.has(target)) this.game.net.devSend(target, { op: "level", level });
      else throw new Error("Jogador desconectado.");
    }
    if (target === "host" || target === "all") DeveloperTools.applyLevel(this.game, level);
    this.announce(`Nível definido como ${level}.`);
  }

  static applyLevel(g: Game, level: number) {
    const p = g.player;
    const old = p.level;
    p.level = level;
    p.xp = xpForLevel(level);
    if (level > old) {
      p.statPoints += level - old;
      for (let n = old + 1; n <= level; n++) p.engramPoints += engramPointsForLevel(n);
    } else {
      p.statPoints = Math.max(0, p.statPoints - (old - level));
      for (let n = level + 1; n <= old; n++) p.engramPoints = Math.max(0, p.engramPoints - engramPointsForLevel(n));
    }
    p.health = Math.min(p.health, p.max("health"));
    p.stamina = Math.min(p.stamina, p.max("stamina"));
    g.events.emit("inventory", undefined);
  }

  addXp(amount: number, target = "host") {
    this.requireHost();
    amount = Math.max(1, Math.min(1e7, Math.floor(Number(amount) || 1)));
    if (target !== "host") {
      if (target === "all") this.game.net.devBroadcast({ op: "xp", amount });
      else if (this.game.net.conns.has(target)) this.game.net.devSend(target, { op: "xp", amount });
      else throw new Error("Jogador desconectado.");
    }
    if (target === "host" || target === "all") this.game.player.addXp(amount);
    this.announce(`+${amount.toLocaleString("pt-BR")} XP.`);
  }

  addPoints(stats: number, engrams: number, target = "host") {
    this.requireHost();
    stats = Math.max(0, Math.min(1000, Math.floor(Number(stats) || 0)));
    engrams = Math.max(0, Math.min(10000, Math.floor(Number(engrams) || 0)));
    if (target !== "host") {
      if (target === "all") this.game.net.devBroadcast({ op: "points", stats, engrams });
      else if (this.game.net.conns.has(target)) this.game.net.devSend(target, { op: "points", stats, engrams });
      else throw new Error("Jogador desconectado.");
    }
    if (target === "host" || target === "all") { this.game.player.statPoints += stats; this.game.player.engramPoints += engrams; }
    this.announce(`+${stats} pontos de atributo e +${engrams} pontos de engrama.`);
  }

  setRule(key: "harvestAmount" | "xpMult" | "tamingSpeed" | "craftingSpeed", value: number) {
    this.requireHost();
    const v = Math.max(0.25, Math.min(25, Number(value) || 1));
    this.game.rules[key] = v;
    this.game.net.devBroadcast({ op: "rule", key, value: v });
    this.announce(`${key} = ${v.toFixed(2)}× para todos.`);
  }

  setWorldRule(key: keyof Rules, value: number | boolean) {
    this.requireHost();
    const definition = RULE_DEFS.find((r) => r.key === key);
    if (!definition) throw new Error("Regra desconhecida.");
    const current = this.game.rules[key];
    if (typeof current === "boolean") value = !!value;
    else {
      const number = Number(value);
      if (!Number.isFinite(number)) throw new Error("Digite um valor numérico válido.");
      value = Math.max(key === "dayCycleSpeed" ? 0 : definition.min ?? 0, Math.min(definition.max ?? 25, number));
      if (key === "maxWildCreatures") value = Math.round(value);
    }
    (this.game.rules as unknown as Record<string, number | boolean>)[key] = value;
    this.game.net.devBroadcast({ op: "worldRule", key, value });
    this.announce(`${definition.label}: ${value}.`);
  }

  unlockAllEngrams(target = "host") {
    this.requireHost();
    if (target === "all") this.game.net.devBroadcast({ op: "engrams" });
    else if (target !== "host") {
      if (!this.game.net.conns.has(target)) throw new Error("Jogador desconectado.");
      this.game.net.devSend(target, { op: "engrams" });
    }
    if (target === "host" || target === "all") for (const e of ENGRAMS) this.game.player.learned.add(e.id);
    this.announce("Todos os engramas aprendidos.");
  }

  setVitals(healthPercent: number, staminaPercent: number, foodPercent: number, waterPercent: number, target = "host") {
    this.requireHost();
    const p = this.game.player;
    const percent = (v: number) => Math.max(0, Math.min(100, Number(v) || 0)) / 100;
    const values = {
      health: Math.round(percent(healthPercent) * 100),
      stamina: Math.round(percent(staminaPercent) * 100),
      food: Math.round(percent(foodPercent) * 100),
      water: Math.round(percent(waterPercent) * 100),
    };
    if (target === "all") this.game.net.devBroadcast({ op: "vitals", ...values });
    else if (target !== "host") {
      if (!this.game.net.conns.has(target)) throw new Error("Jogador desconectado.");
      this.game.net.devSend(target, { op: "vitals", ...values });
    }
    if (target === "host" || target === "all") {
      p.health = p.max("health") * percent(values.health);
      p.stamina = p.max("stamina") * percent(values.stamina);
      p.food = p.max("food") * percent(values.food);
      p.water = p.max("water") * percent(values.water);
    }
    this.announce("Barras do sobrevivente ajustadas.");
  }

  spawnCreature(species: string, level: number, tame = false, saddled = false) {
    this.requireHost();
    if (!SPECIES[species]) throw new Error("Espécie desconhecida.");
    const g = this.game;
    const p = this.actorPos();
    const a = this.actorYaw();
    let x = p.x + Math.sin(a) * 7, z = p.z + Math.cos(a) * 7;
    if (SPECIES[species].movement === "swim") {
      let water: [number, number] | null = null;
      for (let r = 15; r <= 240 && !water; r += 8) for (let k = 0; k < 16; k++) {
        const ang = a + k * Math.PI / 8;
        const xx = p.x + Math.sin(ang) * r, zz = p.z + Math.cos(ang) * r;
        if (g.terrain.isInside(xx, zz) && g.terrain.heightAt(xx, zz) < -3) { water = [xx, zz]; break; }
      }
      if (!water) throw new Error("Nenhuma água profunda encontrada na ilha para esta criatura.");
      [x, z] = water;
    }
    const c = g.creatures.spawn(species, x, z, Math.max(1, Math.min(250, Math.floor(Number(level) || 1))));
    if (c.sp.movement === "swim") c.pos.y = -2;
    if (tame) this.forceTame(c, this.remoteActor?.pid ?? "host");
    if (saddled) this.equipSaddle(c);
    this.announce(`${SPECIES[species].name} invocado (Nv ${c.level}).`);
    return c;
  }

  forceTame(c: CreatureType, ownerId = "host") {
    this.requireHost();
    if (!c.alive || c.sp.id === "guardian") throw new Error("Esta criatura não pode ser domesticada.");
    if (c.tamed) return;
    c.tamed = true; c.ownerId = ownerId; c.taming = null; c.torpor = 0;
    c.state = "follow"; c.command = "follow"; c.stance = "neutral";
    c.target = null; c.food = c.maxFood; c.recompute(); c.health = c.maxHealth;
    this.announce(`${c.name} domesticado instantaneamente.`);
  }

  tameNearby(radius: number) {
    this.requireHost();
    let n = 0;
    for (const c of this.game.creatures.list) if (!c.tamed && c.alive && c.sp.id !== "guardian" && c.pos.distanceTo(this.actorPos()) < radius) { this.forceTame(c, this.remoteActor?.pid ?? "host"); n++; }
    this.announce(`${n} criatura(s) domesticada(s) em ${radius} m.`);
  }

  kill(c: CreatureType) {
    this.requireHost();
    if (!c.alive) return;
    this.game.creatures.kill(c, false);
    if (this.game.riding === c) this.game.dismount();
    this.announce(`${c.name} eliminado.`);
  }

  killWild(radius: number) {
    this.requireHost();
    let n = 0;
    for (const c of [...this.game.creatures.list]) if (c.alive && !c.tamed && c.pos.distanceTo(this.actorPos()) <= radius) { this.game.creatures.kill(c, false); n++; }
    this.announce(`${n} criatura(s) selvagem(ns) eliminada(s).`);
  }

  setCreatureLevel(c: CreatureType, level: number) {
    this.requireHost();
    if (!c.alive) throw new Error("Reviva a criatura antes de alterar o nível.");
    c.level = Math.max(1, Math.min(250, Math.floor(Number(level) || 1)));
    c.recompute(); c.health = c.maxHealth; c.torpor = 0;
    this.announce(`${c.name} agora é nível ${c.level}.`);
  }

  setCreatureHealth(c: CreatureType, percent: number) {
    this.requireHost();
    if (!c.alive) throw new Error("Reviva a criatura primeiro.");
    c.health = Math.max(1, Math.min(c.maxHealth, c.maxHealth * Math.max(1, Math.min(100, Number(percent) || 1)) / 100));
    this.announce(`Vida de ${c.name}: ${Math.round(c.health)}/${Math.round(c.maxHealth)}.`);
  }

  healCreature(c: CreatureType) {
    this.requireHost();
    if (!c.alive) throw new Error("Reviva a criatura primeiro.");
    c.health = c.maxHealth; c.stamina = c.maxStamina; c.food = c.maxFood; c.torpor = 0;
    this.announce(`${c.name} curado.`);
  }

  equipSaddle(c: CreatureType) {
    this.requireHost();
    if (!c.alive || !c.sp.rideable) throw new Error("Esta criatura não aceita sela.");
    const saddle = Object.values(ITEMS).find((item) => item.saddle?.species === c.sp.id);
    if (!saddle) throw new Error("Não existe sela para esta espécie.");
    if (!c.tamed) this.forceTame(c, this.remoteActor?.pid ?? "host");
    if (!c.hasSaddle()) {
      if (c.inventory.capacityFor(saddle.id) < 1) throw new Error("Inventário da criatura cheio.");
      c.inventory.add(saddle.id, 1);
    }
    this.announce(`${c.name} recebeu ${saddle.name}.`);
  }

  addCreatureXp(c: CreatureType, amount: number) {
    this.requireHost();
    if (!c.alive || !c.tamed) throw new Error("Domestique ou reviva a criatura primeiro.");
    this.game.creatures.giveCreatureXp(c, Math.max(1, Math.min(1e7, Math.floor(Number(amount) || 1))));
    this.announce(`${c.name} recebeu XP. Nível ${c.level}.`);
  }

  addCreaturePoints(c: CreatureType, amount: number) {
    this.requireHost();
    if (!c.alive || !c.tamed) throw new Error("Domestique ou reviva a criatura primeiro.");
    c.statPoints += Math.max(1, Math.min(1000, Math.floor(Number(amount) || 1)));
    this.announce(`${c.name}: ${c.statPoints} pontos disponíveis.`);
  }

  giveCreatureItem(c: CreatureType, itemId: string, qty: number) {
    this.requireHost();
    if (!c.alive || !ITEMS[itemId]) throw new Error("Criatura ou item inválido.");
    const amount = Math.max(1, Math.min(10000, Math.floor(Number(qty) || 1)));
    const left = c.inventory.add(itemId, amount);
    if (left === amount) throw new Error("Inventário da criatura cheio.");
    this.announce(`${amount - left} × ${ITEMS[itemId].name} entregue(s) a ${c.name}.`);
  }

  setCreatureBehavior(c: CreatureType, command: Command, stance: Stance) {
    this.requireHost();
    if (!c.alive) throw new Error("Reviva a criatura primeiro.");
    if (!c.tamed) this.forceTame(c, this.remoteActor?.pid ?? "host");
    this.game.setCommand(c, command);
    this.game.setStance(c, stance);
    this.announce(`${c.name}: ${command}, ${stance}.`);
  }

  teleportCreature(c: CreatureType, toPlayer: boolean) {
    this.requireHost();
    if (!c.alive) throw new Error("Reviva a criatura primeiro.");
    if (this.game.riding === c) this.game.dismount();
    const target = toPlayer ? this.actorPos() : this.game.terrain.spawnPoint;
    const x = target.x + 4, z = target.z + 2;
    if (c.sp.movement === "swim" && this.game.terrain.heightAt(x, z) > -2) throw new Error("Leve esta criatura aquática até água profunda.");
    c.pos.set(x, c.sp.movement === "swim" ? -2 : this.game.terrain.heightAt(x, z), z);
    c.vel.set(0, 0, 0);
    c.home.copy(c.pos);
    this.announce(`${c.name} teleportado ${toPlayer ? "até você" : "à praia inicial"}.`);
  }

  setCreatureAge(c: CreatureType, adult: boolean) {
    this.requireHost();
    if (!c.alive) throw new Error("Reviva a criatura primeiro.");
    c.age = adult ? 1 : 0;
    c.recompute();
    c.health = c.maxHealth;
    this.announce(`${c.name} agora é ${adult ? "adulto" : "filhote"}.`);
  }

  removeWild(radius: number) {
    this.requireHost();
    const max = Math.max(1, Number(radius) || 70);
    let removed = 0;
    for (const c of [...this.game.creatures.list]) if (!c.tamed && c.pos.distanceTo(this.actorPos()) < max) {
      this.game.creatures.remove(c);
      removed++;
    }
    this.announce(`${removed} criatura(s) selvagem(ns) removida(s) sem carcaças.`);
  }

  rename(c: CreatureType, name: string) {
    this.requireHost();
    const text = String(name).trim().slice(0, 24);
    if (!text) throw new Error("Digite um nome.");
    c.name = text;
    this.announce(`Criatura renomeada: ${text}.`);
  }

  revive(recordKey: number, nearPlayer = true) {
    this.requireHost();
    const r = this.recent.find((x) => x.key === recordKey);
    if (!r) throw new Error("Registro de recuperação não encontrado.");
    const saved = { ...r.creature, inv: r.creature.inv.map((s) => s && { ...s }) };
    const p = this.actorPos();
    if (nearPlayer) {
      saved.pos = [p.x + 4, p.y, p.z + 2];
      saved.pos[1] = this.game.physics.groundAt(saved.pos[0], saved.pos[2], 0.5, p.y + 4);
    }
    this.game.creatures.loadTamed([saved]);
    const c = this.game.creatures.list[this.game.creatures.list.length - 1];
    c.health = c.maxHealth; c.food = c.maxFood; c.torpor = 0;
    this.recent = this.recent.filter((x) => x.key !== recordKey);
    this.announce(`${c.name} revivido!`);
    return c;
  }

  /** Bring a still-existing corpse back as a tame (or a wild animal). */
  reviveCorpse(c: CreatureType, tame = true, ownerId = "host") {
    this.requireHost();
    if (c.alive) throw new Error("Esta criatura está viva.");
    c.state = tame ? "follow" : "idle";
    c.tamed = tame; c.ownerId = ownerId; c.command = "follow";
    c.taming = null; c.torpor = 0; c.deadAt = 0; c.animT = 0;
    c.rig.body.rotation.z = 0; c.rig.body.position.y = 0;
    c.recompute(); c.health = c.maxHealth; c.food = c.maxFood;
    this.announce(`${c.name} revivido${tame ? " e domesticado" : ""}.`);
  }

  teleport(x: number, z: number, y?: number, target = "host") {
    this.requireHost();
    const g = this.game;
    const bound = g.terrain.half - 5;
    x = THREE.MathUtils.clamp(Number(x) || 0, -bound, bound);
    z = THREE.MathUtils.clamp(Number(z) || 0, -bound, bound);
    const ground = g.physics.groundAt(x, z, CONFIG.player.radius, g.terrain.heightAt(x, z) + 12);
    const yy = y === undefined || !Number.isFinite(y) ? Math.max(ground, 0.5) + 0.2 : THREE.MathUtils.clamp(y, -10, 120);
    if (target !== "host") {
      if (target === "all") g.net.devBroadcast({ op: "teleport", x, y: yy, z });
      else if (g.net.conns.has(target)) g.net.devSend(target, { op: "teleport", x, y: yy, z });
      else throw new Error("Jogador desconectado.");
    }
    if (target === "host" || target === "all") {
      if (g.riding) g.dismount();
      g.player.pos.set(x, yy, z); g.player.vel.set(0, 0, 0);
    }
    this.announce(`Teleporte: ${Math.round(x)}, ${Math.round(yy)}, ${Math.round(z)}.`);
  }

  setTime(hour: number) {
    this.requireHost();
    const h = ((Number(hour) || 0) % 24 + 24) % 24;
    const cycle = CONFIG.time.daySeconds;
    this.game.clock = Math.floor(this.game.clock / cycle) * cycle + (((h - 6 + 24) % 24) / 24) * cycle;
    this.announce(`Horário definido: ${h.toFixed(1)}h.`);
  }

  setWeather(kind: WeatherKind) {
    this.requireHost();
    this.game.weather.set(kind, 500);
    this.announce(`Clima alterado para ${kind}.`);
  }

  healEveryone() {
    this.requireHost();
    const p = this.game.player;
    p.health = p.max("health"); p.stamina = p.max("stamina");
    p.food = p.max("food"); p.water = p.max("water"); p.torpor = 0;
    for (const c of this.game.creatures.list) if (c.tamed && c.alive) { c.health = c.maxHealth; c.food = c.maxFood; c.torpor = 0; }
    this.game.net.devBroadcast({ op: "heal" });
    this.announce("Jogadores e criaturas domesticadas curados.");
  }

  revivePlayer(target = "host") {
    this.requireHost();
    if (target === "all") this.game.net.devBroadcast({ op: "revive" });
    else if (target !== "host") {
      if (!this.game.net.conns.has(target)) throw new Error("Jogador desconectado.");
      this.game.net.devSend(target, { op: "revive" });
    }
    if (target === "host" || target === "all") {
      const p = this.game.player;
      p.resetForRespawn(); p.health = p.max("health");
      p.food = p.max("food"); p.water = p.max("water");
    }
    this.announce("Sobrevivente revivido.");
  }

  refillNodes(radius: number) {
    this.requireHost();
    let count = 0;
    for (const n of this.game.resources.nodes) if (n.respawnAt > 0 && n.respawnAt < 1e8 && Math.hypot(n.x - this.actorPos().x, n.z - this.actorPos().z) < radius) {
      this.game.resources.setAlive(n, true, this.game.time);
      this.game.resources.onChange?.(n);
      count++;
    }
    this.announce(`${count} recursos reapareceram.`);
  }

  restoreAllNodes() {
    this.requireHost();
    let count = 0;
    for (const n of this.game.resources.nodes) if (n.respawnAt > 0) {
      this.game.resources.setAlive(n, true, this.game.time);
      this.game.resources.onChange?.(n);
      count++;
    }
    this.announce(`${count} recursos restaurados no mapa.`);
  }

  spawnStructure(defId: string) {
    this.requireHost();
    const def = STRUCTURES[defId];
    if (!def) throw new Error("Estrutura desconhecida.");
    const p = this.actorPos();
    const a = this.actorYaw();
    const x = p.x + Math.sin(a) * 5, z = p.z + Math.cos(a) * 5;
    if (!this.game.terrain.isInside(x, z) || this.game.terrain.heightAt(x, z) <= 0.3) throw new Error("Escolha um local seco dentro da ilha.");
    const building = this.game.building;
    let structure;
    building.beginPlacement(defId);
    try {
      building.updatePlacement(new THREE.Vector3(x, this.game.terrain.heightAt(x, z), z), p, a);
      const place = building.placement;
      if (!place?.valid) throw new Error(place?.reason ?? "Não há encaixe ou suporte para esta estrutura aqui.");
      structure = building.create(defId, place);
    } finally {
      building.cancelPlacement();
    }
    this.game.grass?.forceRefresh();
    if (this.game.net.role === "host") this.game.net.broadcast({ t: "sa", id: structure.id, def: defId, p: { x: structure.x, y: structure.y, z: structure.z, rot: structure.rot, bottom: structure.bottom } });
    this.announce(`${def.name} criada à sua frente.`);
  }

  repairAll() {
    this.requireHost();
    let count = 0;
    for (const s of this.game.building.list) if (s.hp < s.def.hp) { s.hp = s.def.hp; count++; }
    this.announce(`${count} estruturas reparadas sem custo.`);
  }

  dropSupply(count: number) {
    this.requireHost();
    let n = 0;
    const origin = this.actorPos();
    for (let i = 0; i < Math.min(12, Math.max(1, count)); i++) if (this.game.spawnSupply(origin)) n++;
    this.announce(`${n} pacotes de suprimentos lançados.`);
  }
}