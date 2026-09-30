import * as THREE from "three";
import { mulberry32 } from "../core/noise";

/**
 * Continuous skinned-mesh generator ("loft along bones").
 * A chain of nodes (positions in root space at bind time) is sampled with a Catmull-Rom
 * curve; each sample gets an elliptical/superellipse cross-section with separate top,
 * bottom and side radii plus optional dorsal ridge and muscle bulges. Vertices are weighted
 * to the bone that owns each segment, blended across joints so bends deform smoothly.
 */
export interface LoftNode {
  pos: THREE.Vector3;
  bone: number; // bone index owning the segment starting at this node
  w: number; // half width
  top: number; // radius above center
  bot: number; // radius below center
  ridge?: number; // dorsal ridge height
  ridgeSharp?: number;
  keel?: number; // ventral keel
}

export interface LoftOptions {
  ring: number; // vertices per ring
  perSeg: number; // samples per segment
  up: THREE.Vector3; // reference "top" direction for cross-sections
  uScale: number; // texture repeat along the chain
  capStart?: boolean;
  capEnd?: boolean;
  noise?: number; // surface wrinkle amplitude (fraction of radius)
  seed?: number;
  squareness?: number; // 2 = ellipse, >2 = boxier sections
}

export interface LoftBuffers {
  pos: number[];
  nor: number[];
  uv: number[];
  si: number[];
  sw: number[];
  idx: number[];
}

export function newBuffers(): LoftBuffers {
  return { pos: [], nor: [], uv: [], si: [], sw: [], idx: [] };
}

const smooth = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Append one lofted tube to the buffers. */
export function loft(buf: LoftBuffers, nodes: LoftNode[], o: LoftOptions) {
  if (nodes.length < 2) return;
  const curve = new THREE.CatmullRomCurve3(nodes.map((n) => n.pos.clone()), false, "centripetal", 0.5);
  const segs = nodes.length - 1;
  const total = segs * o.perSeg;
  const rng = mulberry32(o.seed ?? 7);
  const wr = Array.from({ length: 6 }, () => rng() * 10);
  const base = buf.pos.length / 3;
  const sq = o.squareness ?? 2;
  const P = new THREE.Vector3(), T = new THREE.Vector3(), N = new THREE.Vector3(), Bn = new THREE.Vector3();
  let arc = 0;
  const prev = new THREE.Vector3();
  const rings: number[] = [];
  for (let k = 0; k <= total; k++) {
    const u = k / total;
    const segF = u * segs;
    const si = Math.min(segs - 1, Math.floor(segF));
    const t = segF - si;
    // getPointAt uses arc-length reparameterization. The node radii and bone indices
    // below use uniform *segment* parameterization, so getPointAt put each bend at
    // the wrong ring and created a pinched, arched neck on long-headed bipeds.
    curve.getPoint(Math.min(1, u), P);
    curve.getTangent(Math.min(1, Math.max(0, u)), T).normalize();
    if (k > 0) arc += P.distanceTo(prev);
    prev.copy(P);
    N.copy(o.up).addScaledVector(T, -o.up.dot(T));
    if (N.lengthSq() < 1e-6) N.set(0, 0, 1).addScaledVector(T, -T.z);
    N.normalize();
    Bn.crossVectors(T, N).normalize();
    const a = nodes[si], b = nodes[si + 1];
    const e = smooth(t);
    const w = lerp(a.w, b.w, e), top = lerp(a.top, b.top, e), bot = lerp(a.bot, b.bot, e);
    const ridge = lerp(a.ridge ?? 0, b.ridge ?? 0, e);
    const ridgeSharp = lerp(a.ridgeSharp ?? 10, b.ridgeSharp ?? 10, e);
    const keel = lerp(a.keel ?? 0, b.keel ?? 0, e);
    // bone weights: owner of this segment, blended with neighbours near the joints
    const owner = a.bone;
    const prevOwner = si > 0 ? nodes[si - 1].bone : owner;
    const nextOwner = si + 1 < segs ? nodes[si + 1].bone : owner;
    let wPrev = 0, wNext = 0;
    if (t < 0.4 && prevOwner !== owner) wPrev = 0.5 * smooth(1 - t / 0.4);
    if (t > 0.6 && nextOwner !== owner) wNext = 0.5 * smooth((t - 0.6) / 0.4);
    const wOwn = 1 - wPrev - wNext;
    rings.push(buf.pos.length / 3);
    for (let r = 0; r <= o.ring; r++) {
      const th = (r / o.ring) * Math.PI * 2; // 0 = top
      const c = Math.cos(th), s = Math.sin(th);
      const ec = Math.sign(c) * Math.pow(Math.abs(c), 2 / sq), es = Math.sign(s) * Math.pow(Math.abs(s), 2 / sq);
      let vr = c >= 0 ? top : bot;
      vr += ridge * Math.pow(Math.max(0, c), ridgeSharp) + keel * Math.pow(Math.max(0, -c), 6);
      const wrinkle = o.noise ? 1 + o.noise * (Math.sin(th * 7 + wr[0] + arc * 9) * 0.5 + Math.sin(th * 13 + wr[1] + arc * 17) * 0.3 + Math.sin(arc * 31 + wr[2]) * 0.2) : 1;
      const x = P.x + (N.x * ec * vr + Bn.x * es * w) * wrinkle;
      const y = P.y + (N.y * ec * vr + Bn.y * es * w) * wrinkle;
      const z = P.z + (N.z * ec * vr + Bn.z * es * w) * wrinkle;
      buf.pos.push(x, y, z);
      const nn = new THREE.Vector3().addScaledVector(N, ec / Math.max(1e-3, vr)).addScaledVector(Bn, es / Math.max(1e-3, w)).normalize();
      buf.nor.push(nn.x, nn.y, nn.z);
      buf.uv.push(arc * o.uScale, (1 + c) / 2);
      buf.si.push(owner, prevOwner, nextOwner, 0);
      buf.sw.push(wOwn, wPrev, wNext, 0);
    }
  }
  const stride = o.ring + 1;
  for (let k = 0; k < total; k++)
    for (let r = 0; r < o.ring; r++) {
      const a0 = rings[k] + r, a1 = rings[k] + r + 1, b0 = rings[k + 1] + r, b1 = rings[k + 1] + r + 1;
      // counter-clockwise when seen from outside (normals point out; back-face culling hides the interior)
      buf.idx.push(a0, a1, b0, a1, b1, b0);
    }
  const cap = (ringStart: number, nodeIdx: number, flip: boolean) => {
    const center = new THREE.Vector3();
    for (let r = 0; r < o.ring; r++) center.add(new THREE.Vector3(buf.pos[(ringStart + r) * 3], buf.pos[(ringStart + r) * 3 + 1], buf.pos[(ringStart + r) * 3 + 2]));
    center.multiplyScalar(1 / o.ring);
    const ci = buf.pos.length / 3;
    buf.pos.push(center.x, center.y, center.z);
    const tan = curve.getTangent(flip ? 0 : 1).multiplyScalar(flip ? -1 : 1);
    buf.nor.push(tan.x, tan.y, tan.z);
    buf.uv.push(flip ? 0 : arc * o.uScale, 0.5);
    const bn = nodes[nodeIdx].bone;
    buf.si.push(bn, 0, 0, 0);
    buf.sw.push(1, 0, 0, 0);
    for (let r = 0; r < o.ring; r++) {
      if (flip) buf.idx.push(ci, ringStart + r + 1, ringStart + r);
      else buf.idx.push(ci, ringStart + r, ringStart + r + 1);
    }
  };
  if (o.capStart) cap(rings[0], 0, true);
  if (o.capEnd) cap(rings[rings.length - 1], segs - 1, false);
  void stride;
  void base;
}

