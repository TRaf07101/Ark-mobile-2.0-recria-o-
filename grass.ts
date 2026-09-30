import * as THREE from "three";
import type { Terrain } from "./terrain";
import { hash2 } from "../core/noise";

/** Shared wind uniform used by grass, trees and bushes. */
export const WIND = { time: { value: 0 }, strength: { value: 1 } };

/** Inject a vertex sway into any Lambert/Standard material (instanced or not). */
export function addWind(mat: THREE.Material, amount: number, heightScale: number) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uWindTime = WIND.time;
    sh.uniforms.uWindStrength = WIND.strength;
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uWindTime;\nuniform float uWindStrength;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vec3 wBase = vec3(0.0);
        #ifdef USE_INSTANCING
          wBase = instanceMatrix[3].xyz;
        #endif
        float wh = max(0.0, position.y) * ${heightScale.toFixed(3)};
        float wph = uWindTime * 1.6 + wBase.x * 0.21 + wBase.z * 0.17;
        transformed.x += (sin(wph) * 0.7 + sin(wph * 2.3 + position.x) * 0.3) * wh * wh * ${amount.toFixed(3)} * uWindStrength;
        transformed.z += cos(wph * 0.8 + 1.3) * wh * wh * ${(amount * 0.6).toFixed(3)} * uWindStrength;`,
      );
  };
  mat.customProgramCacheKey = () => `wind${amount}_${heightScale}`;
}

/**
 * Clump of thin, curved, tapered blades (ARK-style tall grass). Each blade is a
 * 4-segment strip bent forward along a quadratic curve. Attributes:
 *  - color: base→tip gradient (dark/humid root, bright tip), some dry blades
 *  - aH: normalized height along the blade (0 root .. 1 tip) for wind and AO
 */
function bladeGeometry(blades = 14, seed = 1) {
  const pos: number[] = [], col: number[] = [], hh: number[] = [], idx: number[] = [];
  let r = seed * 9301 + 49297;
  const rnd = () => { r = (r * 9301 + 49297) % 233280; return r / 233280; };
  const SEG = 4;
  for (let b = 0; b < blades; b++) {
    const ang = rnd() * Math.PI * 2;
    const rad = Math.sqrt(rnd()) * 0.22;
    const ox = Math.cos(ang) * rad, oz = Math.sin(ang) * rad;
    const h = 0.45 + rnd() * 0.65;
    const w = 0.022 + rnd() * 0.018;
    const bendDir = rnd() * Math.PI * 2;
    const bend = 0.12 + rnd() * 0.3;
    const facing = rnd() * Math.PI;
    const fx = Math.cos(facing), fz = Math.sin(facing);
    const dry = rnd() < 0.14;
    const seedHead = rnd() < 0.08;
    const base = pos.length / 3;
    for (let s2 = 0; s2 <= SEG; s2++) {
      const t = s2 / SEG;
      const bx = ox + Math.cos(bendDir) * bend * t * t, bz = oz + Math.sin(bendDir) * bend * t * t;
      const y = h * t * (1 - bend * 0.25 * t);
      const ww = w * (1 - t * 0.92);
      pos.push(bx - fx * ww, y, bz - fz * ww, bx + fx * ww, y, bz + fz * ww);
      // root dark humid green → mid green → yellow-green tip; dry blades straw colored
      const c0 = dry ? [0.38, 0.33, 0.16] : [0.16, 0.26, 0.07];
      const c1 = dry ? [0.78, 0.68, 0.38] : [0.55, 0.72, 0.26];
      const k = Math.pow(t, 0.8);
      const c = [c0[0] + (c1[0] - c0[0]) * k, c0[1] + (c1[1] - c0[1]) * k, c0[2] + (c1[2] - c0[2]) * k];
      col.push(...c, ...c);
      hh.push(t, t);
    }
    for (let s2 = 0; s2 < SEG; s2++) {
      const a = base + s2 * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    if (seedHead) {
      // small seed spike at the top of the blade
      const tipX = ox + Math.cos(bendDir) * bend, tipZ = oz + Math.sin(bendDir) * bend, tipY = h * (1 - bend * 0.25);
      const sb = pos.length / 3;
      pos.push(tipX - 0.02, tipY, tipZ, tipX + 0.02, tipY, tipZ, tipX, tipY + 0.12, tipZ, tipX, tipY, tipZ - 0.02, tipX, tipY, tipZ + 0.02);
      for (let i = 0; i < 5; i++) { col.push(0.72, 0.6, 0.34); hh.push(1); }
      idx.push(sb, sb + 1, sb + 2, sb + 3, sb + 4, sb + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute("aH", new THREE.Float32BufferAttribute(hh, 1));
  g.setIndex(idx);
  // soft, mostly-upward normals give the lush, evenly lit look instead of flat cards
  const n: number[] = [];
  for (let i = 0; i < pos.length / 3; i++) n.push(0, 1, 0);
  g.setAttribute("normal", new THREE.Float32BufferAttribute(n, 3));
  return g;
}

/** Grass material: per-blade wind with travelling gusts, interaction bend around the player, distance fade. */
function grassMaterial(): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uWindTime = WIND.time;
    sh.uniforms.uWindStrength = WIND.strength;
    sh.uniforms.uPlayer = GRASS_UNIFORMS.player;
    sh.uniforms.uFadeFar = GRASS_UNIFORMS.fadeFar;
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", `#include <common>
        uniform float uWindTime; uniform float uWindStrength; uniform vec3 uPlayer; uniform float uFadeFar;
        attribute float aH; varying float vH; varying float vFade;`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        vH = aH;
        vec3 root = instanceMatrix[3].xyz;
        // travelling gust bands + per-clump phase
        float gust = sin(dot(root.xz, vec2(0.08, 0.05)) - uWindTime * 1.4) * 0.5 + 0.5;
        float ph = uWindTime * 2.2 + root.x * 0.37 + root.z * 0.29 + position.x * 6.0;
        float amp = (0.08 + gust * 0.22) * uWindStrength * aH * aH;
        transformed.x += (sin(ph) * 0.6 + gust * 0.9) * amp;
        transformed.z += (cos(ph * 0.83) * 0.4 + gust * 0.3) * amp;
        // bend away from the player
        vec3 d = root - uPlayer;
        float pd = length(d.xz);
        float push = smoothstep(1.1, 0.0, pd) * aH;
        transformed.xz += normalize(d.xz + 0.0001) * push * 0.45;
        transformed.y -= push * 0.25;
        float camD = length((modelViewMatrix * instanceMatrix * vec4(position, 1.0)).xyz);
        vFade = 1.0 - smoothstep(uFadeFar * 0.7, uFadeFar, camD);
        transformed *= mix(0.0, 1.0, vFade) ;`);
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vH; varying float vFade;")
      .replace("#include <color_fragment>", `#include <color_fragment>
        // ambient occlusion at the root, subtle translucency glow toward the tip
        diffuseColor.rgb *= mix(0.45, 1.08, smoothstep(0.0, 0.7, vH));`);
  };
  mat.customProgramCacheKey = () => "arkgrass";
  return mat;
}

