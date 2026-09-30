import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { ModelSpec } from "../data/species";
import type { CreatureRig, Leg } from "./models";
import type { Creature } from "./creatures";
import { skinTexture, scaleBumpTexture, skinPoreTexture } from "../core/textures";
import { rigidLoft } from "./skin";
import { mergeByMaterial } from "../core/merge";

/**
 * DOEDICURUS (ARK Mobile 2.0 look) — a glyptodont:
 *  - tall domed carapace built from a mosaic of hexagonal osteoderms (raised centre boss, rosette ring,
 *    deep grooves), a rolled bony lip, a fringe of blunt keratin spikes and a dorsal keel;
 *  - tiny beaked head with cephalic shield, beady eyes, ears and nostrils, poking out of the front arch;
 *  - short elephantine wrinkled legs with osteoderm scutes and blunt hoof-claws;
 *  - a ringed, armoured tail ending in a big spiked mace;
 *  - a lower "ball" hemisphere + front plug that only show when the animal curls up and rolls.
 *
 * Rig layout (all rigid meshes, no skinning):
 *   root → body (tilt / waddle / lie down) ─┬ saddleMount (does NOT spin with the ball)
 *                                            └ pivot (ball spin + squash) → chest (shell, belly, cap, plug)
 *                                                                          ├ legs ├ neck → neck → head → jaw
 *                                                                          └ tail chain (club at the end)
 */

// ---------------------------------------------------------------- constants (metres, before creature scale)
const AX = 0.74, AY = 0.58, AZ = 1.0; // carapace semi-axes
const THM = Math.PI / 2 + 0.46; // how far the skirt wraps below the equator
const PH0 = 0.34; // front opening (where the head comes out)
const STAND_Y = 0.62; // carapace centre height while walking
const BALL_Y = 0.72; // carapace centre height while rolled into a ball
const BALL = { x: 0.96, y: 1.16, z: 0.72 }; // squash that turns the dome into a round ball
const NECK_Y = -0.1, NECK_Z = 0.8;
const TAIL_SEGS = 6;
const TAIL_LEN = 1.3;
const TAU = Math.PI * 2;
const SQ3 = Math.sqrt(3);

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ss = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const hash2 = (x: number, y: number) => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

export interface DoedParts {
  pivot: THREE.Group;
  chest: THREE.Group;
  cap: THREE.Mesh;
  plug: THREE.Mesh;
  legHome: { x: number; y: number; z: number }[];
  ballR: number;
  side: number; // which side the next club swing comes from
  atkT: number; // own attack clock, 0..1 (1 = idle)
  prevAtk: number;
  sz: number; // smoothed waddle roll
  sy: number; // smoothed waddle yaw
  sx: number; // smoothed pitch
  bob: number;
}

// ---------------------------------------------------------------- tiny geometry helpers
export function grp(x = 0, y = 0, z = 0) {
  const o = new THREE.Group();
  o.position.set(x, y, z);
  return o;
}
export function ell(rx: number, ry: number, rz: number, x = 0, y = 0, z = 0, seg = 12) {
  const g = new THREE.SphereGeometry(1, seg, Math.max(6, Math.floor(seg * 0.7)));
  g.scale(rx, ry, rz);
  g.translate(x, y, z);
  return g;
}
export function cone(r: number, h: number, seg = 6) {
  return new THREE.ConeGeometry(r, h, seg);
}
export function mergeGeos(geos: THREE.BufferGeometry[]) {
  const clean = geos.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    if (!n.attributes.uv) n.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
    for (const k of Object.keys(n.attributes)) if (k !== "position" && k !== "normal" && k !== "uv") n.deleteAttribute(k);
    return n;
  });
  const m = mergeGeometries(clean)!;
  m.computeVertexNormals();
  return m;
}
export function put(parent: THREE.Object3D, geos: THREE.BufferGeometry[] | THREE.BufferGeometry, mat: THREE.Material, cast = true, name = "") {
  const m = new THREE.Mesh(Array.isArray(geos) ? mergeGeos(geos) : geos, mat);
  m.castShadow = cast;
  m.receiveShadow = false;
  if (name) m.name = name; // named meshes are skipped by mergeByMaterial
  parent.add(m);
  return m;
}
/** Cone whose base sits on the origin and whose tip points along `dir`. */
export function spike(r: number, h: number, dir: THREE.Vector3, at: THREE.Vector3, seg = 6) {
  const g = cone(r, h, seg);
  g.translate(0, h / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize()));
  g.translate(at.x, at.y, at.z);
  return g;
}

// ---------------------------------------------------------------- hexagonal osteoderm lattice
function hexCell(px: number, py: number, R: number) {
  const q = ((SQ3 / 3) * px - py / 3) / R;
  const rr = ((2 / 3) * py) / R;
  const s = -q - rr;
  let rq = Math.round(q), rz = Math.round(rr);
  const rs = Math.round(s);
  const dq = Math.abs(rq - q), dz = Math.abs(rz - rr), ds = Math.abs(rs - s);
  if (dq > dz && dq > ds) rq = -rz - rs;
  else if (dz > ds) rz = -rq - rs;
  const cx = R * SQ3 * (rq + rz / 2);
  const cy = R * 1.5 * rz;
  const ox = Math.abs(px - cx), oy = Math.abs(py - cy);
  const a = (R * SQ3) / 2;
  const d = Math.max(ox, ox * 0.5 + oy * (SQ3 / 2)) / a;
  return { d: Math.min(1, d), rq, rz };
}

