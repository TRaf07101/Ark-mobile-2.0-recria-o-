import * as THREE from "three";
import { barkTexture, hideTexture, thatchTexture } from "../core/textures";
import { ITEMS } from "../data/items";
import { structureVisual } from "../systems/building";
import { SPECIES } from "../data/species";
import { buildSaddle } from "./models";

/**
 * 3D models for every item. Tools/weapons are modeled along +Y with the grip at the origin
 * so they can be attached directly to the character's hand. Used for held items,
 * rendered inventory icons and world drops.
 */
const mats = new Map<string, THREE.Material>();
function M(key: string, make: () => THREE.Material) {
  let m = mats.get(key);
  if (!m) { m = make(); mats.set(key, m); }
  return m;
}
const std = (color: string, rough = 0.8, metal = 0, emissive?: string) =>
  M(`s${color}${rough}${metal}${emissive}`, () => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, emissive: emissive ?? "#000", emissiveIntensity: emissive ? 1.4 : 0 }));
const wood = () => M("wood", () => new THREE.MeshStandardMaterial({ map: barkTexture([150, 104, 60]), roughness: 0.85 }));
const darkWood = () => M("dwood", () => new THREE.MeshStandardMaterial({ map: barkTexture([96, 64, 36]), roughness: 0.9 }));
const stoneM = () => std("#8f8a82", 0.95);
const flintM = () => std("#4d5a6a", 0.35, 0.1);
const fiberM = () => std("#7ea04a", 0.9);
const hideM = () => M("hide", () => new THREE.MeshStandardMaterial({ map: hideTexture(), roughness: 0.9 }));
const thatchM = () => M("thatchI", () => new THREE.MeshStandardMaterial({ map: thatchTexture(), roughness: 1 }));

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  return m;
}
function rock(r: number, seed: number, detail = 1) {
  const g = new THREE.IcosahedronGeometry(r, detail);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const k = 1 + (Math.sin(p.getX(i) * 13 + seed) * Math.cos(p.getY(i) * 11 + seed * 2) * Math.sin(p.getZ(i) * 9)) * 0.22;
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.8, p.getZ(i) * k);
  }
  g.computeVertexNormals();
  return g;
}
function binding(parent: THREE.Object3D, y: number, r: number) {
  for (let i = 0; i < 3; i++) parent.add(mesh(new THREE.TorusGeometry(r, 0.012, 5, 10), fiberM(), 0, y + i * 0.025, 0, Math.PI / 2));
}
function handle(parent: THREE.Object3D, len: number, r = 0.022) {
  parent.add(mesh(new THREE.CylinderGeometry(r * 0.9, r, len, 8).translate(0, len / 2 - 0.08, 0), wood()));
}

