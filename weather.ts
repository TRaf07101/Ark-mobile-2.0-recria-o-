import * as THREE from "three";
import type { Terrain } from "../world/terrain";

export type WeatherKind = "clear" | "cloudy" | "rain" | "storm" | "fog";

export const WEATHER_LABEL: Record<WeatherKind, string> = {
  clear: "Céu limpo", cloudy: "Nublado", rain: "Chuva", storm: "Tempestade", fog: "Neblina",
};

interface Profile { cover: number; rain: number; fog: number; temp: number; wind: number }
const PROFILE: Record<WeatherKind, Profile> = {
  clear: { cover: 0.62, rain: 0, fog: 0, temp: 0, wind: 0.8 },
  cloudy: { cover: 0.38, rain: 0, fog: 0.1, temp: -2, wind: 1.1 },
  rain: { cover: 0.18, rain: 0.7, fog: 0.3, temp: -5, wind: 1.4 },
  storm: { cover: 0.05, rain: 1, fog: 0.45, temp: -8, wind: 2.2 },
  fog: { cover: 0.3, rain: 0, fog: 1, temp: -3, wind: 0.4 },
};

/**
 * Weather state machine + ambient temperature model.
 * Values interpolate smoothly between states so transitions feel natural.
 */
export class Weather {
  kind: WeatherKind = "clear";
  private next: WeatherKind = "clear";
  private timer = 240;
  cover = 0.62;
  rain = 0;
  fog = 0;
  tempOffset = 0;
  wind = 0.8;
  flash = 0;
  private boltTimer = 8;
  private rainMesh: THREE.LineSegments;
  private rainPos: Float32Array;
  private readonly N = 1400;
  onThunder: ((dist: number) => void) | null = null;

  constructor(scene: THREE.Scene) {
    this.rainPos = new Float32Array(this.N * 6);
    for (let i = 0; i < this.N; i++) this.seedDrop(i, new THREE.Vector3(), true);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.rainPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.rainMesh = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: "#a8c4d8", transparent: true, opacity: 0, depthWrite: false }));
    this.rainMesh.frustumCulled = false;
    this.rainMesh.renderOrder = 9;
    scene.add(this.rainMesh);
  }

  private seedDrop(i: number, c: THREE.Vector3, anyHeight = false) {
    const x = c.x + (Math.random() - 0.5) * 50, z = c.z + (Math.random() - 0.5) * 50;
    const y = c.y + (anyHeight ? Math.random() * 30 - 5 : 22 + Math.random() * 6);
    this.rainPos.set([x, y, z, x, y + 0.9, z], i * 6);
  }

  set(kind: WeatherKind, hold = 200) {
    this.next = kind;
    this.kind = kind;
    this.timer = hold;
  }

  update(dt: number, cam: THREE.Vector3, quality: string) {
    this.timer -= dt;
    if (this.timer <= 0) {
      const r = Math.random();
      this.next = r < 0.38 ? "clear" : r < 0.62 ? "cloudy" : r < 0.8 ? "rain" : r < 0.9 ? "storm" : "fog";
      this.kind = this.next;
      this.timer = 150 + Math.random() * 240;
    }
    const p = PROFILE[this.next];
    const k = Math.min(1, dt * 0.08);
    this.cover += (p.cover - this.cover) * k;
    this.rain += (p.rain - this.rain) * k;
    this.fog += (p.fog - this.fog) * k;
    this.tempOffset += (p.temp - this.tempOffset) * k;
    this.wind += (p.wind - this.wind) * k;
    // lightning
    this.flash = Math.max(0, this.flash - dt * 4);
    if (this.next === "storm" && this.rain > 0.6) {
      this.boltTimer -= dt;
      if (this.boltTimer <= 0) {
        this.boltTimer = 6 + Math.random() * 14;
        this.flash = 1;
        const dist = 200 + Math.random() * 600;
        this.onThunder?.(dist);
      }
    }
    // rain particles follow the camera
    const vis = quality === "low" ? 0.5 : 1;
    const mat = this.rainMesh.material as THREE.LineBasicMaterial;
    mat.opacity = Math.min(0.55, this.rain * 0.6);
    this.rainMesh.visible = this.rain > 0.03;
    if (!this.rainMesh.visible) return;
    const active = Math.floor(this.N * this.rain * vis);
    const fall = 26 * dt, drift = this.wind * 3 * dt;
    for (let i = 0; i < this.N; i++) {
      const o = i * 6;
      if (i >= active) { this.rainPos[o + 1] = this.rainPos[o + 4] = -999; continue; }
      this.rainPos[o + 1] -= fall; this.rainPos[o + 4] -= fall;
      this.rainPos[o] += drift; this.rainPos[o + 3] += drift * 1.3;
      if (this.rainPos[o + 1] < cam.y - 8 || Math.abs(this.rainPos[o] - cam.x) > 28 || Math.abs(this.rainPos[o + 2] - cam.z) > 28) this.seedDrop(i, cam);
    }
    (this.rainMesh.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }

  /** Ambient temperature (°C) at a point, before insulation. */
  temperatureAt(terrain: Terrain, x: number, y: number, z: number, hour: number): number {
    const biome = terrain.biomeAt(x, z);
    const base = biome === "beach" ? 27 : biome === "grassland" ? 24 : biome === "forest" ? 21 : biome === "hills" ? 14 : biome === "peak" ? 2 : 20;
    const alt = -Math.max(0, y - 20) * 0.35;
    const dayCurve = Math.sin(((hour - 9) / 24) * Math.PI * 2) * 6; // warmest ~15h
    return base + alt + dayCurve + this.tempOffset;
  }

  serialize() {
    return { kind: this.next, timer: this.timer };
  }
  load(d: { kind: WeatherKind; timer: number } | undefined) {
    if (!d) return;
    this.set(d.kind, d.timer);
    const p = PROFILE[d.kind];
    this.cover = p.cover; this.rain = p.rain; this.fog = p.fog; this.tempOffset = p.temp; this.wind = p.wind;
  }

  dispose(scene: THREE.Scene) {
    scene.remove(this.rainMesh);
    this.rainMesh.geometry.dispose();
  }
}