export const GRASS_UNIFORMS = { player: { value: new THREE.Vector3() }, fadeFar: { value: 30 } };

/**
 * Grass field around the player. Instances are re-scattered deterministically
 * (world-hashed) whenever the player moves far enough, so blades stay stable.
 */
export class GrassField {
  mesh: THREE.InstancedMesh;
  private lastX = 1e9;
  private lastZ = 1e9;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3();
  private p = new THREE.Vector3();
  private c = new THREE.Color();
  private up = new THREE.Vector3(0, 1, 0);

  forceRefresh() {
    this.lastX = 1e9;
  }
  constructor(scene: THREE.Scene, private terrain: Terrain, private count: number, private radius: number) {
    this.mesh = new THREE.InstancedMesh(bladeGeometry(14, 3), grassMaterial(), Math.max(1, count));
    GRASS_UNIFORMS.fadeFar.value = radius;
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.count = 0;
    scene.add(this.mesh);
  }

  blocked: ((x: number, z: number) => boolean) | null = null;
  update(px: number, pz: number, py = 0) {
    GRASS_UNIFORMS.player.value.set(px, py, pz);
    if (this.count <= 0) { this.mesh.count = 0; return; }
    if (Math.hypot(px - this.lastX, pz - this.lastZ) < this.radius * 0.18) return;
    this.lastX = px;
    this.lastZ = pz;
    const step = (this.radius * 2) / Math.sqrt(this.count * 1.6);
    const t = this.terrain;
    let k = 0;
    const x0 = Math.floor((px - this.radius) / step), x1 = Math.floor((px + this.radius) / step);
    const z0 = Math.floor((pz - this.radius) / step), z1 = Math.floor((pz + this.radius) / step);
    for (let gz = z0; gz <= z1 && k < this.count; gz++)
      for (let gx = x0; gx <= x1 && k < this.count; gx++) {
        const h1 = hash2(gx, gz, 11), h2 = hash2(gx, gz, 23);
        const x = (gx + h1) * step, z = (gz + h2) * step;
        const d = Math.hypot(x - px, z - pz);
        if (d > this.radius) continue;
        const biome = t.biomeAt(x, z);
        if (biome !== "grassland" && biome !== "forest" && biome !== "hills") continue;
        if (this.blocked && this.blocked(x, z)) continue;
        const y = t.heightAt(x, z);
        if (t.normalAt(x, z).y < 0.82) continue;
        // patchy meadows: low-frequency noise makes dense fields and clearings like the original
        const patch = t.noise.noise2(x * 0.045, z * 0.045) * 0.5 + 0.5;
        const dens = (biome === "grassland" ? 1 : biome === "forest" ? 0.55 : 0.4) * THREE.MathUtils.smoothstep(patch, 0.15, 0.55);
        if (hash2(gx, gz, 37) > dens) continue;
        const tall = biome === "grassland" ? 0.7 + patch * 0.6 : 0.55 + patch * 0.4;
        const sc = (0.75 + hash2(gx, gz, 41) * 0.5) * tall;
        this.q.setFromAxisAngle(this.up, h1 * Math.PI * 2);
        this.s.set(sc * 0.95, sc, sc * 0.95);
        this.m.compose(this.p.set(x, y - 0.03, z), this.q, this.s);
        this.mesh.setMatrixAt(k, this.m);
        const tint = hash2(gx, gz, 53);
        const dryPatch = t.noise.noise2(x * 0.02 + 50, z * 0.02) * 0.5 + 0.5;
        this.c.setRGB(0.85 + tint * 0.2 + dryPatch * 0.25, 0.9 + tint * 0.15 + dryPatch * 0.05, 0.8 + tint * 0.1 - dryPatch * 0.1);
        if (biome === "forest") this.c.multiplyScalar(0.8);
        if (biome === "hills") this.c.setRGB(this.c.r * 1.05, this.c.g * 0.9, this.c.b * 0.8);
        this.mesh.setColorAt(k, this.c);
        k++;
      }
    this.mesh.count = k;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  dispose(scene: THREE.Scene) {
    scene.remove(this.mesh);
    this.mesh.geometry.dispose();
  }
}
