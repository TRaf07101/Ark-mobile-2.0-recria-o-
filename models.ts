import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { ModelSpec } from "../data/species";
import { skinTexture, clothTexture, hideTexture, scaleBumpTexture, skinPoreTexture, irisTexture, featherTexture, burlapTexture } from "../core/textures";
import { newBuffers, loft, buildSkinnedGeometry, attachBones, makeSkinned, wp, rigidLoft, type LoftNode } from "./skin";
import { itemModel } from "./itemModels";
import { mergeByMaterial } from "../core/merge";
import { buildDoedicurus, type DoedParts } from "./doedicurus";
import { buildRex, buildRexSaddle } from "./rex";
import { buildDilo } from "./dilo";
import { buildArgentavis, type ArgentParts } from "./argentavis";

// ---------------------------------------------------------------- geometry helpers
const SEG = 14;
function ell(rx: number, ry: number, rz: number, x = 0, y = 0, z = 0, seg = SEG) {
  const g = new THREE.SphereGeometry(1, seg, Math.max(6, Math.floor(seg * 0.7)));
  g.scale(rx, ry, rz);
  g.translate(x, y, z);
  return g;
}
/** Tapered limb along +Z from origin, radius r0 at start, r1 at end. */
function limbZ(r0: number, r1: number, len: number, rx = 1, seg = 10) {
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1, false);
  g.scale(rx, 1, 1);
  g.rotateX(Math.PI / 2);
  g.translate(0, 0, len / 2);
  return g;
}
/** Tapered limb pointing down (-Y) from origin. */
function limbDown(r0: number, r1: number, len: number, seg = 10) {
  const g = new THREE.CylinderGeometry(r0, r1, len, seg);
  g.translate(0, -len / 2, 0);
  return g;
}
function cone(r: number, h: number, seg = 8) {
  return new THREE.ConeGeometry(r, h, seg);
}
function merged(geos: THREE.BufferGeometry[]) {
  const clean = geos.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    if (!n.attributes.uv) n.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
    return n;
  });
  const m = mergeGeometries(clean)!;
  m.computeVertexNormals();
  return m;
}
function add(parent: THREE.Object3D, geos: THREE.BufferGeometry[] | THREE.BufferGeometry, mat: THREE.Material, cast = true) {
  const m = new THREE.Mesh(Array.isArray(geos) ? merged(geos) : geos, mat);
  m.castShadow = cast;
  m.receiveShadow = false;
  parent.add(m);
  return m;
}
function g(x = 0, y = 0, z = 0) {
  const o = new THREE.Group();
  o.position.set(x, y, z);
  return o;
}

// shared materials
const shared = {
  eye: new THREE.MeshStandardMaterial({ color: "#1a120a", roughness: 0.15, metalness: 0.1 }),
  eyeGlint: new THREE.MeshBasicMaterial({ color: "#ffffff" }),
  tooth: new THREE.MeshStandardMaterial({ color: "#efe6cc", roughness: 0.5 }),
  claw: new THREE.MeshStandardMaterial({ color: "#2b241c", roughness: 0.4 }),
  horn: new THREE.MeshStandardMaterial({ color: "#d9cba4", roughness: 0.6 }),
  mouth: new THREE.MeshStandardMaterial({ color: "#6b2a2a", roughness: 0.9 }),
};

// ---------------------------------------------------------------- creature rig
export interface Leg {
  hip: THREE.Group;
  knee: THREE.Group;
  ankle: THREE.Group;
  front: boolean;
  side: number;
  rest: [number, number, number];
  dims?: { tl: number; sl: number; ml: number; w: number };
}

export interface CreatureRig {
  root: THREE.Group; // world position / yaw
  body: THREE.Group; // roll (unconscious), bob, pitch
  torso: THREE.Group;
  neck: THREE.Group[];
  head: THREE.Group;
  jaw: THREE.Group;
  legs: Leg[];
  arms: Leg[];
  tail: THREE.Group[];
  frill: THREE.Object3D | null;
  materials: THREE.MeshStandardMaterial[];
  spec: ModelSpec;
  hipY: number;
  wings: THREE.Group[];
  wingJoints?: { sh: THREE.Group; el: THREE.Group; wr: THREE.Group; side: number }[];
  saddleMount: THREE.Group;
  saddle: THREE.Object3D | null;
  /** Doedicurus-only extras (ball pivot, plug, attack clock...). */
  doed?: DoedParts;
  /** Argentavis-only extras (wing joints, flap state, tail fan). */
  argent?: ArgentParts;
  /** Where a grabbed player hangs (Argentavis talons). */
  talonMount?: THREE.Object3D;
}

function buildLeg(parent: THREE.Object3D, mat: THREE.Material, spec: ModelSpec, front: boolean, side: number, x: number, y: number, z: number, heavy: boolean): Leg {
  const L = spec.legLen * (front && spec.form === "quad" ? spec.frontLegMult ?? 1 : 1);
  const w = spec.legW * (front ? 0.9 : 1);
  const hip = g(x, y, z);
  parent.add(hip);
  const theropod = spec.form === "biped";
  const tl = L * (theropod ? 0.45 : 0.5), sl = L * (theropod ? 0.42 : 0.5), ml = theropod ? L * 0.3 : L * 0.1;
  // thigh: muscular
  const knee = g(0, -tl, 0);
  hip.add(knee);
  const ankle = g(0, -sl, 0);
  knee.add(ankle);
  const foot: THREE.BufferGeometry[] = [];
  if (!theropod) {
    // elephantine pad foot for heavy quadrupeds
    foot.push(ell(w * (heavy ? 0.8 : 0.6), w * 0.35, w * (heavy ? 0.85 : 0.65), 0, -ml - w * 0.1, w * 0.1));
    add(ankle, foot, mat);
  }
  // toes & claws
  const toeY = -ml;
  const claws: THREE.BufferGeometry[] = [];
  const toes: THREE.BufferGeometry[] = [];
  const nToes = theropod ? 3 : heavy ? 4 : 3;
  for (let t = 0; t < nToes; t++) {
    const a = (t - (nToes - 1) / 2) * 0.45;
    const tlen = w * (theropod ? 2.2 : 0.9) * (t === 1 ? 1.1 : 0.9);
    const toe = limbZ(w * (theropod ? 0.28 : 0.35), w * 0.18, tlen);
    toe.rotateY(a);
    toe.translate(0, toeY, 0);
    toes.push(toe);
    const cl = cone(w * 0.16, w * 0.6, 5);
    cl.rotateX(Math.PI / 2 + 0.5);
    cl.translate(Math.sin(a) * tlen, toeY - w * 0.12, Math.cos(a) * tlen);
    claws.push(cl);
  }
  if (spec.extras?.includes("sickle") && theropod) {
    const s = cone(w * 0.2, w * 1.4, 5);
    s.rotateX(-0.4);
    s.translate(side * w * 0.3, toeY + w * 0.6, w * 0.3);
    claws.push(s);
  }
  add(ankle, toes, mat);
  add(ankle, claws, shared.claw);
  const pillar = spec.extras?.includes("sauropod");
  if (spec.extras?.includes("sprawl")) hip.rotation.z = side * 0.9;
  const rest: [number, number, number] = theropod ? [-0.4, 0.95, -0.55] : pillar ? (front ? [0.02, -0.05, 0.03] : [-0.06, 0.1, -0.04]) : front ? [0.08, -0.14, 0.06] : [-0.2, 0.34, -0.14];
  hip.rotation.x = rest[0];
  knee.rotation.x = rest[1];
  ankle.rotation.x = rest[2];
  return { hip, knee, ankle, front, side, rest, dims: { tl, sl, ml, w } };
}

