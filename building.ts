import * as THREE from "three";
import { STRUCTURES, type StructureDef, GRID, THICK } from "../data/structures";
import { CONFIG } from "../core/config";
import type { Terrain } from "../world/terrain";
import type { Physics, BoxCollider } from "../world/physics";
import { Container, type ItemStack } from "./container";
import { CraftQueue, type QueueEntry } from "./crafting";
import { ITEMS } from "../data/items";
import { mergeByMaterial } from "../core/merge";
import { thatchTexture, plankTexture, barkTexture, stoneBlockTexture, hideTexture } from "../core/textures";

const WALL_H = CONFIG.building.wallHeight;
const DOOR_W = 1.2, DOOR_H = 2.3;

export interface Structure {
  id: number;
  def: StructureDef;
  x: number; y: number; z: number; // y = bottom of the piece (foundation: top surface)
  rot: number; // quarter turns (0 = spans X)
  hp: number;
  open: boolean;
  lit: boolean;
  burn: number; // seconds of fuel left in current unit
  cook: number; // cook progress seconds
  inv: Container | null;
  queue: CraftQueue | null;
  mesh: THREE.Object3D;
  colliders: BoxCollider[];
  bottom: number; // foundation bottom (visual/collider)
  flame?: THREE.Object3D;
  doorPivot?: THREE.Object3D;
  water?: number;
  grow?: number;
}

export interface SavedStructure {
  def: string; x: number; y: number; z: number; rot: number; hp: number; open: boolean; lit: boolean; burn: number; cook: number;
  bottom: number; inv?: (ItemStack | null)[]; queue?: QueueEntry[]; water?: number; grow?: number;
  id?: number;
}

export interface Placement {
  valid: boolean;
  reason?: string;
  x: number; y: number; z: number; rot: number; bottom: number;
}

let NEXT = 1;
const matCache = new Map<string, THREE.Material>();
function cm(key: string, make: () => THREE.Material) {
  let m = matCache.get(key);
  if (!m) { m = make(); matCache.set(key, m); }
  return m;
}
const MAT = {
  thatch: () => cm("thatch", () => new THREE.MeshStandardMaterial({ map: thatchTexture(), roughness: 1 })),
  plank: () => cm("plank", () => new THREE.MeshStandardMaterial({ map: plankTexture([150, 100, 56]), roughness: 0.85 })),
  plankDark: () => cm("plankD", () => new THREE.MeshStandardMaterial({ map: plankTexture([98, 64, 36]), roughness: 0.9 })),
  log: () => cm("log", () => new THREE.MeshStandardMaterial({ map: barkTexture([104, 74, 46]), roughness: 0.9 })),
  stone: () => cm("stoneS", () => new THREE.MeshStandardMaterial({ map: stoneBlockTexture(), roughness: 0.95 })),
  rock: () => cm("rockS", () => new THREE.MeshStandardMaterial({ color: "#77726b", roughness: 0.95 })),
  metal: () => cm("metalS", () => new THREE.MeshStandardMaterial({ color: "#5d5a55", roughness: 0.4, metalness: 0.8 })),
  hide: () => cm("hideS", () => new THREE.MeshStandardMaterial({ map: hideTexture(), roughness: 0.9 })),
  cloth: () => cm("clothS", () => new THREE.MeshStandardMaterial({ color: "#e4dccb", roughness: 1 })),
  ash: () => cm("ash", () => new THREE.MeshStandardMaterial({ color: "#2a2624", roughness: 1 })),
  fiber: () => cm("fiberS", () => new THREE.MeshStandardMaterial({ color: "#7c6a3c", roughness: 1 })),
  flameO: () => cm("flameO", () => new THREE.MeshBasicMaterial({ color: "#ff8a1e", transparent: true, opacity: 0.85, depthWrite: false })),
  flameI: () => cm("flameI", () => new THREE.MeshBasicMaterial({ color: "#ffe9a0", transparent: true, opacity: 0.95, depthWrite: false })),
};

/** Box whose UVs are scaled to world size so textures keep a constant density. */
function texBox(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0, texel = 1.5) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  const dims: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) {
    const i = f * 4 + v;
    uv.setXY(i, (uv.getX(i) * dims[f][0]) / texel, (uv.getY(i) * dims[f][1]) / texel);
  }
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
function cyl(r0: number, r1: number, h: number, mat: THREE.Material, x = 0, y = 0, z = 0, seg = 8) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, h, seg), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
function flameGroup(scale = 1) {
  const f = new THREE.Group();
  f.name = "flame";
  const o = new THREE.Mesh(new THREE.ConeGeometry(0.25 * scale, 0.7 * scale, 8), MAT.flameO());
  const i = new THREE.Mesh(new THREE.ConeGeometry(0.13 * scale, 0.45 * scale, 8), MAT.flameI());
  i.position.y = -0.08 * scale;
  f.add(o, i);
  for (let k = 0; k < 3; k++) {
    const t = new THREE.Mesh(new THREE.ConeGeometry(0.1 * scale, 0.35 * scale, 6), MAT.flameO());
    t.position.set(Math.cos(k * 2.1) * 0.14 * scale, -0.1 * scale, Math.sin(k * 2.1) * 0.14 * scale);
    f.add(t);
  }
  return f;
}

