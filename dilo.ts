import * as THREE from "three";
import type { ModelSpec } from "../data/species";
import type { CreatureRig, Leg } from "./models";
import { newBuffers, loft, buildSkinnedGeometry, attachBones, makeSkinned, wp, rigidLoft, type LoftNode } from "./skin";
import { grp, ell, cone, put, spike } from "./doedicurus";
import { irisTexture, skinPoreTexture } from "../core/textures";
import { mergeByMaterial } from "../core/merge";
import type { MapPair } from "./rexTextures";
import { paintDiloBody, paintDiloHead, paintDiloLeg, paintDiloFoot, paintDiloFrill, paintDiloCrest } from "./diloTextures";

/**
 * DILOPHOSAURUS (ARK look):
 *  - slim, leaf-green theropod with black tiger stripes, a cream belly and fine pebbly scales;
 *  - long narrow skull with the typical notch behind the premaxilla, slender curved teeth,
 *    amber slit-pupil eyes ringed in orange, a small bony brow horn and an orange throat wattle;
 *  - TWO thin, veined crests (yellow → orange → red) running along the top of the skull;
 *  - a spiky "mane" of quills down the neck, back and base of the tail;
 *  - the big neck FRILL: a fan of black ribs with a scalloped yellow/orange/crimson membrane that is folded
 *    flat against the neck when calm and spreads out like an umbrella when the animal is angry;
 *  - long digitigrade legs with three-toed feet and sickle-ish black claws, small three-fingered hands.
 * The rig is the same as every generic biped (torso, neck[], head, jaw, legs, arms, tail[]), so the shared
 * creature animation drives it unchanged. The frill exposes `userData.setOpen(0..1)`.
 */

// ---------------------------------------------------------------- textures (built once, shared by every dilo)
interface Maps { map: THREE.CanvasTexture; bump: THREE.CanvasTexture }
interface DiloTex { body: Maps; head: Maps; leg: Maps; foot: Maps; frill: Maps; crest: THREE.CanvasTexture }
let texCache: DiloTex | null = null;

function toTex(c: HTMLCanvasElement, color: boolean, clampS = false) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = clampS ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.anisotropy = 4;
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const toMaps = (p: MapPair): Maps => ({ map: toTex(p.color, true), bump: toTex(p.bump, false) });
function diloTextures(): DiloTex {
  if (!texCache) {
    texCache = {
      body: toMaps(paintDiloBody()),
      head: toMaps(paintDiloHead()),
      leg: toMaps(paintDiloLeg()),
      foot: toMaps(paintDiloFoot()),
      frill: toMaps(paintDiloFrill()),
      crest: toTex(paintDiloCrest(), true, true),
    };
  }
  return texCache;
}

// ---------------------------------------------------------------- helpers
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const sstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Tapered limb pointing down (-Y) from the origin. */
function limbDown(r0: number, r1: number, len: number, seg = 10) {
  const g = new THREE.CylinderGeometry(r0, r1, len, seg);
  g.translate(0, -len / 2, 0);
  return g;
}
function pathLen(nodes: { pos: THREE.Vector3 }[]) {
  let s = 0;
  for (let i = 1; i < nodes.length; i++) s += nodes[i].pos.distanceTo(nodes[i - 1].pos);
  return s;
}

/** One quill of the mane: a dark spike with a slim orange tip. Base sits on `at`, points along `dir`. */
function quill(base: THREE.BufferGeometry[], tip: THREE.BufferGeometry[], at: THREE.Vector3, dir: THREE.Vector3, h: number, r: number) {
  base.push(spike(r, h, dir, at, 5));
  const d = dir.clone().normalize();
  tip.push(spike(r * 0.4, h * 0.4, d, at.clone().addScaledVector(d, h * 0.6), 5));
}

// ---------------------------------------------------------------- neck frill
interface Frill { group: THREE.Group; setOpen: (open: number) => void; mat: THREE.MeshStandardMaterial }

/**
 * A collar of `ribs` ribs around the neck (open at the throat). Between two ribs the membrane is a small
 * grid; its outer edge is scalloped so every rib ends in a point. Geometry is rewritten by setOpen().
 * Axis: +Z points toward the head, angle 0 is straight up.
 */
