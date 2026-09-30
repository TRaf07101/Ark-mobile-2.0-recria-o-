import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * Draw-call optimizer: for every node, merges its direct Mesh children that share
 * the same material (and have no children of their own) into a single mesh.
 * Bone hierarchy (groups) is preserved so skeletal animation keeps working.
 */
export function mergeByMaterial(root: THREE.Object3D) {
  const nodes: THREE.Object3D[] = [];
  root.traverse((o) => nodes.push(o));
  for (const node of nodes) {
    const buckets = new Map<THREE.Material, THREE.Mesh[]>();
    for (const ch of node.children) {
      const m = ch as THREE.Mesh;
      if (!m.isMesh || (m as THREE.SkinnedMesh).isSkinnedMesh || m.children.length || Array.isArray(m.material) || m.name) continue;
      let b = buckets.get(m.material as THREE.Material);
      if (!b) { b = []; buckets.set(m.material as THREE.Material, b); }
      b.push(m);
    }
    for (const [mat, list] of buckets) {
      if (list.length < 2) continue;
      const geos: THREE.BufferGeometry[] = [];
      let ok = true;
      const keys = (g: THREE.BufferGeometry) => Object.keys(g.attributes).filter((k) => k === "position" || k === "normal" || k === "uv").sort().join();
      for (const m of list) {
        m.updateMatrix();
        let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
        if (!g.attributes.normal) g.computeVertexNormals();
        if (!g.attributes.uv) g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
        for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal" && k !== "uv") g.deleteAttribute(k);
        g = g.applyMatrix4(m.matrix);
        geos.push(g);
      }
      const k0 = keys(geos[0]);
      if (geos.some((g) => keys(g) !== k0)) ok = false;
      const merged = ok ? mergeGeometries(geos) : null;
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = list.some((m) => m.castShadow);
      mesh.receiveShadow = list.some((m) => m.receiveShadow);
      for (const m of list) { node.remove(m); m.geometry.dispose(); }
      node.add(mesh);
    }
  }
}
