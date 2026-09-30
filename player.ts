import * as THREE from "three";
import { CONFIG, xpForLevel, engramPointsForLevel } from "../core/config";
import { Container, type ItemStack } from "../systems/container";
import { CraftQueue, type QueueEntry } from "../systems/crafting";
import { ENGRAMS } from "../data/engrams";
import { ITEMS, type ItemDef } from "../data/items";
import { buildHuman, buildHeldItem, applyArmorVisuals, type HumanRig, type BodyShape, type BodyRegion } from "./models";
import type { ArmorSlot } from "../data/items";

export interface Appearance {
  name: string; skin: string; hair: string; eyes: string; height: number;
  female?: boolean; hairStyle?: number; beard?: boolean;
  regions?: Partial<Record<BodyRegion, number>>;
}
export function bodyOf(a: Appearance): BodyShape {
  return { female: !!a.female, hairStyle: a.hairStyle ?? (a.female ? 2 : 1), beard: a.beard ?? !a.female, regions: a.regions ?? {} };
}
export const SKIN_TONES = ["#f1c9a8", "#e0ac86", "#c68a62", "#a86d45", "#7d4e30", "#553423"];
export const HAIR_COLORS = ["#1a120b", "#3a2414", "#6b4424", "#a8743e", "#d8b878", "#8a2a18", "#9a9a9a"];
export const EYE_COLORS = ["#5a7a4a", "#3a5a8a", "#6b4a2a", "#2a2a2a", "#7a8a9a"];

export const ARMOR_SLOTS: ArmorSlot[] = ["head", "chest", "legs", "hands", "feet"];
export const SLOT_LABEL: Record<ArmorSlot, string> = { head: "Cabeça", chest: "Tronco", legs: "Pernas", hands: "Mãos", feet: "Pés" };

export type StatKey = "health" | "stamina" | "food" | "water" | "weight" | "melee" | "speed";
export const STAT_KEYS: StatKey[] = ["health", "stamina", "food", "water", "weight", "melee", "speed"];
export const STAT_LABEL: Record<StatKey, string> = {
  health: "Vida", stamina: "Stamina", food: "Comida", water: "Água", weight: "Peso", melee: "Dano Corpo-a-corpo", speed: "Velocidade",
};

export interface SavedPlayer {
  pos: [number, number, number];
  yaw: number;
  health: number; stamina: number; food: number; water: number; torpor: number;
  level: number; xp: number; statPoints: number; engramPoints: number;
  points: Record<StatKey, number>;
  learned: string[];
  inv: (ItemStack | null)[];
  bar: (ItemStack | null)[];
  selected: number;
  queue: QueueEntry[];
  spawnBag: number | null;
  notes?: number[];
  explored?: string[];
  equip?: (ItemStack | null)[];
  appearance?: Appearance;
  deathCause?: string;
  deathPos?: [number, number] | null;
  deaths?: number;
}

export class Player {
  pos = new THREE.Vector3();
  vel = new THREE.Vector3();
  yaw = 0;
  onGround = false;
  inWater = false;
  swimming = false;
  sprinting = false;
  health = 100;
  stamina = 100;
  food = 100;
  water = 100;
  torpor = 0;
  level = 1;
  xp = 0;
  statPoints = 0;
  engramPoints = 0;
  points: Record<StatKey, number> = { health: 0, stamina: 0, food: 0, water: 0, weight: 0, melee: 0, speed: 0 };
  learned = new Set<string>();
  inv = new Container(48);
  bar = new Container(10);
  selected = -1;
  queue = new CraftQueue("Inventário");
  dead = false;
  /** Developer mode: removes the player weight limit and all encumbrance penalties. */
  weightInfinite = false;
  attackCd = 0;
  swing = 0;
  hurtTimer = 0;
  regenBlock = 0;
  staminaDelay = 0;
  exhausted = false;
  unconscious = false;
  airTime = 0;
  peakFallVel = 0;
  rig: HumanRig;
  held: THREE.Object3D | null = null;
  heldId = "";
  walkPhase = 0;
  spawnBag: number | null = null;
  deathT = 0;
  equip = new Container(5);
  bodyTemp = 22; // felt temperature (°C) after insulation
  ambientTemp = 22;
  riding: number | null = null; // creature id
  implantT = 0; // implant-check animation (third person)
  appearance: Appearance = { name: "Sobrevivente", skin: SKIN_TONES[2], hair: HAIR_COLORS[1], eyes: EYE_COLORS[0], height: 1 };
  deathCause = "";
  deathPos: [number, number] | null = null;
  deaths = 0;
  private appliedLook = "";
  notes: number[] = [];
  explored: string[] = [];