/** Procedural creature builder driven by ModelSpec (all species share this code). */
export function buildCreature(spec: ModelSpec, key: string, scale = 1): CreatureRig {
  if (spec.extras?.includes("trex")) return buildRex(spec, key, scale);
  if (spec.extras?.includes("dilo")) return buildDilo(spec, key, scale);
  if (spec.extras?.includes("dodo")) return buildDodo(spec, key, scale);
  if (spec.extras?.includes("doedicurus")) return buildDoedicurus(spec, key, scale);
  if (spec.extras?.includes("argent")) return buildArgentavis(spec, key, scale);
  const skinMap = skinTexture(key, spec.color, spec.belly, spec.accent, spec.pattern ?? "plain");
  const bump = scaleBumpTexture();
  const skin = new THREE.MeshStandardMaterial({ map: skinMap, bumpMap: bump, bumpScale: 2.2, roughness: 0.78, metalness: 0 });
  const accentMat = new THREE.MeshStandardMaterial({ color: spec.accent, roughness: 0.7 });
  const bellyMat = new THREE.MeshStandardMaterial({ color: spec.belly, roughness: 0.85 });
  const materials = [skin, accentMat, bellyMat];
  const ex = spec.extras ?? [];
  const root = new THREE.Group();
  const body = g();
  root.add(body);
  const fish = spec.form === "fish";
  const hipY = fish ? 0 : spec.legLen * (spec.form === "quad" ? 1.02 : 1.0);
  const torso = g(0, hipY + spec.bodyH * 0.2, 0);
  body.add(torso);
  const BL = spec.bodyLen, BH = spec.bodyH, BW = spec.bodyW;
  // torso masses: chest, belly, hips blended ellipsoids
  const torsoGeos = [
    ell(BW * 0.5, BH * 0.52, BL * 0.42, 0, 0, BL * 0.08),
    ell(BW * 0.46, BH * 0.46, BL * 0.3, 0, -BH * 0.02, -BL * 0.22),
    ell(BW * 0.42, BH * 0.5, BL * 0.24, 0, BH * 0.02, BL * 0.3),
  ];
  if (ex.includes("round")) torsoGeos.push(ell(BW * 0.58, BH * 0.58, BL * 0.5, 0, 0, 0));
  if (spec.form === "fish") void torsoGeos; // body replaced by continuous skin below
  void torsoGeos;

  // legs
  const legs: Leg[] = [];
  const arms: Leg[] = [];
  const heavy = ex.includes("heavy");
  const legX = BW * 0.36;
  if (fish) {
    // no legs: pectoral, dorsal and pelvic fins
    const fin = (w: number, h: number) => {
      const gg = new THREE.BufferGeometry();
      gg.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 0, h, -w * 0.6, 0, 0, -w], 3));
      gg.computeVertexNormals();
      return gg;
    };
    const finMat = new THREE.MeshStandardMaterial({ color: spec.color, side: THREE.DoubleSide, roughness: 0.7 });
    materials.push(finMat);
    const dorsal = new THREE.Mesh(fin(BL * 0.35, BH * 0.9), finMat);
    dorsal.position.set(0, BH * 0.4, BL * 0.1);
    torso.add(dorsal);
    for (const sd of [-1, 1]) {
      const pec = new THREE.Mesh(fin(BL * 0.25, BW * 0.9), finMat);
      pec.rotation.z = sd * (Math.PI / 2 + 0.5);
      pec.position.set(sd * BW * 0.4, -BH * 0.2, BL * 0.2);
      torso.add(pec);
    }
  } else if (spec.form === "quad") {
    const frontY = spec.legLen * (spec.frontLegMult ?? 1) * 1.02;
    for (const s of [-1, 1]) legs.push(buildLeg(body, skin, spec, true, s, s * legX, frontY, BL * 0.3, heavy));
    for (const s of [-1, 1]) legs.push(buildLeg(body, skin, spec, false, s, s * legX, hipY, -BL * 0.28, heavy));
    // pitch the torso when front legs are shorter (stegosaurus, parasaur)
    torso.rotation.x = Math.atan2(hipY - frontY, BL * 0.58) * 0.8;
    torso.position.y -= (hipY - frontY) * 0.35;
  } else {
    for (const s of [-1, 1]) legs.push(buildLeg(body, skin, spec, false, s, s * legX, hipY, -BL * 0.12, false));
    if (spec.armLen) {
      for (const s of [-1, 1]) {
        const sh = g(s * BW * 0.38, hipY + BH * 0.05, BL * 0.34);
        body.add(sh);
        const a = spec.armLen;
        add(sh, [limbDown(spec.legW * 0.55, spec.legW * 0.4, a * 0.55), ell(spec.legW * 0.55, spec.legW * 0.55, spec.legW * 0.6)], skin);
        const el = g(0, -a * 0.55, 0);
        sh.add(el);
        add(el, limbDown(spec.legW * 0.4, spec.legW * 0.3, a * 0.45), skin);
        const hand = g(0, -a * 0.45, 0);
        el.add(hand);
        const cl: THREE.BufferGeometry[] = [];
        for (let k = 0; k < 3; k++) {
          const c = cone(spec.legW * 0.1, spec.legW * 0.5, 4);
          c.rotateX(Math.PI * 0.8);
          c.translate((k - 1) * spec.legW * 0.15, -spec.legW * 0.1, spec.legW * 0.2);
          cl.push(c);
        }
        add(hand, cl, shared.claw);
        if (ex.includes("feathers")) {
          const f = new THREE.BoxGeometry(0.02, a * 0.9, a * 0.35);
          f.translate(s * spec.legW * 0.3, -a * 0.35, -a * 0.12);
          add(sh, f, accentMat);
        }
        sh.rotation.x = -0.5;
        el.rotation.x = -0.9;
        arms.push({ hip: sh, knee: el, ankle: hand, front: true, side: s, rest: [-0.5, -0.9, 0] });
      }
    }
  }
  const wings: THREE.Group[] = [];
  const wingJoints: { sh: THREE.Group; el: THREE.Group; wr: THREE.Group; side: number }[] = [];
  if (ex.includes("ptera")) {
    // ---- Pteranodon (ARK): skinned membrane on a 3-joint arm (humerus → forearm → elongated 4th finger),
    // attached to the flank and ankle; small clawed fingers at the wrist; veined, slightly translucent skin.
    const veinCv = document.createElement("canvas");
    veinCv.width = 256; veinCv.height = 128;
    const vx = veinCv.getContext("2d")!;
    const gM = vx.createLinearGradient(0, 0, 0, 128);
    gM.addColorStop(0, spec.color); gM.addColorStop(1, spec.belly);
    vx.fillStyle = gM; vx.fillRect(0, 0, 256, 128);
    vx.strokeStyle = "rgba(60,30,20,0.35)";
    for (let i = 0; i < 26; i++) { vx.lineWidth = 1 + (i % 3); vx.beginPath(); vx.moveTo((i / 26) * 256, 0); vx.bezierCurveTo((i / 26) * 256 + 10, 50, (i / 26) * 256 - 10, 90, (i / 26) * 256 + 4, 128); vx.stroke(); }
    vx.fillStyle = "rgba(90,40,25,0.5)"; vx.fillRect(0, 0, 256, 10);
    const veinTex = new THREE.CanvasTexture(veinCv);
    veinTex.colorSpace = THREE.SRGBColorSpace;
    const memMat = new THREE.MeshStandardMaterial({ map: veinTex, side: THREE.DoubleSide, roughness: 0.7, transparent: true, opacity: 0.96 });
    materials.push(memMat);
    const span = BL * 3.4;
    const boneR = BW * 0.07;
    for (const sd of [-1, 1]) {
      const sh = g(sd * BW * 0.42, BH * 0.3, BL * 0.26);
      torso.add(sh);
      const el = g(sd * span * 0.27, 0.01, 0.03);
      sh.add(el);
      const wr = g(sd * span * 0.27, 0.02, -0.02);
      el.add(wr);
      const tipL = new THREE.Vector3(sd * span * 0.46, 0, -BL * 0.38);
      // visible arm bones with muscle on the humerus
      add(sh, [limbZ(boneR * 1.8, boneR * 1.1, span * 0.27).rotateY(sd * Math.PI / 2)], skin);
      add(el, [limbZ(boneR * 1.1, boneR * 0.9, span * 0.27).rotateY(sd * Math.PI / 2)], skin);
      const fl = tipL.length();
      const finger = limbZ(boneR * 0.9, boneR * 0.25, fl);
      finger.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), tipL.clone().normalize()));
      add(wr, finger, skin);
      const cl: THREE.BufferGeometry[] = [];
      for (let k = 0; k < 3; k++) cl.push(cone(boneR * 0.35, boneR * 2.2, 4).rotateX(Math.PI / 2 + 0.3).translate(sd * boneR * 0.5, -boneR * 0.3 + k * boneR * 0.35, boneR * 1.4 + k * boneR * 0.3));
      add(wr, cl, shared.claw);
      // membrane (skinned to sh/el/wr)
      const L0 = wp(sh), L1 = wp(el), L2 = wp(wr), L3 = wp(wr, tipL.x, tipL.y, tipL.z);
      const lead = new THREE.CatmullRomCurve3([L0, L1, L2, L3], false, "centripetal");
      const T0 = wp(torso, sd * BW * 0.3, -BH * 0.1, -BL * 0.3);
      const T1 = wp(el, sd * span * 0.08, -0.03, -BL * 0.58);
      const T2 = wp(wr, sd * span * 0.18, -0.01, -BL * 0.55);
      const trail = new THREE.CatmullRomCurve3([T0, T1, T2, L3], false, "centripetal");
      const d01 = L0.distanceTo(L1), d12 = L1.distanceTo(L2), d23 = L2.distanceTo(L3), tot = d01 + d12 + d23;
      const u1 = d01 / tot, u2 = (d01 + d12) / tot;
      const N = 28, M = 7;
      const pos: number[] = [], uv: number[] = [], si: number[] = [], sw: number[] = [], idx: number[] = [];
      for (let i = 0; i <= N; i++) {
        const u = i / N;
        const A = lead.getPointAt(u), Bt = trail.getPointAt(u);
        // bone weights by position along the leading edge, blended at the joints
        const blend = (edge: number, x: number) => THREE.MathUtils.clamp((x - (edge - 0.05)) / 0.1, 0, 1);
        const b1 = blend(u1, u), b2 = blend(u2, u);
        const w0 = 1 - b1, w1 = b1 - b2, w2 = b2;
        for (let j = 0; j <= M; j++) {
          const v = j / M;
          const P = A.clone().lerp(Bt, v);
          P.y -= Math.sin(v * Math.PI) * Math.sin(u * Math.PI) * BH * 0.12; // slight billow
          pos.push(P.x, P.y, P.z);
          uv.push(u, v);
          si.push(0, 1, 2, 0);
          sw.push(w0, Math.max(0, w1), w2, 0);
        }
      }
      for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) {
        const a = i * (M + 1) + j, b = a + M + 1;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
      const mg = new THREE.BufferGeometry();
      mg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      mg.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
      mg.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(si, 4));
      mg.setAttribute("skinWeight", new THREE.Float32BufferAttribute(sw, 4));
      mg.setIndex(idx);
      mg.computeVertexNormals();
      makeSkinned(root, mg, memMat, attachBones([sh, el, wr]));
      wingJoints.push({ sh, el, wr, side: sd });
    }
  }
  if (ex.includes("wings")) {
    const memMat = new THREE.MeshStandardMaterial({ color: spec.color, side: THREE.DoubleSide, roughness: 0.75, transparent: true, opacity: 0.95 });
    const boneMat = skin;
    materials.push(memMat);
    const span = BL * 3.2;
    for (const sd of [-1, 1]) {
      const sh = g(sd * BW * 0.4, BH * 0.25, BL * 0.2);
      torso.add(sh);
      // membrane: fan polygon from shoulder along the leading-edge bone to the wing tip and back to the hip
      const pts: number[] = [];
      const lead = [[0, 0, 0], [sd * span * 0.35, 0.08, BL * 0.15], [sd * span * 0.7, 0.05, BL * 0.05], [sd * span, 0, -BL * 0.25]];
      const trail = [[sd * span * 0.75, 0, -BL * 0.5], [sd * span * 0.45, 0, -BL * 0.7], [sd * span * 0.15, 0, -BL * 0.75], [0, 0, -BL * 0.55]];
      const all = [...lead, ...trail];
      for (let i = 1; i < all.length - 1; i++) pts.push(...all[0], ...all[i], ...all[i + 1]);
      const mg = new THREE.BufferGeometry();
      mg.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
      mg.computeVertexNormals();
      const mem = new THREE.Mesh(mg, memMat);
      mem.castShadow = true;
      sh.add(mem);
      for (let i = 0; i < lead.length - 1; i++) {
        const a = new THREE.Vector3(...(lead[i] as [number, number, number])), b = new THREE.Vector3(...(lead[i + 1] as [number, number, number]));
        const len = a.distanceTo(b);
        const bone = new THREE.CylinderGeometry(0.025, 0.035, len, 5);
        bone.translate(0, len / 2, 0);
        bone.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()));
        bone.translate(a.x, a.y, a.z);
        add(sh, bone, boneMat);
      }
      wings.push(sh);
    }
  }
  if (ex.includes("armorback")) {
    const os: THREE.BufferGeometry[] = [];
    for (let r = 0; r < 5; r++) for (let c = -2; c <= 2; c++) {
      const cc = cone(BW * 0.07, BH * 0.18, 5);
      const a = (c / 2.5) * 1.1;
      cc.rotateZ(-a);
      cc.translate(Math.sin(a) * BW * 0.5, Math.cos(a) * BH * 0.48, BL * (0.35 - r * 0.17));
      os.push(cc);
    }
    add(torso, [ell(BW * 0.56, BH * 0.3, BL * 0.46, 0, BH * 0.22, 0), ...os], accentMat);
  }
  if (ex.includes("wings_small")) {
    for (const s of [-1, 1]) {
      const w = ell(0.04, BH * 0.35, BL * 0.3, s * BW * 0.5, 0, -BL * 0.05, 8);
      add(torso, w, accentMat);
    }
  }

  // neck chain
  const neck: THREE.Group[] = [];
  const nSeg = spec.neckLen > 0.8 ? 3 : 2;
  let parent: THREE.Object3D = torso;
  const neckStart = g(0, BH * 0.18, BL * 0.44);
  torso.add(neckStart);
  parent = neckStart;
  const segLen = spec.neckLen / nSeg;
  for (let i = 0; i < nSeg; i++) {
    const n = g(0, 0, i === 0 ? 0 : segLen);
    parent.add(n);
    const r0 = BW * (0.3 - i * 0.05) * (spec.neckThick ?? 1), r1 = BW * (0.25 - i * 0.05) * (spec.neckThick ?? 1);
    void r0; void r1;
    // Spread the lift through the cervical vertebrae instead of hinging the
    // entire neck at its base (the old single hinge formed an unnatural arc).
    const lift = spec.form === "biped" ? spec.neckRise * 0.78 : spec.neckRise;
    n.rotation.x = -lift * (i === 0 ? 0.62 : i === 1 ? 0.26 : 0.12);
    neck.push(n);
    parent = n;
  }
  const head = g(0, 0, segLen);
  parent.add(head);
  head.rotation.x = spec.neckRise * 0.85;
  const HL = spec.headLen, HH = spec.headH;
  // skull + snout
  const sn = spec.snout ?? 0.3;
  const duck = ex.includes("duckbill");
  const up = new THREE.Vector3(0, 1, 0);
  const skullGeo = rigidLoft([
    { pos: new THREE.Vector3(0, HH * 0.02, -HL * 0.08), w: HH * 0.46, top: HH * 0.42, bot: HH * 0.4 },
    { pos: new THREE.Vector3(0, HH * 0.14, HL * 0.18), w: HH * 0.6, top: HH * 0.5, bot: HH * 0.36, ridge: HH * 0.05 },
    { pos: new THREE.Vector3(0, HH * 0.12, HL * 0.42), w: HH * 0.55, top: HH * 0.44, bot: HH * 0.3, ridge: HH * 0.06 },
    { pos: new THREE.Vector3(0, HH * 0.04, HL * 0.7), w: HH * Math.max(sn * 1.2, 0.3) * (duck ? 1.2 : 1), top: HH * Math.max(sn, 0.25) * 1.05, bot: HH * 0.2 },
    { pos: new THREE.Vector3(0, -HH * 0.02, HL * 0.98), w: HH * sn * (duck ? 1.55 : 0.95), top: HH * sn * (duck ? 0.45 : 0.8), bot: HH * sn * 0.5 },
  ], { ring: 18, perSeg: 4, up, capStart: true, capEnd: true, squareness: 2.3, uScale: 1 / (HH * 2.5) });
  add(head, skullGeo, skin);
  // nostrils
  for (const sd of [-1, 1]) add(head, ell(HH * 0.05, HH * 0.03, HH * 0.07, sd * HH * sn * 0.5, HH * sn * 0.55, HL * 0.92, 6), shared.mouth, false);
  // scutes / osteoderms along the back (large non-feathered carnivores)
  if (spec.teeth && !ex.includes("feathers")) {
    const sc: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 4; i++) sc.push(cone(HH * 0.05, HH * 0.1, 4).translate(0, HH * 0.6 - i * HH * 0.02, HL * (0.3 - i * 0.12)));
    add(head, sc, accentMat, false);
  }
  // eyes
  for (const s of [-1, 1]) {
    const er = HH * (ex.includes("bigeyes") ? 0.18 : 0.12); // Troodon: huge forward-facing night eyes
    const e = new THREE.Mesh(new THREE.SphereGeometry(er, 12, 10), shared.eye);
    e.position.set(s * HH * 0.5, HH * 0.24, HL * 0.36);
    head.add(e);
    const iris = new THREE.Mesh(new THREE.CircleGeometry(er * 0.82, 16), new THREE.MeshStandardMaterial({ map: irisTexture(spec.eye ?? (spec.teeth ? "#d8a020" : "#b07a30"), spec.teeth || spec.form !== "quad"), roughness: 0.15, metalness: 0.1 }));
    iris.position.set(s * (HH * 0.5 + er * 0.94), HH * 0.24, HL * 0.37);
    iris.rotation.y = s * Math.PI / 2;
    iris.name = "iris";
    head.add(iris);
    // eyelids (upper + lower), skin colored, slightly hooded
    const lid = new THREE.Mesh(new THREE.SphereGeometry(er * 1.12, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.42), skin);
    lid.position.copy(e.position);
    lid.rotation.z = -s * 0.5;
    lid.castShadow = false;
    head.add(lid);
    // brow ridge
    add(head, ell(HH * 0.14, HH * 0.06, HH * 0.22, s * HH * 0.42, HH * 0.36, HL * 0.3, 8), skin, false);
  }
  // jaw
  const jaw = g(0, -HH * 0.18, HL * 0.12);
  head.add(jaw);
  const jawGeo = rigidLoft([
    { pos: new THREE.Vector3(0, 0, -HL * 0.02), w: HH * 0.42, top: HH * 0.12, bot: HH * 0.22 },
    { pos: new THREE.Vector3(0, -HH * 0.03, HL * 0.4), w: HH * 0.38, top: HH * 0.1, bot: HH * 0.2 },
    { pos: new THREE.Vector3(0, -HH * 0.01, HL * 0.84), w: HH * sn * (duck ? 1.4 : 0.8), top: HH * 0.06, bot: HH * 0.12 },
  ], { ring: 14, perSeg: 4, up, capStart: true, capEnd: true, uScale: 1 / (HH * 2.5) });
  add(jaw, jawGeo, ex.includes("beak") ? accentMat : skin);
  const mouth = limbZ(HH * 0.32, HH * 0.18, HL * 0.75, 1.0);
  mouth.scale(0.9, 0.3, 1);
  mouth.translate(0, HH * 0.12, 0.02);
  add(jaw, mouth, shared.mouth, false);
  if (spec.teeth) {
    const up: THREE.BufferGeometry[] = [], lo: THREE.BufferGeometry[] = [];
    const n = 7;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const z = HL * (0.35 + t * 0.6);
      const w = HH * (0.42 - t * 0.2);
      for (const s of [-1, 1]) {
        const a = cone(HH * 0.035, HH * 0.14, 4);
        a.rotateX(Math.PI);
        a.translate(s * w, -HH * 0.16, z);
        up.push(a);
        const b = cone(HH * 0.03, HH * 0.11, 4);
        b.translate(s * w * 0.9, HH * 0.1, z * 0.95 - HL * 0.12);
        lo.push(b);
      }
    }
    add(head, up, shared.tooth, false);
    add(jaw, lo, shared.tooth, false);
  }
  if (ex.includes("beak")) {
    const b = cone(HH * 0.28, HL * 0.55, 8);
    b.rotateX(Math.PI / 2 + 0.35);
    b.translate(0, -HH * 0.05, HL * 1.0);
    const hook = cone(HH * 0.12, HH * 0.3, 6);
    hook.rotateX(Math.PI);
    hook.translate(0, -HH * 0.2, HL * 1.2);
    add(head, [b, hook], accentMat);
  }
  let frill: THREE.Object3D | null = null;
  if (ex.includes("frill")) {
    // bony shield (trike): one solid, closed, slightly curved plate rising from the back of the skull,
    // with epoccipital bumps all around the rim (previously an open cylinder slice → looked cut/hollow)
    const Rf = HH * 1.45;
    const shape = new THREE.Shape();
    const a0 = Math.PI + 0.42, a1 = -0.42;
    shape.moveTo(Math.cos(a0) * Rf * 0.95, Rf * 0.32 + Math.sin(a0) * Rf * 0.9);
    shape.absellipse(0, Rf * 0.32, Rf * 0.95, Rf * 0.9, a0, a1 + Math.PI * 2, true, 0);
    shape.quadraticCurveTo(0, -Rf * 0.28, Math.cos(a0) * Rf * 0.95, Rf * 0.32 + Math.sin(a0) * Rf * 0.9);
    const shield = new THREE.ExtrudeGeometry(shape, { depth: HH * 0.1, bevelEnabled: true, bevelThickness: HH * 0.04, bevelSize: HH * 0.05, bevelSegments: 2, curveSegments: 28 });
    shield.translate(0, 0, -HH * 0.05);
    // gentle concave curve (edges sweep forward like the real frill)
    const sp = shield.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < sp.count; i++) { const x = sp.getX(i), y = sp.getY(i); sp.setZ(i, sp.getZ(i) + (x * x) / (Rf * 3.2) - y * 0.05); }
    shield.computeVertexNormals();
    const frillM = new THREE.Matrix4().makeRotationX(-0.55).premultiply(new THREE.Matrix4().makeTranslation(0, HH * 0.38, -HL * 0.02));
    shield.applyMatrix4(frillM);
    add(head, shield, accentMat);
    // central ridge + vascular grooves in skin color
    const ridge = new THREE.BoxGeometry(HH * 0.12, Rf * 0.95, HH * 0.1);
    ridge.translate(0, Rf * 0.48, HH * 0.1);
    ridge.applyMatrix4(frillM);
    add(head, ridge, skin, false);
    const bumps: THREE.BufferGeometry[] = [];
    const nB = 17;
    for (let i = 0; i < nB; i++) {
      const a = a0 - (i / (nB - 1)) * (a0 - a1);
      const bx = Math.cos(a) * Rf * 1.0, by = Rf * 0.32 + Math.sin(a) * Rf * 0.94;
      const c = cone(HH * 0.1, HH * 0.26, 6);
      c.rotateZ(a - Math.PI / 2);
      c.translate(bx, by, (bx * bx) / (Rf * 3.2));
      c.applyMatrix4(frillM);
      bumps.push(c);
    }
    add(head, bumps, shared.horn);
  }
  if (ex.includes("neckfrill")) {
    // dilophosaurus retractable frill, opens when angry
    const f = new THREE.Group();
    const disk = new THREE.CylinderGeometry(HH * 1.6, HH * 1.6, 0.02, 18, 1, true, Math.PI * 0.15, Math.PI * 1.7);
    disk.rotateX(Math.PI / 2);
    add(f, disk, accentMat, false);
    (f.children[0] as THREE.Mesh).material = new THREE.MeshStandardMaterial({ color: spec.accent, side: THREE.DoubleSide, roughness: 0.7 });
    materials.push((f.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial);
    f.position.set(0, 0, -HL * 0.05);
    f.scale.setScalar(0.05);
    head.add(f);
    frill = f;
  }
  if (ex.includes("horns")) {
    const hs: THREE.BufferGeometry[] = [];
    for (const s of [-1, 1]) {
      const h = cone(HH * 0.13, HL * 0.95, 7);
      h.rotateX(Math.PI / 2 - 0.35);
      h.translate(s * HH * 0.34, HH * 0.62, HL * 0.62);
      hs.push(h);
    }
    const nose = cone(HH * 0.1, HH * 0.45, 6);
    nose.rotateX(0.3);
    nose.translate(0, HH * 0.3, HL * 0.9);
    hs.push(nose);
    add(head, hs, shared.horn);
  }
  if (ex.includes("browhorns")) {
    const hs: THREE.BufferGeometry[] = [];
    for (const s of [-1, 1]) {
      const h = cone(HH * 0.14, HH * 0.5, 6);
      h.rotateZ(-s * 0.9);
      h.translate(s * HH * 0.55, HH * 0.55, HL * 0.22);
      hs.push(h);
    }
    add(head, hs, shared.horn);
  }
  if (ex.includes("crest")) {
    for (const s of [-1, 1]) {
      const c = new THREE.BoxGeometry(0.025, HH * 0.4, HL * 0.8);
      c.translate(s * HH * 0.15, HH * 0.58, HL * 0.45);
      add(head, c, accentMat, false);
    }
  }
  if (ex.includes("tubecrest")) {
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, HH * 0.4, HL * 0.5), new THREE.Vector3(0, HH * 0.9, HL * 0.05), new THREE.Vector3(0, HH * 1.1, -HL * 0.6), new THREE.Vector3(0, HH * 0.8, -HL * 1.2)]);
    add(head, new THREE.TubeGeometry(curve, 16, HH * 0.14, 8), accentMat);
  }
  if (ex.includes("feathers")) {
    const fs: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 5; i++) {
      const f = new THREE.BoxGeometry(0.02, HH * 0.5, HH * 0.14);
      f.rotateX(-0.6 - i * 0.1);
      f.translate(0, HH * 0.55, HL * (0.2 - i * 0.1));
      fs.push(f);
    }
    add(head, fs, accentMat, false);
  }

  // ---- Part 4 signature anatomy
  if (ex.includes("dome")) {
    // Pachycephalosaurus: thick bony dome ringed with knobs and spikes
    // thick bony dome (ARK pachy: bumpy, lighter keratin dome)
    const dome = new THREE.SphereGeometry(HH * 0.68, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.6);
    dome.scale(1, 0.95, 1.12);
    dome.translate(0, HH * 0.28, HL * 0.2);
    add(head, dome, shared.horn);
    const knobs: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const k = cone(HH * 0.07, HH * (i % 2 ? 0.16 : 0.24), 5);
      k.rotateZ(-Math.cos(a) * 1.2);
      k.rotateX(Math.sin(a) * 1.2);
      k.translate(Math.cos(a) * HH * 0.6, HH * 0.3, HL * 0.2 + Math.sin(a) * HH * 0.66);
      knobs.push(k);
    }
    for (let i = 0; i < 5; i++) knobs.push(ell(HH * 0.06, HH * 0.05, HH * 0.06, (i - 2) * HH * 0.12, HH * 0.1, HL * 0.62, 6));
    add(head, knobs, accentMat);
  }
  if (ex.includes("crocsnout")) {
    // Spinosaurus: rosette at the snout tip and raised nostrils further back
    add(head, [ell(HH * 0.34, HH * 0.18, HL * 0.12, 0, -HH * 0.02, HL * 0.97), ell(HH * 0.1, HH * 0.08, HH * 0.18, 0, HH * 0.24, HL * 0.62, 6)], skin);
    const extra: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 6; i++) for (const sd of [-1, 1]) {
      const t = cone(HH * 0.04, HH * 0.2, 4);
      t.rotateX(Math.PI);
      t.translate(sd * HH * 0.22, -HH * 0.16, HL * (0.62 + i * 0.06));
      extra.push(t);
    }
    add(head, extra, shared.tooth, false);
  }
  if (ex.includes("sail")) {
    // Spinosaurus sail: neural spines with skin membrane, peaking over the hips
    // sail with dark vertical bands between the spines (like ARK's Spino), lighter trailing edge
    const sailCv = document.createElement("canvas");
    sailCv.width = 256; sailCv.height = 64;
    const sctx = sailCv.getContext("2d")!;
    const gradS = sctx.createLinearGradient(0, 64, 0, 0);
    gradS.addColorStop(0, spec.color); gradS.addColorStop(0.55, spec.accent); gradS.addColorStop(1, "#e0c08a");
    sctx.fillStyle = gradS; sctx.fillRect(0, 0, 256, 64);
    for (let i = 0; i < 13; i++) { sctx.fillStyle = "rgba(20,10,5,0.45)"; sctx.fillRect(i * 20 + 6, 0, 7, 64); }
    const sailTex = new THREE.CanvasTexture(sailCv);
    sailTex.colorSpace = THREE.SRGBColorSpace;
    const sailMat = new THREE.MeshStandardMaterial({ map: sailTex, side: THREE.DoubleSide, roughness: 0.7 });
    materials.push(sailMat);
    const n = 13, pos: number[] = [], spines: THREE.BufferGeometry[] = [];
    const prof = (t: number) => Math.pow(Math.sin(Math.min(1, t * 1.05) * Math.PI), 0.8) * BH * 1.45;
    for (let i = 0; i < n; i++) {
      const t0 = i / (n - 1), t1 = (i + 1) / (n - 1);
      const z0 = BL * (0.5 - t0 * 1.05), z1 = BL * (0.5 - t1 * 1.05);
      const y0 = BH * 0.42, h0 = prof(t0), h1 = prof(t1);
      if (i < n - 1) pos.push(0, y0, z0, 0, y0 + h0, z0, 0, y0, z1, 0, y0, z1, 0, y0 + h0, z0, 0, y0 + h1, z1);
      const sp2 = new THREE.CylinderGeometry(0.018, 0.045, h0 + BH * 0.08, 5);
      sp2.translate(0, y0 + (h0 + BH * 0.08) / 2 - BH * 0.04, z0);
      spines.push(sp2);
    }
    const mg = new THREE.BufferGeometry();
    mg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    const uvs: number[] = [];
    for (let i = 0; i < pos.length / 3; i++) uvs.push(0.5 - pos[i * 3 + 2] / (BL * 1.05), (pos[i * 3 + 1] - BH * 0.42) / (BH * 1.45));
    mg.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    mg.computeVertexNormals();
    const sailMesh = new THREE.Mesh(mg, sailMat);
    sailMesh.castShadow = true;
    sailMesh.name = "sail";
    torso.add(sailMesh);
    add(torso, spines, bellyMat);
  }
  if (ex.includes("sauropod")) {
    // Brontosaurus (ARK look): barrel body, high hips, vertical skin folds on the flanks, throat wrinkles,
    // boxy head with the nostril bump on top, peg teeth and heavy eyelids
    add(torso, [ell(BW * 0.42, BH * 0.3, BL * 0.25, 0, -BH * 0.34, BL * 0.1), ell(BW * 0.36, BH * 0.22, BL * 0.18, 0, BH * 0.34, BL * 0.25), ell(BW * 0.38, BH * 0.26, BL * 0.2, 0, BH * 0.3, -BL * 0.25)], skin);
    const folds: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 7; i++) for (const sd of [-1, 1]) {
      const f2 = new THREE.TorusGeometry(BH * 0.42, BW * 0.018, 4, 10, Math.PI * 0.55);
      f2.rotateY(Math.PI / 2);
      f2.rotateX(-Math.PI * 0.28);
      f2.translate(sd * BW * 0.49, -BH * 0.05, BL * (0.28 - i * 0.09));
      folds.push(f2);
    }
    add(torso, folds, skin, false);
    for (let i = 0; i < 6; i++) add(neck[Math.min(neck.length - 1, Math.floor(i / 2))], ell(BW * 0.14, BW * 0.05, spec.neckLen * 0.05, 0, -BW * 0.2, spec.neckLen * (0.05 + (i % 2) * 0.12)), bellyMat, false);
    add(head, [ell(HH * 0.34, HH * 0.26, HH * 0.4, 0, HH * 0.52, HL * 0.38)], skin);
    const pegs: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 8; i++) pegs.push(new THREE.CylinderGeometry(HH * 0.03, HH * 0.03, HH * 0.12, 4).translate((i - 3.5) * HH * 0.09, -HH * 0.14, HL * 0.93));
    add(head, pegs, shared.tooth, false);
  }
  if (ex.includes("casque")) {
    // Oviraptor: tall rounded keratin casque over the snout, short parrot-like toothless beak, wattle
    const cs = new THREE.Shape();
    cs.moveTo(-HL * 0.1, 0);
    cs.bezierCurveTo(-HL * 0.05, HH * 1.1, HL * 0.55, HH * 1.3, HL * 0.78, HH * 0.15);
    cs.lineTo(HL * 0.6, 0);
    cs.lineTo(-HL * 0.1, 0);
    const casque = new THREE.ExtrudeGeometry(cs, { depth: HH * 0.14, bevelEnabled: true, bevelThickness: HH * 0.04, bevelSize: HH * 0.04, bevelSegments: 2, curveSegments: 16 });
    casque.rotateY(-Math.PI / 2);
    casque.translate(HH * 0.07, HH * 0.32, 0);
    add(head, casque, accentMat);
    add(head, [cone(HH * 0.32, HH * 0.5, 8).rotateX(Math.PI / 2 + 0.5).translate(0, -HH * 0.1, HL * 0.95)], accentMat);
    add(head, ell(HH * 0.12, HH * 0.18, HH * 0.1, 0, -HH * 0.42, HL * 0.3, 8), accentMat, false);
  }
  if (ex.includes("osteoderms")) {
    // Megalosaurus: two rows of low bony scutes along the spine, neck and tail base
    const os: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 12; i++) for (const sd of [-1, 1]) os.push(new THREE.SphereGeometry(1, 6, 4).scale(BW * 0.05, BW * 0.035, BW * 0.07).translate(sd * BW * 0.1, BH * 0.5, BL * (0.42 - i * 0.078)));
    add(torso, os, accentMat);
    for (const n2 of neck) { const nd: THREE.BufferGeometry[] = []; for (let i = 0; i < 3; i++) for (const sd of [-1, 1]) nd.push(new THREE.SphereGeometry(1, 6, 4).scale(BW * 0.04, BW * 0.03, BW * 0.05).translate(sd * BW * 0.07, BW * 0.26, spec.neckLen / neck.length * (i / 3))); add(n2, nd, accentMat); }
  }
  if (ex.includes("ptera")) {
    // long toothless beak (upper + lower), tall backward crest, pycnofiber tufts on the neck
    add(head, rigidLoft([
      { pos: new THREE.Vector3(0, HH * 0.1, HL * 0.3), w: HH * 0.36, top: HH * 0.3, bot: HH * 0.18 },
      { pos: new THREE.Vector3(0, HH * 0.05, HL * 0.8), w: HH * 0.22, top: HH * 0.18, bot: HH * 0.1 },
      { pos: new THREE.Vector3(0, -HH * 0.02, HL * 1.35), w: HH * 0.08, top: HH * 0.07, bot: HH * 0.04 },
      { pos: new THREE.Vector3(0, -HH * 0.06, HL * 1.62), w: HH * 0.02, top: HH * 0.02, bot: HH * 0.01 },
    ], { ring: 12, perSeg: 4, up: new THREE.Vector3(0, 1, 0), capStart: true, capEnd: true }), accentMat);
    add(jaw, rigidLoft([
      { pos: new THREE.Vector3(0, -HH * 0.02, HL * 0.2), w: HH * 0.28, top: HH * 0.06, bot: HH * 0.12 },
      { pos: new THREE.Vector3(0, -HH * 0.04, HL * 0.9), w: HH * 0.14, top: HH * 0.05, bot: HH * 0.07 },
      { pos: new THREE.Vector3(0, -HH * 0.07, HL * 1.45), w: HH * 0.02, top: HH * 0.015, bot: HH * 0.02 },
    ], { ring: 10, perSeg: 4, up: new THREE.Vector3(0, 1, 0), capStart: true, capEnd: true }), accentMat);
    add(head, rigidLoft([
      { pos: new THREE.Vector3(0, HH * 0.35, HL * 0.2), w: HH * 0.12, top: HH * 0.1, bot: HH * 0.1 },
      { pos: new THREE.Vector3(0, HH * 0.6, -HL * 0.2), w: HH * 0.09, top: HH * 0.3, bot: HH * 0.16 },
      { pos: new THREE.Vector3(0, HH * 0.95, -HL * 0.75), w: HH * 0.06, top: HH * 0.22, bot: HH * 0.1 },
      { pos: new THREE.Vector3(0, HH * 1.15, -HL * 1.05), w: HH * 0.02, top: HH * 0.04, bot: HH * 0.02 },
    ], { ring: 10, perSeg: 4, up: new THREE.Vector3(0, 1, 0), capStart: true, capEnd: true, squareness: 3 }), accentMat);
    const tufts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 10; i++) tufts.push(cone(BW * 0.05, BW * 0.14, 4).rotateX(-0.9).translate((i % 2 - 0.5) * BW * 0.08, BW * 0.2, spec.neckLen * (i / 10)));
    add(neck[0], tufts, bellyMat, false);
  }
  if (ex.includes("ankylo")) {
    // ---- Ankylosaurus (ARK): flat armored shell of keeled oval osteoderms in rows, lateral flank spikes,
    // armored neck half-rings, horned head plates; the massive tail club is added in the tail loop.
    add(torso, [ell(BW * 0.56, BH * 0.34, BL * 0.47, 0, BH * 0.2, 0, 24)], skin);
    const plates: THREE.BufferGeometry[] = [], keels: THREE.BufferGeometry[] = [];
    const rows = 7;
    for (let r2 = 0; r2 < rows; r2++) {
      const zt = r2 / (rows - 1);
      const z = BL * (0.38 - zt * 0.78);
      const n = 5 + (r2 % 2);
      for (let k = 0; k < n; k++) {
        const a = ((k - (n - 1) / 2) / (n - 1)) * 2.1;
        const rx = Math.sin(a) * BW * 0.52, ry = BH * 0.2 + Math.cos(a) * BH * 0.36;
        const sz = BW * (0.1 - Math.abs(a) * 0.012) * (1 - Math.abs(zt - 0.45) * 0.4);
        const p = new THREE.SphereGeometry(1, 8, 6).scale(sz * 1.1, sz * 0.4, sz * 1.35).rotateZ(-a).translate(rx, ry, z);
        plates.push(p);
        const kl = cone(sz * 0.4, sz * (Math.abs(a) > 0.7 ? 1.2 : 0.7), 4).rotateZ(-a).translate(rx + Math.sin(a) * sz * 0.35, ry + Math.cos(a) * sz * 0.35, z);
        keels.push(kl);
      }
    }
    add(torso, plates, accentMat);
    add(torso, keels, shared.horn);
    const flank: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 7; i++) for (const sd of [-1, 1]) {
      const len = BW * (0.32 - i * 0.025);
      const c2 = cone(len * 0.28, len, 4);
      c2.rotateZ(-sd * (Math.PI / 2 + 0.3));
      c2.rotateY(sd * 0.35);
      c2.translate(sd * BW * 0.6, BH * 0.05, BL * (0.38 - i * 0.12));
      flank.push(c2);
    }
    add(torso, flank, shared.horn);
    const nk: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 2; i++) for (let k = -2; k <= 2; k++) {
      const a = k * 0.55;
      nk.push(new THREE.SphereGeometry(1, 6, 5).scale(BW * 0.06, BW * 0.03, BW * 0.07).rotateZ(-a).translate(Math.sin(a) * BW * 0.28, Math.cos(a) * BW * 0.28, spec.neckLen * (0.2 + i * 0.5)));
    }
    add(neck[0], nk, accentMat);
    const hh: THREE.BufferGeometry[] = [];
    for (const sd of [-1, 1]) {
      hh.push(cone(HH * 0.14, HH * 0.55, 5).rotateZ(-sd * 1.8).rotateY(sd * 0.6).translate(sd * HH * 0.62, HH * 0.42, HL * 0.05)); // squamosal
      hh.push(cone(HH * 0.12, HH * 0.42, 5).rotateZ(-sd * 2.5).rotateY(sd * 0.3).translate(sd * HH * 0.6, -HH * 0.1, HL * 0.15)); // quadratojugal
    }
    for (let i = 0; i < 6; i++) hh.push(new THREE.SphereGeometry(1, 6, 5).scale(HH * 0.14, HH * 0.05, HH * 0.14).translate(((i % 3) - 1) * HH * 0.26, HH * 0.52, HL * (0.12 + Math.floor(i / 3) * 0.2)));
    add(head, hh, shared.horn);
  }
  if (ex.includes("kentro")) {
    // ---- Kentrosaurus: paired plates over the neck/shoulders turning into long paired spikes over hips and tail,
    // plus a long spike on each shoulder pointing back
    const pl: THREE.BufferGeometry[] = [], sp2: THREE.BufferGeometry[] = [];
    const n = 8;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const z = BL * (0.42 - t * 0.9);
      for (const sd of [-1, 1]) {
        if (t < 0.45) {
          const h = BH * (0.35 + t * 0.6);
          pl.push(new THREE.CylinderGeometry(0.001, h * 0.45, h, 4).scale(0.14, 1, 1).rotateZ(-sd * 0.2).translate(sd * BW * 0.1, BH * 0.45 + h * 0.4, z));
        } else {
          const h = BH * (0.5 + (t - 0.45) * 0.9);
          sp2.push(cone(BW * 0.05, h, 5).rotateZ(-sd * 0.45).rotateX(-0.35).translate(sd * BW * 0.14, BH * 0.45 + h * 0.4, z));
        }
      }
    }
    add(torso, pl, accentMat);
    for (const sd of [-1, 1]) sp2.push(cone(BW * 0.06, BH * 0.9, 5).rotateZ(-sd * 1.9).rotateY(sd * 0.7).translate(sd * BW * 0.5, BH * 0.05, BL * 0.2));
    add(torso, sp2, shared.horn);
  }
  if (ex.includes("dorsalspikes")) {
    const ds: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 12; i++) ds.push(cone(BW * 0.03, BH * 0.12, 4).translate(0, BH * 0.5, BL * (0.42 - i * 0.075)));
    add(torso, ds, accentMat, false);
    for (const n2 of neck) { const nd: THREE.BufferGeometry[] = []; for (let i = 0; i < 4; i++) nd.push(cone(BW * 0.02, BH * 0.08, 4).translate(0, BW * 0.26, spec.neckLen / neck.length * (i / 4))); add(n2, nd, accentMat, false); }
  }
  if (ex.includes("diplo")) {
    // Diplodocus: long low horse-like head with peg teeth and the nostril mound atop the skull; throat folds
    add(head, [ell(HH * 0.3, HH * 0.22, HH * 0.34, 0, HH * 0.46, HL * 0.3)], skin);
    const pegs: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 8; i++) pegs.push(new THREE.CylinderGeometry(HH * 0.025, HH * 0.025, HH * 0.14, 4).translate((i - 3.5) * HH * 0.07, -HH * 0.13, HL * 0.95));
    add(head, pegs, shared.tooth, false);
    for (let i = 0; i < 6; i++) add(neck[Math.min(neck.length - 1, Math.floor(i / 2))], ell(BW * 0.12, BW * 0.04, spec.neckLen * 0.05, 0, -BW * 0.17, spec.neckLen * (0.05 + (i % 2) * 0.12)), bellyMat, false);
  }
  if (ex.includes("scythes") && arms.length) {
    // Therizinosaurus: three enormous curved scythe claws on each hand
    for (const a of arms) {
      const cls: THREE.BufferGeometry[] = [];
      for (let k = 0; k < 3; k++) {
        const len = spec.armLen! * (0.75 - k * 0.12);
        const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3((k - 1) * spec.legW * 0.35, 0, 0), new THREE.Vector3((k - 1) * spec.legW * 0.4, -len * 0.55, len * 0.1), new THREE.Vector3((k - 1) * spec.legW * 0.3, -len * 0.95, len * 0.45));
        const tube = new THREE.TubeGeometry(curve, 10, spec.legW * 0.16, 6);
        const p2 = tube.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < p2.count; i++) { // taper to a point
          const ty = Math.min(1, Math.max(0, -p2.getY(i) / (len * 0.95)));
          const cx = (k - 1) * spec.legW * 0.35;
          p2.setX(i, cx + (p2.getX(i) - cx) * (1 - ty * 0.85));
        }
        tube.computeVertexNormals();
        cls.push(tube);
      }
      add(a.ankle, cls, shared.horn);
    }
  }
  if (ex.includes("thumbspike") && arms.length) {
    for (const a of arms) add(a.ankle, cone(spec.legW * 0.18, spec.legW * 0.9, 6).rotateX(-0.6).translate(-a.side * spec.legW * 0.25, 0, spec.legW * 0.35), shared.horn);
  }
  if (ex.includes("ostrich")) {
    // Gallimimus: toothless beak and big eyes, slender feathered neck line
    add(head, cone(HH * 0.4, HL * 0.55, 8).rotateX(Math.PI / 2 + 0.1).translate(0, -HH * 0.05, HL * 0.95), accentMat);
  }
  if (ex.includes("scutes")) {
    // Sarcosuchus: rows of keeled osteoderms along back and tail
    const sc: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 14; i++) for (const sd of [-1, 0, 1]) {
      const c = cone(BW * 0.06, BH * 0.16, 4);
      c.translate(sd * BW * 0.18, BH * 0.46, BL * (0.45 - i * 0.07));
      sc.push(c);
    }
    add(torso, sc, accentMat);
  }
  if (ex.includes("allocrest")) {
    // Allosaurus: paired low nasal ridges along the snout + triangular lacrimal horns in front of the eyes
    for (const sd of [-1, 1]) {
      const ridge = rigidLoft([
        { pos: new THREE.Vector3(sd * HH * 0.2, HH * 0.42, HL * 0.3), w: 0.02, top: HH * 0.04, bot: 0.01 },
        { pos: new THREE.Vector3(sd * HH * 0.19, HH * 0.4, HL * 0.55), w: 0.025, top: HH * 0.09, bot: 0.01, ridge: HH * 0.05 },
        { pos: new THREE.Vector3(sd * HH * 0.16, HH * 0.3, HL * 0.86), w: 0.018, top: HH * 0.03, bot: 0.01 },
      ], { ring: 8, perSeg: 3, up: new THREE.Vector3(0, 1, 0), capStart: true, capEnd: true });
      add(head, ridge, accentMat);
      const horn = cone(HH * 0.1, HH * 0.32, 5);
      horn.rotateX(-0.25);
      horn.translate(sd * HH * 0.36, HH * 0.52, HL * 0.3);
      add(head, horn, shared.horn);
    }
    // heavy jaw muscles behind the eyes
    add(head, [ell(HH * 0.58, HH * 0.4, HL * 0.22, 0, HH * 0.05, HL * 0.08)], skin);
  }


  // tail chain
  const tail: THREE.Group[] = [];
  const tSeg = 4;
  parent = torso;
  const tStart = g(0, BH * 0.05, -BL * 0.45);
  torso.add(tStart);
  parent = tStart;
  const tl = spec.tailLen / tSeg;
  for (let i = 0; i < tSeg; i++) {
    const t = g(0, 0, i === 0 ? 0 : -tl);
    parent.add(t);
    const r0 = BW * 0.36 * Math.pow(0.68, i), r1 = BW * 0.36 * Math.pow(0.68, i + 1);
    const lg = limbZ(r0, Math.max(0.015, r1), tl * 1.08, 1);
    lg.rotateY(Math.PI);
    void lg;
    if (ex.includes("feathers") && i >= 2) {
      const f = new THREE.BoxGeometry(BW * 0.5, 0.02, tl);
      f.translate(0, 0, -tl * 0.5);
      add(t, f, accentMat, false);
    }
    if (ex.includes("spikes") && i === tSeg - 1) {
      const sp: THREE.BufferGeometry[] = [];
      for (const s of [-1, 1]) for (const k of [0.3, 0.8]) {
        const c = cone(r1 * 0.9 + 0.02, spec.tailLen * 0.25, 6);
        c.rotateZ(-s * 1.1);
        c.rotateX(-0.4);
        c.translate(s * r1, r1, -tl * k);
        sp.push(c);
      }
      add(t, sp, shared.horn);
    }
    if (ex.includes("clubtail") && i === tSeg - 1) {
      const club = ell(BW * 0.28, BW * 0.18, BW * 0.3, 0, 0, -tl);
      add(t, club, shared.horn);
    }
    if (ex.includes("ankylo")) {
      // paired osteoderm spikes along the tail and the massive four-lobed club at the tip
      const tsp: THREE.BufferGeometry[] = [];
      for (const sd of [-1, 1]) tsp.push(cone(r0 * 0.25 + 0.01, r0 * 0.7 + 0.03, 4).rotateZ(-sd * 1.3).translate(sd * r0 * 0.9, r0 * 0.2, -tl * 0.5));
      add(t, tsp, shared.horn);
      if (i === tSeg - 1) {
        const cb = BW * 0.26;
        add(t, [ell(cb, cb * 0.55, cb * 1.0, -cb * 0.55, 0, -tl * 1.05), ell(cb, cb * 0.55, cb * 1.0, cb * 0.55, 0, -tl * 1.05), ell(cb * 0.55, cb * 0.4, cb * 0.6, -cb * 0.35, 0, -tl * 1.05 - cb * 0.9), ell(cb * 0.55, cb * 0.4, cb * 0.6, cb * 0.35, 0, -tl * 1.05 - cb * 0.9)], shared.horn);
      }
    }
    if (fish && i === tSeg - 1) {
      const tf = new THREE.BufferGeometry();
      const H2 = BH * 1.1;
      tf.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, -tl * 0.6, 0, H2, -tl * 1.5, 0, 0, -tl * 1.1, 0, 0, -tl * 0.6, 0, 0, -tl * 1.1, 0, -H2 * 0.7, -tl * 1.4], 3));
      tf.computeVertexNormals();
      const tfm = new THREE.MeshStandardMaterial({ color: spec.color, side: THREE.DoubleSide, roughness: 0.7 });
      materials.push(tfm);
      t.add(new THREE.Mesh(tf, tfm));
    }
    t.rotation.x = i === 0 ? -0.08 : 0.04;
    tail.push(t);
    parent = t;
  }
  if (ex.includes("plates")) {
    const ps: THREE.BufferGeometry[] = [];
    const n = 9;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const z = BL * (0.4 - t * 0.9);
      const h = BH * (0.35 + Math.sin(t * Math.PI) * 0.55);
      for (const s of [-1, 1]) {
        const p = new THREE.CylinderGeometry(0.001, h * 0.5, h, 4);
        p.scale(0.12, 1, 1);
        p.translate(s * BW * 0.08, BH * 0.45 + h * 0.45 - Math.abs(t - 0.5) * BH * 0.3, z + s * BL * 0.03);
        ps.push(p);
      }
    }
    add(torso, ps, accentMat);
  }
  if (ex.includes("feathers")) {
    const back: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 6; i++) {
      const f = new THREE.BoxGeometry(0.02, BH * 0.3, BH * 0.18);
      f.rotateX(-0.9);
      f.translate(0, BH * 0.48, BL * (0.35 - i * 0.14));
      back.push(f);
    }
    add(torso, back, accentMat, false);
  }

  const saddleMount = g(0, BH * 0.5, 0);
  torso.add(saddleMount);
  buildCreatureSkin(root, skin, spec, torso, neck, head, tail, legs, fish);
  mergeByMaterial(root);
  root.scale.setScalar(scale);
  return { root, body, torso, neck, head, jaw, legs, arms, tail, frill, materials, spec, hipY, wings, wingJoints, saddleMount, saddle: null };
}

