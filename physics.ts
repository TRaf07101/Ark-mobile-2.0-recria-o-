import * as THREE from "three";
import type { Terrain } from "./terrain";
import { CONFIG } from "../core/config";

/** Axis-aligned box collider (structures). */
export interface BoxCollider {
  kind: "box";
  minX: number; minY: number; minZ: number;
  maxX: number; maxY: number; maxZ: number;
  owner?: unknown;
  enabled: boolean;
}
/** Vertical cylinder collider (trees, rocks). */
export interface CircleCollider {
  kind: "circle";
  x: number; z: number; r: number;
  minY: number; maxY: number;
  owner?: unknown;
  enabled: boolean;
}
export type Collider = BoxCollider | CircleCollider;

const CELL = 6;

/** Uniform grid spatial hash for static colliders. */
export class Physics {
  private cells = new Map<number, Collider[]>();
  private stamp = 0;
  private marks = new WeakMap<Collider, number>();

  constructor(public terrain: Terrain) {}

  private key(ix: number, iz: number) {
    return (ix + 1000) * 4096 + (iz + 1000);
  }

  private bounds(c: Collider): [number, number, number, number] {
    if (c.kind === "box") return [c.minX, c.minZ, c.maxX, c.maxZ];
    return [c.x - c.r, c.z - c.r, c.x + c.r, c.z + c.r];
  }

  add(c: Collider) {
    const [x0, z0, x1, z1] = this.bounds(c);
    for (let iz = Math.floor(z0 / CELL); iz <= Math.floor(z1 / CELL); iz++)
      for (let ix = Math.floor(x0 / CELL); ix <= Math.floor(x1 / CELL); ix++) {
        const k = this.key(ix, iz);
        let arr = this.cells.get(k);
        if (!arr) { arr = []; this.cells.set(k, arr); }
        arr.push(c);
      }
  }

  remove(c: Collider) {
    const [x0, z0, x1, z1] = this.bounds(c);
    for (let iz = Math.floor(z0 / CELL); iz <= Math.floor(z1 / CELL); iz++)
      for (let ix = Math.floor(x0 / CELL); ix <= Math.floor(x1 / CELL); ix++) {
        const arr = this.cells.get(this.key(ix, iz));
        if (!arr) continue;
        const i = arr.indexOf(c);
        if (i >= 0) arr.splice(i, 1);
      }
  }

  query(x: number, z: number, r: number, out: Collider[] = []): Collider[] {
    out.length = 0;
    this.stamp++;
    for (let iz = Math.floor((z - r) / CELL); iz <= Math.floor((z + r) / CELL); iz++)
      for (let ix = Math.floor((x - r) / CELL); ix <= Math.floor((x + r) / CELL); ix++) {
        const arr = this.cells.get(this.key(ix, iz));
        if (!arr) continue;
        for (const c of arr) {
          if (!c.enabled || this.marks.get(c) === this.stamp) continue;
          this.marks.set(c, this.stamp);
          out.push(c);
        }
      }
    return out;
  }

  /** Highest walkable surface under (x,z) not higher than `maxY` (terrain or box tops). */
  groundAt(x: number, z: number, r: number, maxY: number): number {
    let g = this.terrain.heightAt(x, z);
    const list = this.query(x, z, r, tmpList);
    for (const c of list) {
      if (c.kind !== "box") continue;
      if (x + r * 0.7 > c.minX && x - r * 0.7 < c.maxX && z + r * 0.7 > c.minZ && z - r * 0.7 < c.maxZ) {
        if (c.maxY <= maxY && c.maxY > g) g = c.maxY;
      }
    }
    return g;
  }