function buildFrill(maps: Maps, rn: number, L: number): Frill {
  const ribs = 15, cells = ribs - 1, SUB = 4, ROWS = 6;
  const arcHalf = 2.5; // ≈143° each side of the top → ~74° gap under the throat
  const per = (SUB + 1) * (ROWS + 1);
  const tipBase = cells * per;
  const count = tipBase + ribs * 3;

  const pos = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  const vA = new Float32Array(count); // angle
  const vS = new Float32Array(count); // 0 at root .. 1 at rim (can exceed 1 for rib tips)
  const vLen = new Float32Array(count); // per-vertex length factor (rib length × scallop)
  const vSag = new Float32Array(count); // how far the membrane sags back between ribs
  const dAlpha = (arcHalf * 2) / cells;
  const ribLen = Array.from({ length: ribs }, (_, i) => 0.74 + 0.26 * Math.cos((i / (ribs - 1) - 0.5) * Math.PI * 0.95) + (((i * 37) % 7) - 3) * 0.006);
  const idx: number[] = [];

  for (let c = 0; c < cells; c++) {
    for (let j = 0; j <= SUB; j++) {
      const f = j / SUB;
      for (let k = 0; k <= ROWS; k++) {
        const i = (c * (SUB + 1) + j) * (ROWS + 1) + k;
        vA[i] = -arcHalf + (c + f) * dAlpha;
        vS[i] = k / ROWS;
        const sc = 0.2 + 0.05 * Math.sin(c * 1.7);
        vLen[i] = lerp(ribLen[c], ribLen[c + 1], f) * (1 - sc * Math.sin(Math.PI * f));
        vSag[i] = Math.sin(Math.PI * f);
        uv[i * 2] = c + f;
        uv[i * 2 + 1] = k / ROWS;
        if (j < SUB && k < ROWS) {
          const a = i, b = i + (ROWS + 1), d = i + 1, e = i + (ROWS + 1) + 1;
          idx.push(a, b, d, b, e, d);
        }
      }
    }
  }
  // rib tips: thin dark triangles that stick out past the membrane
  for (let r = 0; r < ribs; r++) {
    const t0 = tipBase + r * 3;
    const a = -arcHalf + r * dAlpha;
    for (let q = 0; q < 3; q++) {
      vA[t0 + q] = a + (q === 0 ? -0.035 : q === 1 ? 0.035 : 0);
      vS[t0 + q] = q === 2 ? 1.14 : 0.97;
      vLen[t0 + q] = ribLen[r];
      vSag[t0 + q] = 0;
      uv[(t0 + q) * 2] = r;
      uv[(t0 + q) * 2 + 1] = 1;
    }
    idx.push(t0, t0 + 1, t0 + 2);
  }

  const geo = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(pos, 3);
  posAttr.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute("position", posAttr);
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);

  const mat = new THREE.MeshStandardMaterial({ map: maps.map, bumpMap: maps.bump, bumpScale: 1.6, roughness: 0.68, side: THREE.DoubleSide });
  mat.map!.wrapS = THREE.RepeatWrapping;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "frill"; // named meshes are skipped by mergeByMaterial (geometry is rewritten at runtime)
  mesh.castShadow = false;
  mesh.frustumCulled = false;

  const group = new THREE.Group();
  group.add(mesh);

  const setOpen = (open: number) => {
    const e = sstep(0, 1, open);
    const phi0 = lerp(2.98, 1.1, e); // rib angle from the forward axis: ~171° folded back → ~63° spread
    const bend = lerp(0.05, 0.8, e); // ribs curve forward as they spread
    const lenK = lerp(0.6, 1.0, e);
    for (let i = 0; i < count; i++) {
      const s = vS[i];
      const Lr = L * lenK * vLen[i];
      const phi = phi0 - bend * Math.min(1, s) * 0.6;
      const rad = rn + Lr * s * Math.sin(phi);
      const a = vA[i];
      pos[i * 3] = rad * Math.sin(a);
      pos[i * 3 + 1] = rad * Math.cos(a);
      pos[i * 3 + 2] = Lr * s * Math.cos(phi) - vSag[i] * L * 0.045 * s * e;
    }
    posAttr.needsUpdate = true;
    geo.computeVertexNormals();
    group.userData.open = open;
  };
  group.userData.setOpen = setOpen;
  setOpen(0.05);
  return { group, setOpen, mat };
}