/** Build a visual for a structure in local space (origin at bottom center; rot applied outside). */
function buildVisual(def: StructureDef, bottomOffset: number, ghost?: THREE.Material): { obj: THREE.Group; flame?: THREE.Object3D; doorPivot?: THREE.Object3D } {
  const g = new THREE.Group();
  const stoneT = def.tier === "stone";
  const wood = def.tier === "wood" || stoneT;
  const panel = ghost ?? (stoneT ? MAT.stone() : wood ? MAT.plank() : MAT.thatch());
  const frame = ghost ?? (stoneT ? MAT.rock() : wood ? MAT.plankDark() : MAT.log());
  const [w, h, d] = def.size;
  let flame: THREE.Object3D | undefined;
  let doorPivot: THREE.Object3D | undefined;
  const F = 0.14; // frame beam size
  switch (def.snap) {
    case "foundation": {
      const depth = Math.max(0.6, bottomOffset);
      g.add(texBox(w, 0.3, d, panel, 0, -0.15, 0, wood ? 1.5 : 1.2));
      // skirt / base block down to the ground
      g.add(texBox(w - 0.1, depth - 0.3, d - 0.1, ghost ?? (stoneT ? MAT.stone() : wood ? MAT.plankDark() : MAT.log()), 0, -0.3 - (depth - 0.3) / 2, 0, 1.5));
      // corner posts and edge trims
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(0.12, 0.12, depth + 0.05, frame, sx * (w / 2 - 0.1), -depth / 2, sz * (d / 2 - 0.1)));
      for (const sz of [-1, 1]) g.add(texBox(w, 0.1, 0.12, frame, 0, -0.05, sz * (d / 2 - 0.06)));
      for (const sx of [-1, 1]) g.add(texBox(0.12, 0.1, d, frame, sx * (w / 2 - 0.06), -0.05, 0));
      break;
    }
    case "wall":
    case "doorframe": {
      const hole = def.snap === "doorframe";
      if (!hole) g.add(texBox(w - F, h - F, d * 0.8, panel, 0, h / 2, 0));
      else {
        const side = (w - DOOR_W) / 2;
        g.add(texBox(side - F / 2, h - F, d * 0.8, panel, -(DOOR_W / 2 + side / 2), h / 2, 0));
        g.add(texBox(side - F / 2, h - F, d * 0.8, panel, DOOR_W / 2 + side / 2, h / 2, 0));
        g.add(texBox(DOOR_W, h - DOOR_H - F / 2, d * 0.8, panel, 0, DOOR_H + (h - DOOR_H) / 2, 0));
        for (const s of [-1, 1]) g.add(texBox(F * 0.8, DOOR_H, d * 1.05, frame, s * (DOOR_W / 2 + F * 0.4), DOOR_H / 2, 0));
        g.add(texBox(DOOR_W + F * 1.6, F * 0.8, d * 1.05, frame, 0, DOOR_H, 0));
      }
      // frame: posts + beams
      for (const s of [-1, 1]) g.add(texBox(F, h, d * 1.1, frame, s * (w / 2 - F / 2), h / 2, 0));
      g.add(texBox(w, F, d * 1.15, frame, 0, h - F / 2, 0));
      g.add(texBox(w, F, d * 1.15, frame, 0, F / 2, 0));
      if (!hole && !wood) {
        // diagonal brace on thatch walls
        const br = texBox(Math.hypot(w, h) * 0.85, F * 0.6, d * 1.05, frame, 0, h / 2, 0);
        br.rotation.z = Math.atan2(h, w);
        g.add(br);
      }
      if (!hole && wood && !stoneT) for (const y of [h * 0.35, h * 0.68]) g.add(texBox(w - F, F * 0.6, d * 1.08, frame, 0, y, 0));
      if (stoneT && !hole) g.add(texBox(w - F, h - F, d * 1.02, panel, 0, h / 2, 0, 1.5));
      break;
    }
    case "door": {
      doorPivot = new THREE.Group();
      doorPivot.position.set(-DOOR_W / 2, 0, 0);
      doorPivot.add(texBox(w, h, d, panel, w / 2, h / 2, 0, 1.2));
      for (const y of [0.35, h - 0.35]) doorPivot.add(texBox(w * 0.95, 0.12, d * 1.4, frame, w / 2, y, 0));
      const brace = texBox(Math.hypot(w, h - 0.7) * 0.95, 0.1, d * 1.3, frame, w / 2, h / 2, 0);
      brace.rotation.z = Math.atan2(h - 0.7, w);
      doorPivot.add(brace);
      doorPivot.add(cyl(0.04, 0.04, 0.12, ghost ?? MAT.metal(), w - 0.18, h * 0.5, d, 8).rotateX(Math.PI / 2));
      for (const y of [0.35, h - 0.35]) doorPivot.add(texBox(0.2, 0.08, d * 1.6, ghost ?? MAT.metal(), 0.08, y, 0));
      g.add(doorPivot);
      break;
    }
    case "roof": {
      g.add(texBox(w + 0.1, h, d + 0.1, panel, 0, h / 2, 0, wood ? 1.5 : 1.2));
      // overhang lip + beams underneath
      for (const s of [-1, 1]) g.add(texBox(w + 0.25, 0.1, 0.18, frame, 0, h, s * (d / 2 + 0.03)));
      for (const x of [-w / 3, 0, w / 3]) g.add(texBox(0.12, 0.12, d, frame, x, -0.04, 0));
      break;
    }
    case "free": {
      if (def.id === "campfire") {
        const stoneM = ghost ?? MAT.rock();
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2;
          const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.14 + (i % 3) * 0.02, 0), stoneM);
          r.position.set(Math.cos(a) * 0.5, 0.08, Math.sin(a) * 0.5);
          r.rotation.set(i, i * 2, 0);
          r.castShadow = true;
          g.add(r);
        }
        const ash = new THREE.Mesh(new THREE.CircleGeometry(0.42, 12), ghost ?? MAT.ash());
        ash.rotation.x = -Math.PI / 2;
        ash.position.y = 0.02;
        g.add(ash);
        for (let i = 0; i < 4; i++) {
          const l = cyl(0.06, 0.06, 0.8, ghost ?? MAT.log(), 0, 0.2, 0, 7);
          l.rotation.set(Math.PI / 2 - 0.5, (i / 4) * Math.PI * 2, 0);
          l.position.set(Math.cos((i / 4) * Math.PI * 2) * 0.12, 0.2, Math.sin((i / 4) * Math.PI * 2) * 0.12);
          g.add(l);
        }
        if (!ghost) {
          const f = flameGroup(1);
          f.position.y = 0.42;
          f.visible = false;
          g.add(f);
          flame = f;
        }
      } else if (def.id === "standing_torch") {
        g.add(cyl(0.07, 0.05, 1.9, ghost ?? MAT.log(), 0, 0.95, 0, 7));
        g.add(cyl(0.12, 0.09, 0.22, ghost ?? MAT.hide(), 0, 1.9, 0, 8));
        for (let i = 0; i < 3; i++) g.add(cyl(0.075, 0.075, 0.03, ghost ?? MAT.fiber(), 0, 1.5 + i * 0.08, 0, 8));
        for (let i = 0; i < 3; i++) {
          const leg = cyl(0.04, 0.03, 0.6, ghost ?? MAT.log(), 0, 0.25, 0, 6);
          const a = (i / 3) * Math.PI * 2;
          leg.rotation.set(Math.cos(a) * 0.6, 0, Math.sin(a) * 0.6);
          leg.position.set(Math.sin(a) * 0.15, 0.22, -Math.cos(a) * 0.15);
          g.add(leg);
        }
        if (!ghost) {
          const f = flameGroup(0.55);
          f.position.y = 2.15;
          f.visible = false;
          g.add(f);
          flame = f;
        }
      } else if (def.id === "forge") {
        const st = ghost ?? MAT.stone();
        g.add(texBox(1.4, 0.9, 1.4, st, 0, 0.45, 0, 1));
        const dome = new THREE.Mesh(new THREE.SphereGeometry(0.62, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), st);
        dome.position.y = 0.9; dome.castShadow = true;
        g.add(dome);
        g.add(cyl(0.16, 0.13, 0.7, st, 0.3, 1.5, -0.3, 8));
        const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.05), ghost ?? MAT.ash());
        mouth.position.set(0, 0.5, 0.71);
        g.add(mouth);
        if (!ghost) {
          const f = flameGroup(0.6);
          f.position.set(0, 0.45, 0.55);
          f.visible = false;
          g.add(f);
          flame = f;
        }
      } else if (def.id === "smithy") {
        g.add(texBox(2.0, 0.12, 1.0, ghost ?? MAT.plankDark(), 0, 0.9, 0, 1));
        for (const sx of [-0.85, 0.85]) for (const sz of [-0.4, 0.4]) g.add(cyl(0.06, 0.06, 0.9, ghost ?? MAT.log(), sx, 0.45, sz, 6));
        const anvil = new THREE.Group();
        anvil.add(texBox(0.25, 0.3, 0.2, ghost ?? MAT.metal(), 0, 0.15, 0, 1));
        anvil.add(texBox(0.55, 0.14, 0.24, ghost ?? MAT.metal(), 0.05, 0.37, 0, 1));
        const horn = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.3, 6), ghost ?? MAT.metal());
        horn.rotation.z = Math.PI / 2; horn.position.set(0.45, 0.37, 0);
        anvil.add(horn);
        anvil.position.set(-0.5, 0.96, 0);
        g.add(anvil);
        const ham = cyl(0.02, 0.02, 0.4, ghost ?? MAT.log(), 0.5, 1.0, 0.1, 5);
        ham.rotation.z = Math.PI / 2;
        g.add(ham);
        g.add(texBox(0.12, 0.1, 0.1, ghost ?? MAT.metal(), 0.72, 1.0, 0.1, 1));
      } else if (def.id === "crop_plot") {
        g.add(texBox(1.8, 0.3, 1.8, ghost ?? MAT.plankDark(), 0, 0.15, 0, 1));
        const soil = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.05, 1.6), ghost ?? cm("soil", () => new THREE.MeshStandardMaterial({ color: "#3e2a18", roughness: 1 })));
        soil.position.y = 0.31;
        g.add(soil);
        const plants = new THREE.Group();
        plants.name = "plants";
        for (let i = 0; i < 9; i++) {
          const p = new THREE.Group();
          const stem = cyl(0.015, 0.02, 0.5, cm("stem", () => new THREE.MeshStandardMaterial({ color: "#4a8a30" })), 0, 0.25, 0, 4);
          const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 0), cm("cropleaf", () => new THREE.MeshStandardMaterial({ color: "#4f9a36", roughness: 0.8 })));
          leaf.position.y = 0.45;
          leaf.scale.set(1, 0.7, 1);
          const berry = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), cm("cropberry", () => new THREE.MeshStandardMaterial({ color: "#6a4bd1" })));
          berry.position.set(0.1, 0.42, 0.05);
          berry.name = "berry";
          p.add(stem, leaf, berry);
          p.position.set(((i % 3) - 1) * 0.5, 0.33, (Math.floor(i / 3) - 1) * 0.5);
          plants.add(p);
        }
        plants.visible = false;
        g.add(plants);
      } else if (def.id === "storage_box") {
        g.add(texBox(w, h * 0.72, d, ghost ?? MAT.plank(), 0, h * 0.36, 0, 1));
        g.add(texBox(w + 0.04, h * 0.28, d + 0.04, ghost ?? MAT.plankDark(), 0, h * 0.86, 0, 1));
        for (const x of [-w / 2 + 0.12, w / 2 - 0.12]) g.add(texBox(0.06, h + 0.02, d + 0.06, ghost ?? MAT.metal(), x, h / 2, 0));
        g.add(texBox(0.12, 0.14, 0.05, ghost ?? MAT.metal(), 0, h * 0.7, d / 2 + 0.03));
      } else if (def.id === "sleeping_bag") {
        const bag = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, d - 0.56, 4, 10), ghost ?? MAT.hide());
        bag.rotation.x = Math.PI / 2;
        bag.scale.set(1.3, 1, 0.45);
        bag.position.y = 0.13;
        bag.castShadow = true;
        g.add(bag);
        const pillow = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), ghost ?? MAT.cloth());
        pillow.scale.set(1.4, 0.45, 0.8);
        pillow.position.set(0, 0.22, -d / 2 + 0.25);
        g.add(pillow);
        for (const z of [-0.2, 0.3]) g.add(cyl(0.03, 0.03, 0.75, ghost ?? MAT.fiber(), 0, 0.2, z, 6).rotateZ(Math.PI / 2));
      } else if (def.id === "mortar_pestle") {
        const pts = [new THREE.Vector2(0.0, 0), new THREE.Vector2(0.3, 0), new THREE.Vector2(0.38, 0.12), new THREE.Vector2(0.36, 0.42), new THREE.Vector2(0.28, 0.44), new THREE.Vector2(0.26, 0.2), new THREE.Vector2(0.0, 0.18)];
        const bowl = new THREE.Mesh(new THREE.LatheGeometry(pts, 14), ghost ?? MAT.rock());
        bowl.castShadow = true;
        g.add(bowl);
        const p = cyl(0.05, 0.08, 0.6, ghost ?? MAT.rock(), 0.08, 0.5, 0, 8);
        p.rotation.z = 0.45;
        g.add(p);
      } else g.add(texBox(w, h, d, ghost ?? MAT.plank(), 0, h / 2, 0));
      break;
    }
  }
  if (!ghost) mergeByMaterial(g);
  return { obj: g, flame, doorPivot };
}

