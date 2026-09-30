import * as THREE from "three";
import { SPECIES } from "../data/species";

export interface Egg {
  id: number;
  species: string;
  level: number;
  statLv: Record<string, number>;
  pos: THREE.Vector3;
  progress: number; // 0..1 incubation
  health: number; // 0..1
  status: "ok" | "cold" | "hot";
  temp: number;
  mesh: THREE.Group;
}

export interface SavedEgg { species: string; level: number; statLv: Record<string, number>; pos: [number, number, number]; progress: number; health: number }

let EGG_ID = 1;

/** Fertilized eggs incubate on the ground within a species-specific temperature range. */
export class Breeding {
  eggs: Egg[] = [];
  constructor(private scene: THREE.Scene) {}

  private mesh(species: string): THREE.Group {
    const sp = SPECIES[species];
    const size = 0.18 + Math.min(0.35, (sp?.height ?? 1) * 0.06);
    const g = new THREE.Group();
    const shell = new THREE.Mesh(new THREE.SphereGeometry(size, 14, 10), new THREE.MeshStandardMaterial({ color: sp?.model.belly ?? "#eee", roughness: 0.6 }));
    shell.scale.set(0.8, 1.05, 0.8);
    shell.position.y = size;
    shell.castShadow = true;
    g.add(shell);
    for (let i = 0; i < 7; i++) {
      const spot = new THREE.Mesh(new THREE.SphereGeometry(size * 0.18, 6, 4), new THREE.MeshStandardMaterial({ color: sp?.model.accent ?? "#888" }));
      const a = i * 2.2, b = 0.4 + (i % 3) * 0.35;
      spot.position.set(Math.cos(a) * Math.sin(b) * size * 0.78, size + Math.cos(b) * size * 1.0, Math.sin(a) * Math.sin(b) * size * 0.78);
      spot.scale.setScalar(0.7);
      g.add(spot);
    }
    const nest = new THREE.Mesh(new THREE.TorusGeometry(size * 1.1, size * 0.35, 6, 14), new THREE.MeshStandardMaterial({ color: "#8a7040", roughness: 1 }));
    nest.rotation.x = Math.PI / 2;
    nest.position.y = size * 0.25;
    g.add(nest);
    return g;
  }

  lay(species: string, level: number, statLv: Record<string, number>, pos: THREE.Vector3, progress = 0, health = 1): Egg {
    const mesh = this.mesh(species);
    mesh.position.copy(pos);
    this.scene.add(mesh);
    const e: Egg = { id: EGG_ID++, species, level, statLv, pos: pos.clone(), progress, health, status: "ok", temp: 20, mesh };
    this.eggs.push(e);
    return e;
  }

  remove(e: Egg) {
    this.scene.remove(e.mesh);
    this.eggs = this.eggs.filter((x) => x !== e);
  }

  /** tempAt returns effective temperature at a point (ambient + heat sources). */
  update(dt: number, tempAt: (p: THREE.Vector3) => number, onHatch: (e: Egg) => void, onDie: (e: Egg) => void) {
    for (const e of [...this.eggs]) {
      const sp = SPECIES[e.species];
      const [lo, hi] = sp?.eggTemp ?? [20, 32];
      e.temp = tempAt(e.pos);
      e.status = e.temp < lo ? "cold" : e.temp > hi ? "hot" : "ok";
      if (e.status === "ok") {
        e.progress += dt / ((sp?.matureSeconds ?? 900) * 0.35);
        e.health = Math.min(1, e.health + dt * 0.01);
      } else e.health -= dt / 180;
      e.mesh.rotation.z = e.status === "ok" && e.progress > 0.85 ? Math.sin(performance.now() * 0.02) * 0.08 : 0;
      if (e.health <= 0) { onDie(e); this.remove(e); }
      else if (e.progress >= 1) { onHatch(e); this.remove(e); }
    }
  }

  clear() {
    for (const e of [...this.eggs]) this.remove(e);
  }

  serialize(): SavedEgg[] {
    return this.eggs.map((e) => ({ species: e.species, level: e.level, statLv: e.statLv, pos: [e.pos.x, e.pos.y, e.pos.z], progress: e.progress, health: e.health }));
  }
  load(list: SavedEgg[] | undefined) {
    for (const s of list ?? []) if (SPECIES[s.species]) this.lay(s.species, s.level, s.statLv, new THREE.Vector3(...s.pos), s.progress, s.health);
  }
}