/** Point on the (undisplaced) carapace. ph: 0 front … π rear, th: angle from the top of the dome. */
function baseShell(ph: number, th: number) {
  const sinp = Math.sin(ph), cosp = Math.cos(ph);
  const rho = Math.pow(Math.max(0, sinp), 0.82);
  const hMul = 1 + 0.14 * clamp01((0.5 - cosp) / 1.4); // a little taller over the hips
  const st = Math.sin(th), ct = Math.cos(th);
  const sT = Math.sign(st) * Math.pow(Math.abs(st), 0.88);
  const cT = Math.sign(ct) * Math.pow(Math.abs(ct), 0.88);
  const thS = th > Math.PI ? th - TAU : th;
  const ath = Math.abs(thS);
  const flare = 1 + 0.1 * ss(Math.PI / 2, THM, ath);
  return { x: AX * rho * sT * flare, y: AY * hMul * rho * cT, z: AZ * cosp, rho, hMul, thS, ath };
}

interface Pal {
  lo: THREE.Color;
  hi: THREE.Color;
  groove: THREE.Color;
  lip: THREE.Color;
}
interface SurfOpts {
  th0: number;
  th1: number;
  ph0: number;
  ph1: number;
  NP: number;
  NT: number;
  R: number;
  cap: boolean;
}

