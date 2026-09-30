import * as THREE from "three";
import type { ModelSpec } from "../data/species";
import type { CreatureRig, Leg } from "./models";
import { newBuffers, loft, buildSkinnedGeometry, attachBones, makeSkinned, wp, rigidLoft, type LoftNode } from "./skin";
import { grp, ell, cone, put, spike } from "./doedicurus";
import { irisTexture, hideTexture, skinPoreTexture } from "../core/textures";
import { mergeByMaterial } from "../core/merge";
import { paintRexBody, paintRexHead, paintRexLeg, paintRexFoot, paintRexPlate, type MapPair } from "./rexTextures";

/**
 * TYRANNOSAURUS REX (ARK Mobile look):
 *  - brick-rust hide of very fine pebbly scales, a blue-mauve band along the spine, clusters of lavender oval
 *    osteoderms on the flanks, thighs and tail, tan belly and throat with dark wrinkles;
 *  - rust legs with a ladder of blue plates down the front of the shin and over the toes, big dark claws;
 *  - a fan crest of flat ribbed plates from the brow, over the nape and down the back, thin dark bristles on the tail;
 *  - huge deep skull with a blue rugose brow (no horns), banana teeth and an amber eye;
 *  - tiny two-clawed arms with blue forearms.
 * The rig is the same as every generic biped (torso, neck[], head, jaw, legs, arms, tail[]) so the shared
 * creature animation drives it unchanged.
 */

// ---------------------------------------------------------------- textures (built once, shared by every rex)
interface Maps { map: THREE.CanvasTexture; bump: THREE.CanvasTexture }
interface RexTex { body: Maps; head: Maps; leg: Maps; foot: Maps; plate: THREE.CanvasTexture }
let texCache: RexTex | null = null;

function toTex(c: HTMLCanvasElement, color: boolean) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.anisotropy = 4;
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const toMaps = (p: MapPair): Maps => ({ map: toTex(p.color, true), bump: toTex(p.bump, false) });
function rexTextures(): RexTex {
  if (!texCache) texCache = { body: toMaps(paintRexBody()), head: toMaps(paintRexHead()), leg: toMaps(paintRexLeg()), foot: toMaps(paintRexFoot()), plate: toTex(paintRexPlate(), true) };
  return texCache;
}

// ---------------------------------------------------------------- helpers
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const sstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
/** Tapered limb pointing down (-Y) from the origin. */
function limbDown(r0: number, r1: number, len: number, seg = 10) {
  const g = new THREE.CylinderGeometry(r0, r1, len, seg);
  g.translate(0, -len / 2, 0);
  return g;
}
/** Flat, tapered fan-crest plate. Broad side faces left/right (it lies in the spine plane), leans back (-Z) by `lean`. */
function blade(len: number, h: number, thick: number, at: THREE.Vector3, lean = 0.55) {
  const g = new THREE.CylinderGeometry(len * 0.3, len * 0.72, h, 4, 1);
  g.rotateY(Math.PI / 4);
  g.scale(thick / (len * 0.72 * 1.4142), 1, 1);
  g.translate(0, h / 2, 0);
  g.rotateX(-lean);
  g.translate(at.x, at.y, at.z);
  return g;
}
/** Total centre-line length of a loft, used to make the texture span exactly one repeat. */
function pathLen(nodes: LoftNode[]) {
  let s = 0;
  for (let i = 1; i < nodes.length; i++) s += nodes[i].pos.distanceTo(nodes[i - 1].pos);
  return s;
}