  constructor() {
    this.rig = buildHuman();
    this.rig.root.userData.armorKey = "";
    for (const e of ENGRAMS) if (e.autoLearned) this.learned.add(e.id);
  }

  max(stat: StatKey | "torpor"): number {
    const b = CONFIG.player.baseStats;
    if (stat === "weight" && this.weightInfinite) return Number.POSITIVE_INFINITY;
    if (stat === "torpor") return b.torpor + this.level * 10;
    return b[stat] + this.points[stat] * CONFIG.player.perLevel[stat];
  }

  get meleeMult() {
    return this.max("melee") / 100;
  }
  get speedMult() {
    return this.max("speed") / 100;
  }

  weight() {
    return this.inv.weight() + this.bar.weight() + this.equip.weight() * 0.5;
  }

  armorAt(slot: ArmorSlot): ItemStack | null {
    return this.equip.slots[ARMOR_SLOTS.indexOf(slot)];
  }
  /** Total armor rating from equipped pieces (reduced by wear below 30%). */
  armorValue(): number {
    let a = 0;
    for (const st of this.equip.slots) {
      if (!st) continue;
      const d = ITEMS[st.id].armor!;
      const wear = st.dur !== undefined ? Math.min(1, 0.4 + (st.dur / d.durability) * 2) : 1;
      a += d.armor * wear;
    }
    return a;
  }
  /** Insulation against cold / heat in °C of comfort offset. */
  insulation(): { cold: number; heat: number } {
    let cold = 0, heat = 0;
    for (const st of this.equip.slots) {
      if (!st) continue;
      const d = ITEMS[st.id].armor!;
      cold += d.cold;
      heat += d.heat;
    }
    return { cold, heat };
  }
  /** Equip an armor piece from a container slot; swaps with what was worn. */
  equipFrom(c: Container, i: number): boolean {
    const st = c.slots[i];
    if (!st) return false;
    const d = ITEMS[st.id];
    if (!d.armor) return false;
    const si = ARMOR_SLOTS.indexOf(d.armor.slot);
    const cur = this.equip.slots[si];
    this.equip.slots[si] = { ...st, qty: 1, dur: st.dur ?? d.armor.durability };
    c.removeAt(i, 1);
    if (cur) c.addStack(cur);
    this.equip.touch();
    return true;
  }
  unequip(slot: ArmorSlot): boolean {
    const si = ARMOR_SLOTS.indexOf(slot);
    const cur = this.equip.slots[si];
    if (!cur || this.inv.capacityFor(cur.id) <= 0) return false;
    this.inv.addStack(cur);
    this.equip.slots[si] = null;
    this.equip.touch();
    return true;
  }
  /** Wear armor from a hit; returns names of pieces that broke. */
  wearArmor(dmg: number): string[] {
    const broke: string[] = [];
    this.equip.slots.forEach((st, i) => {
      if (!st) return;
      st.dur = (st.dur ?? ITEMS[st.id].armor!.durability) - Math.max(0.5, dmg * 0.08);
      if (st.dur <= 0) { broke.push(ITEMS[st.id].name); this.equip.slots[i] = null; }
    });
    if (broke.length) this.equip.touch();
    return broke;
  }
  encumbrance(): number {
    // 0 = fine, 1 = overweight (slow), 2 = cannot move
    const w = this.weight(), m = this.max("weight");
    if (w > m * 1.35) return 2;
    if (w > m) return 1;
    return 0;
  }

  equipped(): ItemStack | null {
    return this.selected >= 0 ? this.bar.slots[this.selected] : null;
  }
  equippedDef(): ItemDef | null {
    const s = this.equipped();
    return s ? ITEMS[s.id] : null;
  }

  count(id: string) {
    return this.inv.count(id) + this.bar.count(id);
  }
  remove(id: string, n: number) {
    let left = n - this.inv.remove(id, n);
    if (left > 0) left -= this.bar.remove(id, left);
    return n - left;
  }
  /** Adds to inventory. Returns quantity that did not fit. */
  give(id: string, qty: number, template?: ItemStack) {
    return this.inv.add(id, qty, template);
  }