/** Standalone model for icons / previews. */
export function structureVisual(defId: string): THREE.Object3D | null {
  const def = STRUCTURES[defId];
  if (!def) return null;
  return buildVisual(def, 0.6).obj;
}

export interface BuildHooks {
  terrain: Terrain;
  physics: Physics;
  notify: (t: string, k?: "info" | "warn" | "good") => void;
}

export class BuildingSystem {
  list: Structure[] = [];
  ghost: THREE.Group | null = null;
  ghostDef: StructureDef | null = null;
  ghostMatOk = new THREE.MeshLambertMaterial({ color: "#39d353", transparent: true, opacity: 0.45, depthWrite: false });
  ghostMatBad = new THREE.MeshLambertMaterial({ color: "#e5484d", transparent: true, opacity: 0.45, depthWrite: false });
  placement: Placement | null = null;
  rotOffset = 0;

  constructor(private scene: THREE.Scene, private h: BuildHooks) {}

  get(id: number) {
    return this.list.find((s) => s.id === id);
  }

  // ------------------------------------------------------------ geometry helpers
  private footprint(def: StructureDef, rot: number): [number, number] {
    const [w, , d] = def.size;
    return rot % 2 === 0 ? [w, d] : [d, w];
  }

  private makeColliders(s: Structure): BoxCollider[] {
    const def = s.def;
    const out: BoxCollider[] = [];
    const add = (cx: number, cz: number, w: number, d: number, y0: number, y1: number) =>
      out.push({ kind: "box", minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, minY: y0, maxY: y1, owner: s, enabled: true });
    const [w, h, d] = def.size;
    const along = s.rot % 2 === 0; // wall spans X
    switch (def.snap) {
      case "foundation":
        add(s.x, s.z, w, d, s.y - s.bottom, s.y);
        break;
      case "wall":
        add(s.x, s.z, along ? w : d, along ? d : w, s.y, s.y + h);
        break;
      case "doorframe": {
        const side = (w - DOOR_W) / 2;
        const off = DOOR_W / 2 + side / 2;
        if (along) {
          add(s.x - off, s.z, side, d, s.y, s.y + h);
          add(s.x + off, s.z, side, d, s.y, s.y + h);
          add(s.x, s.z, DOOR_W, d, s.y + DOOR_H, s.y + h);
        } else {
          add(s.x, s.z - off, d, side, s.y, s.y + h);
          add(s.x, s.z + off, d, side, s.y, s.y + h);
          add(s.x, s.z, d, DOOR_W, s.y + DOOR_H, s.y + h);
        }
        break;
      }
      case "door":
        add(s.x, s.z, along ? DOOR_W : 0.2, along ? 0.2 : DOOR_W, s.y, s.y + DOOR_H);
        out[0].enabled = !s.open;
        break;
      case "roof":
        add(s.x, s.z, w, d, s.y, s.y + h);
        break;
      case "free": {
        if (def.id === "sleeping_bag") break;
        const [fw, fd] = this.footprint(def, s.rot);
        add(s.x, s.z, fw * 0.9, fd * 0.9, s.y, s.y + h);
        break;
      }
    }
    return out;
  }