// ---------------------------------------------------------------- head crest (one thin veined plate)
function crestPlate(HH: number, HL: number, topAt: (zf: number) => number, side: number): THREE.BufferGeometry {
  const N = 30, z0 = 0.2, z1 = 0.88, Hc = HH * 0.62, depth = HH * 0.055;
  const shape = new THREE.Shape();
  const bottom: [number, number][] = [], top: [number, number][] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const zf = z0 + (z1 - z0) * t;
    const yb = topAt(zf) - HH * 0.06;
    // tall, rounded fan that peaks above the eye and ends in scallops
    const h = Hc * Math.pow(Math.max(0, Math.sin(Math.PI * Math.pow(t, 0.72))), 0.72) * (1 + 0.08 * Math.cos(t * Math.PI * 9));
    bottom.push([HL * zf, yb]);
    top.push([HL * zf, yb + h + HH * 0.06 * Math.sin(Math.PI * t)]);
  }
  shape.moveTo(bottom[0][0], bottom[0][1]);
  for (const p of bottom) shape.lineTo(p[0], p[1]);
  for (let i = top.length - 1; i >= 0; i--) shape.lineTo(top[i][0], top[i][1]);
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: depth * 0.4, bevelSize: depth * 0.3, bevelSegments: 1, curveSegments: 1, steps: 1 });
  g.computeBoundingBox();
  const bb = g.boundingBox!;
  const p = g.attributes.position as THREE.BufferAttribute;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    uv[i * 2] = (p.getX(i) - bb.min.x) / (bb.max.x - bb.min.x);
    uv[i * 2 + 1] = (p.getY(i) - bb.min.y) / (bb.max.y - bb.min.y);
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.translate(0, 0, -depth / 2);
  g.rotateY(-Math.PI / 2); // shape x → head z, depth → head x
  g.translate(side * HH * 0.115, 0, 0);
  return g;
}