// ---------------------------------------------------------------- human
export interface BodyShape {
  female: boolean;
  hairStyle?: number; // 0 bald, 1 short, 2 long, 3 ponytail
  beard?: boolean;
  regions: Partial<Record<BodyRegion, number>>; // 0..1 (0.5 default)
}
export type BodyRegion = "headSize" | "neckSize" | "neckLength" | "chest" | "shoulders" | "armLength" | "upperArm" | "lowerArm" | "handSize" | "legLength" | "upperLeg" | "lowerLeg" | "footSize" | "hipWidth" | "torsoWidth" | "upperFace" | "lowerFace" | "torsoDepth" | "headHeight" | "headWidth" | "headDepth" | "torsoHeight";
export const DEFAULT_BODY: BodyShape = { female: false, hairStyle: 1, beard: true, regions: {} };

export interface HumanRig {
  root: THREE.Group;
  hips: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  elbowL: THREE.Group;
  elbowR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  kneeL: THREE.Group;
  kneeR: THREE.Group;
  hand: THREE.Group;
  materials: THREE.MeshStandardMaterial[];
  skinMat?: THREE.MeshStandardMaterial;
  hairMat?: THREE.MeshStandardMaterial;
  irisMats?: THREE.MeshStandardMaterial[];
  beardMat?: THREE.MeshStandardMaterial | null;
  faceMat?: THREE.MeshStandardMaterial;
  garments?: {
    bind: { torso: LoftNode[]; legL: LoftNode[]; legR: LoftNode[]; armL: LoftNode[]; armR: LoftNode[] };
    scale: (list: LoftNode[], k: number, extra?: number) => LoftNode[];
    make: (parts: { nodes: LoftNode[]; ring: number; cap?: boolean }[], mat: THREE.Material) => THREE.SkinnedMesh;
  };
}