  xpToNext() {
    return xpForLevel(this.level + 1) - xpForLevel(this.level);
  }
  xpInLevel() {
    return Math.max(0, this.xp - xpForLevel(this.level));
  }

  /** Add XP; returns number of levels gained. */
  addXp(amount: number): number {
    if (this.level >= CONFIG.player.maxLevel) return 0;
    this.xp += amount;
    let gained = 0;
    while (this.level < CONFIG.player.maxLevel && this.xp >= xpForLevel(this.level + 1)) {
      this.level++;
      gained++;
      this.statPoints++;
      this.engramPoints += engramPointsForLevel(this.level);
    }
    return gained;
  }

  spendStat(stat: StatKey): boolean {
    if (this.statPoints <= 0) return false;
    this.statPoints--;
    this.points[stat]++;
    const inc = CONFIG.player.perLevel[stat];
    if (stat === "health") this.health += inc;
    if (stat === "stamina") this.stamina += inc;
    if (stat === "food") this.food += inc;
    if (stat === "water") this.water += inc;
    return true;
  }

  /** Apply a consumable's effects. Returns false if it cannot be used. */
  consume(def: ItemDef): boolean {
    if (def.food === undefined && def.water === undefined && def.torpor === undefined && def.health === undefined && def.stamina === undefined) return false;
    if (def.food) this.food = Math.min(this.max("food"), Math.max(0, this.food + def.food));
    if (def.water) this.water = Math.min(this.max("water"), Math.max(0, this.water + def.water));
    if (def.health) this.health = Math.min(this.max("health"), this.health + def.health);
    if (def.stamina) this.stamina = Math.min(this.max("stamina"), this.stamina + def.stamina);
    if (def.torpor) this.torpor = Math.max(0, Math.min(this.max("torpor"), this.torpor + def.torpor));
    return true;
  }

  resetForRespawn() {
    this.dead = false;
    this.unconscious = false;
    this.health = this.max("health");
    this.stamina = this.max("stamina");
    this.food = this.max("food") * 0.6;
    this.water = this.max("water") * 0.6;
    this.torpor = 0;
    this.vel.set(0, 0, 0);
    this.selected = -1;
  }

  updateHeld() {
    const id = this.equipped()?.id ?? "";
    if (id === this.heldId) return;
    this.heldId = id;
    if (this.held) this.rig.hand.remove(this.held);
    this.held = id ? buildHeldItem(id) : null;
    if (this.held) this.rig.hand.add(this.held);
  }