// ---------------------------------------------------------------- builder
export function buildRex(spec: ModelSpec, key: string, scale = 1): CreatureRig {
  void key;
  const BL = spec.bodyLen, BH = spec.bodyH, BW = spec.bodyW;
  const HL = spec.headLen, HH = spec.headH;
  const T = rexTextures();
  const pores = skinPoreTexture();

  const skin = new THREE.MeshStandardMaterial({ map: T.body.map, bumpMap: T.body.bump, bumpScale: 2.2, roughness: 0.82, metalness: 0 });
  const headSkin = new THREE.MeshStandardMaterial({ map: T.head.map, bumpMap: T.head.bump, bumpScale: 2.0, roughness: 0.82 });
  // double-sided as a safety net: the thigh is a thin skinned tube and must never show the ground through a gap
  const legSkin = new THREE.MeshStandardMaterial({ map: T.leg.map, bumpMap: T.leg.bump, bumpScale: 2.4, roughness: 0.84, side: THREE.DoubleSide });
  const footMat = new THREE.MeshStandardMaterial({ map: T.foot.map, bumpMap: T.foot.bump, bumpScale: 2.4, roughness: 0.86 });
  const plateMat = new THREE.MeshStandardMaterial({ map: T.plate, roughness: 0.72 });
  // plain-colour materials for small add-ons (sphere/cylinder UVs would smear the big maps)
  const flesh = new THREE.MeshStandardMaterial({ color: "#a3603f", roughness: 0.84, bumpMap: pores, bumpScale: 0.9 });
  const armMat = new THREE.MeshStandardMaterial({ color: "#a05c3d", roughness: 0.84, bumpMap: pores, bumpScale: 1.0 });
  const scuteMat = new THREE.MeshStandardMaterial({ color: "#6c6892", roughness: 0.62, bumpMap: pores, bumpScale: 1.2 });
  const chinMat = new THREE.MeshStandardMaterial({ color: "#d3b183", roughness: 0.82, bumpMap: pores, bumpScale: 0.9 });
  const bristleMat = new THREE.MeshStandardMaterial({ color: "#2f2624", roughness: 0.6 });
  const toothMat = new THREE.MeshStandardMaterial({ color: "#eae2c2", roughness: 0.45 });
  const clawMat = new THREE.MeshStandardMaterial({ color: "#2f3141", roughness: 0.4 });
  const mouthMat = new THREE.MeshStandardMaterial({ color: "#93372f", roughness: 0.85 });
  const tongueMat = new THREE.MeshStandardMaterial({ color: "#b2625b", roughness: 0.8 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: "#1a120a", roughness: 0.15, metalness: 0.1 });
  const irisMat = new THREE.MeshStandardMaterial({ map: irisTexture(spec.eye ?? "#e8901e", false), roughness: 0.15, metalness: 0.1 });
  // every material the creature code flashes red when hurt / disposes with the creature
  const materials = [skin, headSkin, legSkin, footMat, plateMat, flesh, armMat, scuteMat, chinMat, bristleMat, toothMat, clawMat, mouthMat, tongueMat, eyeMat, irisMat];

  const root = new THREE.Group();
  const body = grp();
  root.add(body);
  const hipY = spec.legLen;
  const torso = grp(0, hipY + BH * 0.2, 0);
  body.add(torso);
  const up = new THREE.Vector3(0, 1, 0);

  // ------------------------------------------------------------ legs (bones + rigid feet; skin is lofted later)
  const legs: Leg[] = [];
  const legX = BW * 0.36;
  for (const s of [-1, 1]) {
    const w = spec.legW;
    const L = spec.legLen;
    const tl = L * 0.45, sl = L * 0.42, ml = L * 0.28;
    const hip = grp(s * legX, hipY, -BL * 0.12);
    body.add(hip);
    const knee = grp(0, -tl, 0);
    hip.add(knee);
    const ankle = grp(0, -sl, 0);
    knee.add(ankle);
    // three big toes with heavy black claws + a raised dewclaw, hock pad
    const toes: THREE.BufferGeometry[] = [], claws: THREE.BufferGeometry[] = [];
    const toeY = -ml;
    for (let t = 0; t < 3; t++) {
      const a = (t - 1) * 0.46 + s * 0.03;
      const len = w * (t === 1 ? 3.1 : 2.6);
      const toe = rigidLoft(
        [
          { pos: new THREE.Vector3(0, toeY + w * 0.1, -w * 0.25), w: w * 0.5, top: w * 0.42, bot: w * 0.4 },
          { pos: new THREE.Vector3(0, toeY + w * 0.02, len * 0.5), w: w * 0.46, top: w * 0.34, bot: w * 0.32 },
          { pos: new THREE.Vector3(0, toeY - w * 0.04, len), w: w * 0.34, top: w * 0.26, bot: w * 0.24 },
        ],
        { ring: 10, perSeg: 3, up, capStart: true, capEnd: true, uScale: 0.8 },
      );
      toe.rotateY(a);
      toes.push(toe);
      const cl = cone(w * 0.2, w * 0.85, 6);
      cl.rotateX(Math.PI / 2 + 0.7);
      cl.translate(Math.sin(a) * (len + w * 0.3), toeY - w * 0.18, Math.cos(a) * (len + w * 0.3));
      claws.push(cl);
    }
    toes.push(ell(w * 0.55, w * 0.42, w * 0.6, 0, toeY + w * 0.15, -w * 0.3, 10));
    const dew = cone(w * 0.12, w * 0.5, 5);
    dew.rotateX(-Math.PI / 2 - 0.5);
    dew.translate(0, toeY + w * 1.1, -w * 0.9);
    claws.push(dew);
    put(ankle, toes, footMat);
    put(ankle, claws, clawMat);
    const rest: [number, number, number] = [-0.4, 0.95, -0.55];
    hip.rotation.x = rest[0];
    knee.rotation.x = rest[1];
    ankle.rotation.x = rest[2];
    legs.push({ hip, knee, ankle, front: false, side: s, rest, dims: { tl, sl, ml, w } });
  }

  // ------------------------------------------------------------ arms: tiny, two long claws, held against the chest
  const arms: Leg[] = [];
  {
    const a = Math.max(0.5, (spec.armLen ?? 0.35) * 1.7);
    const w = spec.legW * 0.72;
    for (const s of [-1, 1]) {
      const sh = grp(s * BW * 0.38, hipY + BH * 0.05, BL * 0.34);
      body.add(sh);
      put(sh, [limbDown(w * 0.75, w * 0.5, a * 0.55), ell(w * 0.75, w * 0.7, w * 0.8, 0, 0, 0, 10)], armMat);
      const el = grp(0, -a * 0.55, 0);
      sh.add(el);
      put(el, [limbDown(w * 0.5, w * 0.34, a * 0.5), ell(w * 0.48, w * 0.45, w * 0.5, 0, 0, 0, 8)], scuteMat);
      const hand = grp(0, -a * 0.5, 0);
      el.add(hand);
      const cl: THREE.BufferGeometry[] = [];
      for (const k of [-1, 1]) {
        const c = cone(w * 0.16, w * 1.3, 5);
        c.rotateX(Math.PI * 0.82);
        c.translate(k * w * 0.26, -w * 0.4, w * 0.25);
        cl.push(c);
      }
      put(hand, cl, clawMat);
      sh.rotation.x = -0.5;
      el.rotation.x = -0.9;
      arms.push({ hip: sh, knee: el, ankle: hand, front: true, side: s, rest: [-0.5, -0.9, 0] });
    }
  }

  // ------------------------------------------------------------ neck (3 vertebrae, thick and short)
  const neck: THREE.Group[] = [];
  const nSeg = 3;
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

  // ------------------------------------------------------------ tail (5 segments, thick base, spiked ridge)
  const tail: THREE.Group[] = [];
  const tSeg = 5;
  const tl = spec.tailLen / tSeg;
  const tr = (i: number) => BW * 0.4 * Math.pow(0.72, i);
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
  const skullNodes = [
    { z: -0.1, y: 0.02, w: 0.6, top: 0.46, bot: 0.4 },
    { z: 0.16, y: 0.1, w: 0.68, top: 0.55, bot: 0.38, ridge: 0.05 },
    { z: 0.42, y: 0.1, w: 0.52, top: 0.48, bot: 0.32, ridge: 0.05 },
    { z: 0.7, y: 0.06, w: 0.44, top: 0.42, bot: 0.27 },
    { z: 0.96, y: 0.02, w: 0.4, top: 0.34, bot: 0.24 },
  ];
  const skull = rigidLoft(
    skullNodes.map((n) => ({ pos: new THREE.Vector3(0, HH * n.y, HL * n.z), w: HH * n.w, top: HH * n.top, bot: HH * n.bot, ridge: n.ridge ? HH * n.ridge : 0 })),
    { ring: 22, perSeg: 5, up, capStart: true, capEnd: true, squareness: 2.6, uScale: 0.19, noise: 0.012, seed: 5 },
  );
  put(head, skull, headSkin);
  // profile helpers: top surface height and half-width along the skull
  const topAt = (zf: number) => {
    for (let i = 0; i < skullNodes.length - 1; i++) {
      const a = skullNodes[i], b = skullNodes[i + 1];
      if (zf <= b.z) {
        const t = sstep(a.z, b.z, zf);
        return HH * lerp(a.y + a.top, b.y + b.top, t);
      }
    }
    const e = skullNodes[skullNodes.length - 1];
    return HH * (e.y + e.top);
  };
  const halfW = (zf: number) => {
    for (let i = 0; i < skullNodes.length - 1; i++) {
      const a = skullNodes[i], b = skullNodes[i + 1];
      if (zf <= b.z) return HH * lerp(a.w, b.w, sstep(a.z, b.z, zf));
    }
    return HH * skullNodes[skullNodes.length - 1].w;
  };
  // rounded nose pad, cheek muscle, nostrils
  put(head, [ell(HH * 0.4, HH * 0.3, HH * 0.24, 0, HH * 0.03, HL * 0.96, 14), ell(HH * 0.58, HH * 0.38, HL * 0.2, 0, HH * 0.03, HL * 0.04, 14)], flesh);
  for (const s of [-1, 1]) put(head, ell(HH * 0.055, HH * 0.04, HH * 0.09, s * HH * 0.17, topAt(0.93) - HH * 0.02, HL * 0.93, 8), mouthMat, false);
  // rugose nasal ridge
  {
    const bumps: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 7; i++) {
      const zf = 0.42 + i * 0.075;
      bumps.push(ell(HH * (0.1 - i * 0.008), HH * 0.05, HH * 0.09, 0, topAt(zf) - HH * 0.01, HL * zf, 6));
    }
    put(head, bumps, scuteMat, false);
  }
  // eyes, heavy hooded lids, brow ridge
  for (const s of [-1, 1]) {
    const er = HH * 0.115;
    const ex = s * halfW(0.36) * 0.94, ey = HH * 0.3, ez = HL * 0.36;
    const eye = new THREE.Mesh(new THREE.SphereGeometry(er, 14, 10), eyeMat);
    eye.position.set(ex, ey, ez);
    head.add(eye);
    const iris = new THREE.Mesh(new THREE.CircleGeometry(er * 0.84, 18), irisMat);
    iris.name = "iris";
    iris.position.set(ex + s * er * 0.94, ey, ez + er * 0.05);
    iris.rotation.y = (s * Math.PI) / 2;
    head.add(iris);
    const lid = new THREE.Mesh(new THREE.SphereGeometry(er * 1.16, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.46), flesh);
    lid.position.set(ex, ey, ez);
    lid.rotation.z = -s * 0.45;
    head.add(lid);
    const lower = new THREE.Mesh(new THREE.SphereGeometry(er * 1.1, 12, 6, 0, Math.PI * 2, Math.PI * 0.78, Math.PI * 0.22), flesh);
    lower.position.set(ex, ey - er * 0.05, ez);
    head.add(lower);
    // low, smooth brow ridge (no horns or spikes)
    put(head, [ell(HH * 0.15, HH * 0.075, HH * 0.3, s * halfW(0.3) * 0.86, ey + HH * 0.17, HL * 0.28, 10)], scuteMat, false);
    // bochecha sob o olho (sem chifre)
    put(head, [ell(HH * 0.1, HH * 0.07, HH * 0.14, s * halfW(0.42) * 0.96, ey - HH * 0.12, HL * 0.42, 8)], flesh, false);
  }
  // upper palate + upper teeth (big banana teeth, largest around the middle of the row)
  {
    const teeth: THREE.BufferGeometry[] = [];
    const n = 9;
    for (let i = 0; i < n; i++) {
      const zf = 0.4 + (i / (n - 1)) * 0.55;
      const mid = 1 - Math.abs((i - n * 0.4) / (n * 0.6));
      const th = HH * (0.15 + 0.19 * Math.max(0, mid));
      const rad = HH * (0.032 + 0.022 * Math.max(0, mid));
      for (const s of [-1, 1]) {
        const t = cone(rad, th, 5);
        t.rotateX(Math.PI);
        t.rotateZ(-s * 0.08);
        t.rotateX(-0.12);
        t.translate(s * halfW(zf) * 0.74, -HH * 0.09 - th * 0.35, HL * zf);
        teeth.push(t);
      }
    }
    for (let k = -2; k <= 2; k++) {
      const t = cone(HH * 0.03, HH * 0.13, 5);
      t.rotateX(Math.PI);
      t.translate(k * HH * 0.075, -HH * 0.1, HL * 0.975 - Math.abs(k) * HH * 0.01);
      teeth.push(t);
    }
    put(head, teeth, toothMat, false);
    put(head, [ell(HH * 0.36, HH * 0.035, HL * 0.34, 0, -HH * 0.19, HL * 0.62, 10)], mouthMat, false);
  }
  // jaw: lighter chin, dark mouth floor, tongue, lower teeth
  const jaw = grp(0, -HH * 0.18, HL * 0.12);
  head.add(jaw);
  put(
    jaw,
    rigidLoft(
      [
        { pos: new THREE.Vector3(0, 0, -HL * 0.02), w: HH * 0.44, top: HH * 0.14, bot: HH * 0.26 },
        { pos: new THREE.Vector3(0, -HH * 0.03, HL * 0.36), w: HH * 0.4, top: HH * 0.12, bot: HH * 0.25 },
        { pos: new THREE.Vector3(0, -HH * 0.02, HL * 0.66), w: HH * 0.34, top: HH * 0.1, bot: HH * 0.21 },
        { pos: new THREE.Vector3(0, 0, HL * 0.84), w: HH * 0.3, top: HH * 0.08, bot: HH * 0.17 },
      ],
      { ring: 14, perSeg: 4, up, capStart: true, capEnd: true, uScale: 0.19 },
    ),
    chinMat,
  );
  put(jaw, [ell(HH * 0.3, HH * 0.03, HL * 0.34, 0, HH * 0.1, HL * 0.42, 10)], mouthMat, false);
  put(jaw, [ell(HH * 0.16, HH * 0.05, HL * 0.22, 0, HH * 0.13, HL * 0.34, 10)], tongueMat, false);
  {
    const lo: THREE.BufferGeometry[] = [];
    const n = 8;
    for (let i = 0; i < n; i++) {
      const zf = 0.3 + (i / (n - 1)) * 0.5;
      const th = HH * (0.1 + 0.08 * (1 - Math.abs((i - n * 0.45) / (n * 0.6))));
      for (const s of [-1, 1]) {
        const t = cone(HH * 0.028, th, 5);
        t.rotateZ(s * 0.1);
        t.translate(s * HH * (0.31 - zf * 0.12), HH * 0.1 + th * 0.4, HL * zf);
        lo.push(t);
      }
    }
    put(jaw, lo, toothMat, false);
  }

  // ------------------------------------------------------------ fan crest of flat ribbed plates + thin tail bristles
  {
    const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    // brow → nape: five plates that grow toward the back of the skull
    const crown: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 5; k++) {
      const zf = 0.34 - k * 0.07;
      crown.push(blade(HL * 0.1, HH * (0.2 + 0.05 * k), HH * 0.05, v(0, topAt(zf) - HH * 0.03, HL * zf), 0.6));
    }
    put(head, crown, plateMat, false);
    // neck: three shingled plates per vertebra, tallest near the head
    for (let i = 0; i < nSeg; i++) {
      const r = lerp(BW * 0.3 * (spec.neckThick ?? 1), HH * 0.5, i / nSeg);
      const pl: THREE.BufferGeometry[] = [];
      for (let k = 0; k < 3; k++) {
        const f = (i + k / 3) / nSeg;
        pl.push(blade(BH * 0.11, BH * (0.13 + 0.06 * f), BH * 0.03, v(0, r * 1.0 - 0.02, segLen * (k / 3)), 0.55));
      }
      put(neck[i], pl, plateMat, false);
    }
    // back: taller over the shoulders, low under the saddle, small again toward the hips
    const back: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 9; k++) {
      const zf = 0.44 - (k / 8) * 0.86;
      back.push(blade(BH * 0.09, BH * (0.065 + 0.085 * sstep(0.05, 0.44, zf)), BH * 0.026, v(0, BH * 0.49, BL * zf), 0.5));
    }
    put(torso, back, plateMat, false);
    // tail: a few thin dark bristles along the top of the last segments
    for (let i = 2; i < tSeg; i++) {
      const r = tr(i);
      const br: THREE.BufferGeometry[] = [];
      for (let k = 0; k < 3; k++) br.push(spike(0.012, 0.13 + 0.03 * (tSeg - i), v(0, 1, -0.7), v(0, r * 1.02, -tl * (k / 3)), 4));
      put(tail[i], br, bristleMat, false);
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
    nodes.push({ pos: wp(tail[tSeg - 1], 0, 0, -tl * 1.05), bone: iTail(tSeg - 1), w: Math.max(0.02, tr(tSeg) * 0.4), top: Math.max(0.02, tr(tSeg) * 0.45), bot: Math.max(0.02, tr(tSeg) * 0.4) });
    for (let i = tSeg - 1; i >= 0; i--) {
      const r = tr(i);
      nodes.push({ pos: wp(tail[i]), bone: i === 0 ? iTorso : iTail(i - 1), w: r, top: r * 1.12, bot: r * 1.0 });
    }
    nodes.push({ pos: wp(torso, 0, BH * 0.03, -BL * 0.3), bone: iTorso, w: BW * 0.5, top: BH * 0.5, bot: BH * 0.48 });
    nodes.push({ pos: wp(torso, 0, -BH * 0.02, -BL * 0.02), bone: iTorso, w: BW * 0.54, top: BH * 0.52, bot: BH * 0.6 });
    nodes.push({ pos: wp(torso, 0, 0, BL * 0.26), bone: iTorso, w: BW * 0.5, top: BH * 0.5, bot: BH * 0.54 });
    const nt = spec.neckThick ?? 1;
    for (let i = 0; i < nSeg; i++) {
      const t = i / nSeg;
      const r = lerp(BW * 0.3 * nt, HH * 0.5, t);
      nodes.push({ pos: wp(neck[i]), bone: iNeck(i), w: r, top: r * 1.06, bot: r * 1.14 });
    }
    nodes.push({ pos: wp(head, 0, HH * 0.02, 0), bone: iHead, w: HH * 0.5, top: HH * 0.44, bot: HH * 0.44 });
    nodes.push({ pos: wp(head, 0, HH * 0.1, HL * 0.22), bone: iHead, w: HH * 0.52, top: HH * 0.42, bot: HH * 0.34 });
    const buf = newBuffers();
    loft(buf, nodes, { ring: 24, perSeg: 5, up, uScale: 0.955 / pathLen(nodes), capStart: true, capEnd: true, noise: 0.012, seed: 314 });
    makeSkinned(root, buildSkinnedGeometry(buf), skin, skel);

    // legs: huge thighs tapering into slim shins (rust, with the blue plate ladder painted on the leg map)
    const lb = newBuffers();
    legs.forEach((l, k) => {
      if (!l.dims) return;
      const { tl: ltl, sl, ml, w } = l.dims;
      const bi = legStart + k * 3;
      const n2: LoftNode[] = [
        // rounded, closed hip dome buried inside the torso (an open ring here let you see the ground through the thigh)
        { pos: wp(l.hip, 0, w * 2.2, 0), bone: iTorso, w: w * 0.4, top: w * 0.4, bot: w * 0.4 },
        { pos: wp(l.hip, 0, w * 1.6, 0), bone: iTorso, w: w * 1.45, top: w * 1.8, bot: w * 1.7 },
        { pos: wp(l.hip), bone: bi, w: w * 1.85, top: w * 2.1, bot: w * 2.0 },
        { pos: wp(l.hip, 0, -ltl * 0.5, 0), bone: bi, w: w * 1.5, top: w * 1.65, bot: w * 1.6 },
        { pos: wp(l.knee), bone: bi + 1, w: w * 1.0, top: w * 1.05, bot: w * 1.0 },
        { pos: wp(l.knee, 0, -sl * 0.45, 0), bone: bi + 1, w: w * 0.66, top: w * 0.74, bot: w * 0.74 },
        { pos: wp(l.ankle), bone: bi + 2, w: w * 0.54, top: w * 0.6, bot: w * 0.58 },
        { pos: wp(l.ankle, 0, -Math.max(ml * 0.85, w * 0.3), 0), bone: bi + 2, w: w * 0.5, top: w * 0.54, bot: w * 0.52 },
      ];
      loft(lb, n2, { ring: 14, perSeg: 3, up: new THREE.Vector3(0, 0, 1), uScale: 0.955 / pathLen(n2), capStart: true, capEnd: true, noise: 0.02, seed: k * 13 + 3 });
    });
    makeSkinned(root, buildSkinnedGeometry(lb), legSkin, skel);
  }

  mergeByMaterial(root);
  root.scale.setScalar(scale);
  return { root, body, torso, neck, head, jaw, legs, arms, tail, frill: null, materials, spec, hipY, wings: [], saddleMount, saddle: null };
}