export function buildHuman(bd: BodyShape = DEFAULT_BODY): HumanRig {
  const f = bd.female ? 1 : 0;
  const female = !!bd.female;
  const v = (k: keyof BodyShape["regions"]) => bd.regions[k] ?? 0.5; // 0..1, 0.5 = default
  const sc = (k: keyof BodyShape["regions"], amt = 0.5) => 1 + (v(k) - 0.5) * 2 * amt; // multiplier
  const legL = sc("legLength", 0.18) * (1 - f * 0.04);
  const armL = sc("armLength", 0.16) * (1 - f * 0.05);
  const torsoH = sc("torsoHeight", 0.15);
  const neckL = sc("neckLength", 0.5);
  const shoulder = sc("shoulders", 0.28) * (1 - f * 0.12);
  const torsoW = sc("torsoWidth", 0.25) * (1 - f * 0.08);
  const torsoD = sc("torsoDepth", 0.25);
  const chest = sc("chest", 0.3);
  const hipW = sc("hipWidth", 0.25) * (1 + f * 0.1);
  const upperArm = sc("upperArm", 0.35) * (1 - f * 0.15);
  const lowerArm = sc("lowerArm", 0.35) * (1 - f * 0.12);
  const upperLeg = sc("upperLeg", 0.3) * (1 + f * 0.02);
  const lowerLeg = sc("lowerLeg", 0.3);
  const handS = sc("handSize", 0.3) * (1 - f * 0.1);
  const footS = sc("footSize", 0.3) * (1 - f * 0.1);
  const headS = sc("headSize", 0.18) * (1 - f * 0.03);
  const headW = headS * sc("headWidth", 0.15);
  const headH = headS * sc("headHeight", 0.15);
  const headD = headS * sc("headDepth", 0.15);
  const neckS = sc("neckSize", 0.35) * (1 - f * 0.18);
  const upperFace = sc("upperFace", 0.25);
  const lowerFace = sc("lowerFace", 0.3) * (1 - f * 0.12);
  const skinM = new THREE.MeshStandardMaterial({ color: "#c68a62", roughness: 0.62, bumpMap: skinPoreTexture(), bumpScale: 0.3 });
  // clothing renders in front of the skin layer (polygon offset avoids z-fighting at distance)
  const shirt = new THREE.MeshStandardMaterial({ map: clothTexture([150, 132, 104], "shirt"), roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const pants = new THREE.MeshStandardMaterial({ map: clothTexture([96, 80, 62], "pants"), roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const hideM = new THREE.MeshStandardMaterial({ map: hideTexture(), roughness: 0.9 });
  const hair = new THREE.MeshStandardMaterial({ color: "#2e1c10", roughness: 0.85 });
  const brow = new THREE.MeshStandardMaterial({ color: "#241609", roughness: 0.9 });
  const sclera = new THREE.MeshStandardMaterial({ color: "#f1ece4", roughness: 0.2 });
  const nail = new THREE.MeshStandardMaterial({ color: "#e0b8a0", roughness: 0.3 });
  const implantFrame = new THREE.MeshStandardMaterial({ color: "#6d7a86", metalness: 0.85, roughness: 0.3 });
  const implant = new THREE.MeshStandardMaterial({ color: "#8ff", emissive: "#2de0ff", emissiveIntensity: 1.6 });

  const irisMats: THREE.MeshStandardMaterial[] = [];
  let beardMat: THREE.MeshStandardMaterial | null = null;
  const root = new THREE.Group();
  const hips = g(0, 0.98 * legL, 0);
  root.add(hips);
  const torso = g(0, 0.05, 0);
  hips.add(torso);
  const head = g(0, (0.55 * torsoH) + 0.07 * neckL, 0.012);
  head.scale.set(headW, headH, headD);
  torso.add(head);
  const mkLeg = (s: number) => {
    const hip = g(s * 0.095 * hipW, -0.035, 0);
    hips.add(hip);
    const kn = g(0, -0.44 * legL, 0.005);
    hip.add(kn);
    const an = g(0, -0.42 * legL, -0.01);
    kn.add(an);
    return { hip, kn, an };
  };
  const LL = mkLeg(-1), LR = mkLeg(1);
  const mkArm = (s: number) => {
    const sh = g(s * 0.205 * shoulder, 0.465 * torsoH, -0.005);
    torso.add(sh);
    const el = g(0, -0.285 * armL, 0);
    sh.add(el);
    const hd = g(0, -0.255 * armL, 0.008);
    el.add(hd);
    return { sh, el, hd };
  };
  const L = mkArm(-1), R = mkArm(1);
  // relaxed A-pose so the skin binds with natural shoulders
  L.sh.rotation.z = 0.1; R.sh.rotation.z = -0.1;

  // ---- skeleton & skin
  const groups: THREE.Object3D[] = [hips, torso, head, LL.hip, LL.kn, LL.an, LR.hip, LR.kn, LR.an, L.sh, L.el, L.hd, R.sh, R.el, R.hd];
  const bones = attachBones(groups);
  const skeleton = new THREE.Skeleton(bones);
  const B = { hips: 0, torso: 1, head: 2, leg: [3, 6], arm: [9, 12] };
  const fwd = new THREE.Vector3(0, 0, 1);
  const body = newBuffers();
  // torso chain: crotch → pelvis → waist → ribs → chest → shoulders → neck → head
  const TH = torsoH;
  const tNodes = (k: number): LoftNode[] => [
    { pos: wp(hips, 0, -0.11, 0.0), bone: B.hips, w: 0.11 * k * hipW, top: 0.085 * k * torsoD, bot: 0.09 * k * torsoD * (1 + f * 0.1) },
    { pos: wp(hips, 0, -0.03, 0), bone: B.hips, w: 0.165 * k * hipW, top: 0.1 * k * torsoD, bot: 0.12 * k * torsoD * (1 + f * 0.12) },
    { pos: wp(torso, 0, 0.09 * TH, 0.004), bone: B.torso, w: 0.138 * k * torsoW * (1 - f * 0.1), top: 0.098 * k * torsoD, bot: 0.09 * k * torsoD },
    { pos: wp(torso, 0, 0.24 * TH, 0.008), bone: B.torso, w: 0.158 * k * torsoW, top: 0.112 * k * torsoD * (1 + f * 0.05), bot: 0.098 * k * torsoD },
    { pos: wp(torso, 0, 0.36 * TH, 0.01 + f * 0.012), bone: B.torso, w: 0.182 * k * torsoW, top: 0.122 * k * torsoD * chest * (1 + f * 0.22), bot: 0.104 * k * torsoD },
    { pos: wp(torso, 0, 0.46 * TH, 0.0), bone: B.torso, w: 0.19 * k * shoulder, top: 0.092 * k * torsoD, bot: 0.1 * k * torsoD },
    { pos: wp(torso, 0, 0.55 * TH, 0.004), bone: B.torso, w: 0.066 * k * neckS, top: 0.064 * k * neckS, bot: 0.07 * k * neckS },
    { pos: wp(head, 0, 0.03, 0), bone: B.head, w: 0.055 * k * neckS / headW, top: 0.055 * k * neckS / headD, bot: 0.06 * k * neckS / headD },
    { pos: wp(head, 0, 0.09, 0), bone: B.head, w: 0.05 * k, top: 0.05 * k, bot: 0.05 * k },
  ];
  loft(body, tNodes(1), { ring: 20, perSeg: 4, up: fwd, uScale: 4, capStart: true, capEnd: true });
  const legNodes = (l: { hip: THREE.Group; kn: THREE.Group; an: THREE.Group }, bi: number, s: number, k = 1, upto = 7): LoftNode[] => [
    { pos: wp(l.hip, -s * 0.02, 0.07, 0), bone: B.hips, w: 0.085 * k, top: 0.08 * k, bot: 0.095 * k },
    { pos: wp(l.hip, 0, -0.05, 0.004), bone: bi, w: 0.086 * k * upperLeg, top: 0.086 * k * upperLeg, bot: 0.09 * k * upperLeg },
    { pos: wp(l.hip, 0, -0.24 * legL, 0.006), bone: bi, w: 0.072 * k * upperLeg, top: 0.076 * k * upperLeg, bot: 0.07 * k * upperLeg },
    { pos: wp(l.kn, 0, 0, 0.004), bone: bi + 1, w: 0.052 * k * lowerLeg, top: 0.058 * k * lowerLeg, bot: 0.05 * k * lowerLeg },
    { pos: wp(l.kn, 0, -0.12 * legL, 0), bone: bi + 1, w: 0.053 * k * lowerLeg, top: 0.048 * k * lowerLeg, bot: 0.066 * k * lowerLeg },
    { pos: wp(l.an, 0, 0.02, 0), bone: bi + 2, w: 0.036 * k, top: 0.034 * k, bot: 0.036 * k },
    { pos: wp(l.an, 0, -0.02, 0), bone: bi + 2, w: 0.034 * k, top: 0.034 * k, bot: 0.034 * k },
  ].slice(0, upto);
  loft(body, legNodes(LL, B.leg[0], -1), { ring: 14, perSeg: 4, up: fwd, uScale: 4, capEnd: true });
  loft(body, legNodes(LR, B.leg[1], 1), { ring: 14, perSeg: 4, up: fwd, uScale: 4, capEnd: true });
  const armNodes = (a: { sh: THREE.Group; el: THREE.Group; hd: THREE.Group }, bi: number, s: number, k = 1): LoftNode[] => [
    // root starts well inside the chest so the shoulder never shows a seam when the arm swings
    { pos: wp(a.sh, -s * 0.085, 0.02, 0), bone: B.torso, w: 0.07 * k, top: 0.075 * k, bot: 0.075 * k },
    { pos: wp(a.sh, -s * 0.01, 0.012, 0), bone: B.torso, w: 0.074 * k * upperArm, top: 0.07 * k, bot: 0.07 * k }, // deltoid cap
    { pos: wp(a.sh, 0, -0.05, 0), bone: bi, w: 0.064 * k * upperArm, top: 0.062 * k * upperArm, bot: 0.06 * k * upperArm },
    { pos: wp(a.sh, 0, -0.14 * armL, 0), bone: bi, w: 0.05 * k * upperArm, top: 0.056 * k * upperArm, bot: 0.05 * k * upperArm },
    { pos: wp(a.el, 0, 0, 0), bone: bi + 1, w: 0.04 * k * lowerArm, top: 0.04 * k * lowerArm, bot: 0.043 * k * lowerArm },
    { pos: wp(a.el, 0, -0.09 * armL, 0.004), bone: bi + 1, w: 0.046 * k * lowerArm, top: 0.044 * k * lowerArm, bot: 0.041 * k * lowerArm },
    { pos: wp(a.hd, 0, 0.015, 0), bone: bi + 2, w: 0.031 * k, top: 0.024 * k, bot: 0.024 * k },
    { pos: wp(a.hd, 0, -0.035, 0.004), bone: bi + 2, w: 0.04 * k, top: 0.019 * k, bot: 0.018 * k },
  ];
  loft(body, armNodes(L, B.arm[0], -1), { ring: 12, perSeg: 4, up: fwd, uScale: 4, capEnd: true });
  loft(body, armNodes(R, B.arm[1], 1), { ring: 12, perSeg: 4, up: fwd, uScale: 4, capEnd: true });
  makeSkinned(root, buildSkinnedGeometry(body), skinM, skeleton);
  // clothing layers (skinned to the same skeleton): shorts + wrapped top
  const shorts = newBuffers();
  loft(shorts, tNodes(1.12).slice(0, 3), { ring: 20, perSeg: 3, up: fwd, uScale: 3 });
  loft(shorts, legNodes(LL, B.leg[0], -1, 1.14, 3), { ring: 14, perSeg: 3, up: fwd, uScale: 3 });
  loft(shorts, legNodes(LR, B.leg[1], 1, 1.14, 3), { ring: 14, perSeg: 3, up: fwd, uScale: 3 });
  makeSkinned(root, buildSkinnedGeometry(shorts), pants, skeleton);
  const top = newBuffers();
  loft(top, tNodes(1.1).slice(2, 7), { ring: 20, perSeg: 3, up: fwd, uScale: 3 });
  // short sleeves covering the shoulder junction
  loft(top, armNodes(L, B.arm[0], -1, 1.13).slice(0, 4), { ring: 12, perSeg: 3, up: fwd, uScale: 3 });
  loft(top, armNodes(R, B.arm[1], 1, 1.13).slice(0, 4), { ring: 12, perSeg: 3, up: fwd, uScale: 3 });
  makeSkinned(root, buildSkinnedGeometry(top), shirt, skeleton);
  // bind-pose node lists kept for runtime garments (armor), which share this skeleton
  const bindSet = {
    torso: tNodes(1),
    legL: legNodes(LL, B.leg[0], -1), legR: legNodes(LR, B.leg[1], 1),
    armL: armNodes(L, B.arm[0], -1), armR: armNodes(R, B.arm[1], 1),
  };
  const bodyBind = (root.children.find((o) => (o as THREE.SkinnedMesh).isSkinnedMesh) as THREE.SkinnedMesh).bindMatrix.clone();
  const scaleNodes = (list: LoftNode[], k: number, extra = 0) => list.map((n) => ({ ...n, pos: n.pos.clone(), w: n.w * k + extra, top: n.top * k + extra, bot: n.bot * k + extra }));
  const garment = (parts: { nodes: LoftNode[]; ring: number; cap?: boolean }[], mat: THREE.Material): THREE.SkinnedMesh => {
    const buf = newBuffers();
    for (const p of parts) loft(buf, p.nodes, { ring: p.ring, perSeg: 3, up: fwd, uScale: 5, capEnd: p.cap });
    const m = new THREE.SkinnedMesh(buildSkinnedGeometry(buf), mat);
    m.frustumCulled = false;
    m.castShadow = true;
    root.add(m);
    m.bind(skeleton, bodyBind);
    return m;
  };

  // ---- head: a single sculpted mesh — sphere displaced by facial landmarks (sockets, brow,
  // cheekbones, nose bridge/tip/wings, lips, chin, jaw taper) with vertex-painted lips & cheeks
  const faceMat = new THREE.MeshStandardMaterial({ color: skinM.color, roughness: 0.58, vertexColors: true, bumpMap: skinPoreTexture(), bumpScale: 0.2 });
  const HC = new THREE.Vector3(0, 0.135, 0.004), HR = new THREE.Vector3(0.091, 0.121, 0.103);
  const gss = (dx: number, dy: number, dz: number, sx: number, sy = sx, sz = sx) => Math.exp(-((dx / sx) ** 2 + (dy / sy) ** 2 + (dz / sz) ** 2));
  const sstep = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const headPoint = (d: THREE.Vector3, out = new THREE.Vector3()) => {
    const { x, y, z } = d;
    const ax = Math.abs(x);
    let px = x * HR.x, py = y * HR.y, pz = z * HR.z;
    const low = sstep(0.05, -0.9, y);
    px *= 1 - (0.3 * lowerFace - 0.02) * low * sstep(-0.4, 0.7, z); // jaw → chin taper
    px *= 1 + 0.04 * sstep(0.1, 0.8, y) * (female ? -0.5 : 1); // cranium width
    if (z < 0) pz *= 1 + 0.1 * sstep(-0.3, 0.6, y); // fuller back of the skull
    pz -= 0.018 * low * sstep(0.2, -0.8, z); // neck pulls the lower back inward
    if (z > 0) pz *= 1 - 0.12 * sstep(0.45, 1, z) * (1 - Math.min(1, ax * 1.4)); // flatter face plane
    let dd = 0;
    dd -= 0.0105 * gss(ax - 0.36, y - 0.12, z - 0.9, 0.14, 0.11); // eye sockets
    dd += 0.0065 * upperFace * gss(ax - 0.3, y - 0.27, z - 0.9, 0.2, 0.07) * (female ? 0.5 : 1); // brow ridge
    dd += 0.006 * gss(ax - 0.58, y + 0.06, z - 0.76, 0.16, 0.12); // cheekbones
    dd -= 0.004 * gss(ax - 0.78, y - 0.22, z - 0.52, 0.16); // temples
    const noseMask = sstep(0.24, 0.14, y) * sstep(-0.34, -0.24, y) * sstep(0.75, 0.9, z);
    dd += (0.004 + 0.017 * sstep(0.2, -0.2, y)) * Math.exp(-((x / 0.06) ** 2)) * noseMask; // bridge
    dd += 0.013 * gss(x, y + 0.22, z - 0.97, 0.075, 0.06); // tip
    dd += 0.0065 * gss(ax - 0.1, y + 0.25, z - 0.94, 0.05); // nostril wings
    dd -= 0.0025 * gss(x, y + 0.31, z - 0.96, 0.04, 0.04); // philtrum
    dd += 0.0055 * gss(x, y + 0.39, z - 0.93, 0.19, 0.045) * (female ? 1.25 : 1); // upper lip
    dd += 0.0065 * gss(x, y + 0.5, z - 0.9, 0.17, 0.05) * (female ? 1.25 : 1); // lower lip
    dd -= 0.004 * gss(x, y + 0.445, z - 0.93, 0.17, 0.018); // mouth line
    dd += 0.008 * lowerFace * gss(x, y + 0.78, z - 0.58, 0.16, 0.12) * (female ? 0.6 : 1); // chin
    dd += (female ? 0 : 0.004) * gss(ax - 0.5, y + 0.62, z - 0.45, 0.2, 0.12); // jaw angle
    const n = new THREE.Vector3(px / HR.x ** 2, py / HR.y ** 2, pz / HR.z ** 2).normalize();
    return out.set(px, py, pz).addScaledVector(n, dd).add(HC);
  };
  const hg = new THREE.SphereGeometry(1, 72, 54);
  hg.rotateY(-Math.PI / 2); // put the UV seam at the back of the head
  const hpos = hg.attributes.position as THREE.BufferAttribute;
  const hcol = new Float32Array(hpos.count * 3);
  const tmpD = new THREE.Vector3(), tmpP = new THREE.Vector3();
  for (let i = 0; i < hpos.count; i++) {
    tmpD.set(hpos.getX(i), hpos.getY(i), hpos.getZ(i)).normalize();
    headPoint(tmpD, tmpP);
    hpos.setXYZ(i, tmpP.x, tmpP.y, tmpP.z);
    const { x, y, z } = tmpD;
    const lip = Math.max(gss(x, y + 0.39, z - 0.93, 0.17, 0.035), gss(x, y + 0.5, z - 0.9, 0.15, 0.04));
    const cheek = gss(Math.abs(x) - 0.52, y + 0.12, z - 0.78, 0.2, 0.15);
    const r = 1 - lip * 0.2 + cheek * 0.02, gg = 1 - lip * 0.42 - cheek * 0.06, b = 1 - lip * 0.4 - cheek * 0.07;
    hcol.set([r, gg, b], i * 3);
  }
  hg.setAttribute("color", new THREE.BufferAttribute(hcol, 3));
  hg.computeVertexNormals();
  const headMesh = new THREE.Mesh(hg, faceMat);
  headMesh.name = "face";
  headMesh.castShadow = true;
  head.add(headMesh);
  // eyes: sclera, iris, eyelids, eyebrows
  for (const sd of [-1, 1]) {
    const ep = headPoint(new THREE.Vector3(sd * 0.36, 0.12, 0.92).normalize());
    const ex = ep.x, ey = ep.y, ez = ep.z - 0.0115;
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.0135, 14, 12), sclera);
    eye.position.set(ex, ey, ez);
    head.add(eye);
    const irm = new THREE.MeshStandardMaterial({ map: irisTexture("#ffffff", false), color: "#5a7a4a", roughness: 0.1 });
    irisMats.push(irm);
    const ir = new THREE.Mesh(new THREE.CircleGeometry(0.0068, 16), irm);
    ir.position.set(ex, ey, ez + 0.0133);
    ir.name = "iris";
    head.add(ir);
    const lid = new THREE.Mesh(new THREE.SphereGeometry(0.0146, 14, 6, 0, Math.PI * 2, 0, Math.PI * 0.38), faceMat);
    lid.position.set(ex, ey, ez);
    lid.rotation.x = 0.35;
    head.add(lid);
    // curved eyebrow strand following the brow ridge
    const bc = new THREE.QuadraticBezierCurve3(new THREE.Vector3(ex - sd * 0.014, ey + 0.017, ez + 0.012), new THREE.Vector3(ex + sd * 0.002, ey + 0.024, ez + 0.013), new THREE.Vector3(ex + sd * 0.017, ey + 0.018, ez + 0.006));
    const b = new THREE.Mesh(new THREE.TubeGeometry(bc, 8, female ? 0.0022 : 0.0034, 5), brow);
    b.name = "brow";
    head.add(b);
    // ears with inner fold
    add(head, [ell(0.012, 0.03, 0.02, sd * 0.1, 0.13, -0.004, 10), ell(0.006, 0.018, 0.011, sd * 0.106, 0.13, 0.0, 8)], skinM);
  }
  // hair: styles like the original's hair options
  const hairGeos: THREE.BufferGeometry[] = [];
  const style = bd.hairStyle ?? (f ? 2 : 1);
  if (style > 0) {
    const cap = new THREE.SphereGeometry(0.106, 18, 12, 0, Math.PI * 2, 0, Math.PI * (style === 3 ? 0.62 : 0.55));
    cap.scale(1, 1.05, 1.1);
    cap.translate(0, 0.165, -0.012);
    hairGeos.push(cap);
  }
  if (style === 1) {
    // short messy crop
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const c = cone(0.028, 0.07, 5);
      c.rotateX(Math.PI / 2 + 0.9);
      c.rotateY(a);
      c.translate(Math.sin(a) * 0.085, 0.2 + Math.cos(a * 2) * 0.01, Math.cos(a) * 0.085 - 0.01);
      if (Math.cos(a) > 0.6) c.translate(0, 0.02, 0.01);
      hairGeos.push(c);
    }
    for (let i = 0; i < 6; i++) hairGeos.push(ell(0.035, 0.03, 0.02, (i - 2.5) * 0.024, 0.225, 0.07 - Math.abs(i - 2.5) * 0.008, 6));
  } else if (style === 2) {
    // long hair falling to the shoulders + side locks
    const back = rigidLoft([
      { pos: new THREE.Vector3(0, 0.2, -0.06), w: 0.1, top: 0.05, bot: 0.05 },
      { pos: new THREE.Vector3(0, 0.08, -0.1), w: 0.11, top: 0.035, bot: 0.03 },
      { pos: new THREE.Vector3(0, -0.06, -0.09), w: 0.1, top: 0.025, bot: 0.02 },
      { pos: new THREE.Vector3(0, -0.14, -0.07), w: 0.08, top: 0.015, bot: 0.012 },
    ], { ring: 12, perSeg: 3, up: new THREE.Vector3(0, 0, -1), capEnd: true });
    hairGeos.push(back);
    for (const sd of [-1, 1]) hairGeos.push(ell(0.025, 0.09, 0.03, sd * 0.098, 0.1, 0.02, 8));
    hairGeos.push(ell(0.09, 0.03, 0.04, 0, 0.215, 0.07, 10));
  } else if (style === 3) {
    // tied-back ponytail
    hairGeos.push(ell(0.045, 0.045, 0.04, 0, 0.17, -0.11, 8));
    const tail = rigidLoft([
      { pos: new THREE.Vector3(0, 0.17, -0.13), w: 0.028, top: 0.028, bot: 0.028 },
      { pos: new THREE.Vector3(0, 0.08, -0.16), w: 0.03, top: 0.03, bot: 0.03 },
      { pos: new THREE.Vector3(0, -0.06, -0.15), w: 0.012, top: 0.012, bot: 0.012 },
    ], { ring: 8, perSeg: 3, up: new THREE.Vector3(0, 0, -1), capEnd: true });
    hairGeos.push(tail);
  }
  if (hairGeos.length) add(head, hairGeos, hair);
  if (!f && bd.beard !== false) {
    const beard = new THREE.MeshStandardMaterial({ color: "#3a2616", roughness: 1, transparent: true, opacity: 0.35 });
    add(head, ell(0.058, 0.035, 0.04, 0, 0.045, 0.058, 12), beard, false);
    beardMat = beard;
  }
  if (f) {
    // softer features: fuller lips, lashes
    for (const sd of [-1, 1]) add(head, new THREE.BoxGeometry(0.026, 0.004, 0.006).translate(sd * 0.036, 0.148, 0.1), brow, false);
  }

  // ---- hands: palm + 4 fingers (2 joints) + thumb
  const mkHand = (hd: THREE.Group, sd: number) => {
    add(hd, ell(0.03, 0.042, 0.016, 0, -0.035, 0.004, 10), skinM);
    for (let f = 0; f < 4; f++) {
      const x = (f - 1.5) * 0.0145;
      const len = [0.038, 0.044, 0.042, 0.034][f];
      const p1 = new THREE.CapsuleGeometry(0.0065, len * 0.5, 3, 6);
      p1.translate(x, -0.078 - len * 0.25, 0.008);
      const p2 = new THREE.CapsuleGeometry(0.0058, len * 0.4, 3, 6);
      p2.rotateX(0.5);
      p2.translate(x, -0.078 - len * 0.62, 0.016);
      add(hd, [p1, p2], skinM);
      add(hd, ell(0.005, 0.002, 0.005, x, -0.078 - len * 0.82, 0.024, 5), nail, false);
    }
    // thumb on the medial side (toward the body), angled down/in — was mirrored to the outside
    const th = new THREE.CapsuleGeometry(0.0075, 0.03, 3, 6);
    th.rotateZ(-sd * 0.55);
    th.rotateX(0.25);
    th.translate(-sd * 0.028, -0.045, -0.004);
    add(hd, th, skinM);
  };
  mkHand(L.hd, -1);
  mkHand(R.hd, 1);
  for (const hd of [L.hd, R.hd]) for (const ch of hd.children) ch.scale.multiplyScalar(handS);
  // ---- feet: wrapped hide boots
  for (const l of [LL, LR]) {
    const foot = rigidLoft([
      { pos: new THREE.Vector3(0, -0.03, -0.04), w: 0.042, top: 0.038, bot: 0.032 },
      { pos: new THREE.Vector3(0, -0.045, 0.03), w: 0.046, top: 0.028, bot: 0.022 },
      { pos: new THREE.Vector3(0, -0.055, 0.11), w: 0.043, top: 0.018, bot: 0.015 },
    ], { ring: 12, perSeg: 3, up: new THREE.Vector3(0, 1, 0), capStart: true, capEnd: true });
    add(l.an, foot.scale(footS, 1, footS), hideM);
    add(l.an, limbDown(0.042, 0.04, 0.08).translate(0, 0.05, 0), hideM);
    for (let i = 0; i < 3; i++) add(l.an, new THREE.TorusGeometry(0.043, 0.005, 4, 12).rotateX(Math.PI / 2).translate(0, 0.07 - i * 0.03, 0), brow, false);
  }
  // belt with pouch, fiber wraps
  add(hips, new THREE.TorusGeometry(0.17, 0.018, 6, 20).rotateX(Math.PI / 2).translate(0, 0.055, 0), hideM);
  add(hips, new THREE.BoxGeometry(0.06, 0.07, 0.035).translate(0.13, 0.02, 0.08), hideM);
  // ARK specimen implant in the left forearm (framed crystal)
  add(L.el, [new THREE.BoxGeometry(0.032, 0.05, 0.012).translate(0.012, -0.2 * armL, 0.03)], implantFrame, false);
  add(L.el, [new THREE.OctahedronGeometry(0.011, 0).scale(1, 1.6, 0.5).translate(0.012, -0.2 * armL, 0.037)], implant, false);

  const hand = g(0, -0.075, 0.02);
  R.hd.add(hand);
  mergeByMaterial(root);
  root.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true; });
  return { root, hips, torso, head, armL: L.sh, armR: R.sh, elbowL: L.el, elbowR: R.el, legL: LL.hip, legR: LR.hip, kneeL: LL.kn, kneeR: LR.kn, hand, materials: [skinM, shirt, pants], skinMat: skinM, hairMat: hair, irisMats, beardMat, faceMat,
    garments: { bind: bindSet, scale: scaleNodes, make: garment } };
}