  // ------------------------------------------------------------ create / remove
  create(defId: string, p: { x: number; y: number; z: number; rot: number; bottom: number }, forceId?: number): Structure {
    const def = STRUCTURES[defId];
    const vis = buildVisual(def, p.bottom);
    if (forceId !== undefined) NEXT = Math.max(NEXT, forceId + 1);
    const s: Structure = {
      id: forceId ?? NEXT++, def, x: p.x, y: p.y, z: p.z, rot: p.rot, bottom: p.bottom, hp: def.hp, open: false, lit: false, burn: 0, cook: 0,
      inv: def.container ? new Container(def.container, def.spoilMult ?? 1) : null,
      queue: def.interact === "station" ? new CraftQueue(def.name) : null,
      mesh: vis.obj, colliders: [], flame: vis.flame, doorPivot: vis.doorPivot,
    };
    s.mesh.position.set(p.x, p.y, p.z);
    s.mesh.rotation.y = (p.rot * Math.PI) / 2;
    s.mesh.userData.structure = s;
    this.scene.add(s.mesh);
    s.colliders = this.makeColliders(s);
    for (const c of s.colliders) this.h.physics.add(c);
    this.list.push(s);
    return s;
  }

  remove(s: Structure, cascade = true): Structure[] {
    const i = this.list.indexOf(s);
    if (i < 0) return [];
    this.list.splice(i, 1);
    this.scene.remove(s.mesh);
    for (const c of s.colliders) this.h.physics.remove(c);
    const removed = [s];
    if (cascade) {
      // remove anything that lost support
      let changed = true;
      while (changed) {
        changed = false;
        for (const o of [...this.list]) {
          if (!this.isSupported(o)) {
            this.list.splice(this.list.indexOf(o), 1);
            this.scene.remove(o.mesh);
            for (const c of o.colliders) this.h.physics.remove(c);
            removed.push(o);
            changed = true;
          }
        }
      }
    }
    return removed;
  }

