import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { mulberry32, hash2 } from "../core/noise";
import { addWind } from "./grass";
import type { Terrain } from "./terrain";
import type { Physics, CircleCollider } from "./physics";
import type { ToolKind } from "../data/items";

export type NodeType = "tree" | "palm" | "bush" | "rock" | "metal_rock" | "pebble";
type ToolClass = "hand" | "pick" | "hatchet" | "other";

export interface YieldDef {
  item: string;
  base: number;
  tool: Partial<Record<ToolClass, number>>;
  chance?: number;
}

export interface NodeTypeDef {
  type: NodeType;
  name: string;
  hp: number;
  respawn: number;
  radius: number;
  height: number;
  gather: "hit" | "interact";
  yields: YieldDef[];
  handHurt?: number; // damage to player when punched barehanded
  xp: number;
}

export const NODE_TYPES: Record<NodeType, NodeTypeDef> = {
  tree: {
    type: "tree", name: "Árvore", hp: 140, respawn: 360, radius: 0.45, height: 7, gather: "hit", xp: 0.6, handHurt: 0.8,
    yields: [
      { item: "wood", base: 2, tool: { hand: 0.4, pick: 0.6, hatchet: 2.4, other: 0.3 } },
      { item: "thatch", base: 2, tool: { hand: 1.4, pick: 2.2, hatchet: 0.5, other: 0.5 } },
    ],
  },
  palm: {
    type: "palm", name: "Palmeira", hp: 100, respawn: 360, radius: 0.35, height: 6, gather: "hit", xp: 0.6, handHurt: 0.8,
    yields: [
      { item: "wood", base: 1.6, tool: { hand: 0.4, pick: 0.6, hatchet: 2.2, other: 0.3 } },
      { item: "thatch", base: 2.4, tool: { hand: 1.5, pick: 2.2, hatchet: 0.5, other: 0.5 } },
    ],
  },
  rock: {
    type: "rock", name: "Rocha", hp: 160, respawn: 420, radius: 1.0, height: 1.6, gather: "hit", xp: 0.7, handHurt: 1.2,
    yields: [
      { item: "stone", base: 2, tool: { hand: 0.3, pick: 0.8, hatchet: 2.4, other: 0.3 } },
      { item: "flint", base: 1.6, tool: { hand: 0.6, pick: 2.4, hatchet: 0.5, other: 0.2 } },
    ],
  },
  metal_rock: {
    type: "metal_rock", name: "Rocha de Metal", hp: 220, respawn: 600, radius: 1.1, height: 1.8, gather: "hit", xp: 1.2, handHurt: 1.5,
    yields: [
      { item: "stone", base: 1.2, tool: { hand: 0.2, pick: 0.6, hatchet: 1.8, other: 0.2 } },
      { item: "metal", base: 1.2, tool: { hand: 0, pick: 1.6, hatchet: 0.4, other: 0 } },
      { item: "flint", base: 0.6, tool: { hand: 0.2, pick: 1, hatchet: 0.2 } },
    ],
  },
  bush: {
    type: "bush", name: "Arbusto", hp: 4, respawn: 200, radius: 0.6, height: 1, gather: "interact", xp: 0.4,
    yields: [
      { item: "fiber", base: 3, tool: { hand: 1 } },
      { item: "mejoberry", base: 2, tool: { hand: 1 }, chance: 0.6 },
      { item: "amarberry", base: 2, tool: { hand: 1 }, chance: 0.5 },
      { item: "narcoberry", base: 1.5, tool: { hand: 1 }, chance: 0.35 },
      { item: "stimberry", base: 1.5, tool: { hand: 1 }, chance: 0.25 },
    ],
  },
  pebble: {
    type: "pebble", name: "Pedras Soltas", hp: 1, respawn: 240, radius: 0.3, height: 0.3, gather: "interact", xp: 0.3,
    yields: [{ item: "stone", base: 2, tool: { hand: 1 } }],
  },
};

export interface ResourceNode {
  id: number;
  type: NodeType;
  x: number; y: number; z: number;
  rot: number;
  scale: number;
  hp: number;
  respawnAt: number; // game time when it returns (0 = alive)
  instance: number;
  variant: number;
  mesh?: THREE.InstancedMesh;
  collider?: CircleCollider;
}