/** Held item attached to the right hand. Item models are built along +Y with grip at origin. */
export function buildHeldItem(id: string): THREE.Object3D | null {
  const m = itemModel(id, true);
  if (!m) return null;
  const holder = new THREE.Group();
  m.rotation.x = Math.PI / 2; // point forward out of the fist
  holder.add(m);
  holder.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true; });
  return holder;
}

/** Saddle model fitted to the creature's torso. */
export function buildSaddle(spec: ModelSpec): THREE.Object3D {
  if (spec.extras?.includes("trex")) return buildRexSaddle(spec);
  const leather = new THREE.MeshStandardMaterial({ map: hideTexture(), roughness: 0.85 });
  const strap = new THREE.MeshStandardMaterial({ color: "#3a2616", roughness: 0.9 });
  const metal = new THREE.MeshStandardMaterial({ color: "#b0a080", metalness: 0.7, roughness: 0.35 });
  const gr = new THREE.Group();
  const W = spec.bodyW, L = spec.bodyLen, H = spec.bodyH;
  const seatL = Math.min(L * 0.45, 1.1), seatW = Math.min(W * 0.75, 0.9);
  const pad = new THREE.Mesh(new THREE.BoxGeometry(seatW * 1.3, 0.06, seatL * 1.2), leather);
  pad.position.y = 0.02;
  gr.add(pad);
  const seat = new THREE.Mesh(new THREE.CylinderGeometry(seatW * 0.45, seatW * 0.5, 0.14, 10), leather);
  seat.scale.set(1, 1, seatL / seatW);
  seat.position.y = 0.1;
  gr.add(seat);
  const horn = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.25, 6), strap);
  horn.position.set(0, 0.25, seatL * 0.45);
  gr.add(horn);
  const back = new THREE.Mesh(new THREE.BoxGeometry(seatW * 0.8, 0.2, 0.06), leather);
  back.position.set(0, 0.2, -seatL * 0.45);
  gr.add(back);
  for (const z of [-seatL * 0.2, seatL * 0.2]) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(Math.max(W, H) * 0.53, 0.025, 4, 18), strap);
    band.rotation.y = Math.PI / 2;
    band.scale.set(1, H / Math.max(W, H), W / Math.max(W, H));
    band.position.set(0, -H * 0.5, z);
    gr.add(band);
  }
  for (const sd of [-1, 1]) {
    const stir = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.015, 4, 10), metal);
    stir.position.set(sd * W * 0.52, -H * 0.35, 0);
    stir.rotation.y = Math.PI / 2;
    gr.add(stir);
  }
  gr.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true; });
  return gr;
}