function build(id: string): THREE.Object3D | null {
  const o = new THREE.Group();
  switch (id) {
    // ---------------- tools & weapons (along +Y)
    case "stone_pick": {
      handle(o, 0.72);
      const head = new THREE.Group();
      head.position.y = 0.56;
      head.add(mesh(new THREE.ConeGeometry(0.045, 0.28, 6).rotateZ(Math.PI / 2).translate(0.15, 0, 0), stoneM()));
      head.add(mesh(new THREE.ConeGeometry(0.045, 0.2, 6).rotateZ(-Math.PI / 2).translate(-0.11, 0, 0), stoneM()));
      head.add(mesh(new THREE.BoxGeometry(0.08, 0.09, 0.08), stoneM()));
      o.add(head);
      binding(o, 0.52, 0.032);
      break;
    }
    case "stone_hatchet": {
      handle(o, 0.62);
      const blade = rock(0.1, 3, 0);
      blade.scale(0.35, 1.2, 1);
      o.add(mesh(blade, flintM(), 0, 0.5, 0.08));
      binding(o, 0.44, 0.032);
      break;
    }
    case "spear": {
      handle(o, 1.8, 0.02);
      o.add(mesh(new THREE.ConeGeometry(0.045, 0.28, 4).scale(1, 1, 0.35), flintM(), 0, 1.84, 0));
      binding(o, 1.62, 0.028);
      break;
    }
    case "wooden_club": {
      o.add(mesh(new THREE.CylinderGeometry(0.06, 0.025, 0.7, 8).translate(0, 0.27, 0), darkWood()));
      for (let i = 0; i < 4; i++) o.add(mesh(new THREE.SphereGeometry(0.03, 5, 4), darkWood(), Math.cos(i * 1.7) * 0.055, 0.45 + i * 0.05, Math.sin(i * 1.7) * 0.055));
      binding(o, -0.02, 0.03);
      break;
    }
    case "torch": {
      handle(o, 0.5, 0.022);
      o.add(mesh(new THREE.CylinderGeometry(0.04, 0.03, 0.1, 8), hideM(), 0, 0.4, 0));
      const f = new THREE.Group();
      f.name = "flame";
      f.position.y = 0.52;
      f.add(mesh(new THREE.ConeGeometry(0.05, 0.18, 7), M("flameO", () => new THREE.MeshBasicMaterial({ color: "#ff8a1e", transparent: true, opacity: 0.9 }))));
      f.add(mesh(new THREE.ConeGeometry(0.028, 0.11, 7), M("flameI", () => new THREE.MeshBasicMaterial({ color: "#fff1a8" })), 0, -0.02, 0));
      o.add(f);
      break;
    }
    case "bow": {
      const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, -0.55, 0), new THREE.Vector3(0, 0, 0.32), new THREE.Vector3(0, 0.55, 0));
      o.add(mesh(new THREE.TubeGeometry(curve, 16, 0.018, 6), darkWood()));
      const line = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, -0.55, 0), new THREE.Vector3(0, 0.55, 0)]);
      o.add(new THREE.Line(line, M("string", () => new THREE.LineBasicMaterial({ color: "#e8e0c8" }))));
      o.add(mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.12, 8), hideM(), 0, 0, 0.16));
      o.rotation.x = 0;
      break;
    }
    case "slingshot": {
      handle(o, 0.22, 0.02);
      for (const s of [-1, 1]) o.add(mesh(new THREE.CylinderGeometry(0.015, 0.018, 0.14, 6).translate(0, 0.07, 0), wood(), s * 0.02, 0.12, 0, 0, 0, -s * 0.5));
      const band = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.09, 0.25, 0), new THREE.Vector3(0, 0.2, -0.04), new THREE.Vector3(0.09, 0.25, 0)]);
      o.add(new THREE.Line(band, M("band", () => new THREE.LineBasicMaterial({ color: "#6b3f22" }))));
      break;
    }
    // ---------------- ammo
    case "stone_arrow":
    case "tranq_arrow": {
      o.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.7, 5).translate(0, 0.35, 0), wood()));
      o.add(mesh(new THREE.ConeGeometry(0.022, 0.07, 4), id === "tranq_arrow" ? std("#7d4fb0", 0.4, 0.3) : flintM(), 0, 0.72, 0));
      for (let i = 0; i < 3; i++) o.add(mesh(new THREE.BoxGeometry(0.002, 0.1, 0.03), std(id === "tranq_arrow" ? "#c9a6f0" : "#e8e0d0"), 0, 0.06, 0, 0, (i / 3) * Math.PI * 2, 0));
      break;
    }
    // ---------------- resources
    case "wood": {
      for (let i = 0; i < 3; i++) {
        const l = mesh(new THREE.CylinderGeometry(0.07, 0.075, 0.5, 9), wood(), (i - 1) * 0.13, i === 1 ? 0.12 : 0, 0, 0, 0, Math.PI / 2);
        o.add(l);
        o.add(mesh(new THREE.CircleGeometry(0.068, 9), std("#c89a60"), (i - 1) * 0.13, i === 1 ? 0.12 : 0, 0.251, 0, 0, 0));
        l.rotation.set(Math.PI / 2, 0, 0);
      }
      break;
    }
    case "thatch": {
      for (let i = 0; i < 16; i++) o.add(mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.55, 4), std(i % 3 ? "#c8a45a" : "#a88842", 1), Math.cos(i * 2.4) * 0.05, 0, Math.sin(i * 2.4) * 0.05, Math.cos(i) * 0.15, 0, Math.sin(i) * 0.15));
      o.add(mesh(new THREE.TorusGeometry(0.07, 0.015, 5, 12), fiberM(), 0, 0, 0, Math.PI / 2));
      o.rotation.z = 0.5;
      break;
    }
    case "stone": {
      o.add(mesh(rock(0.13, 1), stoneM()));
      o.add(mesh(rock(0.08, 5), stoneM(), 0.14, -0.04, 0.05));
      break;
    }
    case "flint": {
      const g = new THREE.OctahedronGeometry(0.13, 0);
      g.scale(1, 1.4, 0.6);
      o.add(mesh(g, flintM(), 0, 0, 0, 0.3, 0.4, 0));
      o.add(mesh(new THREE.OctahedronGeometry(0.07, 0), flintM(), 0.12, -0.06, 0.04));
      break;
    }
    case "metal": {
      o.add(mesh(rock(0.14, 7), std("#5e5a55", 0.9)));
      for (let i = 0; i < 4; i++) o.add(mesh(new THREE.OctahedronGeometry(0.045, 0), std("#d8dde2", 0.25, 0.9), Math.cos(i * 1.6) * 0.1, 0.05 + (i % 2) * 0.05, Math.sin(i * 1.6) * 0.1));
      break;
    }
    case "fiber": {
      for (let i = 0; i < 12; i++) {
        const c = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, -0.2, 0), new THREE.Vector3(Math.cos(i) * 0.1, 0, Math.sin(i) * 0.1), new THREE.Vector3(Math.cos(i) * 0.2, 0.2, Math.sin(i) * 0.15));
        o.add(mesh(new THREE.TubeGeometry(c, 6, 0.008, 3), fiberM()));
      }
      break;
    }
    case "hide": {
      const g = new THREE.PlaneGeometry(0.45, 0.35, 6, 4);
      const p = g.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 9) * 0.03 + Math.cos(p.getY(i) * 7) * 0.02);
      g.computeVertexNormals();
      o.add(mesh(g, M("hide2", () => new THREE.MeshStandardMaterial({ map: hideTexture(), side: THREE.DoubleSide, roughness: 0.9 })), 0, 0, 0, -0.9, 0, 0.2));
      break;
    }
    case "keratin": {
      const c = new THREE.ConeGeometry(0.07, 0.4, 8);
      c.translate(0, 0.2, 0);
      o.add(mesh(c, std("#d9cba4", 0.6), 0, -0.15, 0, 0, 0, -0.5));
      break;
    }
    case "spoiled_meat":
    case "raw_meat": {
      const g = rock(0.16, 9);
      g.scale(1.2, 0.55, 0.9);
      o.add(mesh(g, std(id === "raw_meat" ? "#b8322a" : "#6b7a3a", 0.6)));
      o.add(mesh(new THREE.TorusGeometry(0.1, 0.02, 5, 12, Math.PI), std(id === "raw_meat" ? "#f0e0d0" : "#a0a070", 0.7), 0, 0.04, 0, -Math.PI / 2));
      break;
    }
    case "cooked_meat": {
      const g = rock(0.13, 4);
      g.scale(1, 1.3, 1);
      o.add(mesh(g, std("#7a3d18", 0.55), 0, 0.08, 0));
      o.add(mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.2, 6), std("#efe6d0", 0.6), 0, -0.14, 0));
      o.add(mesh(new THREE.SphereGeometry(0.035, 6, 5), std("#efe6d0", 0.6), 0.02, -0.25, 0));
      o.add(mesh(new THREE.SphereGeometry(0.035, 6, 5), std("#efe6d0", 0.6), -0.02, -0.25, 0));
      break;
    }
    case "mejoberry":
    case "amarberry":
    case "narcoberry":
    case "stimberry": {
      const col = ITEMS[id].color;
      for (let i = 0; i < 9; i++) {
        const a = i * 2.4, r = i === 0 ? 0 : 0.05 + (i % 3) * 0.025;
        o.add(mesh(new THREE.SphereGeometry(0.045, 8, 6), std(col, 0.35), Math.cos(a) * r, (i % 3) * 0.035, Math.sin(a) * r));
      }
      o.add(mesh(new THREE.PlaneGeometry(0.12, 0.07), M("leafI", () => new THREE.MeshStandardMaterial({ color: "#4f8a36", side: THREE.DoubleSide })), 0.06, 0.1, 0, 0.5, 0.3, 0.3));
      break;
    }
    case "narcotic":
    case "stimulant": {
      o.add(mesh(new THREE.SphereGeometry(0.12, 10, 8).scale(1, 0.9, 1), hideM()));
      o.add(mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.06, 8), hideM(), 0, 0.12, 0));
      o.add(mesh(new THREE.TorusGeometry(0.045, 0.012, 5, 10), std(id === "narcotic" ? "#6b3fa0" : "#2fa39a", 0.5), 0, 0.1, 0, Math.PI / 2));
      break;
    }
    case "kibble_basic": {
      const g = new THREE.SphereGeometry(0.1, 10, 8);
      g.scale(1, 1.3, 1);
      o.add(mesh(g, std("#c9a26a", 0.8)));
      for (let i = 0; i < 6; i++) o.add(mesh(new THREE.SphereGeometry(0.018, 5, 4), std("#7a5a30"), Math.cos(i) * 0.09, (i - 3) * 0.03, Math.sin(i) * 0.09));
      break;
    }
    case "metal_pick": {
      handle(o, 0.78);
      const head = new THREE.Group();
      head.position.y = 0.62;
      const steel = std("#c9d1d8", 0.3, 0.85);
      head.add(mesh(new THREE.ConeGeometry(0.035, 0.34, 6).rotateZ(Math.PI / 2).translate(0.18, 0, 0), steel));
      head.add(mesh(new THREE.ConeGeometry(0.035, 0.24, 6).rotateZ(-Math.PI / 2).translate(-0.13, 0, 0), steel));
      head.add(mesh(new THREE.BoxGeometry(0.07, 0.08, 0.07), steel));
      o.add(head);
      o.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.18, 8), hideM(), 0, 0.02, 0));
      break;
    }
    case "metal_hatchet": {
      handle(o, 0.66);
      const b = new THREE.Shape();
      b.moveTo(0, -0.06); b.lineTo(0.2, -0.12); b.quadraticCurveTo(0.26, 0, 0.2, 0.12); b.lineTo(0, 0.06);
      o.add(mesh(new THREE.ExtrudeGeometry(b, { depth: 0.02, bevelEnabled: false }).translate(0, 0, -0.01), std("#c9d1d8", 0.3, 0.85), 0.02, 0.52, 0));
      o.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.18, 8), hideM(), 0, 0.02, 0));
      break;
    }
    case "metal_sword": {
      o.add(mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.2, 8).translate(0, 0.02, 0), hideM()));
      o.add(mesh(new THREE.BoxGeometry(0.22, 0.03, 0.05), std("#8a7a5a", 0.4, 0.7), 0, 0.13, 0));
      const blade = new THREE.BoxGeometry(0.06, 0.8, 0.012);
      blade.translate(0, 0.55, 0);
      o.add(mesh(blade, std("#dfe6ec", 0.2, 0.95)));
      o.add(mesh(new THREE.ConeGeometry(0.03, 0.1, 4).scale(1, 1, 0.2), std("#dfe6ec", 0.2, 0.95), 0, 1.0, 0));
      o.add(mesh(new THREE.SphereGeometry(0.03, 6, 5), std("#8a7a5a", 0.4, 0.7), 0, -0.1, 0));
      break;
    }
    case "waterskin": {
      o.add(mesh(new THREE.SphereGeometry(0.14, 10, 8).scale(1, 1.2, 0.7), hideM()));
      o.add(mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.08, 8), wood(), 0, 0.2, 0));
      o.add(mesh(new THREE.TorusGeometry(0.1, 0.01, 4, 12, Math.PI), fiberM(), 0, 0.1, 0, 0, 0, 0));
      break;
    }
    case "metal_ingot": {
      const shape = new THREE.BoxGeometry(0.3, 0.08, 0.13);
      const st = std("#c9d1d8", 0.3, 0.9);
      o.add(mesh(shape, st, 0, 0, 0));
      o.add(mesh(shape.clone(), st, 0.05, 0.085, 0.02, 0, 0.3, 0));
      break;
    }
    case "sparkpowder":
    case "cementing_paste": {
      o.add(mesh(new THREE.SphereGeometry(0.12, 10, 8).scale(1, 0.9, 1), hideM()));
      const top = new THREE.SphereGeometry(0.1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
      o.add(mesh(top, std(id === "sparkpowder" ? "#7a7a80" : "#b0a898", 1), 0, 0.07, 0));
      break;
    }
    case "chitin": {
      const g = new THREE.SphereGeometry(0.15, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2);
      g.scale(1, 0.6, 1.3);
      o.add(mesh(g, std("#4a5a48", 0.4, 0.2)));
      for (let i = 0; i < 3; i++) o.add(mesh(new THREE.TorusGeometry(0.12 - i * 0.03, 0.01, 4, 12, Math.PI), std("#2e3a2c", 0.5), 0, 0.02 + i * 0.03, (i - 1) * 0.06, 0, Math.PI / 2, 0));
      break;
    }
    case "raw_prime":
    case "cooked_prime":
    case "fish_meat": {
      const g = rock(0.17, 12);
      g.scale(1.3, 0.55, 0.9);
      const col = id === "raw_prime" ? "#d8403a" : id === "cooked_prime" ? "#8e4a1f" : "#e8b0a0";
      o.add(mesh(g, std(col, 0.5)));
      for (let i = 0; i < 3; i++) o.add(mesh(new THREE.TorusGeometry(0.08, 0.012, 4, 10, Math.PI), std("#f4e8e0", 0.6), -0.1 + i * 0.1, 0.06, 0, -Math.PI / 2));
      break;
    }
    case "mejoberry_seed":
    case "amarberry_seed":
    case "narcoberry_seed": {
      for (let i = 0; i < 7; i++) o.add(mesh(new THREE.SphereGeometry(0.035, 6, 4).scale(1, 1.4, 1), std(i % 2 ? "#8a6a3a" : "#6a9a3a", 0.7), Math.cos(i * 2.4) * 0.07, (i % 3) * 0.02, Math.sin(i * 2.4) * 0.07, 0.3, 0, 0.4));
      o.add(mesh(new THREE.ConeGeometry(0.03, 0.12, 5), std("#5a9a3a", 0.8), 0, 0.08, 0));
      break;
    }
    default: {
      const d0 = ITEMS[id];
      if (d0?.armor) {
        const tier = id.split("_")[0];
        const col = { cloth: "#b8a888", hide: "#7a5236", chitin: "#3e4c3c", metal: "#9aa3ad" }[tier] ?? "#888";
        const am = std(col, tier === "metal" ? 0.35 : 0.85, tier === "metal" ? 0.8 : 0);
        const slot = d0.armor.slot;
        if (slot === "head") { o.add(mesh(new THREE.SphereGeometry(0.16, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), am)); if (tier === "metal") o.add(mesh(new THREE.BoxGeometry(0.02, 0.12, 0.08), am, 0, 0, 0.15)); }
        else if (slot === "chest") { o.add(mesh(new THREE.SphereGeometry(0.2, 12, 10).scale(1, 1.3, 0.6), am)); for (const sd of [-1, 1]) o.add(mesh(new THREE.SphereGeometry(0.08, 8, 6), am, sd * 0.21, 0.16, 0)); }
        else if (slot === "legs") { for (const sd of [-1, 1]) o.add(mesh(new THREE.CylinderGeometry(0.07, 0.055, 0.42, 10), am, sd * 0.08, 0, 0)); o.add(mesh(new THREE.BoxGeometry(0.28, 0.1, 0.14), am, 0, 0.22, 0)); }
        else if (slot === "hands") { for (const sd of [-1, 1]) o.add(mesh(new THREE.SphereGeometry(0.06, 8, 6).scale(1, 1.4, 0.7), am, sd * 0.09, 0, 0)); }
        else { for (const sd of [-1, 1]) { o.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.16, 8), am, sd * 0.08, 0.06, 0)); o.add(mesh(new THREE.SphereGeometry(0.055, 8, 6).scale(1, 0.6, 1.8), am, sd * 0.08, -0.03, 0.04)); } }
        return o;
      }
      if (d0?.saddle) {
        const sp = SPECIES[d0.saddle.species];
        if (sp) { const sd = buildSaddle({ ...sp.model, bodyW: 0.7, bodyH: 0.5, bodyLen: 1.2 }); return sd; }
      }
      const d = ITEMS[id];
      if (d?.structure) {
        const v = structureVisual(d.structure);
        if (v) return v;
      }
      return null;
    }
  }
  return o;
}

const protoCache = new Map<string, THREE.Object3D | null>();
/** Returns a new instance of an item's model (clones a cached prototype). */
export function itemModel(id: string, _held = false): THREE.Object3D | null {
  if (!protoCache.has(id)) protoCache.set(id, build(id));
  const p = protoCache.get(id);
  return p ? p.clone(true) : null;
}
export { thatchM };