  animate(dt: number, time: number, aimPitch = 0) {
    const r = this.rig;
    r.root.position.copy(this.pos);
    r.root.rotation.y = this.yaw;
    const hs = Math.hypot(this.vel.x, this.vel.z);
    const run = this.sprinting ? 1 : 0;
    this.walkPhase += hs * dt * (run ? 1.9 : 2.6);
    const amp = Math.min(1, hs / 4.2) * (run ? 1.3 : 1);
    const s = Math.sin(this.walkPhase), c2 = Math.cos(this.walkPhase);
    const k = Math.min(1, dt * 12);
    const L = (o: THREE.Object3D, ax: "x" | "y" | "z", v: number, kk = k) => { o.rotation[ax] += (v - o.rotation[ax]) * kk; };
    if (this.dead) {
      this.deathT = Math.min(1, this.deathT + dt * 2);
      r.root.rotation.x = -Math.PI / 2 * this.deathT;
      r.root.position.y = this.pos.y + 0.15 * this.deathT;
      return;
    }
    this.deathT = 0;
    r.root.rotation.x = 0;
    if (this.riding !== null) {
      // seated pose
      L(r.legL, "x", -1.35); L(r.legR, "x", -1.35); L(r.legL, "z", -0.45); L(r.legR, "z", 0.45);
      L(r.kneeL, "x", 1.3); L(r.kneeR, "x", 1.3);
      r.hips.position.y = 0.98;
      L(r.torso, "x", 0.15 - aimPitch * 0.2);
      const sw2 = this.swing > 0 ? Math.sin((1 - this.swing) * Math.PI) : 0;
      L(r.armL, "x", -0.7); L(r.elbowL, "x", -0.8);
      L(r.armR, "x", -0.7 - sw2 * 1.2); L(r.elbowR, "x", -0.8);
      r.root.visible = true;
      return;
    }
    r.legL.rotation.z *= 0.8; r.legR.rotation.z *= 0.8;
    const air = !this.onGround && !this.swimming;
    const breath = Math.sin(time * 2) * 0.015;
    // legs
    if (this.swimming) {
      L(r.legL, "x", Math.sin(time * 5) * 0.4); L(r.legR, "x", -Math.sin(time * 5) * 0.4);
      L(r.kneeL, "x", 0.3); L(r.kneeR, "x", 0.3);
    } else if (air) {
      L(r.legL, "x", -0.6); L(r.legR, "x", 0.25); L(r.kneeL, "x", 1.0); L(r.kneeR, "x", 0.3);
    } else {
      L(r.legL, "x", -s * 0.7 * amp, 0.5); L(r.legR, "x", s * 0.7 * amp, 0.5);
      L(r.kneeL, "x", Math.max(0, c2) * 1.1 * amp + 0.05, 0.5); L(r.kneeR, "x", Math.max(0, -c2) * 1.1 * amp + 0.05, 0.5);
    }
    // hips & torso
    r.hips.position.y = 0.98 + Math.abs(c2) * 0.05 * amp - (this.swimming ? 0.2 : 0);
    r.hips.rotation.y = s * 0.12 * amp;
    L(r.torso, "x", (run * 0.25 + (this.swimming ? 0.9 : 0)) * Math.min(1, amp + (this.swimming ? 1 : 0)) + breath - aimPitch * 0.35);
    // attack swing (0..1 progress)
    const sw = this.swing > 0 ? 1 - this.swing : 0;
    const swingCurve = this.swing > 0 ? Math.sin(sw * Math.PI) : 0;
    const wind = this.swing > 0 && sw < 0.3 ? sw / 0.3 : 0;
    L(r.torso, "y", -s * 0.1 * amp + (this.swing > 0 ? (sw < 0.3 ? 0.4 * wind : -0.5 * swingCurve) : 0));
    const ranged = this.heldId === "bow" || this.heldId === "slingshot";
    // arms
    if (this.swimming) {
      L(r.armL, "x", -1.5 + Math.sin(time * 4) * 1.2); L(r.armR, "x", -1.5 - Math.sin(time * 4) * 1.2);
      L(r.armL, "z", 0.3); L(r.armR, "z", -0.3);
    } else if (ranged) {
      L(r.armL, "x", -1.45 - aimPitch); L(r.armL, "z", -0.1); L(r.elbowL, "x", -0.1);
      L(r.armR, "x", -1.35 - aimPitch - swingCurve * 0.3); L(r.armR, "z", 0.5); L(r.elbowR, "x", -1.4);
    } else {
      L(r.armL, "x", s * 0.6 * amp + (air ? -0.8 : 0)); L(r.armL, "z", 0.08 + (air ? 0.3 : 0)); L(r.elbowL, "x", -0.25 - amp * 0.4);
      const hold = this.heldId ? -0.5 : 0;
      const swingX = this.swing > 0 ? (sw < 0.3 ? -2.6 * wind : -2.6 + swingCurve * 2.9) : 0;
      L(r.armR, "x", (this.swing > 0 ? swingX : -s * 0.6 * amp + hold) + (air && !this.swing ? -0.8 : 0), this.swing > 0 ? 0.6 : k);
      L(r.armR, "z", -0.08 - (air ? 0.3 : 0));
      L(r.elbowR, "x", this.swing > 0 ? -0.4 + swingCurve * 0.2 : -0.3 - amp * 0.4 + hold * 0.6);
    }
    L(r.head, "x", -aimPitch * 0.4);
    if (this.implantT > 0) {
      // raise the left forearm across the chest, rotate the wrist up and look down at the implant
      const e = THREE.MathUtils.smoothstep(this.implantT, 0, 0.5) * (1 - THREE.MathUtils.smoothstep(this.implantT, 0.85, 1));
      r.armL.rotation.x = THREE.MathUtils.lerp(r.armL.rotation.x, -1.1, e);
      r.armL.rotation.z = THREE.MathUtils.lerp(r.armL.rotation.z, 0.75, e);
      r.elbowL.rotation.x = THREE.MathUtils.lerp(r.elbowL.rotation.x, -1.7, e);
      r.elbowL.rotation.y = -1.4 * e;
      r.head.rotation.x = THREE.MathUtils.lerp(r.head.rotation.x, 0.45, e);
      r.head.rotation.y = 0.35 * e;
    } else { r.elbowL.rotation.y *= 0.8; r.head.rotation.y *= 0.8; }
    // held torch flame flicker
    if (this.held) {
      const f = this.held.getObjectByName("flame");
      if (f) f.scale.set(1 + Math.sin(time * 20) * 0.1, 1 + Math.sin(time * 27) * 0.2, 1);
    }
    r.root.visible = true;
    const eq: Record<string, string | null> = {};
    ARMOR_SLOTS.forEach((sl, i) => (eq[sl] = this.equip.slots[i]?.id ?? null));
    applyArmorVisuals(r, eq);
    this.applyLook();
  }