export function toolClass(kind: ToolKind | undefined): ToolClass {
  if (!kind || kind === "hand") return "hand";
  if (kind === "pick") return "pick";
  if (kind === "hatchet") return "hatchet";
  return "other";
}

// ------------------------------------------------------------------ procedural geometry
type Geo = THREE.BufferGeometry;
function vcolor(g: Geo, fn: (x: number, y: number, z: number, nx: number, ny: number, nz: number) => [number, number, number]): Geo {
  const geo = g.index ? g.toNonIndexed() : g;
  geo.computeVertexNormals();
  const p = geo.attributes.position as THREE.BufferAttribute;
  const n = geo.attributes.normal as THREE.BufferAttribute;
  const arr = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const c = fn(p.getX(i), p.getY(i), p.getZ(i), n.getX(i), n.getY(i), n.getZ(i));
    arr[i * 3] = c[0]; arr[i * 3 + 1] = c[1]; arr[i * 3 + 2] = c[2];
  }
  geo.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  if (geo.attributes.uv) geo.deleteAttribute("uv");
  return geo;
}
const hex = (h: string): [number, number, number] => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
const shade = (c: [number, number, number], k: number): [number, number, number] => [c[0] * k, c[1] * k, c[2] * k];
function jitter(g: Geo, amt: number, seed: number) {
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + Math.sin(x * 7.1 + seed) * Math.cos(y * 5.3 + seed * 1.3) * Math.sin(z * 6.7 + seed * 0.7) * amt;
    p.setXYZ(i, x * k, y * k, z * k);
  }
  return g;
}
function foliage(color: string, cx: number, cy: number, cz: number, r: number, seed: number, flatten = 0.8): Geo {
  const g = jitter(new THREE.IcosahedronGeometry(r, 1), 0.28, seed);
  g.scale(1, flatten, 1);
  g.translate(cx, cy, cz);
  const base = hex(color);
  return vcolor(g, (x, y, z, nx, ny) => {
    const ao = 0.55 + 0.45 * (ny * 0.5 + 0.5);
    const v = 0.9 + Math.sin(x * 3 + z * 2 + seed) * 0.1;
    return shade(base, ao * v * (ny > 0.6 ? 1.12 : 1));
  });
}
function trunk(r0: number, r1: number, h: number, color: string, seed: number, bend = 0): Geo {
  const g = new THREE.CylinderGeometry(r1, r0, h, 8, 5);
  g.translate(0, h / 2, 0);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const t = y / h;
    const flare = 1 + Math.pow(Math.max(0, 1 - t * 5), 2) * 0.6;
    p.setX(i, p.getX(i) * flare + Math.sin(t * 3 + seed) * bend * t);
    p.setZ(i, p.getZ(i) * flare + Math.cos(t * 2 + seed) * bend * 0.5 * t);
  }
  const base = hex(color);
  return vcolor(g, (x, y, z) => shade(base, (0.7 + Math.min(1, y / h + 0.2) * 0.35) * (0.85 + 0.15 * Math.sin(Math.atan2(z, x) * 7 + y * 2))));
}
function branch(from: THREE.Vector3, to: THREE.Vector3, r: number, color: string): Geo {
  const len = from.distanceTo(to);
  const g = new THREE.CylinderGeometry(r * 0.5, r, len, 5);
  g.translate(0, len / 2, 0);
  const dir = to.clone().sub(from).normalize();
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
  g.translate(from.x, from.y, from.z);
  const base = hex(color);
  return vcolor(g, () => shade(base, 0.8));
}
function rockGeo(r: number, seed: number, moss: boolean, color = "#8a857e"): Geo {
  const g = new THREE.IcosahedronGeometry(r, 2);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + Math.sin(x * 2.3 + seed) * Math.cos(z * 1.9 + seed) * 0.18 + Math.sin(y * 5 + x * 3) * 0.06;
    p.setXYZ(i, x * k * 1.15, Math.max(-r * 0.25, y * k * 0.72), z * k);
  }
  g.translate(0, r * 0.35, 0);
  const base = hex(color), mossC = hex("#5d7a36");
  return vcolor(g, (x, y, z, nx, ny) => {
    let c = shade(base, 0.72 + 0.28 * (ny * 0.5 + 0.5) + Math.sin(x * 4 + z * 3) * 0.05);
    if (moss && ny > 0.55 + Math.sin(x * 3 + z * 5) * 0.15) c = shade(mossC, 0.8 + ny * 0.3);
    if (y < 0.05) c = shade(c, 0.7);
    return c;
  });
}