// ---------------------------------------------------------------- builder
export function buildDilo(spec: ModelSpec, key: string, scale = 1): CreatureRig {
  void key;
  const BL = spec.bodyLen, BH = spec.bodyH, BW = spec.bodyW;
  const HL = spec.headLen, HH = spec.headH;
  const T = diloTextures();
  const pores = skinPoreTexture();

  const skin = new THREE.MeshStandardMaterial({ map: T.body.map, bumpMap: T.body.bump, bumpScale: 1.8, roughness: 0.74, metalness: 0 });
  const headSkin = new THREE.MeshStandardMaterial({ map: T.head.map, bumpMap: T.head.bump, bumpScale: 1.6, roughness: 0.72 });
  // double-sided as a safety net: the thigh is a thin skinned tube and must never show the ground through a gap
  const legSkin = new THREE.MeshStandardMaterial({ map: T.leg.map, bumpMap: T.leg.bump, bumpScale: 1.8, roughness: 0.78, side: THREE.DoubleSide });
  const footMat = new THREE.MeshStandardMaterial({ map: T.foot.map, bumpMap: T.foot.bump, bumpScale: 1.8, roughness: 0.82 });
  const crestMat = new THREE.MeshStandardMaterial({ map: T.crest, roughness: 0.6, side: THREE.DoubleSide });
  // plain-colour materials for small add-ons (sphere/cylinder UVs would smear the big maps)
  const flesh = new THREE.MeshStandardMaterial({ color: "#5f7d33", roughness: 0.8, bumpMap: pores, bumpScale: 0.9 });
  const armMat = new THREE.MeshStandardMaterial({ color: "#6a8838", roughness: 0.8, bumpMap: pores, bumpScale: 1.0 });
  const chinMat = new THREE.MeshStandardMaterial({ color: "#e4dca4", roughness: 0.8, bumpMap: pores, bumpScale: 0.9 });
  const wattleMat = new THREE.MeshStandardMaterial({ color: "#e0782c", roughness: 0.7, bumpMap: pores, bumpScale: 1.1 });
  const ringMat = new THREE.MeshStandardMaterial({ color: "#e58a24", roughness: 0.6 });
  const boneMat = new THREE.MeshStandardMaterial({ color: "#c7a05a", roughness: 0.55, bumpMap: pores, bumpScale: 1.0 });
  const quillMat = new THREE.MeshStandardMaterial({ color: "#26361a", roughness: 0.6 });
  const quillTip = new THREE.MeshStandardMaterial({ color: "#e0692a", roughness: 0.55 });
  const toothMat = new THREE.MeshStandardMaterial({ color: "#efe7c8", roughness: 0.4 });
  const clawMat = new THREE.MeshStandardMaterial({ color: "#2a2820", roughness: 0.38 });
  const mouthMat = new THREE.MeshStandardMaterial({ color: "#8e342c", roughness: 0.85 });
  const tongueMat = new THREE.MeshStandardMaterial({ color: "#b85f58", roughness: 0.8 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: "#1a120a", roughness: 0.15, metalness: 0.1 });
  const irisMat = new THREE.MeshStandardMaterial({ map: irisTexture(spec.eye ?? "#f2c21a", true), roughness: 0.15, metalness: 0.1 });

  const root = new THREE.Group();
  const body = grp();
  root.add(body);
  // stand exactly on the ground in the rest pose: thigh + shin + metatarsus (+ toe thickness) below the hip
  const hipY = spec.legLen * (0.45 * Math.cos(0.4) + 0.42 * Math.cos(0.55) + 0.3) + spec.legW * 0.42;
  const torso = grp(0, hipY + BH * 0.2, 0);
  body.add(torso);
  const up = new THREE.Vector3(0, 1, 0);

  // ------------------------------------------------------------ legs (bones + rigid feet; skin is lofted later)
  const legs: Leg[] = [];
  const legX = BW * 0.3;
  for (const s of [-1, 1]) {
    const w = spec.legW;
    const L = spec.legLen;
    const tl = L * 0.45, sl = L * 0.42, ml = L * 0.3;
    const hip = grp(s * legX, hipY, -BL * 0.12);
    body.add(hip);
    const knee = grp(0, -tl, 0);
    hip.add(knee);
    const ankle = grp(0, -sl, 0);
    knee.add(ankle);
    // three long toes (middle one longest) with black hooked claws, a raised hallux and a heel pad
    const toes: THREE.BufferGeometry[] = [], claws: THREE.BufferGeometry[] = [];
    const toeY = -ml;
    for (let t = 0; t < 3; t++) {
      const a = (t - 1) * 0.4 + s * 0.03;
      const len = w * (t === 1 ? 3.3 : 2.7);
      const toe = rigidLoft(
        [
          { pos: new THREE.Vector3(0, toeY + w * 0.1, -w * 0.25), w: w * 0.46, top: w * 0.4, bot: w * 0.36 },
          { pos: new THREE.Vector3(0, toeY + w * 0.05, len * 0.3), w: w * 0.4, top: w * 0.3, bot: w * 0.28 },
          { pos: new THREE.Vector3(0, toeY + w * 0.0, len * 0.65), w: w * 0.36, top: w * 0.26, bot: w * 0.24 },
          { pos: new THREE.Vector3(0, toeY - w * 0.04, len), w: w * 0.3, top: w * 0.22, bot: w * 0.2 },
        ],
        { ring: 10, perSeg: 3, up, capStart: true, capEnd: true, uScale: 0.8 },
      );
      toe.rotateY(a);
      toes.push(toe);
      const cl = cone(w * 0.17, w * (t === 1 ? 1.15 : 0.95), 6);
      cl.rotateX(Math.PI / 2 + 0.85);
      cl.translate(Math.sin(a) * (len + w * 0.35), toeY - w * 0.22, Math.cos(a) * (len + w * 0.35));
      claws.push(cl);
      // knuckle pads
      toes.push(ell(w * 0.36, w * 0.3, w * 0.32, Math.sin(a) * len * 0.42, toeY - w * 0.02, Math.cos(a) * len * 0.42, 8));
    }
    toes.push(ell(w * 0.5, w * 0.4, w * 0.6, 0, toeY + w * 0.12, -w * 0.3, 10));
    const dew = cone(w * 0.11, w * 0.5, 5);
    dew.rotateX(-Math.PI / 2 - 0.5);
    dew.translate(0, toeY + w * 1.0, -w * 0.85);
    claws.push(dew);
    put(ankle, toes, footMat);
    put(ankle, claws, clawMat);
    const rest: [number, number, number] = [-0.4, 0.95, -0.55];
    hip.rotation.x = rest[0];
    knee.rotation.x = rest[1];
    ankle.rotation.x = rest[2];
    legs.push({ hip, knee, ankle, front: false, side: s, rest, dims: { tl, sl, ml, w } });
  }

  // ------------------------------------------------------------ arms: slim, three clawed fingers, held against the chest
  const arms: Leg[] = [];
  {
    const a = Math.max(0.36, (spec.armLen ?? 0.38) * 1.15);
    const w = spec.legW * 0.52;
    for (const s of [-1, 1]) {
      const sh = grp(s * BW * 0.34, hipY + BH * 0.05, BL * 0.33);
      body.add(sh);
      put(sh, [limbDown(w * 0.78, w * 0.55, a * 0.52), ell(w * 0.85, w * 0.8, w * 0.9, 0, 0, 0, 10)], armMat);
      const el = grp(0, -a * 0.52, 0);
      sh.add(el);
      put(el, [limbDown(w * 0.55, w * 0.4, a * 0.48), ell(w * 0.52, w * 0.5, w * 0.55, 0, 0, 0, 8)], armMat);
      const hand = grp(0, -a * 0.48, 0);
      el.add(hand);
      const fingers: THREE.BufferGeometry[] = [], cl: THREE.BufferGeometry[] = [];
      for (const k of [-1, 0, 1]) {
        const len = w * (k === 0 ? 1.5 : 1.2);
        const f = new THREE.CylinderGeometry(w * 0.11, w * 0.17, len, 6);
        f.translate(0, -len / 2, 0);
        f.rotateX(-0.6);
        f.rotateZ(k * 0.22);
        f.translate(k * w * 0.26, 0, 0);
        fingers.push(f);
        const c = cone(w * 0.11, w * 0.6, 5);
        c.rotateX(Math.PI);
        c.translate(0, -len - w * 0.22, 0);
        c.rotateX(-0.6);
        c.rotateZ(k * 0.22);
        c.translate(k * w * 0.26, 0, 0);
        cl.push(c);
      }
      fingers.push(ell(w * 0.5, w * 0.4, w * 0.5, 0, -w * 0.05, w * 0.05, 8));
      put(hand, fingers, armMat);
      put(hand, cl, clawMat);
      sh.rotation.x = -0.5;
      el.rotation.x = -0.9;
      arms.push({ hip: sh, knee: el, ankle: hand, front: true, side: s, rest: [-0.5, -0.9, 0] });
    }
  }

  // ------------------------------------------------------------ neck (4 vertebrae, long, slender, S-curved)
  const neck: THREE.Group[] = [];
  const nSeg = 4;
  const neckStart = grp(0, BH * 0.18, BL * 0.44);
  torso.add(neckStart);
  let parent: THREE.Object3D = neckStart;
  const segLen = spec.neckLen / nSeg;
  const lift = spec.neckRise * 0.78;
  for (let i = 0; i < nSeg; i++) {
    const n = grp(0, 0, i === 0 ? 0 : segLen);
    parent.add(n);
    n.rotation.x = -lift * (i === 0 ? 0.62 : i === 1 ? 0.26 : 0.12);
    neck.push(n);
    parent = n;
  }
  const head = grp(0, 0, segLen);
  parent.add(head);
  head.rotation.x = spec.neckRise * 0.85;
  const nt = spec.neckThick ?? 1;
  const neckR = (i: number) => lerp(BW * 0.3 * nt, HH * 0.43, i / nSeg) * (1 + 0.08 * Math.sin((i / nSeg) * Math.PI));

  // ------------------------------------------------------------ tail (6 segments, thick base, whip-thin tip)
  const tail: THREE.Group[] = [];
  const tSeg = 6;
  const tl = spec.tailLen / tSeg;
  const tr = (i: number) => BW * 0.4 * Math.pow(0.77, i);
  const tStart = grp(0, BH * 0.05, -BL * 0.45);
  torso.add(tStart);
  parent = tStart;
  for (let i = 0; i < tSeg; i++) {
    const t = grp(0, 0, i === 0 ? 0 : -tl);
    parent.add(t);
    t.rotation.x = i === 0 ? -0.08 : 0.04;
    tail.push(t);
    parent = t;
  }

  // ------------------------------------------------------------ head (rigid skull + jaw)
  // long, narrow snout with the dilophosaur notch behind a bulbous premaxilla
  const skullNodes = [
    { z: -0.08, y: 0.0, w: 0.46, top: 0.44, bot: 0.36 },
    { z: 0.14, y: 0.06, w: 0.5, top: 0.5, bot: 0.34 },
    { z: 0.38, y: 0.07, w: 0.34, top: 0.36, bot: 0.27 },
    { z: 0.6, y: 0.05, w: 0.27, top: 0.27, bot: 0.21 },
    { z: 0.75, y: 0.03, w: 0.22, top: 0.23, bot: 0.18 },
    { z: 0.91, y: 0.02, w: 0.3, top: 0.3, bot: 0.21 },
    { z: 1.0, y: 0.0, w: 0.24, top: 0.21, bot: 0.17 },
  ];
  const skullPts = skullNodes.map((n) => ({ pos: new THREE.Vector3(0, HH * n.y, HL * n.z), w: HH * n.w, top: HH * n.top, bot: HH * n.bot }));
  const skull = rigidLoft(skullPts, { ring: 22, perSeg: 5, up, capStart: true, capEnd: true, squareness: 2.4, uScale: 0.98 / pathLen(skullPts), noise: 0.01, seed: 9 });
  put(head, skull, headSkin);
  const prof = (zf: number, fn: (n: (typeof skullNodes)[number]) => number) => {
    for (let i = 0; i < skullNodes.length - 1; i++) {
      const a = skullNodes[i], b = skullNodes[i + 1];
      if (zf <= b.z) return HH * lerp(fn(a), fn(b), sstep(a.z, b.z, zf));
    }
    return HH * fn(skullNodes[skullNodes.length - 1]);
  };
  const topAt = (zf: number) => prof(zf, (n) => n.y + n.top);
  const botAt = (zf: number) => prof(zf, (n) => n.y - n.bot);
  const halfW = (zf: number) => prof(zf, (n) => n.w);

  // nostrils on the premaxilla, nasal ridge, cheek muscle
  for (const s of [-1, 1]) {
    put(head, ell(HH * 0.05, HH * 0.035, HH * 0.09, s * halfW(0.86) * 0.6, topAt(0.86) - HH * 0.045, HL * 0.86, 8), mouthMat, false);
    // antorbital cheek bump + rugose lacrimal brow horn above the eye
    put(head, [ell(HH * 0.09, HH * 0.07, HH * 0.16, s * halfW(0.5) * 0.92, HH * 0.08, HL * 0.5, 8)], flesh, false);
    const bh = cone(HH * 0.075, HH * 0.26, 6);
    bh.rotateZ(-s * 0.35);
    bh.rotateX(-0.45);
    bh.translate(s * halfW(0.36) * 0.86, topAt(0.36) - HH * 0.02, HL * 0.36);
    put(head, [bh], boneMat, false);
  }
  {
    const bumps: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 5; i++) {
      const zf = 0.5 + i * 0.07;
      bumps.push(ell(HH * 0.055, HH * 0.03, HH * 0.06, 0, topAt(zf) - HH * 0.01, HL * zf, 6));
    }
    put(head, bumps, flesh, false);
  }
  // eyes: amber slit iris, hooded lids, orange ring
  for (const s of [-1, 1]) {
    const er = HH * 0.15;
    const ex = s * halfW(0.3) * 0.92, ey = HH * 0.2, ez = HL * 0.3;
    const eye = new THREE.Mesh(new THREE.SphereGeometry(er, 14, 10), eyeMat);
    eye.position.set(ex, ey, ez);
    head.add(eye);
    const iris = new THREE.Mesh(new THREE.CircleGeometry(er * 0.86, 20), irisMat);
    iris.name = "iris";
    iris.position.set(ex + s * er * 0.94, ey, ez + er * 0.05);
    iris.rotation.y = (s * Math.PI) / 2;
    head.add(iris);
    const lid = new THREE.Mesh(new THREE.SphereGeometry(er * 1.14, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.44), flesh);
    lid.position.set(ex, ey, ez);
    lid.rotation.z = -s * 0.4;
    head.add(lid);
    const lower = new THREE.Mesh(new THREE.SphereGeometry(er * 1.08, 12, 6, 0, Math.PI * 2, Math.PI * 0.8, Math.PI * 0.2), flesh);
    lower.position.set(ex, ey - er * 0.05, ez);
    head.add(lower);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(er * 1.12, er * 0.17, 6, 18), ringMat);
    ring.position.set(ex + s * er * 0.22, ey, ez);
    ring.rotation.y = (s * Math.PI) / 2;
    head.add(ring);
  }
  // upper teeth: a few straight ones in the premaxilla, then a row of slender recurved maxillary teeth
  {
    const teeth: THREE.BufferGeometry[] = [];
    for (const s of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        const zf = 0.93 + k * 0.022;
        const t = cone(HH * 0.028, HH * 0.15, 5);
        t.rotateX(Math.PI);
        t.translate(s * HH * (0.05 + k * 0.045), botAt(zf) + HH * 0.03 - HH * 0.075, HL * zf);
        teeth.push(t);
      }
      const n = 8;
      for (let i = 0; i < n; i++) {
        const zf = 0.34 + (i / (n - 1)) * 0.38;
        const mid = 1 - Math.abs((i - n * 0.4) / (n * 0.6));
        const th = HH * (0.11 + 0.09 * Math.max(0, mid));
        const t = cone(HH * 0.022, th, 5);
        t.rotateX(Math.PI);
        t.rotateX(-0.22); // recurved: tips lean back
        t.rotateZ(-s * 0.06);
        t.translate(s * halfW(zf) * 0.66, botAt(zf) + HH * 0.03 - th * 0.45, HL * zf);
        teeth.push(t);
      }
    }
    put(head, teeth, toothMat, false);
    put(head, [ell(HH * 0.22, HH * 0.03, HL * 0.36, 0, botAt(0.55) + HH * 0.03, HL * 0.56, 10)], mouthMat, false);
  }
  // jaw: slim cream mandible, pink mouth floor + tongue, small lower teeth, orange throat wattle
  const jaw = grp(0, -HH * 0.16, HL * 0.1);
  head.add(jaw);
  put(
    jaw,
    rigidLoft(
      [
        { pos: new THREE.Vector3(0, 0, -HL * 0.02), w: HH * 0.36, top: HH * 0.14, bot: HH * 0.22 },
        { pos: new THREE.Vector3(0, -HH * 0.02, HL * 0.3), w: HH * 0.3, top: HH * 0.11, bot: HH * 0.19 },
        { pos: new THREE.Vector3(0, -HH * 0.01, HL * 0.58), w: HH * 0.24, top: HH * 0.09, bot: HH * 0.15 },
        { pos: new THREE.Vector3(0, 0.0, HL * 0.76), w: HH * 0.21, top: HH * 0.08, bot: HH * 0.13 },
        { pos: new THREE.Vector3(0, HH * 0.01, HL * 0.88), w: HH * 0.17, top: HH * 0.07, bot: HH * 0.1 },
      ],
      { ring: 14, perSeg: 4, up, capStart: true, capEnd: true, uScale: 1.0 },
    ),
    chinMat,
  );
  put(jaw, [ell(HH * 0.2, HH * 0.03, HL * 0.34, 0, HH * 0.1, HL * 0.42, 10)], mouthMat, false);
  put(jaw, [ell(HH * 0.12, HH * 0.04, HL * 0.22, 0, HH * 0.12, HL * 0.36, 10)], tongueMat, false);
  put(jaw, [ell(HH * 0.15, HH * 0.11, HL * 0.17, 0, -HH * 0.1, HL * 0.22, 10), ell(HH * 0.1, HH * 0.07, HL * 0.12, 0, -HH * 0.13, HL * 0.36, 8)], wattleMat, false);
  {
    const lo: THREE.BufferGeometry[] = [];
    const n = 9;
    for (let i = 0; i < n; i++) {
      const zf = 0.22 + (i / (n - 1)) * 0.62;
      const th = HH * (0.08 + 0.06 * (1 - Math.abs((i - n * 0.45) / (n * 0.6))));
      for (const s of [-1, 1]) {
        const t = cone(HH * 0.02, th, 5);
        t.rotateZ(s * 0.06);
        t.translate(s * HH * (0.23 - zf * 0.08), HH * 0.09 + th * 0.4, HL * zf);
        lo.push(t);
      }
    }
    put(jaw, lo, toothMat, false);
  }

  // ------------------------------------------------------------ the TWO head crests
  put(head, [crestPlate(HH, HL, topAt, -1), crestPlate(HH, HL, topAt, 1)], crestMat, false);

  // ------------------------------------------------------------ neck frill (on the last vertebra, folds back against the neck)
  const frillRoot = neckR(nSeg - 1) * 0.92;
  const frill = buildFrill(T.frill, frillRoot, HL * 1.0);
  frill.group.position.set(0, 0, segLen * 0.82);
  neck[nSeg - 1].add(frill.group);

  // ------------------------------------------------------------ the mane: quills down the neck, back and tail
  {
    const qb: THREE.BufferGeometry[] = [], qt: THREE.BufferGeometry[] = [];
    const back = v3(0, 1, -0.75);
    // neck (skip the last vertebra: the frill sits there)
    for (let i = 0; i < nSeg - 1; i++) {
      const nb: THREE.BufferGeometry[] = [], nq: THREE.BufferGeometry[] = [];
      const r = neckR(i) * 1.02;
      for (let k = 0; k < 3; k++) {
        const f = (i + k / 3) / nSeg;
        quill(nb, nq, v3(0, r - 0.012, segLen * (k / 3)), back, BH * (0.13 + 0.1 * f), BH * 0.022);
      }
      put(neck[i], nb, quillMat, false);
      put(neck[i], nq, quillTip, false);
    }
    // back: smaller quills over the shoulders, hips and the first tail segments
    for (let k = 0; k < 9; k++) {
      const zf = 0.4 - (k / 8) * 0.8;
      quill(qb, qt, v3(0, BH * 0.47, BL * zf), back, BH * (0.1 - 0.02 * Math.abs(zf)), BH * 0.02);
    }
    put(torso, qb, quillMat, false);
    put(torso, qt, quillTip, false);
    for (let i = 0; i < 4; i++) {
      const tb: THREE.BufferGeometry[] = [], tq: THREE.BufferGeometry[] = [];
      for (let k = 0; k < 2; k++) quill(tb, tq, v3(0, tr(i) * 1.06 - 0.008, -tl * (k / 2)), back, 0.085 - 0.017 * i, 0.011 - 0.0015 * i);
      put(tail[i], tb, quillMat, false);
      put(tail[i], tq, quillTip, false);
    }
  }

  const saddleMount = grp(0, BH * 0.52, 0);
  torso.add(saddleMount);

  // ------------------------------------------------------------ skinned body + legs
  {
    const groups: THREE.Object3D[] = [torso, ...tail, ...neck, head];
    const legStart = groups.length;
    for (const l of legs) groups.push(l.hip, l.knee, l.ankle);
    const bones = attachBones(groups);
    const skel = new THREE.Skeleton(bones);
    const iTorso = 0, iTail = (i: number) => 1 + i, iNeck = (i: number) => 1 + tSeg + i, iHead = 1 + tSeg + nSeg;
    const nodes: LoftNode[] = [];
    nodes.push({ pos: wp(tail[tSeg - 1], 0, 0, -tl * 1.05), bone: iTail(tSeg - 1), w: Math.max(0.012, tr(tSeg) * 0.4), top: Math.max(0.012, tr(tSeg) * 0.42), bot: Math.max(0.012, tr(tSeg) * 0.4) });
    for (let i = tSeg - 1; i >= 0; i--) {
      const r = tr(i);
      nodes.push({ pos: wp(tail[i]), bone: i === 0 ? iTorso : iTail(i - 1), w: r * 0.92, top: r * 1.1, bot: r * 1.0 });
    }
    // sleek torso: deep chest, tucked waist
    nodes.push({ pos: wp(torso, 0, BH * 0.03, -BL * 0.3), bone: iTorso, w: BW * 0.4, top: BH * 0.46, bot: BH * 0.44 });
    nodes.push({ pos: wp(torso, 0, -BH * 0.02, -BL * 0.04), bone: iTorso, w: BW * 0.44, top: BH * 0.48, bot: BH * 0.54 });
    nodes.push({ pos: wp(torso, 0, 0, BL * 0.26), bone: iTorso, w: BW * 0.42, top: BH * 0.46, bot: BH * 0.5 });
    for (let i = 0; i < nSeg; i++) {
      const r = neckR(i);
      // the throat is a touch deeper than the nape
      nodes.push({ pos: wp(neck[i]), bone: iNeck(i), w: r * 0.92, top: r * 1.0, bot: r * 1.12 });
    }
    nodes.push({ pos: wp(head, 0, HH * 0.02, 0), bone: iHead, w: HH * 0.44, top: HH * 0.4, bot: HH * 0.4 });
    nodes.push({ pos: wp(head, 0, HH * 0.06, HL * 0.18), bone: iHead, w: HH * 0.46, top: HH * 0.42, bot: HH * 0.32 });
    const buf = newBuffers();
    loft(buf, nodes, { ring: 22, perSeg: 5, up, uScale: 0.955 / pathLen(nodes), capStart: true, capEnd: true, noise: 0.01, seed: 271 });
    makeSkinned(root, buildSkinnedGeometry(buf), skin, skel);

    // legs: strong thigh tapering into long, slim digitigrade shins
    const lb = newBuffers();
    legs.forEach((l, k) => {
      if (!l.dims) return;
      const { tl: ltl, sl, ml, w } = l.dims;
      const bi = legStart + k * 3;
      const n2: LoftNode[] = [
        // rounded, closed hip dome buried inside the torso (an open ring here let you see the ground through the thigh)
        { pos: wp(l.hip, 0, w * 2.0, 0), bone: iTorso, w: w * 0.4, top: w * 0.4, bot: w * 0.4 },
        { pos: wp(l.hip, 0, w * 1.4, 0), bone: iTorso, w: w * 1.0, top: w * 1.45, bot: w * 1.35 },
        { pos: wp(l.hip), bone: bi, w: w * 1.22, top: w * 1.6, bot: w * 1.5 },
        { pos: wp(l.hip, 0, -ltl * 0.5, 0), bone: bi, w: w * 1.02, top: w * 1.25, bot: w * 1.2 },
        { pos: wp(l.knee), bone: bi + 1, w: w * 0.7, top: w * 0.8, bot: w * 0.76 },
        { pos: wp(l.knee, 0, -sl * 0.45, 0), bone: bi + 1, w: w * 0.48, top: w * 0.58, bot: w * 0.56 },
        { pos: wp(l.ankle), bone: bi + 2, w: w * 0.4, top: w * 0.48, bot: w * 0.46 },
        { pos: wp(l.ankle, 0, -ml * 0.92, 0), bone: bi + 2, w: w * 0.4, top: w * 0.44, bot: w * 0.42 },
      ];
      loft(lb, n2, { ring: 14, perSeg: 3, up: new THREE.Vector3(0, 0, 1), uScale: 0.955 / pathLen(n2), capStart: true, capEnd: true, noise: 0.015, seed: k * 13 + 5 });
    });
    makeSkinned(root, buildSkinnedGeometry(lb), legSkin, skel);
  }

  mergeByMaterial(root);
  root.scale.setScalar(scale);
  const materials = [skin, headSkin, legSkin, footMat, crestMat, frill.mat, flesh, armMat, chinMat, wattleMat, ringMat, boneMat, quillMat, quillTip, toothMat, clawMat, mouthMat, tongueMat, eyeMat, irisMat];
  return { root, body, torso, neck, head, jaw, legs, arms, tail, frill: frill.group, materials, spec, hipY, wings: [], saddleMount, saddle: null };
}
