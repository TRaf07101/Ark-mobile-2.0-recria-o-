import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { ModelSpec } from "../data/species";
import type { CreatureRig, Leg } from "./models";
import type { Creature } from "./creatures";
import { skinTexture, scaleBumpTexture } from "../core/textures";
import { rigidLoft } from "./skin";
import { grp, ell, put, spike } from "./doedicurus";

/**
 * ARGENTAVIS (ARK Mobile look): a stocky, hunched giant vulture-eagle.
 *  - barrel-shaped, nose-up trunk: slate-blue back, big pale fluffy chest/belly;
 *  - short thick neck sunk into a white-blue feather collar, small bald orange face,
 *    spiky pale crest on the nape, heavy dark hooked beak;
 *  - very broad wings (thick feathered arm, wide secondaries, 10 fingered primaries with rust-red tips);
 *  - short fanned tail with two long thin streamers; feathered "trousers", red scaly legs, black talons.
 *
 * Rig: root → body (pitch / bank / roll / lie down) ─┬ saddleMount
 *                                                    └ chest ─┬ trunk (nose-up tilt) ─┬ neck0 → neck1 → head → jaw
 *                                                             │                       ├ wing sh → el → wr (x2)
 *                                                             │                       └ tail fan
 *                                                             └ legs (hip → knee → ankle), talonMount
 */

const STAND = 1.12; // chest centre height when standing on the ground
const TL = 0.4, SL = 0.4; // thigh / tarsus
const RX = 0.52, RY = 0.5, RZ = 0.9; // torso semi-axes
const HUM = 0.75, FORE = 0.85; // wing bone lengths
const TILT = -0.3; // ground pitch of the trunk (front up)
const FOLD = { sh: 1.3, shZ: 0.6, el: 3.3, wr: 3.5 }; // folded-wing joint angles (draped over the flank)
const TAU = Math.PI * 2;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ss = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

export interface ArgentParts {
  chest: THREE.Group;
  trunk: THREE.Group;
  wings: { sh: THREE.Group; el: THREE.Group; wr: THREE.Group; fe: THREE.Group; side: number }[]; // fe = forearm feathers (roll flips them when the wing folds)
  tailFan: THREE.Group;
  spread: number; // 0 folded … 1 fully open
  flap: number; // 0 soaring … 1 powered flapping
  ph: number; // flap phase
  bank: number;
  atkT: number; // own attack clock (1 = idle)
  prevAtk: number;
  bob: number;
}

// ---------------------------------------------------------------- feather helpers
function mergeColored(geos: THREE.BufferGeometry[]) {
  const clean = geos.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    const cnt = n.attributes.position.count;
    if (!n.attributes.normal) n.computeVertexNormals();
    if (!n.attributes.uv) n.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(cnt * 2), 2));
    if (!n.attributes.color) n.setAttribute("color", new THREE.BufferAttribute(new Float32Array(cnt * 3).fill(1), 3));
    for (const k of Object.keys(n.attributes)) if (k !== "position" && k !== "normal" && k !== "uv" && k !== "color") n.deleteAttribute(k);
    return n;
  });
  return mergeGeometries(clean)!;
}
function paint(g: THREE.BufferGeometry, fn: (x: number, y: number, z: number) => THREE.Color) {
  const p = g.attributes.position;
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const c = fn(p.getX(i), p.getY(i), p.getZ(i));
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return g;
}
/**
 * One broad flat feather ribbon: base on the origin, tip at +X (rounded), rachis slightly raised,
 * tip curling up by `curl`. Colour fades base → tip from `tipAt` (fraction of the length) onwards.
 */