export const VARIANTS: Record<NodeType, number> = { tree: 4, palm: 2, bush: 3, rock: 3, metal_rock: 2, pebble: 2 };

function buildGeometry(type: NodeType, v: number): Geo {
  const parts: Geo[] = [];
  const seed = v * 13.7 + type.length;
  switch (type) {
    case "tree": {
      if (v < 2) {
        // broadleaf
        const h = 3.4 + v * 0.8;
        parts.push(trunk(0.3, 0.18, h, "#5e4430", seed, 0.25));
        const leaf = v === 0 ? "#3f6e2e" : "#4c7a30";
        const tops: [number, number, number, number][] = [[0, h + 1.1, 0, 1.7], [1.1, h + 0.5, 0.4, 1.2], [-1, h + 0.7, -0.5, 1.25], [0.2, h + 0.4, -1.1, 1.15], [-0.3, h + 0.2, 1.0, 1.1], [0.3, h + 2.0, 0.2, 1.1]];
        for (const [x, y, z, r] of tops) {
          parts.push(branch(new THREE.Vector3(0, h * 0.8, 0), new THREE.Vector3(x * 0.8, y - 0.4, z * 0.8), 0.1, "#5e4430"));
          parts.push(foliage(leaf, x, y, z, r, seed + x * 3));
        }
      } else {
        // conifer
        const h = 7 + (v - 2) * 1.8;
        parts.push(trunk(0.26, 0.08, h, "#4f3a2a", seed));
        const tiers = 5;
        for (let i = 0; i < tiers; i++) {
          const t = i / (tiers - 1);
          const r = 1.9 * (1 - t * 0.78);
          const c = new THREE.ConeGeometry(r, 2.1 - t * 0.6, 9, 2);
          jitter(c, 0.1, seed + i);
          c.translate(0, h * 0.28 + i * (h * 0.15), 0);
          const base = hex(v === 2 ? "#2f5a32" : "#35603a");
          parts.push(vcolor(c, (x, y, z, nx, ny) => shade(base, 0.6 + 0.45 * (ny * 0.5 + 0.5) + (Math.sin(x * 5 + z * 4) * 0.06))));
        }
      }
      break;
    }
    case "palm": {
      const h = 5 + v * 0.8;
      const segs = 7;
      const lean = 0.8 + v * 0.3;
      const pos = (t: number) => new THREE.Vector3(Math.sin(t * 1.3) * lean * t, t * h, 0);
      for (let i = 0; i < segs; i++) {
        const a = pos(i / segs), b = pos((i + 1) / segs);
        const r = 0.2 - (i / segs) * 0.07;
        const len = a.distanceTo(b);
        const g = new THREE.CylinderGeometry(r * 0.9, r * 1.05, len, 7);
        g.translate(0, len / 2, 0);
        g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()));
        g.translate(a.x, a.y, a.z);
        const base = hex("#8b6e45");
        parts.push(vcolor(g, (x, y) => shade(base, 0.75 + ((y * 3) % 1) * 0.3)));
      }
      const top = pos(1);
      for (let k = 0; k < 8; k++) {
        const ang = (k / 8) * Math.PI * 2 + v;
        const frond = new THREE.PlaneGeometry(3.0, 0.7, 8, 1);
        const p = frond.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < p.count; i++) {
          const x = p.getX(i) + 1.5;
          const w = Math.sin((x / 3) * Math.PI) * 1.1;
          p.setXYZ(i, x, -x * x * 0.12 + 0.2, p.getY(i) * w);
        }
        frond.rotateY(ang);
        frond.translate(top.x, top.y, top.z);
        const base = hex(k % 2 ? "#4f8a36" : "#5e9a3e");
        parts.push(vcolor(frond, (x, y) => shade(base, 0.75 + Math.min(0.35, (y - top.y + 1) * 0.2))));
      }
      for (let k = 0; k < 3; k++) {
        const c = new THREE.SphereGeometry(0.13, 7, 5);
        c.translate(top.x + Math.cos(k * 2.1) * 0.22, top.y - 0.25, top.z + Math.sin(k * 2.1) * 0.22);
        parts.push(vcolor(c, () => hex("#5a4020")));
      }
      break;
    }
    case "rock": {
      parts.push(rockGeo(1.05, seed, true));
      if (v !== 1) parts.push(rockGeo(0.5, seed + 4, true).translate(0.95, -0.15, 0.35));
      if (v === 2) parts.push(rockGeo(0.4, seed + 9, false).translate(-0.8, -0.1, -0.5));
      break;
    }
    case "metal_rock": {
      parts.push(rockGeo(1.15, seed, false, "#5a5652"));
      parts.push(rockGeo(0.55, seed + 3, false, "#54504c").translate(-0.9, -0.1, 0.4));
      for (let i = 0; i < 8; i++) {
        const c = new THREE.OctahedronGeometry(0.16 + (i % 3) * 0.06, 0);
        c.scale(1, 1.8, 1);
        c.rotateZ(i);
        c.translate(Math.cos(i * 1.3) * 0.85, 0.5 + Math.sin(i * 2.1) * 0.3, Math.sin(i * 1.3) * 0.75);
        parts.push(vcolor(c, (x, y, z, nx, ny) => shade(hex("#d6dde6"), 0.7 + ny * 0.4)));
      }
      break;
    }
    case "bush": {
      const leaf = ["#4f8a36", "#437a30", "#5a8f3a"][v];
      for (let i = 0; i < 5; i++) {
        const a = i * 1.3;
        parts.push(foliage(leaf, Math.cos(a) * 0.35, 0.45 + (i % 2) * 0.15, Math.sin(a) * 0.35, 0.5, seed + i, 0.75));
      }
      const berry = [["#6a4bd1", "#d23c3c"], ["#e2b93b", "#2c2c3c"], ["#e8e8f0", "#6a4bd1"]][v];
      for (let i = 0; i < 14; i++) {
        const a = i * 2.39, r = 0.55 + (i % 3) * 0.08;
        const b = new THREE.SphereGeometry(0.06, 6, 4);
        b.translate(Math.cos(a) * r, 0.35 + (i % 4) * 0.13, Math.sin(a) * r);
        parts.push(vcolor(b, () => hex(berry[i % 2])));
      }
      break;
    }
    case "pebble": {
      for (let i = 0; i < 4; i++) parts.push(rockGeo(0.14 + i * 0.03, seed + i, false, "#9a958f").translate(i * 0.2 - 0.3, -0.03, (i % 2) * 0.18 - 0.08));
      break;
    }
  }
  const merged = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)))!;
  merged.computeVertexNormals();
  return merged;
}