  /**
   * Move a vertical-cylinder body with collision against terrain, boxes and circles.
   * pos = feet position. Mutates pos & vel. Returns ground state.
   */
  moveBody(pos: THREE.Vector3, vel: THREE.Vector3, dt: number, radius: number, height: number, stepHeight: number = CONFIG.player.stepHeight) {
    const res = { onGround: false, hitWall: false, hitCeiling: false, groundY: 0 };
    const steps = Math.max(1, Math.ceil((Math.hypot(vel.x, vel.z) * dt) / (radius * 0.8)));
    const sdt = dt / steps;
    for (let s = 0; s < steps; s++) {
      const ox = pos.x, oz = pos.z;
      pos.x += vel.x * sdt;
      pos.z += vel.z * sdt;
      // slope limit: cannot walk up terrain steeper than ~52 degrees
      const t0 = this.terrain.heightAt(ox, oz), t1 = this.terrain.heightAt(pos.x, pos.z);
      const horiz = Math.hypot(pos.x - ox, pos.z - oz);
      if (horiz > 1e-5 && t1 > pos.y + 0.05 && (t1 - t0) / horiz > 1.3 && pos.y <= t0 + 0.3) {
        pos.x = ox;
        pos.z = oz;
        res.hitWall = true;
      }
      // horizontal resolution
      const list = this.query(pos.x, pos.z, radius + 1, tmpList);
      for (const c of list) {
        if (c.kind === "circle") {
          if (pos.y + height < c.minY || pos.y > c.maxY - 0.05) continue;
          const dx = pos.x - c.x, dz = pos.z - c.z;
          const d = Math.hypot(dx, dz), m = radius + c.r;
          if (d < m && d > 1e-5) {
            pos.x = c.x + (dx / d) * m;
            pos.z = c.z + (dz / d) * m;
            res.hitWall = true;
          }
        } else {
          // vertical overlap (allow stepping onto low boxes)
          if (pos.y + height <= c.minY || pos.y >= c.maxY - 0.02) continue;
          if (c.maxY - pos.y <= stepHeight && vel.y <= 0.1) continue; // step up handled by ground
          const cx = Math.max(c.minX, Math.min(pos.x, c.maxX));
          const cz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
          const dx = pos.x - cx, dz = pos.z - cz;
          const d2 = dx * dx + dz * dz;
          if (d2 < radius * radius) {
            if (d2 > 1e-8) {
              const d = Math.sqrt(d2);
              pos.x = cx + (dx / d) * radius;
              pos.z = cz + (dz / d) * radius;
            } else {
              // center inside box: push out on smallest axis
              const pxl = pos.x - c.minX, pxr = c.maxX - pos.x, pzl = pos.z - c.minZ, pzr = c.maxZ - pos.z;
              const m = Math.min(pxl, pxr, pzl, pzr);
              if (m === pxl) pos.x = c.minX - radius;
              else if (m === pxr) pos.x = c.maxX + radius;
              else if (m === pzl) pos.z = c.minZ - radius;
              else pos.z = c.maxZ + radius;
            }
            res.hitWall = true;
          }
        }
      }
    }
    // vertical
    pos.y += vel.y * dt;
    const ground = this.groundAt(pos.x, pos.z, radius, pos.y + stepHeight);
    res.groundY = ground;
    if (pos.y <= ground + 0.001) {
      if (vel.y <= 0 || ground - pos.y < stepHeight) {
        pos.y = ground;
        if (vel.y < 0) vel.y = 0;
        res.onGround = true;
      }
    } else if (pos.y - ground < 0.06 && vel.y <= 0) {
      pos.y = ground;
      res.onGround = true;
    }
    // ceiling
    if (vel.y > 0) {
      const list = this.query(pos.x, pos.z, radius, tmpList);
      for (const c of list) {
        if (c.kind !== "box") continue;
        if (pos.x + radius * 0.6 > c.minX && pos.x - radius * 0.6 < c.maxX && pos.z + radius * 0.6 > c.minZ && pos.z - radius * 0.6 < c.maxZ) {
          if (pos.y + height > c.minY && pos.y < c.minY) {
            pos.y = c.minY - height;
            vel.y = 0;
            res.hitCeiling = true;
          }
        }
      }
    }
    return res;
  }

  /** Ray vs boxes & circles & terrain. Returns nearest distance or -1. */
  raycast(o: THREE.Vector3, d: THREE.Vector3, maxDist: number, includeTerrain = true): { dist: number; collider: Collider | null } {
    let best = includeTerrain ? this.terrain.raycast(o, d, maxDist) : -1;
    let bestC: Collider | null = null;
    if (best < 0) best = Infinity;
    // sample cells along ray
    const seen = new Set<Collider>();
    const stepLen = CELL * 0.5;
    for (let t = 0; t <= Math.min(maxDist, best) + stepLen; t += stepLen) {
      const x = o.x + d.x * t, z = o.z + d.z * t;
      for (const c of this.query(x, z, CELL * 0.5, tmpList2)) {
        if (seen.has(c)) continue;
        seen.add(c);
        const hit = c.kind === "box" ? rayBox(o, d, c) : rayCylinder(o, d, c);
        if (hit >= 0 && hit < best) { best = hit; bestC = c; }
      }
    }
    return { dist: best === Infinity ? -1 : best, collider: bestC };
  }
}

const tmpList: Collider[] = [];
const tmpList2: Collider[] = [];

export function rayBox(o: THREE.Vector3, d: THREE.Vector3, b: { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number }): number {
  let tmin = -Infinity, tmax = Infinity;
  const axes: [number, number, number, number][] = [
    [o.x, d.x, b.minX, b.maxX],
    [o.y, d.y, b.minY, b.maxY],
    [o.z, d.z, b.minZ, b.maxZ],
  ];
  for (const [oo, dd, mn, mx] of axes) {
    if (Math.abs(dd) < 1e-9) {
      if (oo < mn || oo > mx) return -1;
    } else {
      let t1 = (mn - oo) / dd, t2 = (mx - oo) / dd;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return -1;
    }
  }
  if (tmax < 0) return -1;
  return Math.max(0, tmin);
}

export function rayCylinder(o: THREE.Vector3, d: THREE.Vector3, c: { x: number; z: number; r: number; minY: number; maxY: number }): number {
  const ox = o.x - c.x, oz = o.z - c.z;
  const a = d.x * d.x + d.z * d.z;
  if (a < 1e-9) return -1;
  const b = 2 * (ox * d.x + oz * d.z);
  const cc = ox * ox + oz * oz - c.r * c.r;
  const disc = b * b - 4 * a * cc;
  if (disc < 0) return -1;
  const s = Math.sqrt(disc);
  let t = (-b - s) / (2 * a);
  if (t < 0) t = (-b + s) / (2 * a);
  if (t < 0) return -1;
  const y = o.y + d.y * t;
  if (y < c.minY || y > c.maxY) return -1;
  return t;
}

export function raySphere(o: THREE.Vector3, d: THREE.Vector3, cx: number, cy: number, cz: number, r: number): number {
  const ox = o.x - cx, oy = o.y - cy, oz = o.z - cz;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const c = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - c;
  if (disc < 0) return -1;
  const t = -b - Math.sqrt(disc);
  return t >= 0 ? t : c < 0 ? 0 : -1;
}
