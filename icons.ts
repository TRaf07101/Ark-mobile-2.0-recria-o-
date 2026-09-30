import * as THREE from "three";
import { ITEMS } from "../data/items";
import { itemModel } from "../entities/itemModels";
import { buildCreature, buildHuman } from "../entities/models";
import { SPECIES_LIST } from "../data/species";

/**
 * Renders every item's 3D model into a small transparent image once, producing a
 * consistent illustrated icon set for inventory, hotbar, crafting and notifications.
 */
const icons = new Map<string, string>();
let ready = false;

export function iconFor(id: string): string {
  return icons.get(id) ?? "";
}
export function iconsReady() {
  return ready;
}

export async function generateIcons(onProgress?: (p: number) => void) {
  if (ready) return;
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  } catch (e) {
    console.warn("Icon renderer unavailable", e);
    ready = true;
    return;
  }
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight("#ffffff", "#6a5a48", 1.6));
  const key = new THREE.DirectionalLight("#fff3dc", 2.2);
  key.position.set(2, 3, 2.5);
  scene.add(key);
  const rim = new THREE.DirectionalLight("#9fd8ff", 1.0);
  rim.position.set(-3, 1, -2);
  scene.add(rim);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.01, 100);
  const ids = Object.keys(ITEMS);
  const box = new THREE.Box3(), center = new THREE.Vector3(), sz = new THREE.Vector3();
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const m = itemModel(id);
    if (!m) continue;
    const holder = new THREE.Group();
    holder.add(m);
    const d = ITEMS[id];
    // pleasant 3/4 angle; long tools laid diagonally
    if (d.tool || d.cat === "ammo") holder.rotation.set(0.2, 0.6, -0.75);
    else holder.rotation.set(0.45, -0.6, 0);
    scene.add(holder);
    holder.updateMatrixWorld(true);
    box.setFromObject(holder);
    box.getCenter(center);
    box.getSize(sz);
    const r = Math.max(sz.x, sz.y, sz.z) * 0.62;
    const dist = r / Math.tan((cam.fov * Math.PI) / 360);
    cam.position.set(center.x, center.y + dist * 0.12, center.z + dist);
    cam.lookAt(center);
    renderer.render(scene, cam);
    icons.set(id, canvas.toDataURL("image/png"));
    scene.remove(holder);
    if (i % 6 === 0) {
      onProgress?.(i / ids.length);
      await new Promise((res) => setTimeout(res, 0));
    }
  }
  // portraits: survivor + every species (used by character screen and dossiers)
  const portrait = (obj: THREE.Object3D, key: string, yaw: number) => {
    const holder = new THREE.Group();
    holder.add(obj);
    holder.rotation.y = yaw;
    scene.add(holder);
    holder.updateMatrixWorld(true);
    box.setFromObject(holder);
    box.getCenter(center);
    box.getSize(sz);
    const r = Math.max(sz.x, sz.y, sz.z) * 0.58;
    const dist = r / Math.tan((cam.fov * Math.PI) / 360);
    cam.position.set(center.x + dist * 0.15, center.y + dist * 0.18, center.z + dist);
    cam.lookAt(center);
    renderer.render(scene, cam);
    icons.set(key, canvas.toDataURL("image/png"));
    scene.remove(holder);
  };
  canvas.width = canvas.height = 256;
  renderer.setSize(256, 256, false);
  portrait(buildHuman().root, "__player", 0.5);
  for (const sp of SPECIES_LIST) {
    const rig = buildCreature(sp.model, sp.id, 1);
    portrait(rig.root, "__sp_" + sp.id, -0.9);
    await new Promise((res) => setTimeout(res, 0));
  }
  renderer.dispose();
  renderer.forceContextLoss();
  ready = true;
  onProgress?.(1);
}