  toggleDoor(s: Structure) {
    s.open = !s.open;
    if (s.colliders[0]) s.colliders[0].enabled = !s.open;
  }

  clear() {
    for (const s of [...this.list]) this.remove(s, false);
  }

  // ------------------------------------------------------------ support rules
  private floors() {
    return this.list.filter((s) => s.def.snap === "foundation" || s.def.snap === "roof");
  }
  private floorTop(s: Structure) {
    return s.def.snap === "foundation" ? s.y : s.y + THICK;
  }

  private isSupported(s: Structure): boolean {
    const snap = s.def.snap;
    const eps = 0.15;
    if (snap === "foundation") return true;
    if (snap === "wall" || snap === "doorframe") {
      // floor edge beneath or wall beneath
      for (const f of this.floors()) {
        if (Math.abs(this.floorTop(f) - s.y) > eps) continue;
        for (const e of this.edges(f)) if (Math.abs(e.x - s.x) < eps && Math.abs(e.z - s.z) < eps) return true;
      }
      for (const w of this.list) {
        if (w === s || (w.def.snap !== "wall" && w.def.snap !== "doorframe")) continue;
        if (Math.abs(w.x - s.x) < eps && Math.abs(w.z - s.z) < eps && Math.abs(w.y + WALL_H - s.y) < eps) return true;
      }
      return false;
    }
    if (snap === "roof") {
      if (this.wallsAroundCell(s.x, s.z, s.y) > 0) return true;
      for (const r of this.list) {
        if (r === s || r.def.snap !== "roof" || Math.abs(r.y - s.y) > eps) continue;
        if (Math.abs(Math.hypot(r.x - s.x, r.z - s.z) - GRID) < 0.2 && this.wallsAroundCell(r.x, r.z, r.y) > 0) return true;
      }
      return false;
    }
    if (snap === "door") return this.list.some((f) => f.def.snap === "doorframe" && Math.abs(f.x - s.x) < eps && Math.abs(f.z - s.z) < eps && Math.abs(f.y - s.y) < eps);
    // free: supported by terrain or floor
    if (Math.abs(this.h.terrain.heightAt(s.x, s.z) - s.y) < 0.4) return true;
    return this.floors().some((f) => Math.abs(this.floorTop(f) - s.y) < eps && Math.abs(f.x - s.x) <= GRID / 2 + 0.1 && Math.abs(f.z - s.z) <= GRID / 2 + 0.1);
  }

  private edges(f: Structure) {
    const g = GRID / 2;
    return [
      { x: f.x, z: f.z - g, rot: 0 },
      { x: f.x, z: f.z + g, rot: 0 },
      { x: f.x - g, z: f.z, rot: 1 },
      { x: f.x + g, z: f.z, rot: 1 },
    ];
  }

  private wallsAroundCell(x: number, z: number, topY: number): number {
    const g = GRID / 2;
    let n = 0;
    for (const w of this.list) {
      if (w.def.snap !== "wall" && w.def.snap !== "doorframe") continue;
      if (Math.abs(w.y + WALL_H - topY) > 0.15) continue;
      const onEdge =
        (Math.abs(w.x - x) < 0.1 && Math.abs(Math.abs(w.z - z) - g) < 0.1) || (Math.abs(w.z - z) < 0.1 && Math.abs(Math.abs(w.x - x) - g) < 0.1);
      if (onEdge) n++;
    }
    return n;
  }

  // ------------------------------------------------------------ placement
  beginPlacement(defId: string) {
    this.cancelPlacement();
    const def = STRUCTURES[defId];
    if (!def) return;
    this.ghostDef = def;
    this.ghost = buildVisual(def, 0.6, this.ghostMatOk).obj;
    this.scene.add(this.ghost);
    this.rotOffset = 0;
  }

  cancelPlacement() {
    if (this.ghost) this.scene.remove(this.ghost);
    this.ghost = null;
    this.ghostDef = null;
    this.placement = null;
  }

  rotate() {
    this.rotOffset = (this.rotOffset + 1) % 4;
  }