// ------------------------------------------------------------------ decorations (non-interactive)
type DecoType = "fern" | "flowers" | "mushroom" | "log" | "stones" | "reeds";
function decoGeometry(t: DecoType): Geo {
  const parts: Geo[] = [];
  switch (t) {
    case "fern":
      for (let k = 0; k < 7; k++) {
        const f = new THREE.PlaneGeometry(0.9, 0.22, 4, 1);
        const p = f.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < p.count; i++) { const x = p.getX(i) + 0.45; p.setXYZ(i, x, 0.35 * x - x * x * 0.45 + 0.05, p.getY(i) * (1 - x)); }
        f.rotateY((k / 7) * Math.PI * 2);
        parts.push(vcolor(f, (x, y) => shade(hex("#3f7a2e"), 0.7 + y * 1.2)));
      }
      break;
    case "flowers":
      for (let k = 0; k < 6; k++) {
        const x = Math.cos(k * 2.3) * 0.25, z = Math.sin(k * 2.3) * 0.25;
        parts.push(vcolor(new THREE.CylinderGeometry(0.01, 0.01, 0.35, 3).translate(x, 0.17, z), () => hex("#4a7a2a")));
        const col = ["#f0e060", "#e85a8a", "#ffffff", "#b070e0"][k % 4];
        parts.push(vcolor(new THREE.IcosahedronGeometry(0.06, 0).scale(1, 0.4, 1).translate(x, 0.36, z), () => hex(col)));
      }
      break;
    case "mushroom":
      for (let k = 0; k < 3; k++) {
        const x = k * 0.15 - 0.15, s = 0.7 + k * 0.25;
        parts.push(vcolor(new THREE.CylinderGeometry(0.03 * s, 0.04 * s, 0.14 * s, 5).translate(x, 0.07 * s, k * 0.06), () => hex("#e8dcc0")));
        parts.push(vcolor(new THREE.SphereGeometry(0.09 * s, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2).translate(x, 0.13 * s, k * 0.06), () => hex(k === 1 ? "#c0392b" : "#a0703c")));
      }
      break;
    case "log": {
      const g = trunk(0.28, 0.22, 3.2, "#5a4232", 3);
      g.rotateZ(Math.PI / 2);
      g.translate(1.6, 0.22, 0);
      parts.push(g);
      parts.push(foliage("#4d7a30", 0.6, 0.45, 0.1, 0.25, 3, 0.5));
      break;
    }
    case "stones":
      for (let k = 0; k < 3; k++) parts.push(rockGeo(0.12 + k * 0.05, k * 3, k === 2).translate(k * 0.25 - 0.25, -0.02, (k % 2) * 0.2));
      break;
    case "reeds":
      for (let k = 0; k < 9; k++) {
        const x = Math.cos(k * 2.1) * 0.2, z = Math.sin(k * 2.1) * 0.2;
        parts.push(vcolor(new THREE.ConeGeometry(0.025, 1.1 + (k % 3) * 0.2, 3).translate(x, 0.55, z), (_x, y) => shade(hex("#7a8a40"), 0.6 + y * 0.35)));
      }
      break;
  }
  const merged = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)))!;
  merged.computeVertexNormals();
  return merged;
}