/** Armor tier materials (shared). Cloth = coarse woven fiber (ARK cloth set), hide = stitched leather,
 * chitin = glossy dark carapace, metal = riveted steel. Polygon offset keeps each layer above the one below. */
const armorMats = new Map<string, THREE.MeshStandardMaterial>();
function armorMat(tier: string, layer = 0): THREE.MeshStandardMaterial {
  const k = tier + layer;
  let m = armorMats.get(k);
  if (m) return m;
  const po = { polygonOffset: true, polygonOffsetFactor: -6 - layer * 2, polygonOffsetUnits: -6 - layer * 2 };
  if (tier === "cloth") m = new THREE.MeshStandardMaterial({ map: burlapTexture(), roughness: 1, ...po });
  else if (tier === "hide") m = new THREE.MeshStandardMaterial({ map: hideTexture(), color: "#b08058", roughness: 0.85, ...po });
  else if (tier === "chitin") m = new THREE.MeshStandardMaterial({ color: "#3a4a36", roughness: 0.35, metalness: 0.15, ...po });
  else if (tier === "rope") m = new THREE.MeshStandardMaterial({ color: "#6e5530", roughness: 1, ...po });
  else m = new THREE.MeshStandardMaterial({ color: "#a2abb4", roughness: 0.32, metalness: 0.85, ...po });
  armorMats.set(k, m);
  return m;
}