export function buildSkinnedGeometry(buf: LoftBuffers): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(buf.pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(buf.nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(buf.uv, 2));
  g.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(buf.si, 4));
  g.setAttribute("skinWeight", new THREE.Float32BufferAttribute(buf.sw, 4));
  g.setIndex(buf.idx);
  g.computeVertexNormals();
  return g;
}

/** Create a Bone at the origin of each group (so existing group animation drives the skin). */
export function attachBones(groups: THREE.Object3D[]): THREE.Bone[] {
  return groups.map((grp) => {
    const b = new THREE.Bone();
    b.name = "bone";
    grp.add(b);
    return b;
  });
}

/** Bind a skinned geometry to bones. The root must be at identity transform when called. */
export function makeSkinned(root: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, bones: THREE.Bone[] | THREE.Skeleton): THREE.SkinnedMesh {
  root.updateMatrixWorld(true);
  const mesh = new THREE.SkinnedMesh(geo, mat);
  mesh.name = "skin";
  mesh.castShadow = true;
  mesh.frustumCulled = false; // bounds change with animation
  root.add(mesh);
  mesh.updateMatrixWorld(true);
  const skel = bones instanceof THREE.Skeleton ? bones : new THREE.Skeleton(bones);
  // bone world matrices are current now (root updated above) — recompute the bind inverses
  skel.calculateInverses();
  mesh.bind(skel, mesh.matrixWorld.clone());
  return mesh;
}

/** World-space (root-space at bind) position of a point expressed in a group's local frame. */
export function wp(grp: THREE.Object3D, x = 0, y = 0, z = 0): THREE.Vector3 {
  grp.updateWorldMatrix(true, false);
  return new THREE.Vector3(x, y, z).applyMatrix4(grp.matrixWorld);
}

/** Rigid (non-skinned) loft for heads, jaws, horns: returns a regular geometry. */
export function rigidLoft(nodes: Omit<LoftNode, "bone">[], o: Omit<LoftOptions, "uScale"> & { uScale?: number }): THREE.BufferGeometry {
  const buf = newBuffers();
  loft(buf, nodes.map((n) => ({ ...n, bone: 0 })), { uScale: 1, ...o });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(buf.pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(buf.uv, 2));
  g.setIndex(buf.idx);
  g.computeVertexNormals();
  return g;
}