function buildSurface(o: SurfOpts, pal: Pal): THREE.BufferGeometry {
  const nv = (o.NP + 1) * (o.NT + 1);
  const pos = new Float32Array(nv * 3), col = new Float32Array(nv * 3), uv = new Float32Array(nv * 2);
  const tmp = new THREE.Color();
  let vi = 0;
  for (let i = 0; i <= o.NP; i++) {
    const ph = lerp(o.ph0, o.ph1, i / o.NP);
    for (let j = 0; j <= o.NT; j++) {
      const th = lerp(o.th0, o.th1, j / o.NT);
      const s = baseShell(ph, th);
      // lattice coordinates: metres along the body / metres around the dome
      const px = s.z + 0.016 * Math.sin(s.thS * 5 + s.z * 7);
      const py = s.thS * 0.66 * s.rho + 0.016 * Math.sin(s.z * 9);
      const cell = hexCell(px, py, o.R);
      const d = cell.d;
      const hv = hash2(cell.rq, cell.rz);
      // relief: domed tile, sharp groove between tiles, pit/boss + ring = the "rosette" of a glyptodont plate
      let disp = 0.024 * (1 - Math.pow(d, 2.4)) * (0.8 + 0.4 * hv) - 0.02 * ss(0.84, 1, d);
      disp += 0.007 * (1 - ss(0, 0.2, d));
      disp -= 0.004 * Math.exp(-Math.pow((d - 0.52) / 0.06, 2));
      disp += 0.014 * Math.exp(-Math.pow(s.thS / 0.1, 2)) * (o.cap ? 0 : 1); // dorsal keel
      const lipS = o.cap ? 0 : ss(THM - 0.16, THM - 0.02, s.ath);
      const lipF = o.cap ? 0 : ss(o.ph0 + 0.07, o.ph0, ph);
      const lip = Math.max(lipS, lipF);
      disp += 0.03 * lip; // rolled bony lip around the skirt and the head arch
      // outward direction ≈ ellipsoid normal
      const nx = s.x / (AX * AX), ny = s.y / (AY * s.hMul * AY * s.hMul), nz = s.z / (AZ * AZ);
      const nl = Math.hypot(nx, ny, nz) || 1;
      pos[vi * 3] = s.x + (nx / nl) * disp;
      pos[vi * 3 + 1] = s.y + (ny / nl) * disp;
      pos[vi * 3 + 2] = s.z + (nz / nl) * disp;
      // colour: every tile has its own tone, lighter boss, dark grooves, mottling, sun-bleached top, occluded skirt
      tmp.copy(pal.lo).lerp(pal.hi, 0.2 + 0.6 * hv);
      tmp.lerp(pal.hi, 0.28 * (1 - ss(0, 0.5, d)));
      tmp.lerp(pal.groove, 0.88 * ss(0.8, 1, d));
      tmp.lerp(pal.groove, 0.28 * Math.exp(-Math.pow((d - 0.52) / 0.05, 2)));
      const mott = 0.5 + 0.5 * Math.sin(s.z * 3.1 + Math.sin(s.thS * 4) * 1.4) * Math.sin(s.thS * 2.3 + s.z * 1.7);
      tmp.multiplyScalar(0.86 + 0.24 * mott);
      tmp.multiplyScalar(1 + 0.12 * ss(0.9, 0, s.ath) - 0.34 * ss(Math.PI / 2 - 0.1, THM, s.ath));
      tmp.lerp(pal.lip, 0.7 * lip);
      col[vi * 3] = tmp.r;
      col[vi * 3 + 1] = tmp.g;
      col[vi * 3 + 2] = tmp.b;
      uv[vi * 2] = j / o.NT;
      uv[vi * 2 + 1] = i / o.NP;
      vi++;
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < o.NP; i++)
    for (let j = 0; j < o.NT; j++) {
      const a = i * (o.NT + 1) + j, b = a + 1, c = a + o.NT + 1, d2 = c + 1;
      idx.push(a, b, c, b, d2, c);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const surfaceCache = new Map<string, { shell: THREE.BufferGeometry; cap: THREE.BufferGeometry }>();
function carapace(pal: Pal) {
  const key = [pal.lo, pal.hi, pal.groove, pal.lip].map((c) => c.getHexString()).join();
  let e = surfaceCache.get(key);
  if (!e) {
    e = {
      shell: buildSurface({ th0: -THM, th1: THM, ph0: PH0, ph1: Math.PI, NP: 132, NT: 176, R: 0.105, cap: false }, pal),
      cap: buildSurface({ th0: THM - 0.12, th1: TAU - (THM - 0.12), ph0: PH0, ph1: Math.PI, NP: 72, NT: 96, R: 0.095, cap: true }, pal),
    };
    surfaceCache.set(key, e);
  }
  // Creature.remove() disposes geometries, so every creature gets its own copy
  return { shell: e.shell.clone(), cap: e.cap.clone() };
}

// ---------------------------------------------------------------- builder
export function buildDoedicurus(spec: ModelSpec, key: string, scale = 1): CreatureRig {
  const base = new THREE.Color(spec.color), bel = new THREE.Color(spec.belly), acc = new THREE.Color(spec.accent);
  const pal: Pal = {
    lo: base.clone().multiplyScalar(0.82),
    hi: base.clone().lerp(bel, 0.42),
    groove: acc.clone().multiplyScalar(0.7),
    lip: bel.clone().lerp(new THREE.Color("#ffffff"), 0.12),
  };
  const skinC = base.clone().lerp(bel, 0.55);
  const pores = skinPoreTexture();

  const skin = new THREE.MeshStandardMaterial({ map: skinTexture(key + "_dsk", "#" + skinC.getHexString(), spec.belly, spec.accent, "mottled"), bumpMap: scaleBumpTexture(), bumpScale: 1.7, roughness: 0.88 });
  const bellyMat = new THREE.MeshStandardMaterial({ color: bel.clone().lerp(base, 0.25), roughness: 0.9, bumpMap: pores, bumpScale: 0.8 });
  const shellMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.02, bumpMap: pores, bumpScale: 0.9, side: THREE.DoubleSide });
  const tileMat = new THREE.MeshStandardMaterial({ color: pal.hi, roughness: 0.78, bumpMap: scaleBumpTexture(), bumpScale: 2.2 });
  const tailMat = new THREE.MeshStandardMaterial({ color: pal.lo.clone().lerp(pal.hi, 0.35), roughness: 0.82, bumpMap: scaleBumpTexture(), bumpScale: 2 });
  const hornMat = new THREE.MeshStandardMaterial({ color: "#dccfa8", roughness: 0.55 });
  const clawMat = new THREE.MeshStandardMaterial({ color: "#2f271d", roughness: 0.45 });
  const noseMat = new THREE.MeshStandardMaterial({ color: "#8d766a", roughness: 0.55 });
  const toothMat = new THREE.MeshStandardMaterial({ color: "#efe6cc", roughness: 0.5 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: spec.eye ?? "#b8862c", roughness: 0.25, metalness: 0.1 });
  const pupilMat = new THREE.MeshStandardMaterial({ color: "#100a05", roughness: 0.12, metalness: 0.2 });
  const glintMat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.1, emissive: new THREE.Color("#ffffff"), emissiveIntensity: 0.0 });
  const materials = [skin, bellyMat, shellMat, tileMat, tailMat, hornMat, clawMat, noseMat, toothMat, eyeMat, pupilMat, glintMat];

  const root = new THREE.Group();
  const body = grp();
  root.add(body);
  const saddleMount = grp(0, STAND_Y + 0.61, -0.1);
  body.add(saddleMount);
  const pivot = grp(0, STAND_Y, 0);
  body.add(pivot);
  const chest = grp();
  pivot.add(chest);

  // ---- carapace + ball hemisphere + front plug + belly
  const surf = carapace(pal);
  const shell = new THREE.Mesh(surf.shell, shellMat);
  shell.name = "shell";
  shell.castShadow = true;
  chest.add(shell);
  const cap = new THREE.Mesh(surf.cap, shellMat);
  cap.name = "cap";
  cap.castShadow = true;
  cap.scale.setScalar(0.55);
  cap.visible = false;
  chest.add(cap);
  // head plug: a bony domed shield that seals the front arch when the animal is curled into a ball
  const plugGeo = mergeGeos([ell(0.31, 0.25, 0.11, 0, 0, 0, 16), ...[-2, -1, 0, 1, 2].map((k) => ell(0.05, 0.04, 0.035, k * 0.105, 0.02 - Math.abs(k) * 0.02, 0.1, 8))]);
  const plug = new THREE.Mesh(plugGeo, tileMat);
  plug.name = "plug";
  plug.castShadow = true;
  plug.position.set(0, -0.005, 0.9);
  plug.scale.setScalar(0.001);
  plug.visible = false;
  chest.add(plug);
  put(chest, [ell(AX * 0.9, AY * 0.52, AZ * 0.88, 0, -0.17, 0, 18)], bellyMat, false, "belly");

  // ---- rim fringe: blunt keratin spikes along both skirts, larger toward the hips
  {
    const rim: THREE.BufferGeometry[] = [];
    for (const sd of [-1, 1])
      for (let k = 0; k < 26; k++) {
        const ph = lerp(0.62, 2.95, k / 25);
        const s = baseShell(ph, sd * (THM - 0.04));
        const len = 0.06 + 0.1 * ss(0.8, 2.8, ph);
        rim.push(spike(len * 0.36, len, new THREE.Vector3(sd, 0.3, -0.35), new THREE.Vector3(s.x, s.y, s.z), 6));
      }
    // a second, smaller row of studs higher on the flanks
    for (const sd of [-1, 1])
      for (let k = 0; k < 15; k++) {
        const ph = lerp(0.85, 2.6, k / 14);
        const s = baseShell(ph, sd * 1.22);
        const len = 0.045 + 0.05 * ss(0.8, 2.6, ph);
        rim.push(spike(len * 0.4, len, new THREE.Vector3(sd * 0.7, 1, -0.2), new THREE.Vector3(s.x, s.y, s.z), 5));
      }
    put(chest, rim, hornMat, true, "rim");
  }

  // ---- legs: short, thick and wrinkled, with osteoderm scutes and blunt hoof-claws
  const legs: Leg[] = [];
  const legHome: { x: number; y: number; z: number }[] = [];
  const TL = 0.24, SL = 0.22;
  const buildLeg = (front: boolean, side: number, x: number, y: number, z: number): Leg => {
    const hip = grp(x, y, z);
    chest.add(hip);
    legHome.push({ x, y, z });
    const w = front ? 0.95 : 1.05;
    put(hip, rigidLoft(
      [
        { pos: new THREE.Vector3(0, 0.1, 0), w: 0.23 * w, top: 0.22 * w, bot: 0.22 * w },
        { pos: new THREE.Vector3(0, -TL * 0.45, 0), w: 0.2 * w, top: 0.19 * w, bot: 0.2 * w },
        { pos: new THREE.Vector3(0, -TL, 0), w: 0.16 * w, top: 0.15 * w, bot: 0.16 * w },
      ],
      { ring: 14, perSeg: 4, up: new THREE.Vector3(0, 0, 1) },
    ), skin);
    const knee = grp(0, -TL, 0);
    hip.add(knee);
    put(knee, [ell(0.165 * w, 0.15, 0.16 * w, 0, 0, 0, 12)], skin);
    put(knee, rigidLoft(
      [
        { pos: new THREE.Vector3(0, 0, 0), w: 0.15 * w, top: 0.145 * w, bot: 0.15 * w },
        { pos: new THREE.Vector3(0, -SL * 0.5, 0), w: 0.125 * w, top: 0.12 * w, bot: 0.13 * w },
        { pos: new THREE.Vector3(0, -SL, 0), w: 0.135 * w, top: 0.13 * w, bot: 0.135 * w },
      ],
      { ring: 12, perSeg: 3, up: new THREE.Vector3(0, 0, 1) },
    ), skin);
    const ankle = grp(0, -SL, 0);
    knee.add(ankle);
    // wrinkle folds around the knee, shin and ankle
    const folds: THREE.BufferGeometry[] = [];
    for (const [ry, rr] of [[0.02, 0.17], [-0.06, 0.16], [-0.12, 0.13], [-0.2, 0.135]] as const) folds.push(new THREE.TorusGeometry(rr * w, 0.011, 5, 16).rotateX(Math.PI / 2).translate(0, ry, 0));
    put(knee, folds, skin);
    // osteoderm scutes down the front of the limb
    const sc: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 4; k++) sc.push(ell(0.06 * w, 0.03, 0.045, 0, -0.03 - k * 0.048, 0.135 * w, 8));
    put(knee, sc, tileMat);
    const thighSc: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 4; k++) thighSc.push(ell(0.07 * w, 0.032, 0.05, 0, 0.05 - k * 0.055, 0.19 * w, 8));
    put(hip, thighSc, tileMat);
    // broad pad foot + four blunt toes with dark hoof-like nails
    const foot: THREE.BufferGeometry[] = [ell(0.155 * w, 0.06, 0.19, 0, -0.075, 0.035, 12)];
    const nails: THREE.BufferGeometry[] = [];
    for (let k = -1.5; k <= 1.5; k += 1) {
      const fx = k * 0.075;
      foot.push(ell(0.038, 0.04, 0.06, fx, -0.07, 0.18 - Math.abs(k) * 0.012, 8));
      nails.push(ell(0.034, 0.03, front ? 0.058 : 0.046, fx, -0.078, 0.225 - Math.abs(k) * 0.02, 8));
    }
    put(ankle, foot, skin);
    put(ankle, nails, clawMat);
    const rest: [number, number, number] = front ? [0.04, -0.06, 0.05] : [-0.1, 0.2, -0.1];
    hip.rotation.x = rest[0];
    knee.rotation.x = rest[1];
    ankle.rotation.x = rest[2];
    void side;
    return { hip, knee, ankle, front, side, rest, dims: { tl: TL, sl: SL, ml: 0.1, w: 0.16 } };
  };
  for (const s of [-1, 1]) legs.push(buildLeg(true, s, s * 0.5, -0.05, 0.55));
  for (const s of [-1, 1]) legs.push(buildLeg(false, s, s * 0.52, -0.05, -0.5));

  // ---- neck (thick, wrinkled, with a collar of scutes under the shell lip)
  const neck0 = grp(0, NECK_Y, NECK_Z);
  chest.add(neck0);
  put(neck0, rigidLoft(
    [
      { pos: new THREE.Vector3(0, 0, -0.34), w: 0.3, top: 0.27, bot: 0.27 },
      { pos: new THREE.Vector3(0, 0, -0.08), w: 0.27, top: 0.25, bot: 0.25 },
      { pos: new THREE.Vector3(0, 0, 0.16), w: 0.24, top: 0.23, bot: 0.22 },
    ],
    { ring: 16, perSeg: 3, up: new THREE.Vector3(0, 1, 0), capStart: true },
  ), skin);
  const neckFolds: THREE.BufferGeometry[] = [];
  for (const [fz, fr] of [[-0.12, 0.26], [-0.02, 0.245], [0.08, 0.235]] as const) neckFolds.push(new THREE.TorusGeometry(fr, 0.012, 5, 20).translate(0, 0, fz));
  put(neck0, neckFolds, skin);
  const collar: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 11; k++) {
    const a = -1.45 + (k / 10) * 2.9;
    for (const [cz, cs] of [[-0.03, 1], [0.07, 0.8]] as const) {
      const g = ell(0.055 * cs, 0.02, 0.045, 0, 0, 0, 8);
      g.rotateZ(-a);
      g.translate(Math.sin(a) * 0.265, Math.cos(a) * 0.265, cz);
      collar.push(g);
    }
  }
  put(neck0, collar, tileMat);
  const neck1 = grp(0, 0, 0.16);
  neck0.add(neck1);
  put(neck1, rigidLoft(
    [
      { pos: new THREE.Vector3(0, 0, -0.06), w: 0.23, top: 0.22, bot: 0.21 },
      { pos: new THREE.Vector3(0, 0, 0.1), w: 0.2, top: 0.19, bot: 0.185 },
    ],
    { ring: 14, perSeg: 3, up: new THREE.Vector3(0, 1, 0) },
  ), skin);
  const head = grp(0, 0, 0.16);
  neck1.add(head);

  // ---- head: small, low, blunt snout with a bony cephalic shield
  put(head, rigidLoft(
    [
      { pos: new THREE.Vector3(0, 0, -0.08), w: 0.155, top: 0.14, bot: 0.13 },
      { pos: new THREE.Vector3(0, 0.01, 0.08), w: 0.16, top: 0.14, bot: 0.115 },
      { pos: new THREE.Vector3(0, 0, 0.22), w: 0.135, top: 0.11, bot: 0.08 },
      { pos: new THREE.Vector3(0, -0.015, 0.34), w: 0.105, top: 0.085, bot: 0.062 },
      { pos: new THREE.Vector3(0, -0.03, 0.44), w: 0.085, top: 0.062, bot: 0.05 },
    ],
    { ring: 18, perSeg: 4, up: new THREE.Vector3(0, 1, 0), capStart: true, capEnd: true },
  ), skin);
  put(head, [ell(0.09, 0.058, 0.055, 0, -0.03, 0.455, 12)], noseMat);
  const nostrils: THREE.BufferGeometry[] = [];
  for (const sd of [-1, 1]) nostrils.push(ell(0.016, 0.011, 0.022, sd * 0.034, -0.012, 0.495, 6));
  put(head, nostrils, clawMat, false);
  // cephalic shield: staggered hex scutes over the crown
  const crown: THREE.BufferGeometry[] = [];
  const topAt = (z: number) => (z < 0.08 ? 0.14 + (z + 0.08) * 0.06 : z < 0.22 ? 0.14 - (z - 0.08) * 0.24 : 0.106 - (z - 0.22) * 0.18);
  for (let row = 0; row < 5; row++) {
    const z = -0.03 + row * 0.068;
    const n = row < 2 ? 5 : row < 4 ? 4 : 3;
    for (let k = 0; k < n; k++) {
      const x = (k - (n - 1) / 2) * 0.05;
      const g = ell(0.03, 0.014, 0.036, 0, 0, 0, 8);
      g.rotateX(-0.25);
      g.translate(x, topAt(z) * 0.94, z);
      crown.push(g);
    }
  }
  put(head, crown, tileMat);
  const face: THREE.BufferGeometry[] = [], hardware: THREE.BufferGeometry[] = [];
  for (const sd of [-1, 1]) {
    face.push(ell(0.048, 0.03, 0.075, sd * 0.125, 0.105, 0.12, 8)); // brow ridge
    face.push(ell(0.05, 0.038, 0.09, sd * 0.13, -0.03, 0.12, 8)); // cheek
    face.push(ell(0.03, 0.05, 0.028, sd * 0.14, 0.11, -0.04, 8)); // ear
    // beady deep-set eye
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.024, 12, 9), eyeMat);
    eye.position.set(sd * 0.132, 0.05, 0.145);
    head.add(eye);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 8), pupilMat);
    pupil.position.set(sd * 0.148, 0.05, 0.152);
    head.add(pupil);
    const glint = new THREE.Mesh(new THREE.SphereGeometry(0.0055, 6, 5), glintMat);
    glint.position.set(sd * 0.153, 0.058, 0.16);
    head.add(glint);
    hardware.push(new THREE.TorusGeometry(0.03, 0.007, 5, 14).rotateY(Math.PI / 2).translate(sd * 0.128, 0.05, 0.145));
  }
  put(head, face, skin);
  put(head, hardware, skin, false);
  // lower jaw with a few blunt peg teeth
  const jaw = grp(0, -0.055, 0.03);
  head.add(jaw);
  put(jaw, rigidLoft(
    [
      { pos: new THREE.Vector3(0, 0, 0), w: 0.09, top: 0.02, bot: 0.04 },
      { pos: new THREE.Vector3(0, -0.005, 0.18), w: 0.07, top: 0.02, bot: 0.036 },
      { pos: new THREE.Vector3(0, -0.012, 0.36), w: 0.05, top: 0.016, bot: 0.028 },
    ],
    { ring: 12, perSeg: 3, up: new THREE.Vector3(0, 1, 0), capStart: true, capEnd: true },
  ), skin);
  const teeth: THREE.BufferGeometry[] = [];
  for (let k = -2; k <= 2; k++) teeth.push(cone(0.011, 0.03, 5).translate(k * 0.02, 0.028, 0.32 - Math.abs(k) * 0.01));
  put(jaw, teeth, toothMat, false);
  put(head, (() => {
    const t: THREE.BufferGeometry[] = [];
    for (let k = -2; k <= 2; k++) t.push(cone(0.011, 0.03, 5).rotateX(Math.PI).translate(k * 0.022, -0.045, 0.4 - Math.abs(k) * 0.012));
    return t;
  })(), toothMat, false);

  // ---- tail: ringed, studded armour tapering to a spiked mace
  const tail: THREE.Group[] = [];
  const tr = (i: number) => 0.2 * Math.pow(0.8, i);
  const segL = TAIL_LEN / TAIL_SEGS;
  let parent: THREE.Object3D = chest;
  for (let i = 0; i < TAIL_SEGS; i++) {
    const t = i === 0 ? grp(0, -0.08, -0.88) : grp(0, 0, -segL);
    parent.add(t);
    const r0 = tr(i), r1 = tr(i + 1);
    put(t, rigidLoft(
      [
        { pos: new THREE.Vector3(0, 0, 0.02), w: r0, top: r0 * 1.02, bot: r0 * 0.96 },
        { pos: new THREE.Vector3(0, 0, -segL * 1.05), w: r1, top: r1 * 1.02, bot: r1 * 0.96 },
      ],
      { ring: 14, perSeg: 3, up: new THREE.Vector3(0, 1, 0), capEnd: i === TAIL_SEGS - 1 },
    ), tailMat);
    const plates: THREE.BufferGeometry[] = [], studs: THREE.BufferGeometry[] = [];
    for (const f of [0.27, 0.75]) {
      const rr = lerp(r0, r1, f) * 1.0;
      const n = 12;
      for (let k = 0; k < n; k++) {
        const a = ((k + (f > 0.5 ? 0.5 : 0)) / n) * TAU;
        const pg = ell(rr * 0.36, rr * 0.15, segL * 0.2, 0, 0, 0, 8);
        pg.rotateZ(-a);
        pg.translate(Math.sin(a) * rr, Math.cos(a) * rr, -segL * f);
        plates.push(pg);
        const sg = cone(rr * 0.09, rr * 0.2, 5);
        sg.rotateZ(-a);
        sg.translate(Math.sin(a) * rr * 1.14, Math.cos(a) * rr * 1.14, -segL * f);
        studs.push(sg);
      }
    }
    put(t, plates, tileMat);
    put(t, studs, hornMat);
    if (i >= 1) {
      const sp: THREE.BufferGeometry[] = [];
      for (const sd of [-1, 1]) sp.push(spike(r0 * 0.24, r0 * (0.75 + i * 0.1), new THREE.Vector3(sd, 0.15, -0.35), new THREE.Vector3(sd * r0 * 0.92, r0 * 0.05, -segL * 0.5), 5));
      if (i >= 3) sp.push(spike(r0 * 0.22, r0 * 0.8, new THREE.Vector3(0, 1, -0.3), new THREE.Vector3(0, r0 * 0.96, -segL * 0.5), 5));
      put(t, sp, hornMat);
    }
    if (i === TAIL_SEGS - 1) {
      // the mace: bony core studded with spikes in rings + a long tip spike
      const zc = -segL * 1.0 - 0.15;
      put(t, [ell(0.2, 0.19, 0.27, 0, 0, zc, 16), ell(0.15, 0.14, 0.09, 0, 0, zc + 0.2, 10)], tailMat);
      const knobs: THREE.BufferGeometry[] = [];
      for (let k = 0; k < 14; k++) {
        const a = (k / 14) * TAU;
        const g = ell(0.045, 0.03, 0.05, 0, 0, 0, 6);
        g.rotateZ(-a);
        g.translate(Math.sin(a) * 0.185, Math.cos(a) * 0.175, zc + (k % 2 ? 0.07 : -0.07));
        knobs.push(g);
      }
      put(t, knobs, tileMat);
      const mace: THREE.BufferGeometry[] = [];
      for (const [zo, tilt, n, len] of [[-0.13, -0.55, 7, 0.15], [0, 0, 8, 0.19], [0.13, 0.55, 7, 0.14]] as const)
        for (let k = 0; k < n; k++) {
          const a = ((k + (zo === 0 ? 0.5 : 0)) / n) * TAU;
          const rad = new THREE.Vector3(Math.sin(a), Math.cos(a), 0);
          const dir = new THREE.Vector3(rad.x, rad.y, tilt).normalize();
          mace.push(spike(0.048, len, dir, new THREE.Vector3(rad.x * 0.17, rad.y * 0.165, zc + zo), 6));
        }
      for (const sd of [-1, 1]) mace.push(spike(0.07, 0.26, new THREE.Vector3(sd, 0.05, -0.1), new THREE.Vector3(sd * 0.17, 0, zc), 7));
      mace.push(spike(0.075, 0.3, new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 0, zc - 0.24), 7));
      put(t, mace, hornMat);
    }
    t.rotation.x = i === 0 ? 0.05 : -0.06;
    tail.push(t);
    parent = t;
  }

  root.scale.setScalar(scale);
  const parts: DoedParts = { pivot, chest, cap, plug, legHome, ballR: 0.72, side: 1, atkT: 1, prevAtk: 0, sz: 0, sy: 0, sx: 0, bob: 0 };
  // a stable rest pose for the head/neck
  neck0.rotation.x = 0.1;
  neck1.rotation.x = 0.08;
  head.rotation.x = 0.14;
  mergeByMaterial(root);
  return { root, body, torso: chest, neck: [neck0, neck1], head, jaw, legs, arms: [], tail, frill: null, materials, spec, hipY: STAND_Y, wings: [], saddleMount, saddle: null, doed: parts };
}