const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

export class ResourceManager {
  nodes: ResourceNode[] = [];
  meshes: THREE.InstancedMesh[] = [];
  decoMeshes: THREE.InstancedMesh[] = [];
  private grid = new Map<number, ResourceNode[]>();
  private readonly cell = 8;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();

  private seedVal: number;
  constructor(private terrain: Terrain, private physics: Physics, seed: number) {
    this.seedVal = seed;
    this.scatter(seed);
  }

  private gkey(x: number, z: number) {
    return (Math.floor(x / this.cell) + 500) * 2048 + (Math.floor(z / this.cell) + 500);
  }

  private extraNodes: ResourceNode[] = [];
  private scatter(seed: number) {
    const rng = mulberry32(seed + 77);
    const t = this.terrain;
    const step = 4.2;
    const sp = t.spawnPoint;
    let id = 0;
    for (let z = -t.half + 4; z < t.half - 4; z += step)
      for (let x = -t.half + 4; x < t.half - 4; x += step) {
        const px = x + (rng() - 0.5) * step * 0.9, pz = z + (rng() - 0.5) * step * 0.9;
        const biome = t.biomeAt(px, pz);
        if (biome === "water") continue;
        const h = t.heightAt(px, pz);
        const slope = t.normalAt(px, pz).y;
        const r = rng();
        let type: NodeType | null = null;
        switch (biome) {
          case "beach":
            if (r < 0.035) type = "palm";
            else if (r < 0.055) type = "pebble";
            else if (r < 0.065) type = "rock";
            else if (r < 0.075) type = "bush";
            break;
          case "grassland":
            if (r < 0.03) type = "tree";
            else if (r < 0.075) type = "bush";
            else if (r < 0.095) type = "pebble";
            else if (r < 0.108) type = "rock";
            break;
          case "forest":
            if (r < 0.22) type = "tree";
            else if (r < 0.28) type = "bush";
            else if (r < 0.295) type = "rock";
            else if (r < 0.31) type = "pebble";
            break;
          case "hills":
            if (r < 0.06) type = "rock";
            else if (r < 0.085) type = "metal_rock";
            else if (r < 0.105) type = "tree";
            else if (r < 0.125) type = "pebble";
            else if (r < 0.14) type = "bush";
            break;
          case "peak":
            if (r < 0.05) type = "rock";
            else if (r < 0.09) type = "metal_rock";
            break;
        }
        if (!type) continue;
        if ((type === "tree" || type === "palm") && slope < 0.8) continue;
        // keep spawn beach slightly clear but with starter resources nearby
        const ds = Math.hypot(px - sp.x, pz - sp.z);
        if (ds < 3) continue;
        const node: ResourceNode = {
          id: id++, type, x: px, y: h - 0.05, z: pz, rot: rng() * Math.PI * 2,
          scale: 0.8 + rng() * 0.45, hp: NODE_TYPES[type].hp, respawnAt: 0, instance: 0, variant: 0,
        };
        this.nodes.push(node);
      }
    // extra loose-stone pass (easier to find stones, like the original's frequent pebble piles)
    const rng2 = mulberry32(seed + 4242);
    const step2 = 5.5;
    for (let z = -t.half + 4; z < t.half - 4; z += step2)
      for (let x = -t.half + 4; x < t.half - 4; x += step2) {
        const px = x + (rng2() - 0.5) * step2, pz = z + (rng2() - 0.5) * step2;
        const b = t.biomeAt(px, pz);
        const chance = b === "beach" ? 0.09 : b === "grassland" ? 0.07 : b === "forest" ? 0.06 : b === "hills" ? 0.1 : 0;
        if (rng2() > chance || t.normalAt(px, pz).y < 0.8) continue;
        this.extraNodes.push({ id: 0, type: "pebble", x: px, y: t.heightAt(px, pz) - 0.05, z: pz, rot: rng2() * Math.PI * 2, scale: 1 + rng2() * 0.35, hp: 1, respawnAt: 0, instance: 0, variant: 0 });
      }
    // guarantee starter resources near spawn
    const starters: NodeType[] = ["pebble", "pebble", "pebble", "bush", "bush", "palm", "palm", "rock"];
    starters.forEach((type, i) => {
      const a = (i / starters.length) * Math.PI * 2;
      const r = 6 + (i % 3) * 3;
      const x = sp.x + Math.cos(a) * r, z = sp.z + Math.sin(a) * r;
      if (t.heightAt(x, z) < 0.2) return;
      this.nodes.push({ id: id++, type, x, y: t.heightAt(x, z) - 0.05, z, rot: a, scale: 1, hp: NODE_TYPES[type].hp, respawnAt: 0, instance: 0, variant: 0 });
    });
    for (const n of this.extraNodes) { n.id = id++; this.nodes.push(n); }
    this.extraNodes = [];
  }