// ---------------------------------------------------------------- saddle (leather seat, girth straps, ropes, rings, head harness)
export function buildRexSaddle(spec: ModelSpec): THREE.Object3D {
  const leather = new THREE.MeshStandardMaterial({ map: hideTexture(), color: "#a8703a", roughness: 0.8 });
  const strap = new THREE.MeshStandardMaterial({ color: "#7a4a28", roughness: 0.85 });
  const dark = new THREE.MeshStandardMaterial({ color: "#4f3019", roughness: 0.9 });
  const rope = new THREE.MeshStandardMaterial({ color: "#d3c7a4", roughness: 0.92 });
  const steel = new THREE.MeshStandardMaterial({ color: "#9aa0a2", metalness: 0.7, roughness: 0.35 });
  const gr = new THREE.Group();
  const W = spec.bodyW, L = spec.bodyLen, H = spec.bodyH;
  const add = (geos: THREE.BufferGeometry[], mat: THREE.Material) => put(gr, geos, mat, true);
  // seat: dark padded base, leather cushion, raised pommel and cantle
  add([ell(W * 0.34, 0.1, L * 0.2, 0, 0.02, 0, 16)], dark);
  add([ell(W * 0.28, 0.1, L * 0.16, 0, 0.11, -L * 0.005, 16)], leather);
  add([ell(W * 0.13, 0.15, 0.09, 0, 0.19, L * 0.17, 12), ell(W * 0.05, 0.05, 0.05, 0, 0.35, L * 0.17, 8)], leather);
  add([ell(W * 0.22, 0.19, 0.09, 0, 0.21, -L * 0.17, 12)], leather);
  // side skirts hugging the ribs
  const skirts: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    const sk = ell(0.05, H * 0.2, L * 0.16, 0, 0, 0, 12);
    sk.rotateZ(s * 0.28);
    sk.translate(s * W * 0.47, -H * 0.2, 0);
    skirts.push(sk);
  }
  add(skirts, leather);
  // girth straps around the barrel, chest strap and breeching
  const ring = (zf: number, sx: number, sy: number, wide: number) => {
    const t = new THREE.TorusGeometry(1, 0.028, 6, 36);
    t.scale(sx, sy, wide);
    t.translate(0, -H * 0.56, L * zf);
    return t;
  };
  add([ring(0.1, W * 0.56, H * 0.58, 3.4), ring(-0.09, W * 0.56, H * 0.58, 3.0), ring(0.3, W * 0.51, H * 0.55, 2.2), ring(-0.32, W * 0.47, H * 0.5, 2.2)], strap);
  // rope loops on the saddle flanks (the original hangs coiled rope there) and steel D-rings + buckles at the sides
  const ropes: THREE.BufferGeometry[] = [];
  const bits: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    const r = new THREE.TorusGeometry(0.11, 0.014, 6, 18);
    r.rotateY(Math.PI / 2);
    r.translate(s * W * 0.33, 0.2, L * 0.02);
    ropes.push(r);
    for (const zf of [0.1, -0.09]) {
      const t = new THREE.TorusGeometry(0.055, 0.014, 6, 14);
      t.rotateY(Math.PI / 2);
      t.translate(s * W * 0.6, -H * 0.42, L * zf);
      bits.push(t);
      bits.push(new THREE.BoxGeometry(0.03, 0.09, 0.07).translate(s * W * 0.57, -H * 0.3, L * zf));
    }
  }
  add(ropes, rope);
  add(bits, steel);
  gr.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true; });

  // head harness (attached to the head bone by the creature code): straps around the skull, a strap down each
  // cheek and a steel ball at each corner of the mouth, like the original
  const HL = spec.headLen, HH = spec.headH;
  if (HL > 0 && HH > 0) {
    const bridle = new THREE.Group();
    const band = (zf: number, w: number, top: number, bot: number, yc: number) => {
      const t = new THREE.TorusGeometry(1, 0.035, 6, 28);
      t.scale(HH * w + 0.02, (HH * (top + bot)) / 2 + 0.02, 1.5);
      t.translate(0, HH * yc + (HH * (top - bot)) / 2, HL * zf);
      return t;
    };
    put(bridle, [band(0.66, 0.44, 0.42, 0.27, 0.06), band(0.3, 0.64, 0.52, 0.36, 0.1), band(0.08, 0.62, 0.5, 0.4, 0.04)], strap, true);
    const cheek: THREE.BufferGeometry[] = [];
    const balls: THREE.BufferGeometry[] = [];
    for (const s of [-1, 1]) {
      const x = s * (HH * 0.66 + 0.03);
      cheek.push(new THREE.BoxGeometry(0.035, HH * 0.75, 0.06).rotateZ(s * 0.06).translate(x, HH * 0.32, HL * 0.3));
      balls.push(new THREE.SphereGeometry(HH * 0.085, 12, 10).translate(x + s * 0.01, HH * 0.0, HL * 0.3));
    }
    put(bridle, cheek, strap, true);
    put(bridle, balls, steel, true);
    gr.userData.headGear = bridle;
  }
  return gr;
}