  /** Apply survivor customization (skin tone, hair, eyes, height) to the rig. */
  private appliedBody = "";
  applyLook() {
    const a = this.appearance;
    const bodyKey = JSON.stringify(bodyOf(a));
    if (bodyKey !== this.appliedBody) {
      // geometry-level customization: rebuild the procedural survivor with the new proportions
      const first = this.appliedBody === "";
      this.appliedBody = bodyKey;
      if (!first || bodyKey !== JSON.stringify(bodyOf({ ...a, female: false, hairStyle: 1, beard: true, regions: {} }))) {
        const parent = this.rig.root.parent;
        parent?.remove(this.rig.root);
        this.rig = buildHuman(bodyOf(a));
        parent?.add(this.rig.root);
        this.heldId = "__rebuild";
        this.held = null;
        this.updateHeld();
        this.appliedLook = "";
      }
    }
    const key = `${a.skin}|${a.hair}|${a.eyes}|${a.height}`;
    if (key === this.appliedLook) return;
    this.appliedLook = key;
    const r = this.rig;
    r.beardMat?.color.set(a.hair);
    r.skinMat?.color.set(a.skin);
    r.hairMat?.color.set(a.hair);
    r.irisMats?.forEach((m) => m.color.set(a.eyes));
    r.root.scale.setScalar(a.height);
  }

  serialize(): SavedPlayer {
    return {
      pos: [this.pos.x, this.pos.y, this.pos.z], yaw: this.yaw,
      health: this.health, stamina: this.stamina, food: this.food, water: this.water, torpor: this.torpor,
      level: this.level, xp: this.xp, statPoints: this.statPoints, engramPoints: this.engramPoints,
      points: { ...this.points }, learned: [...this.learned],
      inv: this.inv.serialize(), bar: this.bar.serialize(), selected: this.selected, queue: this.queue.serialize(), spawnBag: this.spawnBag, notes: this.notes, explored: this.explored, equip: this.equip.serialize(), appearance: this.appearance, deathCause: this.deathCause, deathPos: this.deathPos, deaths: this.deaths,
    };
  }

  load(s: SavedPlayer) {
    this.pos.set(s.pos[0], s.pos[1], s.pos[2]);
    this.yaw = s.yaw;
    this.level = s.level; this.xp = s.xp; this.statPoints = s.statPoints; this.engramPoints = s.engramPoints;
    this.points = { ...this.points, ...s.points };
    this.learned = new Set(s.learned);
    for (const e of ENGRAMS) if (e.autoLearned) this.learned.add(e.id);
    this.health = s.health; this.stamina = s.stamina; this.food = s.food; this.water = s.water; this.torpor = s.torpor ?? 0;
    this.inv.load(s.inv);
    this.bar.load(s.bar);
    this.selected = s.selected ?? -1;
    this.queue.load(s.queue);
    this.spawnBag = s.spawnBag ?? null;
    this.notes = s.notes ?? [];
    this.explored = s.explored ?? [];
    this.equip.load(s.equip);
    if (s.appearance) this.appearance = { ...this.appearance, ...s.appearance };
    this.deathCause = s.deathCause ?? "";
    this.deathPos = s.deathPos ?? null;
    this.deaths = s.deaths ?? 0;
    this.dead = this.health <= 0;
  }
}