  private pickVariant(n: ResourceNode): number {
    const h = hash2(n.id, n.type.length, 991);
    if (n.type === "tree") {
      const biome = this.terrain.biomeAt(n.x, n.z);
      const conifer = biome === "hills" ? h < 0.85 : biome === "forest" ? h < 0.35 : h < 0.1;
      return conifer ? 2 + (h * 100 > 50 ? 1 : 0) : (h * 100) % 2 < 1 ? 0 : 1;
    }
    return Math.floor(h * VARIANTS[n.type]) % VARIANTS[n.type];
  }

  buildMeshes(scene: THREE.Scene) {
    const CH = 64;
    const groups = new Map<string, ResourceNode[]>();
    for (const n of this.nodes) {
      n.variant = this.pickVariant(n);
      const cx = Math.floor(n.x / CH), cz = Math.floor(n.z / CH);
      const key = `${n.type}|${n.variant}|${cx}|${cz}`;
      let a = groups.get(key);
      if (!a) { a = []; groups.set(key, a); }
      n.instance = a.length;
      a.push(n);
      const k = this.gkey(n.x, n.z);
      let gr = this.grid.get(k);
      if (!gr) { gr = []; this.grid.set(k, gr); }
      gr.push(n);
      const def = NODE_TYPES[n.type];
      if (def.gather === "hit") {
        const r = n.type === "tree" && n.variant >= 2 ? 0.32 : def.radius;
        n.collider = { kind: "circle", x: n.x, z: n.z, r: r * n.scale, minY: n.y - 1, maxY: n.y + def.height * n.scale, owner: n, enabled: true };
        this.physics.add(n.collider);
      }
    }
    const geoCache = new Map<string, THREE.BufferGeometry>();
    const matPlain = new THREE.MeshLambertMaterial({ vertexColors: true });
    const matTree = new THREE.MeshLambertMaterial({ vertexColors: true });
    addWind(matTree, 0.05, 0.18);
    const matPalm = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    addWind(matPalm, 0.05, 0.16);
    const matBush = new THREE.MeshLambertMaterial({ vertexColors: true });
    addWind(matBush, 0.12, 0.8);
    for (const [key, list] of groups) {
      const [type, v] = key.split("|") as [NodeType, string];
      const gk = type + v;
      let geo = geoCache.get(gk);
      if (!geo) { geo = buildGeometry(type, Number(v)); geoCache.set(gk, geo); }
      const mat = type === "tree" ? matTree : type === "palm" ? matPalm : type === "bush" ? matBush : matPlain;
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      for (const n of list) { n.mesh = im; this.writeMatrix(im, n); }
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      if (im.boundingSphere) im.boundingSphere.radius += 8;
      im.castShadow = type === "tree" || type === "palm" || type === "rock" || type === "metal_rock";
      im.userData.small = type === "pebble" || type === "bush";
      im.receiveShadow = true;
      this.meshes.push(im);
      scene.add(im);
    }
    this.scatterDecorations(scene);
  }