export function applyArmorVisuals(rig: HumanRig, equipped: Record<string, string | null>) {
  const key = JSON.stringify(equipped);
  if (rig.root.userData.armorKey === key) return;
  rig.root.userData.armorKey = key;
  for (const o of [...(rig.root.userData.armorParts ?? [])] as THREE.Object3D[]) { o.parent?.remove(o); ((o as THREE.Mesh).geometry as THREE.BufferGeometry | undefined)?.dispose(); }
  const parts: THREE.Object3D[] = [];
  const G = rig.garments;
  if (!G) return;
  const tierOf = (id: string | null) => (id ? id.split("_")[0] : null);
  const rigid = (parent: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.castShadow = true;
    parent.add(mesh);
    parts.push(mesh);
    return mesh;
  };
  const band = (parent: THREE.Object3D, r: number, y: number, tube = 0.008, z = 0, scaleZ = 1) => {
    const t = new THREE.TorusGeometry(r, tube, 5, 18);
    t.rotateX(Math.PI / 2);
    t.scale(1, 1, scaleZ);
    t.translate(0, y, z);
    rigid(parent, t, armorMat("rope"));
  };
  const B = G.bind;
  // ---- chest
  const tc = tierOf(equipped.chest);
  if (tc) {
    const k = tc === "metal" ? 1.24 : tc === "chitin" ? 1.21 : 1.17;
    const m = armorMat(tc);
    parts.push(G.make([
      { nodes: G.scale(B.torso, k).slice(1, 7), ring: 20 },
      { nodes: G.scale(B.armL, k * 1.02).slice(0, tc === "cloth" ? 5 : 4), ring: 12, cap: false },
      { nodes: G.scale(B.armR, k * 1.02).slice(0, tc === "cloth" ? 5 : 4), ring: 12, cap: false },
    ], m));
    if (tc === "cloth") {
      // wrap-shirt: rope belt, crossed chest tie and collar rope
      band(rig.hips, 0.185, 0.05, 0.009, 0.004, 0.72);
      band(rig.torso, 0.08, 0.55, 0.008, 0.004);
      const tie = new THREE.CylinderGeometry(0.006, 0.006, 0.36, 5);
      tie.rotateZ(0.7); tie.translate(0.0, 0.3, 0.125);
      rigid(rig.torso, tie, armorMat("rope"));
    } else if (tc === "hide") {
      for (const sd of [-1, 1]) rigid(rig.torso, new THREE.SphereGeometry(0.085, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.6, 1).translate(sd * 0.2, 0.47, 0), armorMat("hide", 1));
      band(rig.hips, 0.19, 0.05, 0.012, 0.004, 0.72);
    } else if (tc === "chitin") {
      for (let i = 0; i < 4; i++) rigid(rig.torso, new THREE.SphereGeometry(0.16 - i * 0.012, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.45).scale(1.1, 0.35, 0.8).rotateX(Math.PI / 2).translate(0, 0.42 - i * 0.09, 0.07), armorMat("chitin", 1));
      for (const sd of [-1, 1]) rigid(rig.torso, new THREE.SphereGeometry(0.09, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.1, 0.7, 1).translate(sd * 0.21, 0.47, 0), armorMat("chitin", 1));
    } else {
      rigid(rig.torso, new THREE.SphereGeometry(0.19, 16, 10, -Math.PI / 2, Math.PI, 0, Math.PI * 0.6).scale(1, 1.1, 0.72).translate(0, 0.3, 0.02), armorMat("metal", 1));
      for (const sd of [-1, 1]) rigid(rig.torso, new THREE.SphereGeometry(0.095, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.15, 0.75, 1.1).translate(sd * 0.22, 0.47, 0), armorMat("metal", 1));
      for (let i = 0; i < 6; i++) rigid(rig.torso, new THREE.SphereGeometry(0.008, 5, 4).translate((i - 2.5) * 0.05, 0.14, 0.135), armorMat("metal", 1));
    }
  }
  // ---- legs
  const tl = tierOf(equipped.legs);
  if (tl) {
    const k = tl === "metal" ? 1.24 : 1.18;
    const m = armorMat(tl);
    parts.push(G.make([
      { nodes: G.scale(B.torso, k * 1.02).slice(0, 3), ring: 20 },
      { nodes: G.scale(B.legL, k).slice(0, tl === "cloth" ? 6 : 5), ring: 14 },
      { nodes: G.scale(B.legR, k).slice(0, tl === "cloth" ? 6 : 5), ring: 14 },
    ], m));
    for (const kn of [rig.kneeL, rig.kneeR]) {
      if (tl === "cloth") { band(kn, 0.058, -0.04, 0.007); band(kn, 0.052, -0.16, 0.007); band(kn, 0.05, -0.28, 0.007); }
      else if (tl === "hide") band(kn, 0.06, -0.03, 0.01);
      else rigid(kn, new THREE.SphereGeometry(0.06, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.7, 1).rotateX(Math.PI / 2).translate(0, 0, 0.04), armorMat(tl, 1));
    }
  }
  // ---- feet (boots): shin wrap + shaped boot on the ankle
  const tf = tierOf(equipped.feet);
  if (tf) {
    const m = armorMat(tf, 1);
    parts.push(G.make([
      { nodes: G.scale(B.legL, 1.32).slice(4, 7), ring: 12, cap: true },
      { nodes: G.scale(B.legR, 1.32).slice(4, 7), ring: 12, cap: true },
    ], m));
    for (const kn of [rig.kneeL, rig.kneeR]) {
      const an = kn.children.find((c) => (c as THREE.Group).isGroup && c.position.y < -0.3) as THREE.Group | undefined;
      const host = an ?? kn;
      const boot = rigidLoft([
        { pos: new THREE.Vector3(0, -0.02, -0.05), w: 0.05, top: 0.045, bot: 0.036 },
        { pos: new THREE.Vector3(0, -0.04, 0.035), w: 0.053, top: 0.034, bot: 0.028 },
        { pos: new THREE.Vector3(0, -0.052, 0.125), w: 0.049, top: 0.022, bot: 0.018 },
      ], { ring: 12, perSeg: 3, up: new THREE.Vector3(0, 1, 0), capStart: true, capEnd: true });
      rigid(host, boot, m);
      if (tf === "cloth") { band(host, 0.048, 0.02, 0.006); band(host, 0.052, -0.02, 0.006, 0.02); }
    }
  }
  // ---- hands (gloves / wraps)
  const th = tierOf(equipped.hands);
  if (th) {
    parts.push(G.make([
      { nodes: G.scale(B.armL, th === "metal" ? 1.3 : 1.2).slice(5, 9), ring: 10, cap: true },
      { nodes: G.scale(B.armR, th === "metal" ? 1.3 : 1.2).slice(5, 9), ring: 10, cap: true },
    ], armorMat(th, 1)));
    if (th === "cloth") for (const e of [rig.elbowL, rig.elbowR]) { band(e, 0.047, -0.2, 0.006); band(e, 0.042, -0.24, 0.006); }
  }
  // ---- head
  const tH = tierOf(equipped.head);
  if (tH) {
    const m = armorMat(tH, 1);
    if (tH === "cloth") {
      // ARK cloth hat: wrapped fiber hood with a tied tail at the back
      rigid(rig.head, new THREE.SphereGeometry(0.118, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.58).scale(1, 1.02, 1.08).translate(0, 0.16, -0.012), m);
      band(rig.head, 0.112, 0.175, 0.012, -0.01, 1.05);
      rigid(rig.head, new THREE.ConeGeometry(0.035, 0.12, 6).rotateX(-2.3).translate(0, 0.17, -0.14), m);
    } else if (tH === "hide") {
      rigid(rig.head, new THREE.SphereGeometry(0.12, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.6).scale(1, 1, 1.08).translate(0, 0.155, -0.01), m);
      for (const sd of [-1, 1]) rigid(rig.head, new THREE.BoxGeometry(0.02, 0.08, 0.06).translate(sd * 0.108, 0.1, 0), m);
    } else if (tH === "chitin") {
      rigid(rig.head, new THREE.SphereGeometry(0.125, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.62).scale(1, 1.05, 1.1).translate(0, 0.155, -0.01), m);
      rigid(rig.head, new THREE.BoxGeometry(0.16, 0.02, 0.05).translate(0, 0.14, 0.11), m);
    } else {
      rigid(rig.head, new THREE.SphereGeometry(0.126, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.64).scale(1, 1.05, 1.1).translate(0, 0.15, -0.01), m);
      rigid(rig.head, new THREE.BoxGeometry(0.016, 0.09, 0.03).translate(0, 0.12, 0.118), m);
    }
  }
  rig.root.userData.armorParts = parts;
}