// ---------------------------------------------------------------- animation
// club swing: wind-up (tail whips back and up), a fast strike that accelerates into the hit, then recover.
const atkSwing = (p: number) => (p < 0.24 ? -ss(0, 1, p / 0.24) : p < 0.5 ? -1 + 2.2 * Math.pow((p - 0.24) / 0.26, 1.6) : 1.2 * (1 - ss(0, 1, (p - 0.5) / 0.5)));
const atkLift = (p: number) => (p < 0.24 ? ss(0, 1, p / 0.24) : p < 0.5 ? 1 - 2.4 * ss(0, 1, (p - 0.24) / 0.26) : -1.4 * (1 - ss(0, 1, (p - 0.5) / 0.5)));

export function animateDoedicurus(c: Creature, dt: number) {
  const r = c.rig;
  const P = r.doed;
  if (!P) return;
  const sp = c.sp;
  const t = performance.now() * 0.001 + c.id * 1.7;
  const hs = Math.hypot(c.vel.x, c.vel.z);
  const scl = r.root.scale.x || 1;
  const k = (s: number) => Math.min(1, dt * s);
  const rot = (o: THREE.Object3D, axis: "x" | "y" | "z", v: number, s = 11) => {
    o.rotation[axis] += (v - o.rotation[axis]) * k(s);
  };
  const downed = c.state === "dead" || c.state === "unconscious" || c.sleeping;

  // hurt flash
  for (const m of r.materials) m.emissive.setRGB(c.hurtFlash > 0 ? 0.6 : 0, c.hurtFlash > 0 ? 0.05 : 0, 0);

  // ---------------- ball roll: limbs and head tuck in first, then the dome squashes into a sphere
  const wantRoll = c.rolling && !downed && !!sp.rollSpeed;
  c.rollBlend += ((wantRoll ? 1 : 0) - c.rollBlend) * k(5.5);
  if (!wantRoll && c.rollBlend < 0.004) c.rollBlend = 0;
  const b = c.rollBlend;
  const bl = ss(0, 0.55, b);
  const sq = ss(0.22, 1, b);
  if (wantRoll) {
    // angle = distance / radius, so the shell rolls without slipping
    c.rollSpin = (c.rollSpin + (hs * dt) / (P.ballR * scl)) % TAU;
  } else if (c.rollSpin !== 0) {
    // keep turning to the next full revolution while easing out, so the ball settles upright
    const target = c.rollSpin > Math.PI ? TAU : 0;
    c.rollSpin += (target - c.rollSpin) * k(4.5);
    if (Math.abs(target - c.rollSpin) < 0.02) c.rollSpin = 0;
  }
  P.pivot.scale.set(lerp(1, BALL.x, sq), lerp(1, BALL.y, sq), lerp(1, BALL.z, sq));
  P.pivot.position.y = lerp(STAND_Y, BALL_Y, sq);
  P.pivot.rotation.x = c.rollSpin;
  P.pivot.rotation.z = Math.sin(c.rollSpin * 2) * 0.02 * b;
  const capS = lerp(0.55, 1, ss(0.05, 0.6, b));
  P.cap.scale.setScalar(capS);
  P.cap.visible = b > 0.02;
  const plugS = ss(0.3, 0.95, b);
  P.plug.scale.setScalar(Math.max(0.001, plugS));
  P.plug.visible = plugS > 0.02;
  r.saddleMount.position.set(0, lerp(STAND_Y + 0.61, BALL_Y + 0.72, sq), lerp(-0.1, 0, sq));
  r.legs.forEach((l, i) => {
    const h = P.legHome[i];
    l.hip.position.set(lerp(h.x, h.x * 0.35, bl), lerp(h.y, 0.06, bl), lerp(h.z, h.z * 0.4, bl));
    l.hip.scale.setScalar(1 - 0.7 * bl);
  });
  const neck0 = r.neck[0], neck1 = r.neck[1];
  neck0.position.set(0, lerp(NECK_Y, -0.02, bl), lerp(NECK_Z, 0.3, bl));
  r.head.scale.setScalar(1 - 0.18 * bl);
  r.tail[0].scale.setScalar(1 - 0.28 * bl);

  // ---------------- attack clock (own timeline, so the whip reads clearly)
  if (!downed && c.attackAnim > P.prevAtk + 0.25 && c.attackAnim > 0.55 && !c.rolling) {
    P.atkT = 0;
    P.side = -P.side;
    c.attackSide = P.side;
  }
  P.prevAtk = c.attackAnim;
  if (P.atkT < 1) P.atkT = Math.min(1, P.atkT + dt / 0.8);
  const atkOn = P.atkT < 1 && !downed;
  const p = P.atkT;
  const sw0 = atkOn ? atkSwing(p) : 0;

  if (downed) {
    // ---------------- dead / knocked out / asleep: tips onto its side, limbs slack
    c.animT = Math.min(1, c.animT + dt * 1.8);
    const e = 1 - Math.pow(1 - c.animT, 3);
    P.sz *= 1 - k(6);
    P.sy *= 1 - k(6);
    P.sx *= 1 - k(6);
    r.body.rotation.z = (Math.PI / 2) * 0.92 * e + P.sz;
    r.body.rotation.y = P.sy;
    r.body.rotation.x = P.sx;
    r.body.position.set(0, 0.66 * e, 0);
    r.legs.forEach((l) => {
      rot(l.hip, "x", l.rest[0] + (l.front ? -0.55 : 0.55), 6);
      rot(l.knee, "x", 0.18, 6);
      rot(l.ankle, "x", 0, 6);
    });
    rot(P.chest, "y", 0, 8);
    rot(neck0, "x", 0.38, 5);
    rot(neck0, "y", 0, 5);
    rot(neck1, "x", 0.3, 5);
    rot(neck1, "y", 0, 5);
    rot(r.head, "x", 0.42, 5);
    r.tail.forEach((s, i) => {
      rot(s, "y", 0.1 * i, 5);
      rot(s, "x", i === 0 ? 0.0 : -0.1, 5);
    });
    const breath = c.state === "unconscious" || c.sleeping ? Math.sin(t * (c.sleeping ? 0.9 : 1.4)) * 0.03 : 0;
    P.chest.scale.set(1 + breath * 0.5, 1 + breath, 1 + breath * 0.4);
    const eat = Math.sin(Math.min(1, c.attackAnim) * Math.PI);
    rot(r.jaw, "x", eat * 0.4, 14);
    return;
  }

  // ---------------- alive
  c.animT = Math.max(0, c.animT - dt * 2);
  const eTip = 1 - Math.pow(1 - c.animT, 3);
  const moving = hs > 0.12 && (c.onGround || c.swimming);
  const run = ss(1.6, 5.2, hs);
  const amp = moving ? Math.min(1, hs / 1.5) : 0;
  const gaitRate = moving ? 2.6 + 6 * amp + 5.5 * run : 0; // rad/s of the walk cycle (short legs: quick heavy scuttle)
  c.walkPhase += gaitRate * dt;
  const ph = c.walkPhase;
  const w = amp * (1 - bl);
  const breathe = Math.sin(t * 1.7) * 0.012;
  P.chest.scale.set(1 + breathe * 0.5, 1 + breathe, 1 + breathe * 0.4);

  // legs: diagonal walk, long lazy swing, knee lift on the forward stroke
  const A = 0.4 + 0.2 * run;
  r.legs.forEach((l, i) => {
    const lph = ph + (i === 0 || i === 3 ? 0 : Math.PI);
    const cph = Math.cos(lph), sph = Math.sin(lph);
    const lift = Math.max(0, -sph);
    let hx = l.rest[0] - A * cph * amp * (l.front ? 1.05 : 0.95);
    let kx = l.rest[1] + lift * (l.front ? 0.55 : 0.95) * amp * (1 + run * 0.4);
    let ax = l.rest[2] + A * cph * amp * 0.35 - lift * 0.35 * amp;
    if (atkOn && l.front) hx += Math.max(0, sw0) * 0.14; // front feet dig in as the club comes round
    if (c.swimming) {
      hx = l.rest[0] + Math.sin(t * 4 + i) * 0.5;
      kx = l.rest[1] + 0.3;
    }
    hx = lerp(hx, l.front ? -1.0 : 1.0, bl);
    kx = lerp(kx, l.front ? 1.5 : -1.5, bl);
    ax = lerp(ax, 0.4, bl);
    rot(l.hip, "x", hx, 14);
    rot(l.knee, "x", kx, 14);
    rot(l.ankle, "x", ax, 14);
  });

  // body: heavy waddle (roll once per cycle), yaw wobble, bob, lean into turns / into the strike
  const lean = THREE.MathUtils.clamp(-c.turnRate * 0.05, -0.12, 0.12);
  const tz = Math.sin(ph) * 0.055 * w * (1 + 0.6 * run) + Math.sin(t * 0.6) * 0.008 * (1 - amp) + lean * b;
  const ty = lerp(Math.cos(ph) * 0.045 * w, -c.turnRate * 0.16, b) - (atkOn ? sw0 * P.side * 0.12 : 0);
  const tx = Math.sin(ph * 2) * 0.02 * w - run * 0.03 * (1 - bl) + (atkOn ? Math.max(0, sw0) * 0.05 : 0);
  P.sz += (tz - P.sz) * k(9);
  P.sy += (ty - P.sy) * k(9);
  P.sx += (tx - P.sx) * k(9);
  r.body.rotation.z = P.sz + (Math.PI / 2) * 0.92 * eTip;
  r.body.rotation.y = P.sy;
  r.body.rotation.x = P.sx;
  const bobT = -0.028 * Math.abs(Math.cos(ph)) * w * (1 + run) + (c.swimming ? -0.3 : 0);
  P.bob += (bobT - P.bob) * k(12);
  r.body.position.set(0, P.bob + 0.66 * eTip, (atkOn ? Math.max(0, sw0) * 0.07 : 0));

  // shell twists against the club
  rot(P.chest, "y", atkOn ? -sw0 * P.side * 0.2 : 0, atkOn ? 24 : 10);

  // neck & head: idle sway, look-at, graze, roar, strike dip, gait bob, tuck for the ball
  const roar = c.roarTimer > 0 ? Math.sin(Math.min(1, c.roarTimer) * Math.PI) : 0;
  const graze = c.grazeTimer > 0 ? Math.min(1, c.grazeTimer) : 0;
  const lunge = Math.max(0, sw0), wind = Math.max(0, -sw0);
  const bobH = Math.sin(ph * 2) * 0.05 * w;
  const n0 = lerp(0.1 + graze * 0.78 + lunge * 0.22 - wind * 0.1 - roar * 0.45 + bobH + Math.sin(t * 0.7) * 0.02, -0.25, bl);
  const n1 = lerp(0.08 + graze * 0.3 - roar * 0.2 + lunge * 0.1, 0.2, bl);
  const hd = lerp(0.14 + graze * 0.28 - roar * 0.22 + lunge * 0.08 - bobH * 0.8, 0.55, bl);
  rot(neck0, "x", n0, 8);
  rot(neck1, "x", n1, 8);
  rot(r.head, "x", hd, 8);
  let look = 0;
  if (c.lookTarget) {
    const a = Math.atan2(c.lookTarget.x - c.pos.x, c.lookTarget.z - c.pos.z) - c.yaw;
    look = THREE.MathUtils.clamp(Math.atan2(Math.sin(a), Math.cos(a)), -0.9, 0.9);
  }
  rot(neck0, "y", (look * 0.55 - P.sy * 0.6) * (1 - bl) + Math.sin(t * 0.5) * 0.03, 5);
  rot(neck1, "y", look * 0.35 * (1 - bl), 5);
  rot(r.head, "y", Math.sin(t * 0.9) * 0.05 * (1 - bl), 4);
  const jawOpen = Math.max(roar * 0.6, graze > 0 ? Math.max(0, Math.sin(t * 6)) * 0.17 : 0, c.state === "chase" ? 0.05 : 0) * (1 - bl);
  rot(r.jaw, "x", jawOpen, 14);

  // tail: lazy arch, counter-sway with the waddle, lag through turns, whip with the strike, curl under for the ball
  const turn = THREE.MathUtils.clamp(c.turnRate * 0.15, -0.4, 0.4);
  r.tail.forEach((s, i) => {
    const sway = Math.sin(t * 1.3 - i * 0.7) * (0.04 + 0.03 * i) * (1 + amp);
    const walk = Math.sin(ph + 1.2 - i * 0.55) * 0.09 * w;
    const lag = clamp01(p - i * 0.035);
    const swi = atkOn ? atkSwing(lag) : 0;
    const lif = atkOn ? atkLift(lag) : 0;
    const yaw = (-turn * 0.32 + sway + walk + swi * P.side * 0.22) * (1 - bl);
    const pitch = lerp((i === 0 ? 0.05 : -0.06) + amp * 0.025 + lif * 0.1, -(0.85 + i * 0.05), bl);
    rot(s, "y", yaw, atkOn ? 30 : 12);
    rot(s, "x", pitch, atkOn ? 26 : 12);
  });
}