  private scatterDecorations(scene: THREE.Scene) {
    const t = this.terrain;
    const rng = mulberry32(this.seedVal + 313);
    const byKey = new Map<string, THREE.Matrix4[]>();
    const CH = 64;
    const step = 3.2;
    const q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (let z = -t.half + 4; z < t.half - 4; z += step)
      for (let x = -t.half + 4; x < t.half - 4; x += step) {
        const px = x + (rng() - 0.5) * step, pz = z + (rng() - 0.5) * step;
        const b = t.biomeAt(px, pz);
        const r = rng();
        let type: DecoType | null = null;
        const h = t.heightAt(px, pz);
        if (b === "water") { if (h > -0.6 && r < 0.12) type = "reeds"; }
        else if (b === "forest") type = r < 0.16 ? "fern" : r < 0.2 ? "mushroom" : r < 0.215 ? "log" : r < 0.24 ? "stones" : null;
        else if (b === "grassland") type = r < 0.07 ? "flowers" : r < 0.1 ? "fern" : r < 0.115 ? "stones" : null;
        else if (b === "beach") type = r < 0.025 ? "stones" : h < 1 && r < 0.06 ? "reeds" : null;
        else if (b === "hills") type = r < 0.06 ? "stones" : r < 0.08 ? "fern" : null;
        if (!type) continue;
        if (t.normalAt(px, pz).y < 0.8 && type !== "stones") continue;
        const key = `${type}|${Math.floor(px / CH)}|${Math.floor(pz / CH)}`;
        let a = byKey.get(key);
        if (!a) { a = []; byKey.set(key, a); }
        q.setFromAxisAngle(up, rng() * Math.PI * 2);
        const sc = 0.75 + rng() * 0.6;
        a.push(new THREE.Matrix4().compose(p.set(px, h - 0.03, pz), q, s.set(sc, sc, sc)));
      }
    const geoCache = new Map<string, THREE.BufferGeometry>();
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    addWind(mat, 0.15, 1.2);
    const matStatic = new THREE.MeshLambertMaterial({ vertexColors: true });
    for (const [key, list] of byKey) {
      const type = key.split("|")[0] as DecoType;
      let geo = geoCache.get(type);
      if (!geo) { geo = decoGeometry(type); geoCache.set(type, geo); }
      const im = new THREE.InstancedMesh(geo, type === "log" || type === "stones" ? matStatic : mat, list.length);
      list.forEach((m, i) => im.setMatrixAt(i, m));
      im.computeBoundingSphere();
      if (im.boundingSphere) im.boundingSphere.radius += 4;
      im.receiveShadow = true;
      im.castShadow = type === "log";
      this.decoMeshes.push(im);
      scene.add(im);
    }
  }

  /** Hide decoration & small resource chunks beyond a distance (mobile LOD). */
  updateLod(cam: THREE.Vector3, decoDist: number) {
    for (const m of this.meshes) {
      const bs = m.boundingSphere;
      if (bs && m.userData.small) m.visible = bs.center.distanceTo(cam) - bs.radius < decoDist * 1.3;
    }
    for (const m of this.decoMeshes) {
      const bs = m.boundingSphere;
      if (bs) m.visible = bs.center.distanceTo(cam) - bs.radius < decoDist;
    }
  }

  removeFrom(scene: THREE.Scene) {
    for (const m of this.meshes) scene.remove(m);
    for (const m of this.decoMeshes) scene.remove(m);
  }

  private writeMatrix(im: THREE.InstancedMesh, n: ResourceNode, shake = 0) {
    if (n.respawnAt > 0) {
      im.setMatrixAt(n.instance, HIDDEN);
      return;
    }
    this.q.setFromAxisAngle(this.v.set(0, 1, 0), n.rot + shake);
    this.s.setScalar(n.scale);
    this.m.compose(this.v.set(n.x, n.y, n.z), this.q, this.s);
    im.setMatrixAt(n.instance, this.m);
  }