/** Continuous skinned body (tail tip → torso → neck → head) plus skinned legs, sharing one skeleton. */
function buildCreatureSkin(root: THREE.Group, mat: THREE.MeshStandardMaterial, spec: ModelSpec, torso: THREE.Group, neck: THREE.Group[], head: THREE.Group, tail: THREE.Group[], legs: Leg[], fish: boolean) {
  const BL = spec.bodyLen, BH = spec.bodyH, BW = spec.bodyW, HH = spec.headH;
  const ex = spec.extras ?? [];
  const groups: THREE.Object3D[] = [torso, ...tail, ...neck, head];
  const legStart = groups.length;
  for (const l of legs) groups.push(l.hip, l.knee, l.ankle);
  const bones = attachBones(groups);
  const iTorso = 0, iTail = (i: number) => 1 + i, iNeck = (i: number) => 1 + tail.length + i, iHead = 1 + tail.length + neck.length;
  const buf = newBuffers();
  const nodes: LoftNode[] = [];
  const round = ex.includes("round") ? 1.25 : 1;
  const heavy = ex.includes("heavy") ? 1.06 : 1;
  const tl = spec.tailLen / tail.length;
  const tr = (i: number) => BW * 0.4 * Math.pow(0.68, i);
  const tailTall = fish ? 1.4 : 1.12;
  nodes.push({ pos: wp(tail[tail.length - 1], 0, 0, -tl * (fish ? 0.9 : 1.05)), bone: iTail(tail.length - 1), w: Math.max(0.012, tr(tail.length) * 0.35), top: Math.max(0.012, tr(tail.length) * 0.4), bot: Math.max(0.012, tr(tail.length) * 0.35) });
  for (let i = tail.length - 1; i >= 0; i--) {
    const r = tr(i);
    // segment from tail[i] origin toward the body is owned by the next group up the chain
    nodes.push({ pos: wp(tail[i]), bone: i === 0 ? iTorso : iTail(i - 1), w: r, top: r * tailTall, bot: r * (fish ? 1.2 : 1.02), ridge: fish ? 0 : r * 0.12 });
  }
  nodes.push({ pos: wp(torso, 0, BH * 0.03, -BL * 0.3), bone: iTorso, w: BW * 0.48 * round, top: BH * 0.5 * round, bot: BH * 0.48 * round, ridge: BH * 0.05, ridgeSharp: 14 });
  nodes.push({ pos: wp(torso, 0, -BH * 0.02, -BL * 0.02), bone: iTorso, w: BW * 0.53 * round, top: BH * 0.52 * round, bot: BH * (fish ? 0.46 : 0.6) * round, ridge: BH * 0.04 });
  nodes.push({ pos: wp(torso, 0, 0.0, BL * 0.26), bone: iTorso, w: BW * 0.49 * round * heavy, top: BH * 0.5 * round, bot: BH * 0.54 * round, keel: ex.includes("wings") ? BH * 0.12 : 0 });
  const nt = spec.neckThick ?? 1;
  for (let i = 0; i < neck.length; i++) {
    const t = i / neck.length;
    const r = THREE.MathUtils.lerp(BW * 0.34 * nt, HH * 0.52, t);
    nodes.push({ pos: wp(neck[i]), bone: iNeck(i), w: r, top: r * 1.02, bot: r * (1.12 - t * 0.1), keel: r * 0.08 });
  }
  nodes.push({ pos: wp(head, 0, HH * 0.02, 0), bone: iHead, w: HH * 0.48, top: HH * 0.44, bot: HH * 0.44 });
  nodes.push({ pos: wp(head, 0, HH * 0.1, spec.headLen * 0.28), bone: iHead, w: HH * 0.42, top: HH * 0.36, bot: HH * 0.3 });
  loft(buf, nodes, { ring: 20, perSeg: 5, up: new THREE.Vector3(0, 1, 0), uScale: 1 / (BW * 2.6), capStart: true, capEnd: true, noise: 0.015, seed: BL * 100 });
  // legs
  legs.forEach((l, k) => {
    if (!l.dims) return;
    const { tl: ltl, sl, ml, w } = l.dims;
    const bi = legStart + k * 3;
    const bip = spec.form === "biped";
    const n2: LoftNode[] = [
      { pos: wp(l.hip, 0, w * 1.6, 0), bone: iTorso, w: w * (bip ? 1.4 : 1.35), top: w * (bip ? 1.9 : 1.5), bot: w * (bip ? 1.8 : 1.45) },
      { pos: wp(l.hip), bone: bi, w: w * (bip ? 1.35 : 1.3), top: w * (bip ? 1.75 : 1.4), bot: w * (bip ? 1.7 : 1.4) },
      { pos: wp(l.hip, 0, -ltl * 0.5, 0), bone: bi, w: w * 1.05, top: w * 1.2, bot: w * 1.25 },
      { pos: wp(l.knee), bone: bi + 1, w: w * 0.72, top: w * 0.78, bot: w * 0.75 },
      { pos: wp(l.knee, 0, -sl * 0.45, 0), bone: bi + 1, w: w * 0.58, top: w * 0.6, bot: w * 0.72 },
      { pos: wp(l.ankle), bone: bi + 2, w: w * 0.48, top: w * 0.5, bot: w * 0.52 },
      { pos: wp(l.ankle, 0, -Math.max(ml * 0.85, w * 0.3), 0), bone: bi + 2, w: w * 0.42, top: w * 0.44, bot: w * 0.46 },
    ];
    loft(buf, n2, { ring: 12, perSeg: 3, up: new THREE.Vector3(0, 0, 1), uScale: 1 / (BW * 2.6), capEnd: true, noise: 0.02, seed: k * 13 });
  });
  const geo = buildSkinnedGeometry(buf);
  makeSkinned(root, geo, mat, bones);
}

/**
 * ARK-style Dodo: stout egg-shaped feathered body, oversized head with bare facial skin,
 * big hooked orange-yellow beak, forehead tuft, stubby wings, fluffy curled tail plume,
 * short thick yellow legs with scaly toes. Males: rust/red with pinkish belly; females: blue with white belly.
 */
function buildDodo(spec: ModelSpec, key: string, scale: number): CreatureRig {
  const female = key.endsWith("_f");
  const backC = female ? "#4c5f86" : "#8a4a2e", bellyC = female ? "#e9e9ef" : "#d8a898", patC = female ? "#34466a" : "#5e2e1a";
  const feathers = new THREE.MeshStandardMaterial({ map: featherTexture(key, backC, bellyC, patC), roughness: 0.95 });
  const face = new THREE.MeshStandardMaterial({ color: "#c9a092", roughness: 0.7 });
  const beak = new THREE.MeshStandardMaterial({ color: "#e3a238", roughness: 0.35 });
  const beakTip = new THREE.MeshStandardMaterial({ color: "#8a5a1e", roughness: 0.35 });
  const legM = new THREE.MeshStandardMaterial({ color: "#d9a93c", roughness: 0.6, bumpMap: scaleBumpTexture(), bumpScale: 1 });
  const tuftM = new THREE.MeshStandardMaterial({ color: female ? "#dfe4ee" : "#caa27a", roughness: 0.95 });
  const wingM = new THREE.MeshStandardMaterial({ map: featherTexture(key + "w", patC, backC, bellyC), roughness: 0.95 });
  const materials = [feathers, face, beak, legM, tuftM, wingM, beakTip];
  const root = new THREE.Group();
  const body = g();
  root.add(body);
  const hipY = spec.legLen * 0.95;
  const torso = g(0, hipY + 0.2, 0);
  body.add(torso);
  // pear-shaped body: wide bottom/rear, tapering to the chest
  const bodyGeo = new THREE.SphereGeometry(1, 28, 20);
  const bp = bodyGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < bp.count; i++) {
    let x = bp.getX(i), y = bp.getY(i), z = bp.getZ(i);
    const low = Math.max(0, -y), rear = Math.max(0, -z);
    x *= 1 + low * 0.14 + rear * 0.08;
    z *= 1 + low * 0.06;
    y *= 1 + rear * 0.1;
    bp.setXYZ(i, x * 0.27, y * 0.27, z * 0.33);
  }
  bodyGeo.computeVertexNormals();
  add(torso, bodyGeo, feathers);
  // fluffy chest ruff + neck
  add(torso, ell(0.2, 0.2, 0.14, 0, 0.06, 0.2, 16), feathers);
  const neckG = g(0, 0.14, 0.2);
  torso.add(neckG);
  neckG.rotation.x = -0.5;
  add(neckG, [ell(0.13, 0.13, 0.12, 0, 0.02, 0.04, 14)], feathers);
  const head = g(0, 0.08, 0.1);
  neckG.add(head);
  head.rotation.x = 0.45;
  // big round head, bare wrinkled facial skin around the eyes and beak base
  add(head, ell(0.115, 0.12, 0.13, 0, 0.06, 0.02, 18), feathers);
  add(head, [ell(0.1, 0.085, 0.09, 0, 0.045, 0.085, 16)], face);
  for (const sd of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 8), new THREE.MeshStandardMaterial({ color: "#f0d860", roughness: 0.2 }));
    eye.position.set(sd * 0.085, 0.075, 0.09);
    head.add(eye);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 6), shared.eye);
    pupil.position.set(sd * 0.097, 0.075, 0.095);
    head.add(pupil);
    const glint = new THREE.Mesh(new THREE.SphereGeometry(0.004, 5, 4), shared.eyeGlint);
    glint.position.set(sd * 0.104, 0.082, 0.1);
    head.add(glint);
    // wrinkles around the eye
    add(head, new THREE.TorusGeometry(0.024, 0.005, 5, 12).rotateY(Math.PI / 2).translate(sd * 0.088, 0.075, 0.09), face, false);
  }
  // hooked upper beak (long, deep, curving down into a sharp hook with darker tip)
  const upper = rigidLoft([
    { pos: new THREE.Vector3(0, 0.05, 0.12), w: 0.075, top: 0.06, bot: 0.03 },
    { pos: new THREE.Vector3(0, 0.055, 0.2), w: 0.058, top: 0.058, bot: 0.028, ridge: 0.012 },
    { pos: new THREE.Vector3(0, 0.045, 0.28), w: 0.042, top: 0.05, bot: 0.024, ridge: 0.012 },
    { pos: new THREE.Vector3(0, 0.02, 0.335), w: 0.03, top: 0.038, bot: 0.02 },
    { pos: new THREE.Vector3(0, -0.025, 0.355), w: 0.016, top: 0.02, bot: 0.012 },
  ], { ring: 14, perSeg: 4, up: new THREE.Vector3(0, 1, 0), capStart: true, capEnd: true });
  add(head, upper, beak);
  add(head, cone(0.014, 0.05, 6).rotateX(Math.PI * 0.85).translate(0, -0.035, 0.355), beakTip, false);
  // nostril slits
  for (const sd of [-1, 1]) add(head, ell(0.006, 0.004, 0.018, sd * 0.03, 0.095, 0.22, 6), beakTip, false);
  const jaw = g(0, 0.02, 0.12);
  head.add(jaw);
  add(jaw, rigidLoft([
    { pos: new THREE.Vector3(0, 0, 0), w: 0.062, top: 0.015, bot: 0.028 },
    { pos: new THREE.Vector3(0, -0.005, 0.1), w: 0.045, top: 0.013, bot: 0.022 },
    { pos: new THREE.Vector3(0, -0.012, 0.19), w: 0.022, top: 0.008, bot: 0.012 },
  ], { ring: 12, perSeg: 3, up: new THREE.Vector3(0, 1, 0), capStart: true, capEnd: true }), beak);
  // forehead tuft
  const tufts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 7; i++) { const c = cone(0.018, 0.07, 5); c.rotateX(-0.9 + i * 0.1); c.rotateZ((i - 3) * 0.18); c.translate((i - 3) * 0.012, 0.17, 0.02 - i * 0.004); tufts.push(c); }
  add(head, tufts, tuftM, false);
  // stubby wings with lighter tip feathers
  const wings: THREE.Group[] = [];
  for (const sd of [-1, 1]) {
    const w = g(sd * 0.25, 0.05, 0.05);
    torso.add(w);
    add(w, ell(0.035, 0.1, 0.15, 0, -0.03, -0.04, 12), wingM);
    for (let k = 0; k < 4; k++) add(w, ell(0.02, 0.022, 0.07, 0, -0.1 - k * 0.012, -0.12 - k * 0.03, 6), tuftM, false);
    w.rotation.z = sd * 0.15;
    w.name = "dodowing";
    wings.push(w);
  }
  // curly tail plume (tail groups used for sway)
  const tail: THREE.Group[] = [];
  const t0 = g(0, 0.1, -0.3);
  torso.add(t0);
  const plume: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 9; i++) {
    const a = (i - 4) * 0.22;
    const c = ell(0.035, 0.035, 0.1, Math.sin(a) * 0.06, 0.05 + Math.abs(a) * 0.05, -0.05, 8);
    c.rotateX(-0.9 - Math.abs(a) * 0.3);
    plume.push(c);
  }
  add(t0, plume, tuftM);
  tail.push(t0);
  const t1 = g(0, 0.08, -0.06);
  t0.add(t1);
  add(t1, [ell(0.03, 0.03, 0.08, 0, 0.05, -0.02, 8).rotateX(-1.4), ell(0.025, 0.025, 0.06, 0.03, 0.08, 0, 6).rotateX(-1.7)], tuftM);
  tail.push(t1);
  // legs: feathered thighs, thick scaly yellow tarsus, 3 forward toes + hallux
  const legs: Leg[] = [];
  for (const sd of [-1, 1]) {
    const hip = g(sd * 0.12, hipY + 0.06, -0.02);
    body.add(hip);
    add(hip, ell(0.08, 0.1, 0.09, 0, -0.03, 0, 10), feathers);
    const knee = g(0, -0.1, 0.02);
    hip.add(knee);
    add(knee, limbDown(0.032, 0.028, 0.12), legM);
    const ankle = g(0, -0.12, 0);
    knee.add(ankle);
    add(ankle, ell(0.03, 0.02, 0.03), legM);
    const toes: THREE.BufferGeometry[] = [], claws: THREE.BufferGeometry[] = [];
    for (let t = 0; t < 3; t++) {
      const a = (t - 1) * 0.45;
      const toe = limbZ(0.013, 0.009, 0.075);
      toe.rotateY(a);
      toe.translate(0, -0.015, 0);
      toes.push(toe);
      const cl = cone(0.007, 0.02, 4);
      cl.rotateX(Math.PI / 2 + 0.5);
      cl.translate(Math.sin(a) * 0.08, -0.02, Math.cos(a) * 0.08);
      claws.push(cl);
    }
    toes.push(limbZ(0.01, 0.007, 0.04).rotateY(Math.PI).translate(0, -0.015, 0));
    add(ankle, toes, legM);
    add(ankle, claws, shared.claw);
    const rest: [number, number, number] = [-0.12, 0.3, -0.18];
    hip.rotation.x = rest[0]; knee.rotation.x = rest[1]; ankle.rotation.x = rest[2];
    legs.push({ hip, knee, ankle, front: false, side: sd, rest });
  }
  const saddleMount = g(0, 0.25, 0);
  torso.add(saddleMount);
  mergeByMaterial(root);
  root.scale.setScalar(scale);
  return { root, body, torso, neck: [neckG], head, jaw, legs, arms: [], tail, frill: null, materials, spec, hipY, wings: [], saddleMount, saddle: null };
}