  /** Recompute ghost placement from an aim point (world hit) and player yaw. */
  updatePlacement(aim: THREE.Vector3, playerPos: THREE.Vector3, yaw: number) {
    const def = this.ghostDef;
    if (!def || !this.ghost) return;
    let p: Placement;
    const baseRot = ((Math.round(-yaw / (Math.PI / 2)) % 4) + 4) % 4;
    switch (def.snap) {
      case "foundation": p = this.placeFoundation(aim); break;
      case "wall":
      case "doorframe": p = this.placeWall(aim); break;
      case "roof": p = this.placeRoof(aim); break;
      case "door": p = this.placeDoor(aim); break;
      default: p = this.placeFree(aim, (baseRot + this.rotOffset) % 4);
    }
    if (p.valid && Math.hypot(p.x - playerPos.x, p.z - playerPos.z) > CONFIG.building.placeRange) {
      p.valid = false;
      p.reason = "Muito longe";
    }
    if (p.valid && def.snap !== "door" && this.overlapsPlayer(def, p, playerPos)) {
      p.valid = false;
      p.reason = "Você está no caminho";
    }
    this.placement = p;
    // rebuild foundation ghost depth if needed
    this.ghost.position.set(p.x, p.y, p.z);
    this.ghost.rotation.y = (p.rot * Math.PI) / 2;
    const m = p.valid ? this.ghostMatOk : this.ghostMatBad;
    this.ghost.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = m; });
    if (def.snap === "foundation") {
      const depth = Math.max(0.6, p.bottom);
      const body = this.ghost.children[0] as THREE.Mesh;
      body.scale.y = depth / 0.6;
      body.position.y = -depth / 2;
    }
  }

  private overlapsPlayer(def: StructureDef, p: Placement, pp: THREE.Vector3): boolean {
    if (def.id === "sleeping_bag") return false;
    const [fw, fd] = this.footprint(def, p.rot);
    const h = def.snap === "foundation" ? 0 : def.size[1];
    const y0 = def.snap === "foundation" ? p.y - p.bottom : p.y;
    const y1 = def.snap === "foundation" ? p.y : p.y + h;
    const r = CONFIG.player.radius;
    return pp.x + r > p.x - fw / 2 && pp.x - r < p.x + fw / 2 && pp.z + r > p.z - fd / 2 && pp.z - r < p.z + fd / 2 && pp.y + 1.7 > y0 && pp.y < y1 - 0.05;
  }

  private terrainRange(x: number, z: number, half: number) {
    const t = this.h.terrain;
    let mn = Infinity, mx = -Infinity;
    for (const [dx, dz] of [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const hh = t.heightAt(x + dx * half, z + dz * half);
      mn = Math.min(mn, hh);
      mx = Math.max(mx, hh);
    }
    return [mn, mx];
  }

  private foundationAt(x: number, z: number, y: number) {
    return this.list.find((s) => s.def.snap === "foundation" && Math.abs(s.x - x) < 0.2 && Math.abs(s.z - z) < 0.2 && Math.abs(s.y - y) < 1.5);
  }

  private placeFoundation(aim: THREE.Vector3): Placement {
    const fs = this.list.filter((s) => s.def.snap === "foundation" && Math.hypot(s.x - aim.x, s.z - aim.z) < GRID * 1.3);
    let x = aim.x, z = aim.z, top: number;
    if (fs.length) {
      fs.sort((a, b) => Math.hypot(a.x - aim.x, a.z - aim.z) - Math.hypot(b.x - aim.x, b.z - aim.z));
      const f = fs[0];
      const dx = aim.x - f.x, dz = aim.z - f.z;
      if (Math.abs(dx) > Math.abs(dz)) { x = f.x + Math.sign(dx) * GRID; z = f.z; }
      else { x = f.x; z = f.z + Math.sign(dz || 1) * GRID; }
      top = f.y;
      if (this.foundationAt(x, z, top)) return { valid: false, reason: "Espaço ocupado", x, y: top, z, rot: 0, bottom: 0.6 };
    } else {
      const [mn, mx] = this.terrainRange(x, z, GRID / 2);
      top = mx + 0.15;
      if (mx - mn > 2.4) return { valid: false, reason: "Terreno muito inclinado", x, y: top, z, rot: 0, bottom: top - mn + 0.4 };
    }
    const [mn, mx] = this.terrainRange(x, z, GRID / 2);
    const bottom = top - mn + 0.4;
    if (mn < -0.3) return { valid: false, reason: "Não pode construir na água", x, y: top, z, rot: 0, bottom };
    if (mx > top + 0.3) return { valid: false, reason: "Terreno obstrui", x, y: top, z, rot: 0, bottom };
    if (bottom > 5) return { valid: false, reason: "Muito alto do chão", x, y: top, z, rot: 0, bottom };
    if (this.overlapsNodes(x, z, GRID / 2)) return { valid: false, reason: "Obstruído por recurso", x, y: top, z, rot: 0, bottom };
    return { valid: true, x, y: top, z, rot: 0, bottom };
  }

  nodeBlocker: ((x: number, z: number, half: number) => boolean) | null = null;
  private overlapsNodes(x: number, z: number, half: number) {
    return this.nodeBlocker ? this.nodeBlocker(x, z, half) : false;
  }

  private placeWall(aim: THREE.Vector3): Placement {
    let best: { x: number; z: number; y: number; rot: number; d: number } | null = null;
    for (const f of this.floors()) {
      if (Math.hypot(f.x - aim.x, f.z - aim.z) > GRID * 1.5) continue;
      for (const e of this.edges(f)) {
        const d = Math.hypot(e.x - aim.x, e.z - aim.z) + Math.abs(this.floorTop(f) - aim.y) * 0.3;
        if (!best || d < best.d) best = { x: e.x, z: e.z, y: this.floorTop(f), rot: e.rot, d };
      }
    }
    // stacking on walls
    for (const w of this.list) {
      if (w.def.snap !== "wall" && w.def.snap !== "doorframe") continue;
      const topY = w.y + WALL_H;
      const d = Math.hypot(w.x - aim.x, w.z - aim.z) + Math.abs(topY - aim.y) * 0.5;
      if (aim.y > w.y + WALL_H * 0.6 && (!best || d < best.d)) best = { x: w.x, z: w.z, y: topY, rot: w.rot, d };
    }
    if (!best || best.d > GRID * 1.2) return { valid: false, reason: "Encaixe em uma fundação", x: aim.x, y: aim.y, z: aim.z, rot: 0, bottom: 0 };
    const occupied = this.list.some((s) => (s.def.snap === "wall" || s.def.snap === "doorframe") && Math.abs(s.x - best!.x) < 0.1 && Math.abs(s.z - best!.z) < 0.1 && Math.abs(s.y - best!.y) < 0.1);
    return { valid: !occupied, reason: occupied ? "Espaço ocupado" : undefined, x: best.x, y: best.y, z: best.z, rot: best.rot, bottom: 0 };
  }

  private placeRoof(aim: THREE.Vector3): Placement {
    const cands: { x: number; z: number; y: number }[] = [];
    for (const f of this.floors()) cands.push({ x: f.x, z: f.z, y: this.floorTop(f) + WALL_H });
    for (const r of this.list) {
      if (r.def.snap !== "roof") continue;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) cands.push({ x: r.x + dx * GRID, z: r.z + dz * GRID, y: r.y });
    }
    let best: { x: number; z: number; y: number; d: number } | null = null;
    for (const c of cands) {
      const d = Math.hypot(c.x - aim.x, c.z - aim.z) + Math.abs(c.y - aim.y) * 0.3;
      if (!best || d < best.d) best = { ...c, d };
    }
    if (!best || best.d > GRID * 1.5) return { valid: false, reason: "Encaixe sobre paredes", x: aim.x, y: aim.y, z: aim.z, rot: 0, bottom: 0 };
    const occupied = this.list.some((s) => s.def.snap === "roof" && Math.abs(s.x - best!.x) < 0.1 && Math.abs(s.z - best!.z) < 0.1 && Math.abs(s.y - best!.y) < 0.1);
    const fake = { def: STRUCTURES.thatch_roof, x: best.x, y: best.y, z: best.z } as Structure;
    const supported = this.isSupported(fake);
    return { valid: !occupied && supported, reason: occupied ? "Espaço ocupado" : !supported ? "Precisa de paredes" : undefined, x: best.x, y: best.y, z: best.z, rot: 0, bottom: 0 };
  }

  private placeDoor(aim: THREE.Vector3): Placement {
    let best: Structure | null = null, bd = 4;
    for (const f of this.list) {
      if (f.def.snap !== "doorframe") continue;
      const d = Math.hypot(f.x - aim.x, f.z - aim.z) + Math.abs(f.y + 1 - aim.y) * 0.3;
      if (d < bd) { bd = d; best = f; }
    }
    if (!best) return { valid: false, reason: "Encaixe em um batente", x: aim.x, y: aim.y, z: aim.z, rot: 0, bottom: 0 };
    const occupied = this.list.some((s) => s.def.snap === "door" && Math.abs(s.x - best!.x) < 0.1 && Math.abs(s.z - best!.z) < 0.1 && Math.abs(s.y - best!.y) < 0.1);
    return { valid: !occupied, reason: occupied ? "Já tem porta" : undefined, x: best.x, y: best.y, z: best.z, rot: best.rot, bottom: 0 };
  }

  private placeFree(aim: THREE.Vector3, rot: number): Placement {
    const def = this.ghostDef!;
    let y = this.h.terrain.heightAt(aim.x, aim.z);
    let onFloor = false;
    for (const f of this.floors()) {
      if (Math.abs(f.x - aim.x) <= GRID / 2 && Math.abs(f.z - aim.z) <= GRID / 2) {
        const top = this.floorTop(f);
        if (top >= y - 0.2 && Math.abs(top - aim.y) < 1.2) { y = top; onFloor = true; }
      }
    }
    if (!onFloor && y < 0) return { valid: false, reason: "Não pode colocar na água", x: aim.x, y, z: aim.z, rot, bottom: 0 };
    if (!onFloor && this.h.terrain.normalAt(aim.x, aim.z).y < 0.75) return { valid: false, reason: "Terreno inclinado", x: aim.x, y, z: aim.z, rot, bottom: 0 };
    const [fw, fd] = this.footprint(def, rot);
    const hit = this.list.some((s) => {
      if (s.def.snap !== "free" && s.def.snap !== "wall" && s.def.snap !== "doorframe") return false;
      return s.colliders.some((c) => c.maxY > y + 0.05 && c.minY < y + def.size[1] && aim.x + fw / 2 > c.minX && aim.x - fw / 2 < c.maxX && aim.z + fd / 2 > c.minZ && aim.z - fd / 2 < c.maxZ);
    }) || this.overlapsNodes(aim.x, aim.z, Math.max(fw, fd) / 2);
    return { valid: !hit, reason: hit ? "Obstruído" : undefined, x: aim.x, y, z: aim.z, rot, bottom: 0 };
  }

  // ------------------------------------------------------------ simulation
  update(dt: number) {
    for (const s of this.list) {
      if (s.inv) s.inv.tickSpoil(dt);
      if (s.def.id === "campfire" || s.def.id === "standing_torch" || s.def.id === "forge") this.updateCampfire(s, dt);
      if (s.def.id === "crop_plot") this.updateCrop(s, dt);
      if (s.doorPivot) {
        const target = s.open ? -Math.PI / 2 : 0;
        s.doorPivot.rotation.y += (target - s.doorPivot.rotation.y) * Math.min(1, dt * 8);
      }
    }
  }

  private updateCampfire(s: Structure, dt: number) {
    const inv = s.inv!;
    if (s.lit) {
      s.burn -= dt;
      if (s.burn <= 0) {
        // consume fuel: prefer thatch? ARK burns wood/thatch; prefer wood (longer)
        const fuelId = inv.count("wood") > 0 ? "wood" : inv.count("thatch") > 0 ? "thatch" : null;
        if (fuelId) {
          inv.remove(fuelId, 1);
          s.burn += ITEMS[fuelId].fuel ?? 10;
        } else {
          s.lit = false;
          s.burn = 0;
          this.h.notify(`${s.def.name} apagou por falta de combustível.`, "warn");
        }
      }
      if (s.lit && (s.def.id === "campfire" || s.def.id === "forge")) {
        // cook/smelt one raw item at a time (campfire cooks food, forge smelts ore)
        const kind = s.def.id === "forge" ? "forge" : "campfire";
        const rawIdx = inv.slots.findIndex((st) => st && ITEMS[st.id]?.cookTo && (ITEMS[st.id].cookIn ?? "campfire") === kind);
        if (rawIdx >= 0) {
          const st = inv.slots[rawIdx]!;
          const def = ITEMS[st.id];
          s.cook += dt;
          if (s.cook >= (def.cookTime ?? 10)) {
            s.cook = 0;
            if (inv.capacityFor(def.cookTo!) > 0 || st.qty === 1) {
              inv.removeAt(rawIdx, 1);
              inv.add(def.cookTo!, 1);
              this.onCooked?.(def.cookTo!);
            }
          }
        } else s.cook = 0;
      }
    }
    if (s.flame) {
      s.flame.visible = s.lit;
      if (s.lit) {
        const t = performance.now() * 0.001;
        s.flame.scale.set(0.9 + Math.sin(t * 17 + s.id) * 0.08, 0.85 + Math.sin(t * 23 + s.id * 2) * 0.18, 0.9 + Math.cos(t * 19) * 0.08);
        s.flame.rotation.y = t * 2;
      }
    }
  }

  lightCampfire(s: Structure, on: boolean): boolean {
    if (on) {
      const inv = s.inv!;
      if (inv.count("wood") + inv.count("thatch") <= 0 && s.burn <= 0) {
        this.h.notify("Coloque madeira ou palha como combustível.", "warn");
        return false;
      }
    }
    s.lit = on;
    return true;
  }

  onCooked: ((id: string) => void) | null = null;
  resistMult = 1;
  rain = 0;

  private updateCrop(s: Structure, dt: number) {
    const inv = s.inv!;
    s.water = Math.min(100, (s.water ?? 0) + this.rain * dt * 2);
    const seedIdx = inv.slots.findIndex((st) => st && ITEMS[st.id]?.seed);
    const plants = s.mesh.getObjectByName("plants");
    if (seedIdx < 0) { s.grow = 0; if (plants) plants.visible = false; return; }
    const seed = ITEMS[inv.slots[seedIdx]!.id];
    if ((s.water ?? 0) > 0) {
      s.grow = (s.grow ?? 0) + dt / 120;
      s.water = Math.max(0, (s.water ?? 0) - dt * 0.15);
    }
    const g = Math.min(1, s.grow ?? 0);
    if (plants) {
      plants.visible = true;
      plants.scale.set(1, 0.2 + g * 0.8, 1);
      plants.traverse((o) => { if (o.name === "berry") o.visible = g >= 1; });
    }
    if ((s.grow ?? 0) >= 1.25) {
      s.grow = 1;
      if (inv.capacityFor(seed.seed!) > 0) inv.add(seed.seed!, 2 + Math.floor(Math.random() * 3));
      if (Math.random() < 0.08) inv.removeAt(seedIdx, 1); // seeds eventually get used up
    }
  }

  water(s: Structure, amount: number) {
    s.water = Math.min(100, (s.water ?? 0) + amount);
  }

  /** Damage a structure; returns true if destroyed (with cascade). */
  damage(s: Structure, dmg: number, fromCarnivore = true): Structure[] {
    const resist = s.def.tier === "stone" ? (fromCarnivore ? 0.08 : 0.4) : s.def.tier === "wood" ? 0.5 : 1;
    s.hp -= (dmg * resist) / this.resistMult;
    if (s.hp > 0) return [];
    return this.remove(s);
  }

  repairCost(s: Structure): [string, number][] {
    const missing = 1 - s.hp / s.def.hp;
    if (missing <= 0.001) return [];
    const base: Record<string, [string, number][]> = { thatch: [["thatch", 6], ["wood", 2]], wood: [["wood", 20], ["thatch", 5]], stone: [["stone", 40], ["cementing_paste", 1]], misc: [["wood", 8], ["stone", 8]] };
    return (base[s.def.tier] ?? base.misc).map(([id, n]) => [id, Math.max(1, Math.ceil(n * missing))]);
  }

  /** Nearest structure within reach of a creature (for AI attacks). */
  nearestTo(pos: THREE.Vector3, r: number): Structure | null {
    let best: Structure | null = null, bd = r;
    for (const s of this.list) {
      for (const c of s.colliders) {
        const cx = Math.max(c.minX, Math.min(pos.x, c.maxX)), cz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
        const d = Math.hypot(pos.x - cx, pos.z - cz);
        if (d < bd && c.maxY > pos.y - 0.5 && c.minY < pos.y + 3) { bd = d; best = s; }
      }
    }
    return best;
  }

  /** Warmth from lit fires near a point (°C). */
  heatAt(p: THREE.Vector3): number {
    let h = 0;
    for (const s of this.list) {
      if (!s.lit) continue;
      const d = Math.hypot(s.x - p.x, s.z - p.z, (s.y - p.y) * 0.5);
      const power = s.def.id === "forge" ? 14 : s.def.id === "campfire" ? 12 : 8;
      const range = s.def.id === "standing_torch" ? 6 : 8;
      if (d < range) h += power * (1 - d / range);
    }
    return Math.min(22, h);
  }

  /** True if a roof or ceiling covers the point (shelter from rain/cold). */
  covered(p: THREE.Vector3): boolean {
    return this.list.some((s) => s.def.snap === "roof" && Math.abs(s.x - p.x) <= GRID / 2 + 0.2 && Math.abs(s.z - p.z) <= GRID / 2 + 0.2 && s.y > p.y + 1.2 && s.y < p.y + 8);
  }

  nearSettlement(x: number, z: number, r = 25) {
    return this.list.some((s) => Math.hypot(s.x - x, s.z - z) < r);
  }

  serialize(): SavedStructure[] {
    return this.list.map((s) => ({
      def: s.def.id, x: s.x, y: s.y, z: s.z, rot: s.rot, hp: s.hp, open: s.open, lit: s.lit, burn: s.burn, cook: s.cook,
      bottom: s.bottom, inv: s.inv?.serialize(), queue: s.queue?.serialize(), water: s.water, grow: s.grow, id: s.id,
    }));
  }

  load(list: SavedStructure[] | undefined, keepIds = false) {
    if (!list) return;
    for (const d of list) {
      if (!STRUCTURES[d.def]) continue;
      const s = this.create(d.def, d, keepIds ? d.id : undefined);
      s.hp = d.hp;
      s.lit = d.lit;
      s.burn = d.burn;
      s.cook = d.cook;
      if (d.open) this.toggleDoor(s);
      if (s.inv) s.inv.load(d.inv);
      if (s.queue) s.queue.load(d.queue);
      s.water = d.water;
      s.grow = d.grow;
    }
  }
}