  refresh(n: ResourceNode, shake = 0) {
    const im = n.mesh;
    if (!im) return;
    this.writeMatrix(im, n, shake);
    im.instanceMatrix.needsUpdate = true;
  }

  near(x: number, z: number, r: number, out: ResourceNode[] = []): ResourceNode[] {
    out.length = 0;
    for (let gz = Math.floor((z - r) / this.cell); gz <= Math.floor((z + r) / this.cell); gz++)
      for (let gx = Math.floor((x - r) / this.cell); gx <= Math.floor((x + r) / this.cell); gx++) {
        const arr = this.grid.get((gx + 500) * 2048 + (gz + 500));
        if (!arr) continue;
        for (const n of arr) if (n.respawnAt === 0 && Math.hypot(n.x - x, n.z - z) <= r + NODE_TYPES[n.type].radius * n.scale) out.push(n);
      }
    return out;
  }

  /** Compute yields for a hit/gather; applies damage & depletion. */
  harvest(n: ResourceNode, tool: ToolKind | undefined, power: number, damage: number, now: number): { item: string; qty: number }[] {
    const def = NODE_TYPES[n.type];
    const tc = toolClass(tool);
    const out: { item: string; qty: number }[] = [];
    for (const y of def.yields) {
      if (y.chance !== undefined && Math.random() > y.chance) continue;
      const mult = y.tool[tc] ?? y.tool.other ?? 0;
      const raw = y.base * mult * power * (0.75 + Math.random() * 0.5);
      let q = Math.floor(raw);
      if (Math.random() < raw - q) q++;
      if (q > 0) out.push({ item: y.item, qty: q });
    }
    n.hp -= def.gather === "interact" ? 1 : damage;
    if (n.hp <= 0) this.deplete(n, now);
    else this.refresh(n, (Math.random() - 0.5) * 0.08);
    return out;
  }

  respawnMult = 1;
  onChange: ((n: ResourceNode) => void) | null = null; // multiplayer host: broadcast depletion/respawn
  netDriven = false; // multiplayer guest: respawns come from the host
  byId(id: number) { const n = this.nodes[id]; return n && n.id === id ? n : this.nodes.find((x) => x.id === id); }
  setAlive(n: ResourceNode, alive: boolean, now: number) {
    if (alive) { n.respawnAt = 0; n.hp = NODE_TYPES[n.type].hp; if (n.collider) n.collider.enabled = true; this.refresh(n); }
    else if (n.respawnAt === 0) { n.respawnAt = now + 99999; if (n.collider) n.collider.enabled = false; this.refresh(n); }
  }
  deplete(n: ResourceNode, now: number) {
    n.respawnAt = now + NODE_TYPES[n.type].respawn * this.respawnMult * (0.8 + Math.random() * 0.4);
    if (n.collider) n.collider.enabled = false;
    this.refresh(n);
    this.onChange?.(n);
  }

  private respawnTimer = 0;
  update(dt: number, now: number, playerPos: THREE.Vector3) {
    if (this.netDriven) return;
    this.respawnTimer -= dt;
    if (this.respawnTimer > 0) return;
    this.respawnTimer = 2;
    for (const n of this.nodes) {
      if (n.respawnAt > 0 && now >= n.respawnAt) {
        // do not pop in right on top of the player
        if (Math.hypot(n.x - playerPos.x, n.z - playerPos.z) < 4) continue;
        n.respawnAt = 0;
        n.hp = NODE_TYPES[n.type].hp;
        if (n.collider) n.collider.enabled = true;
        this.refresh(n);
        this.onChange?.(n);
      }
    }
  }

  serialize(): [number, number][] {
    return this.nodes.filter((n) => n.respawnAt > 0).map((n) => [n.id, Math.round(n.respawnAt)]);
  }

  load(data: [number, number][] | undefined) {
    if (!data) return;
    const byId = new Map(this.nodes.map((n) => [n.id, n]));
    for (const [id, t] of data) {
      const n = byId.get(id);
      if (!n) continue;
      n.respawnAt = t;
      if (n.collider) n.collider.enabled = false;
      this.refresh(n);
    }
  }
}