function feather(L: number, W: number, base: THREE.Color, tip: THREE.Color, seed: number, curl = 0.05, tipAt = 0.4) {
  const N = 7;
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  const j = 0.9 + 0.2 * hash(seed);
  const c = new THREE.Color();
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    let w = W * (0.55 + 0.45 * Math.min(1, t / 0.3));
    const q = clamp01((t - 0.78) / 0.22);
    w *= Math.sqrt(1 - q * q * 0.97);
    const y = curl * L * t * t;
    for (let k = 0; k < 3; k++) {
      const e = k - 1;
      pos.push(t * L, y + (e === 0 ? 0.012 : 0), e * w);
      c.copy(base).lerp(tip, ss(tipAt, 1, t)).multiplyScalar(j * (1 - 0.14 * e * e));
      col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < N; i++)
    for (let k = 0; k < 2; k++) {
      const a = i * 3 + k, b = a + 1, d = a + 3, f = a + 4;
      idx.push(a, d, b, b, d, f);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
const _m = new THREE.Matrix4(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
/** Put a +X-pointing geometry at `pos`, tip along `dir`, flat side facing `up`. */
function place(g: THREE.BufferGeometry, pos: THREE.Vector3, dir: THREE.Vector3, up: THREE.Vector3) {
  _x.copy(dir).normalize();
  _z.crossVectors(_x, up).normalize();
  _y.crossVectors(_z, _x).normalize();
  _m.makeBasis(_x, _y, _z).setPosition(pos);
  g.applyMatrix4(_m);
  return g;
}
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const pair = (a: THREE.Color, b: THREE.Color): [THREE.Color, THREE.Color] => [a, b];

interface PlumeOpts {
  c: [number, number, number];
  r: [number, number, number];
  dir: [number, number, number]; // where the feather tips point (projected onto the surface)
  pole: "y" | "z";
  rows: number;
  cols: number;
  a0: number; // start / end angle from the pole, in units of π
  a1: number;
  len: number;
  wid: number;
  lift?: number;
  col: (nx: number, ny: number, nz: number) => [THREE.Color, THREE.Color];
  seed: number;
  skip?: (nx: number, ny: number, nz: number) => boolean;
}
/** Rows of overlapping small feathers laid over an ellipsoid, tips pointing along `dir`. */
function plume(o: PlumeOpts): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const d = V(...o.dir).normalize();
  for (let i = 0; i < o.rows; i++) {
    const psi = lerp(o.a0, o.a1, o.rows === 1 ? 0 : i / (o.rows - 1)) * Math.PI;
    for (let j = 0; j < o.cols; j++) {
      const th = ((j + (i % 2) * 0.5) / o.cols) * TAU;
      const s = Math.sin(psi), cs = Math.cos(psi);
      const u = o.pole === "z" ? V(s * Math.sin(th), s * Math.cos(th), cs) : V(s * Math.cos(th), cs, s * Math.sin(th));
      if (o.skip?.(u.x, u.y, u.z)) continue;
      const p = V(o.c[0] + o.r[0] * u.x, o.c[1] + o.r[1] * u.y, o.c[2] + o.r[2] * u.z);
      const n = V(u.x / o.r[0], u.y / o.r[1], u.z / o.r[2]).normalize();
      const t = d.clone().addScaledVector(n, -n.dot(d));
      if (t.lengthSq() < 1e-3) continue;
      t.normalize().addScaledVector(n, o.lift ?? 0.22).normalize();
      const [b, tp] = o.col(u.x, u.y, u.z);
      const sd = o.seed + i * 31 + j;
      const g = feather(o.len * (0.85 + 0.3 * hash(sd)), o.wid, b, tp, sd, 0.12, 0.3);
      place(g, p.addScaledVector(n, 0.008 + 0.006 * (i % 2)), t, n);
      out.push(g);
    }
  }
  return out;
}

// ---------------------------------------------------------------- builder
export function buildArgentavis(spec: ModelSpec, key: string, scale = 1): CreatureRig {
  // palette: slate-blue back, pale grey-white chest, rust-red flight-feather tips, orange bald face
  const back = new THREE.Color(spec.color), pale = new THREE.Color(spec.belly), rust = new THREE.Color(spec.accent);
  const dark = back.clone().multiplyScalar(0.62);
  const mid = back.clone().lerp(pale, 0.35);
  const ruffC = new THREE.Color("#e9eef3"), ruffTip = new THREE.Color("#c9d5e2");
  const crestC = new THREE.Color("#eaf1f8");
  const rustAt = (r: number) => back.clone().lerp(rust, r);

  const plum = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, side: THREE.DoubleSide });
  const headSkin = new THREE.MeshStandardMaterial({ map: skinTexture(key + "_ahd", "#c98862", "#dfa47e", "#8c5a3d", "mottled"), bumpMap: scaleBumpTexture(), bumpScale: 1.2, roughness: 0.85 });
  const legSkin = new THREE.MeshStandardMaterial({ map: skinTexture(key + "_alg", "#b0473d", "#94392f", "#57241e", "mottled"), bumpMap: scaleBumpTexture(), bumpScale: 2.4, roughness: 0.75 });
  const beakMat = new THREE.MeshStandardMaterial({ color: "#4d4750", roughness: 0.4 });
  const cereMat = new THREE.MeshStandardMaterial({ color: "#a8735a", roughness: 0.6 });
  const clawMat = new THREE.MeshStandardMaterial({ color: "#18130f", roughness: 0.4 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: spec.eye ?? "#c98a2c", roughness: 0.25, metalness: 0.1 });
  const pupilMat = new THREE.MeshStandardMaterial({ color: "#0d0805", roughness: 0.1 });
  const materials = [plum, headSkin, legSkin, beakMat, cereMat, clawMat, eyeMat, pupilMat];

  const putC = (parent: THREE.Object3D, geos: THREE.BufferGeometry[], cast = true) => {
    const m = new THREE.Mesh(mergeColored(geos), plum);
    m.castShadow = cast;
    parent.add(m);
    return m;
  };

  const root = new THREE.Group();
  const body = grp();
  root.add(body);
  const saddleMount = grp(0, STAND + 0.58, -0.08);
  body.add(saddleMount);
  const chest = grp(0, STAND, 0);
  body.add(chest);
  const trunk = grp();
  trunk.rotation.x = TILT;
  chest.add(trunk);

  // ---- trunk: barrel body, slate back → big pale fluffy chest, layered with overlapping feathers
  const core = ell(RX * 0.98, RY * 0.98, RZ * 0.98, 0, 0, 0, 24);
  const bibK = (ny: number, nz: number) => clamp01(ss(0.25, -0.55, ny) + ss(0.3, 0.85, nz) * 0.85);
  paint(core, (x, y, z) => back.clone().lerp(pale, bibK(y / RY, z / RZ)));
  const bodyCol = (_nx: number, ny: number, nz: number) => {
    const b = back.clone().lerp(pale, bibK(ny, nz));
    return pair(b, b.clone().lerp(pale, 0.25).multiplyScalar(1.04));
  };
  putC(trunk, [
    core,
    ...plume({ c: [0, 0, 0], r: [RX, RY, RZ], dir: [0, 0, -1], pole: "z", rows: 12, cols: 20, a0: 0.12, a1: 0.98, len: 0.25, wid: 0.09, col: bodyCol, seed: 11 }),
    // fluffy chest bulge
    ...plume({ c: [0, -0.02, 0.5], r: [0.42, 0.4, 0.36], dir: [0, -0.6, -1], pole: "z", rows: 6, cols: 14, a0: 0.08, a1: 0.7, len: 0.22, wid: 0.09, col: () => pair(pale.clone().multiplyScalar(0.96), pale.clone()), seed: 23, lift: 0.35 }),
  ]);

  // ---- neck: short, thick, hunched; sunk into a white-blue feather collar
  const neck0 = grp(0, 0.2, 0.62);
  trunk.add(neck0);
  put(neck0, rigidLoft(
    [
      { pos: V(0, 0, -0.15), w: 0.27, top: 0.25, bot: 0.25 },
      { pos: V(0, 0, 0.1), w: 0.22, top: 0.21, bot: 0.21 },
      { pos: V(0, 0, 0.34), w: 0.19, top: 0.18, bot: 0.18 },
    ],
    { ring: 14, perSeg: 3, up: V(0, 1, 0), capStart: true },
  ), headSkin);
  const neckCol = (_a: number, ny: number) => {
    const b = mid.clone().lerp(pale, 0.35).lerp(back, ss(0.4, 1, ny) * 0.5);
    return pair(b, b.clone().lerp(ruffC, 0.4));
  };
  putC(neck0, plume({ c: [0, 0, 0.1], r: [0.23, 0.22, 0.3], dir: [0, 0, -1], pole: "z", rows: 5, cols: 12, a0: 0.2, a1: 0.85, len: 0.2, wid: 0.075, col: neckCol, seed: 41, lift: 0.35 }));
  const ruff: THREE.BufferGeometry[] = [];
  for (let row = 0; row < 3; row++)
    for (let k = 0; k < 24; k++) {
      const a = ((k + row * 0.5) / 24) * TAU;
      const rad = V(Math.cos(a), Math.sin(a), 0);
      const g = feather(0.34 - row * 0.03, 0.062, ruffC, ruffTip, 500 + row * 40 + k, 0.1, 0.5);
      place(g, V(rad.x * (0.24 + row * 0.02), rad.y * (0.24 + row * 0.02), 0.05 - row * 0.09), V(rad.x * 0.8, rad.y * 0.8, -0.6), rad);
      ruff.push(g);
    }
  putC(neck0, ruff);
  const neck1 = grp(0, 0, 0.3);
  neck0.add(neck1);
  put(neck1, rigidLoft(
    [
      { pos: V(0, 0, -0.04), w: 0.19, top: 0.18, bot: 0.18 },
      { pos: V(0, 0, 0.12), w: 0.16, top: 0.15, bot: 0.15 },
      { pos: V(0, 0, 0.28), w: 0.14, top: 0.13, bot: 0.13 },
    ],
    { ring: 12, perSeg: 3, up: V(0, 1, 0) },
  ), headSkin);
  putC(neck1, plume({ c: [0, 0, 0.1], r: [0.17, 0.16, 0.18], dir: [0, 0, -1], pole: "z", rows: 3, cols: 10, a0: 0.25, a1: 0.75, len: 0.14, wid: 0.055, col: neckCol, seed: 77, lift: 0.4 }));
  const head = grp(0, 0, 0.26);
  neck1.add(head);

  // ---- head (ARK look): long, low, flat-topped skull covered in bare orange skin; heavy brow slanting down to a
  //      SHORT, deep, blunt beak with a small hook; long gape line; wrinkled throat; swept-back blue-white mane
  put(head, rigidLoft(
    [
      { pos: V(0, 0, -0.13), w: 0.13, top: 0.11, bot: 0.09 },
      { pos: V(0, 0.005, 0.0), w: 0.145, top: 0.115, bot: 0.095 },
      { pos: V(0, 0.002, 0.11), w: 0.125, top: 0.098, bot: 0.085 },
      { pos: V(0, -0.006, 0.2), w: 0.098, top: 0.078, bot: 0.07 },
    ],
    { ring: 18, perSeg: 4, up: V(0, 1, 0), capStart: true },
  ), headSkin);
  // upper beak: deep and blunt, short hook at the tip
  put(head, rigidLoft(
    [
      { pos: V(0, -0.004, 0.16), w: 0.09, top: 0.075, bot: 0.055 },
      { pos: V(0, -0.01, 0.25), w: 0.078, top: 0.068, bot: 0.045 },
      { pos: V(0, -0.028, 0.325), w: 0.056, top: 0.055, bot: 0.032 },
      { pos: V(0, -0.07, 0.372), w: 0.03, top: 0.03, bot: 0.014 },
      { pos: V(0, -0.106, 0.382), w: 0.009, top: 0.012, bot: 0.006 },
    ],
    { ring: 14, perSeg: 4, up: V(0, 1, 0), capStart: true, capEnd: true },
  ), beakMat);
  put(head, [ell(0.088, 0.045, 0.065, 0, 0.022, 0.185, 10)], cereMat, false); // fleshy cere at the beak base
  // lower jaw: pivots under the eye so the gape runs back below it
  const jaw = grp(0, -0.062, 0.03);
  head.add(jaw);
  put(jaw, rigidLoft(
    [
      { pos: V(0, 0, 0), w: 0.088, top: 0.03, bot: 0.045 },
      { pos: V(0, -0.004, 0.14), w: 0.08, top: 0.026, bot: 0.04 },
      { pos: V(0, -0.012, 0.26), w: 0.052, top: 0.02, bot: 0.03 },
      { pos: V(0, -0.02, 0.33), w: 0.022, top: 0.012, bot: 0.014 },
    ],
    { ring: 12, perSeg: 3, up: V(0, 1, 0), capStart: true, capEnd: true },
  ), beakMat);
  const tilt = (g: THREE.BufferGeometry, rx: number, rz: number, x: number, y: number, z: number) => {
    g.rotateX(rx);
    g.rotateZ(rz);
    g.translate(x, y, z);
    return g;
  };
  const face: THREE.BufferGeometry[] = [], nostrils: THREE.BufferGeometry[] = [];
  for (const sd of [-1, 1]) {
    // heavy brow ridge slanting down toward the beak (the angry ARK look)
    face.push(tilt(new THREE.SphereGeometry(1, 10, 7).scale(0.05, 0.03, 0.11), 0.42, sd * -0.25, sd * 0.098, 0.088, 0.085));
    face.push(ell(0.05, 0.045, 0.075, sd * 0.1, -0.035, 0.05, 8)); // cheek
    nostrils.push(ell(0.013, 0.009, 0.022, sd * 0.038, 0.03, 0.235, 6));
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.026, 12, 9), eyeMat);
    eye.position.set(sd * 0.118, 0.03, 0.075);
    head.add(eye);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.015, 10, 8), pupilMat);
    pupil.position.set(sd * 0.135, 0.03, 0.083);
    head.add(pupil);
  }
  put(head, face, headSkin);
  put(head, nostrils, clawMat, false);
  // wrinkled throat: horizontal skin folds down the neck
  const folds: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 6; k++) {
    const t = new THREE.TorusGeometry(0.135 - k * 0.004, 0.011, 5, 16);
    t.scale(1, 0.92, 1);
    t.translate(0, -0.005, -0.02 - k * 0.055);
    folds.push(t);
  }
  put(neck1, folds.map((g) => g.translate(0, 0, 0.16)), headSkin, false);
  // swept-back mane: starts above the eye and streams back along the nape, blue at the roots, white at the tips
  const mane: THREE.BufferGeometry[] = [];
  const maneBase = back.clone().lerp(new THREE.Color("#8fb0dc"), 0.55), maneTip = crestC.clone();
  for (let m = 0; m < 6; m++) {
    const z = 0.115 - m * 0.043;
    const rise = 0.104 + 0.02 * Math.sin((m / 5) * Math.PI);
    for (let k = 0; k < 9; k++) {
      const s = (k - 4) / 4, a = Math.abs(s);
      const len = (0.2 + 0.04 * m) * (1 - a * 0.25);
      const g = feather(len, 0.036 + 0.006 * m, maneBase, maneTip, 900 + m * 17 + k, 0.14, 0.15);
      place(g, V(s * 0.105 * (1 - m * 0.04), rise - a * 0.045, z), V(s * 0.55, 0.3 + 0.05 * (m % 2), -1), V(0, 1, 0));
      mane.push(g);
    }
  }
  putC(head, mane);
  head.scale.setScalar(1.25);

  // ---- wings: thick feathered arm, broad coverts, wide secondaries, 10 fingered primaries with rust tips
  const wings: ArgentParts["wings"] = [];
  const fCol = (r: number, k = 0): [THREE.Color, THREE.Color] => pair(dark.clone().lerp(back, 0.35 + 0.1 * hash(k)), rustAt(r));
  for (const sd of [-1, 1]) {
    const off = sd > 0 ? 50 : 0;
    const sh = grp(sd * 0.42, 0.34, 0.2);
    trunk.add(sh);
    const el = grp(sd * HUM, 0, 0);
    sh.add(el);
    const wr = grp(sd * FORE, 0, 0);
    el.add(wr);
    const dirOut = (beta: number, y = 0.02) => V(sd * Math.sin(beta), y, -Math.cos(beta));
    // arm masses
    const armCol = () => back.clone().lerp(dark, 0.25);
    putC(sh, [paint(ell(HUM * 0.58, 0.15, 0.27, sd * HUM * 0.5, -0.01, 0.04, 14), armCol)]);
    putC(el, [paint(ell(FORE * 0.56, 0.12, 0.21, sd * FORE * 0.5, -0.01, 0.05, 14), armCol)]);
    putC(wr, [paint(ell(0.3, 0.09, 0.15, sd * 0.2, -0.005, 0.05, 10), armCol)]);
    // tertials on the humerus (long, dark, only a hint of rust)
    const shF: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 7; k++) {
      const [b, tp] = fCol(0.1 + 0.03 * k, k);
      shF.push(place(feather(0.9 - k * 0.025, 0.17, b, tp, 200 + k + off, 0.04, 0.55), V(sd * (0.08 + k * 0.1), -0.012 + 0.006 * (k % 3), -0.16), dirOut(-0.14 + k * 0.03), V(0, 1, 0)));
    }
    // covert rows over the humerus
    for (let row = 0; row < 4; row++)
      for (let k = 0; k < 9; k++) {
        const b = mid.clone().lerp(back, 0.35 + 0.15 * row + 0.1 * hash(row * 9 + k)), tp = pale.clone().lerp(mid, 0.55 + 0.1 * row);
        shF.push(place(feather(0.34 + row * 0.09, 0.1, b, tp, 300 + row * 10 + k + off, 0.1, 0.6), V(sd * (0.05 + k * 0.085), 0.02 + row * 0.012, 0.17 - row * 0.13), dirOut(-0.06 + k * 0.02), V(0, 1, 0)));
      }
    putC(sh, shF);
    // secondaries along the forearm + coverts
    const elF: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 10; k++) {
      const [b, tp] = fCol(0.3 + 0.035 * k, k + 3);
      elF.push(place(feather(1.05 - k * 0.02, 0.175, b, tp, 400 + k + off, 0.05, 0.5), V(sd * (0.02 + k * 0.088), -0.01 + 0.006 * (k % 3), -0.14), dirOut(0.02 + k * 0.03), V(0, 1, 0)));
    }
    for (let row = 0; row < 4; row++)
      for (let k = 0; k < 10; k++) {
        const b = mid.clone().lerp(back, 0.3 + 0.15 * row + 0.1 * hash(row * 13 + k)), tp = rustAt(0.1 + 0.08 * row).lerp(pale, 0.3);
        elF.push(place(feather(0.36 + row * 0.09, 0.1, b, tp, 600 + row * 10 + k + off, 0.1, 0.65), V(sd * (0.03 + k * 0.088), 0.02 + row * 0.012, 0.17 - row * 0.13), dirOut(0.02 + k * 0.03), V(0, 1, 0)));
      }
    const fe = grp();
    el.add(fe);
    putC(fe, elF);
    // ten fingered primaries fanning from the wrist: outer ones long and separated, tips curled up, rust-red
    const wrF: THREE.BufferGeometry[] = [];
    const PL = [1.15, 1.4, 1.5, 1.55, 1.5, 1.42, 1.32, 1.22, 1.12, 1.05];
    for (let k = 0; k < 10; k++) {
      const phi = 0.2 + k * 0.075;
      const [b, tp] = pair(dark.clone().lerp(back, 0.3), rustAt(0.85 + 0.15 * hash(k)));
      wrF.push(place(feather(PL[k], 0.135 - 0.008 * Math.abs(k - 4) * 0.5, b, tp, 700 + k + off, 0.07, 0.38), V(sd * k * 0.02, -0.005 + 0.006 * (k % 3) + (sd > 0 ? 0.025 : 0), -0.02 - k * 0.012), V(sd * Math.cos(phi), 0.05 + (1 - k / 9) * 0.1, -Math.sin(phi)), V(0, 1, 0)));
    }
    for (let k = 0; k < 7; k++) {
      const b = mid.clone().lerp(back, 0.4), tp = rustAt(0.35).lerp(pale, 0.25);
      wrF.push(place(feather(0.5, 0.1, b, tp, 800 + k + off, 0.08, 0.5), V(sd * (0.04 + k * 0.08), 0.022, 0.06), V(sd * Math.cos(0.18 + k * 0.1), 0.03, -Math.sin(0.18 + k * 0.1)), V(0, 1, 0)));
    }
    putC(wr, wrF);
    wings.push({ sh, el, wr, fe, side: sd });
  }

  // ---- legs: feathered trousers, red scaly tarsus, three forward toes + a hallux, black talons
  const legs: Leg[] = [];
  const buildLeg = (side: number): Leg => {
    const hip = grp(side * 0.27, -0.3, -0.02);
    chest.add(hip);
    putC(hip, [
      paint(ell(0.19, TL * 0.64, 0.21, 0, -TL * 0.4, 0.02, 12), (_x2, y) => pale.clone().lerp(back, ss(-0.45, -0.05, y) * 0.5)),
      ...plume({ c: [0, -TL * 0.4, 0.02], r: [0.19, TL * 0.64, 0.21], dir: [0, -1, -0.15], pole: "y", rows: 5, cols: 9, a0: 0.15, a1: 0.85, len: 0.18, wid: 0.07, col: () => pair(pale.clone().lerp(back, 0.3), pale.clone()), seed: 950 + (side > 0 ? 30 : 0), lift: 0.3 }),
    ]);
    const knee = grp(0, -TL, 0);
    hip.add(knee);
    put(knee, rigidLoft(
      [
        { pos: V(0, 0.02, 0), w: 0.08, top: 0.075, bot: 0.075 },
        { pos: V(0, -SL * 0.5, 0), w: 0.06, top: 0.055, bot: 0.06 },
        { pos: V(0, -SL, 0), w: 0.065, top: 0.06, bot: 0.065 },
      ],
      { ring: 10, perSeg: 3, up: V(0, 0, 1) },
    ), legSkin);
    const ankle = grp(0, -SL, 0);
    knee.add(ankle);
    const foot: THREE.BufferGeometry[] = [ell(0.075, 0.045, 0.085, 0, -0.03, 0.02, 8)];
    const talons: THREE.BufferGeometry[] = [];
    for (const tx of [-0.08, 0, 0.08]) {
      const tz = 0.08 + (tx === 0 ? 0.04 : 0);
      foot.push(ell(0.03, 0.028, 0.14, tx, -0.035, tz + 0.07, 8));
      foot.push(ell(0.032, 0.03, 0.032, tx, -0.03, tz + 0.15, 6)); // knuckle
      talons.push(spike(0.03, 0.17, V(0, -0.55, 1), V(tx, -0.03, tz + 0.2), 6));
    }
    foot.push(ell(0.028, 0.028, 0.07, 0, -0.03, -0.09, 8));
    talons.push(spike(0.032, 0.18, V(0, -0.5, -1), V(0, -0.03, -0.14), 6));
    put(ankle, foot, legSkin);
    put(ankle, talons, clawMat);
    const rest: [number, number, number] = [-0.3, 0.6, -0.3];
    hip.rotation.x = rest[0];
    knee.rotation.x = rest[1];
    ankle.rotation.x = rest[2];
    return { hip, knee, ankle, front: false, side, rest, dims: { tl: TL, sl: SL, ml: 0.1, w: 0.06 } };
  };
  for (const s of [-1, 1]) legs.push(buildLeg(s));

  // ---- tail: short broad fan with rust tips + two long thin streamers
  const talonMount = grp(0, -1.05, -0.25);
  chest.add(talonMount);
  const tail0 = grp(0, -0.06, -0.82);
  trunk.add(tail0);
  const tf: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 9; k++) {
    const a = ((k - 4) / 4) * 0.4;
    const b = dark.clone().lerp(back, 0.3 + 0.2 * hash(k)), tp = rustAt(0.55 + 0.2 * hash(k + 9));
    tf.push(place(feather(0.75 - Math.abs(a) * 0.3, 0.12, b, tp, 1100 + k, 0.03, 0.5), V(a * 0.1, -0.005 * (k % 2), 0), V(Math.sin(a), -0.03, -Math.cos(a)), V(0, 1, 0)));
  }
  for (let k = 0; k < 7; k++) {
    const a = ((k - 3) / 3) * 0.34;
    tf.push(place(feather(0.36, 0.09, mid.clone().lerp(back, 0.4), pale.clone().lerp(mid, 0.4), 1200 + k, 0.04, 0.5), V(a * 0.1, 0.022, 0.1), V(Math.sin(a), 0.02, -Math.cos(a)), V(0, 1, 0)));
  }
  for (const sx of [-1, 1]) tf.push(place(feather(1.4, 0.022, dark.clone(), dark.clone().lerp(pale, 0.35), 1300 + sx, 0.02, 0.6), V(sx * 0.03, 0.01, -0.02), V(sx * 0.04, -0.02, -1), V(0, 1, 0)));
  putC(tail0, tf);
  put(tail0, [ell(0.14, 0.06, 0.17, 0, 0, -0.02, 8)], headSkin, false);

  root.scale.setScalar(scale);
  chest.rotation.x = 0;
  neck0.rotation.x = -0.25;
  neck1.rotation.x = 0.45;
  head.rotation.x = 0.35;
  const argent: ArgentParts = { chest, trunk, wings, tailFan: tail0, spread: 0, flap: 0, ph: 0, bank: 0, atkT: 1, prevAtk: 0, bob: 0 };
  // wings start folded (draped over the flanks)
  for (const w of wings) {
    w.sh.rotation.set(0, w.side * FOLD.sh, -w.side * FOLD.shZ);
    w.el.rotation.set(0, w.side * FOLD.el, 0);
    w.wr.rotation.set(0, -w.side * FOLD.wr, 0);
    w.fe.rotation.set(w.side * Math.PI, 0, 0);
  }
  return { root, body, torso: chest, neck: [neck0, neck1], head, jaw, legs, arms: [], tail: [tail0], frill: null, materials, spec, hipY: STAND, wings: [], saddleMount, saddle: null, argent, talonMount };
}

// ---------------------------------------------------------------- animation
export function animateArgentavis(c: Creature, dt: number) {
  const r = c.rig;
  const P = r.argent;
  if (!P) return;
  r.root.position.copy(c.pos);
  r.root.rotation.y = c.yaw;
  const t = performance.now() * 0.001 + c.id * 1.7;
  const k = (s: number) => Math.min(1, dt * s);
  const rot = (o: THREE.Object3D, axis: "x" | "y" | "z", v: number, s = 10) => {
    o.rotation[axis] += (v - o.rotation[axis]) * k(s);
  };
  for (const m of r.materials) m.emissive.setRGB(c.hurtFlash > 0 ? 0.6 : 0, c.hurtFlash > 0 ? 0.05 : 0, 0);
  const downed = c.state === "dead" || c.state === "unconscious" || c.sleeping;
  const hs = Math.hypot(c.vel.x, c.vel.z);
  const [nk0, nk1] = r.neck;
  const tail = r.tail[0];
  const flying = c.flying && !downed;

  // attack clock: talons + beak strike
  if (!downed && c.attackAnim > P.prevAtk + 0.25 && c.attackAnim > 0.55) P.atkT = 0;
  P.prevAtk = c.attackAnim;
  if (P.atkT < 1) P.atkT = Math.min(1, P.atkT + dt / 0.75);
  const atkOn = P.atkT < 1 && !downed;
  const p = P.atkT;
  const strike = atkOn && p < 0.6 ? Math.sin((p / 0.6) * Math.PI) : 0;

  // ---------------- wings: fold ↔ open, soaring ↔ powered flapping
  const climb = c.vel.y > 0.6 || hs < c.sp.runSpeed * 0.55;
  const wantSpread = downed ? 0.12 : flying ? 1 : atkOn ? 0.55 : hs > 3.5 ? 0.4 : 0;
  P.spread += (wantSpread - P.spread) * k(flying ? 6 : 4);
  const wantFlap = flying ? (climb || atkOn || c.rollT > 0 ? 1 : 0.16) : atkOn ? 0.8 : hs > 3.5 ? 0.35 : 0;
  P.flap += (wantFlap - P.flap) * k(3);
  P.ph += dt * (flying ? 5.2 + 3.8 * P.flap : 8 * P.flap);
  const A = P.flap, sw = P.spread;
  const s1 = Math.sin(P.ph), s2 = Math.sin(P.ph - 0.75), s3 = Math.sin(P.ph - 1.4);
  const zSh = 0.1 + Math.sin(t * 0.9) * 0.025 * (1 - A) + A * (0.18 + 0.62 * s1);
  const zEl = 0.02 + A * 0.36 * s2;
  const zWr = 0.12 + A * (0.5 * s3 - 0.16 * Math.max(0, -Math.cos(P.ph)));
  for (const w of P.wings) {
    const sd = w.side;
    w.sh.rotation.set(0, sd * lerp(FOLD.sh, 0.12 - A * 0.08 * Math.cos(P.ph), sw), lerp(-sd * FOLD.shZ, sd * zSh, sw));
    w.el.rotation.set(0, sd * lerp(FOLD.el, 0, sw), lerp(0, sd * zEl, sw));
    w.wr.rotation.set(0, -sd * lerp(FOLD.wr, 0.08, sw), lerp(0, sd * zWr, sw));
    w.fe.rotation.x = sd * (1 - sw) * Math.PI; // forearm feathers flip to lie back over the body when folded
  }

  if (downed) {
    // ---------------- dead / knocked out / asleep: tips over onto its side
    c.animT = Math.min(1, c.animT + dt * 1.8);
    const e = 1 - Math.pow(1 - c.animT, 3);
    r.body.rotation.z = (Math.PI / 2) * 0.92 * e;
    r.body.rotation.x *= 1 - k(6);
    r.body.position.set(0, 0.42 * e, 0);
    r.legs.forEach((l) => {
      rot(l.hip, "x", 0.2, 6);
      rot(l.knee, "x", 0.5, 6);
      rot(l.ankle, "x", 0.1, 6);
    });
    rot(P.trunk, "x", 0, 5);
    rot(nk0, "x", -0.15, 5);
    rot(nk1, "x", 0.6, 5);
    rot(r.head, "x", 0.7, 5);
    rot(tail, "x", 0.1, 5);
    const breath = c.state === "unconscious" || c.sleeping ? Math.sin(t * (c.sleeping ? 0.9 : 1.4)) * 0.025 : 0;
    P.chest.scale.set(1 + breath * 0.5, 1 + breath, 1 + breath * 0.4);
    rot(r.jaw, "x", Math.sin(Math.min(1, c.attackAnim) * Math.PI) * 0.4, 14);
    return;
  }

  c.animT = Math.max(0, c.animT - dt * 2);
  const eTip = 1 - Math.pow(1 - c.animT, 3);
  const breathe = Math.sin(t * 1.6) * 0.01;
  P.chest.scale.set(1 + breathe * 0.5, 1 + breathe, 1 + breathe * 0.4);
  const graze = c.grazeTimer > 0 ? Math.min(1, c.grazeTimer) : 0; // pecking at a carcass
  const roar = c.roarTimer > 0 ? Math.sin(Math.min(1, c.roarTimer) * Math.PI) : 0;
  let look = 0;
  if (c.lookTarget) {
    const a = Math.atan2(c.lookTarget.x - c.pos.x, c.lookTarget.z - c.pos.z) - c.yaw;
    look = THREE.MathUtils.clamp(Math.atan2(Math.sin(a), Math.cos(a)), -0.9, 0.9);
  }

  if (flying) {
    // ---------------- airborne: bank into turns, pitch with climb/dive, legs tucked, talons out on the strike
    const bankT = THREE.MathUtils.clamp(-c.turnRate * 0.28, -0.65, 0.65);
    P.bank += (bankT - P.bank) * k(4);
    const roll = c.rollT > 0 ? (1 - c.rollT / 0.7) * TAU : 0;
    r.body.rotation.z = P.bank + roll;
    rot(r.body, "x", THREE.MathUtils.clamp(-c.vel.y * 0.05, -0.45, 0.45) - strike * 0.1, 4);
    r.body.rotation.y = 0;
    const bob = Math.sin(P.ph - 0.3) * 0.07 * A;
    P.bob += (bob - P.bob) * k(10);
    r.body.position.set(0, P.bob, 0);
    const hold = c.talonHeld ? 1 : 0; // a player hangs from the talons: legs reach down and the toes clamp shut
    r.legs.forEach((l) => {
      rot(l.hip, "x", lerp(1.15 - strike * 2.0, 0.25, hold), 12);
      rot(l.knee, "x", lerp(0.35 - strike * 0.3, 0.1, hold), 12);
      rot(l.ankle, "x", lerp(0.7 - strike * 1.5, 0.55, hold), 12);
    });
    rot(P.trunk, "x", -0.08 - strike * 0.05, 5);
    rot(nk0, "x", -0.3 + strike * 0.35 + graze * 0.2, 8);
    rot(nk1, "x", 0.3 - strike * 0.25, 8);
    rot(r.head, "x", 0.22 + strike * 0.3, 8);
    rot(nk0, "y", look * 0.4, 5);
    rot(r.jaw, "x", Math.max(strike * 0.6, roar * 0.55), 14);
    const turn = THREE.MathUtils.clamp(c.turnRate * 0.15, -0.4, 0.4);
    rot(tail, "x", THREE.MathUtils.clamp(-c.vel.y * 0.04, -0.3, 0.3) + 0.12, 6);
    rot(tail, "y", -turn * 0.3, 6);
    tail.scale.x += ((flying && A < 0.5 ? 1.25 : 1.0) - tail.scale.x) * k(3);
    return;
  }

  // ---------------- on the ground: waddling stride, head bob, folded wings
  const moving = hs > 0.15 && c.onGround;
  const amp = moving ? Math.min(1.4, hs / 2.4) : 0;
  c.walkPhase += (moving ? 3.2 + 4 * amp : 0) * dt;
  const ph = c.walkPhase;
  r.legs.forEach((l, i) => {
    const lp = ph + (i === 0 ? 0 : Math.PI);
    rot(l.hip, "x", l.rest[0] + Math.sin(lp) * 0.55 * amp + strike * -0.9, 14);
    rot(l.knee, "x", l.rest[1] + Math.max(0, Math.cos(lp)) * 0.75 * amp - strike * 0.2, 14);
    rot(l.ankle, "x", l.rest[2] - Math.sin(lp) * 0.25 * amp - strike * 0.5, 14);
  });
  P.bank += (0 - P.bank) * k(6);
  r.body.rotation.z = Math.sin(ph) * 0.05 * amp + (Math.PI / 2) * 0.92 * eTip;
  rot(r.body, "x", 0.02 - strike * 0.12, 8);
  r.body.rotation.y = 0;
  P.bob += (-0.03 * Math.abs(Math.cos(ph)) * amp - P.bob) * k(12);
  r.body.position.set(0, P.bob + 0.42 * eTip, 0);
  const headBob = Math.sin(ph * 2) * 0.08 * amp;
  rot(P.trunk, "x", TILT - strike * 0.12 + graze * 0.12, 6);
  rot(nk0, "x", lerp(-0.25 + strike * 0.5 - roar * 0.25, 0.7, graze), 8);
  rot(nk1, "x", lerp(0.45 + headBob - strike * 0.3, 0.85, graze), 8);
  rot(r.head, "x", lerp(0.35 + strike * 0.45, 0.6, graze), 8);
  rot(nk0, "y", look * 0.5 + Math.sin(t * 0.4) * 0.12 * (1 - graze), 5);
  const chomp = graze > 0 ? Math.max(0, Math.sin(t * 7)) * 0.3 : 0;
  rot(r.jaw, "x", Math.max(strike * 0.6, roar * 0.5, chomp), 14);
  const turn = THREE.MathUtils.clamp(c.turnRate * 0.15, -0.4, 0.4);
  rot(tail, "x", 0.05, 6);
  rot(tail, "y", -turn * 0.3 + Math.sin(t * 1.1) * 0.05, 6);
  tail.scale.x += (1 - tail.scale.x) * k(3);
}
