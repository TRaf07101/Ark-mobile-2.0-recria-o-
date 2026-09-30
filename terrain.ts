import * as THREE from "three";
import { Noise, mulberry32 } from "../core/noise";
import { CONFIG } from "../core/config";
import type { Biome } from "../data/species";
import { terrainTextures } from "../core/textures";

const W = CONFIG.world;

function smoothstep(a: number, b: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export class Terrain {
  readonly size = W.size;
  readonly half = W.size / 2;
  readonly res = W.res;
  readonly cell = W.size / W.res;
  heights: Float32Array;
  forest: Float32Array;
  readonly noise: Noise;
  noise2: Noise;
  mesh!: THREE.Mesh;
  spawnPoint = new THREE.Vector3();

  constructor(public seed: number) {
    this.noise = new Noise(seed);
    this.noise2 = new Noise(seed + 101);
    const n = this.res + 1;
    this.heights = new Float32Array(n * n);
    this.forest = new Float32Array(n * n);
    this.generate();
  }

  private generate() {
    const n = this.res + 1;
    const nz = this.noise, nz2 = this.noise2;
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const x = i * this.cell - this.half;
        const z = j * this.cell - this.half;
        // island shape with warped radius
        const warp = nz2.fbm2(x * 0.006, z * 0.006, 3) * 0.18;
        const d = Math.hypot(x, z) / this.half + warp;
        const island = 1 - smoothstep(0.52, 0.93, d);
        const base = nz.fbm2(x * 0.0045, z * 0.0045, 5);
        const detail = nz2.fbm2(x * 0.03, z * 0.03, 2);
        const ridge = 1 - Math.abs(nz.fbm2(x * 0.007 + 40, z * 0.007 - 70, 4));
        // mountains concentrated in the north-west
        const mMask = smoothstep(0.05, 0.6, nz2.noise2(x * 0.003 + 7, z * 0.003 - 3) * 0.6 + (-z / this.half) * 0.45 + (-x / this.half) * 0.15);
        let h = 3.5 + base * 9 + detail * 1.2 + mMask * ridge * ridge * 40;
        // gentle beach terrace
        if (h < 3 && h > 0) h = h * 0.8;
        h = W.minHeight + (h - W.minHeight) * island;
        this.heights[j * n + i] = Math.max(W.minHeight, Math.min(W.maxHeight, h));
        this.forest[j * n + i] = nz2.fbm2(x * 0.01 + 300, z * 0.01 + 300, 3);
      }
    // spawn: scan from south towards center for a beach
    const rng = mulberry32(this.seed + 5);
    for (let tries = 0; tries < 60; tries++) {
      const ang = Math.PI / 2 + (rng() - 0.5) * 1.2; // south-ish
      for (let r = this.half * 0.95; r > 20; r -= 2) {
        const x = Math.cos(ang) * r, z = Math.sin(ang) * r;
        const h = this.heightAt(x, z);
        if (h > 0.6 && h < 2.2) {
          this.spawnPoint.set(x, h, z);
          return;
        }
      }
    }
    this.spawnPoint.set(0, this.heightAt(0, 0), 0);
  }

  heightAt(x: number, z: number): number {
    const fx = (x + this.half) / this.cell, fz = (z + this.half) / this.cell;
    const n = this.res + 1;
    if (fx < 0 || fz < 0 || fx >= this.res || fz >= this.res) return W.minHeight;
    const i = Math.floor(fx), j = Math.floor(fz);
    const tx = fx - i, tz = fz - j;
    const h00 = this.heights[j * n + i], h10 = this.heights[j * n + i + 1];
    const h01 = this.heights[(j + 1) * n + i], h11 = this.heights[(j + 1) * n + i + 1];
    // match triangle split of PlaneGeometry (diagonal from (i,j+1) to (i+1,j))
    if (tx + tz <= 1) return h00 + (h10 - h00) * tx + (h01 - h00) * tz;
    return h11 + (h01 - h11) * (1 - tx) + (h10 - h11) * (1 - tz);
  }

  normalAt(x: number, z: number, out = new THREE.Vector3()) {
    const e = 0.8;
    const hl = this.heightAt(x - e, z), hr = this.heightAt(x + e, z);
    const hd = this.heightAt(x, z - e), hu = this.heightAt(x, z + e);
    return out.set(hl - hr, 2 * e, hd - hu).normalize();
  }

  forestAt(x: number, z: number) {
    const n = this.res + 1;
    const i = Math.max(0, Math.min(this.res, Math.round((x + this.half) / this.cell)));
    const j = Math.max(0, Math.min(this.res, Math.round((z + this.half) / this.cell)));
    return this.forest[j * n + i];
  }

  biomeAt(x: number, z: number): Biome | "water" {
    const h = this.heightAt(x, z);
    if (h < 0.1) return "water";
    if (h < 2.4) return "beach";
    if (h > 31) return "peak";
    if (h > 17) return "hills";
    return this.forestAt(x, z) > 0.08 ? "forest" : "grassland";
  }

  isInside(x: number, z: number) {
    return Math.abs(x) < this.half - 2 && Math.abs(z) < this.half - 2;
  }

  buildMeshes(scene: THREE.Scene) {
    const geo = new THREE.PlaneGeometry(this.size, this.size, this.res, this.res);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const n = this.res + 1;
    for (let k = 0; k < pos.count; k++) {
      const i = k % n, j = Math.floor(k / n);
      pos.setY(k, this.heights[j * n + i]);
    }
    geo.computeVertexNormals();
    const nor = geo.attributes.normal as THREE.BufferAttribute;
    // splat weights: x=sand, y=grass, z=rock, w=dirt ; color = tint
    const splat = new Float32Array(pos.count * 4);
    const tint = new Float32Array(pos.count * 3);
    for (let k = 0; k < pos.count; k++) {
      const i = k % n, j = Math.floor(k / n);
      const h = this.heights[j * n + i];
      const x = pos.getX(k), z = pos.getZ(k);
      const f = this.forest[j * n + i];
      const slope = nor.getY(k);
      let sand = 1 - smoothstep(1.6, 2.8, h);
      let rock = smoothstep(0.82, 0.62, slope) * (h > 0.5 ? 1 : 0.3) + smoothstep(18, 26, h);
      let dirt = smoothstep(0.05, 0.3, f) * 0.55 * (1 - sand) + smoothstep(0.1, 0.9, this.noise.noise2(x * 0.02, z * 0.02)) * 0.25;
      if (h < 0) { sand = 1; rock = smoothstep(-2, -10, h) * 0.5; dirt = 0; }
      rock = Math.min(1, rock);
      let grass = Math.max(0, 1 - sand - rock - dirt);
      const sum = sand + grass + rock + dirt || 1;
      splat.set([sand / sum, grass / sum, rock / sum, dirt / sum], k * 4);
      const v = 0.92 + this.noise.noise2(x * 0.05, z * 0.05) * 0.1;
      const lush = f > 0.08 ? 0.88 : 1;
      tint.set([v * lush, v, v * lush * 0.95], k * 3);
    }
    geo.setAttribute("splat", new THREE.BufferAttribute(splat, 4));
    geo.setAttribute("color", new THREE.BufferAttribute(tint, 3));
    const tex = terrainTextures();
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.tSand = { value: tex.sand };
      sh.uniforms.tGrass = { value: tex.grass };
      sh.uniforms.tRock = { value: tex.rock };
      sh.uniforms.tDirt = { value: tex.dirt };
      sh.uniforms.tSnow = { value: tex.snow };
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nattribute vec4 splat;\nvarying vec4 vSplat;\nvarying vec3 vWPos;\nvarying float vUp;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvSplat = splat;\nvWPos = position;\nvUp = normal.y;");
      sh.fragmentShader = sh.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
          uniform sampler2D tSand; uniform sampler2D tGrass; uniform sampler2D tRock; uniform sampler2D tDirt; uniform sampler2D tSnow;
          varying vec4 vSplat; varying vec3 vWPos; varying float vUp;
          vec3 tri(sampler2D t, vec2 uv) { return mix(texture2D(t, uv).rgb, texture2D(t, uv * 0.23 + 0.37).rgb, 0.35); }`,
        )
        .replace(
          "#include <map_fragment>",
          `vec2 tuv = vWPos.xz * 0.16;
          vec3 cRock = mix(texture2D(tRock, vec2(vWPos.x, vWPos.y) * 0.12).rgb, texture2D(tRock, vec2(vWPos.z, vWPos.y) * 0.12).rgb, 0.5);
          vec3 col = tri(tSand, tuv) * vSplat.x + tri(tGrass, tuv) * vSplat.y + cRock * vSplat.z + tri(tDirt, tuv) * vSplat.w;
          float snow = smoothstep(31.0, 36.0, vWPos.y + sin(vWPos.x * 0.3) * 1.5) * smoothstep(0.55, 0.8, vUp);
          col = mix(col, tri(tSnow, tuv), snow);
          float wet = smoothstep(0.9, 0.1, vWPos.y) * step(-0.5, vWPos.y);
          col *= 1.0 - wet * 0.35;
          diffuseColor.rgb *= col;`,
        );
    };
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.receiveShadow = true;
    this.mesh.matrixAutoUpdate = false;
    scene.add(this.mesh);
  }

  /** Returns a small canvas map of the island (for the map screen & minimap). */
  renderMap(px = 512): HTMLCanvasElement {
    const c = document.createElement("canvas");
    c.width = c.height = px;
    const ctx = c.getContext("2d")!;
    const img = ctx.createImageData(px, px);
    for (let y = 0; y < px; y++)
      for (let x = 0; x < px; x++) {
        const wx = (x / px) * this.size - this.half, wz = (y / px) * this.size - this.half;
        const h = this.heightAt(wx, wz);
        const shade = Math.max(0.55, Math.min(1.25, 1 + (this.heightAt(wx - 1.5, wz - 1.5) - h) * 0.35));
        let col: [number, number, number];
        if (h < 0) {
          const d = Math.min(1, -h / 12);
          col = [30 + (1 - d) * 60, 90 + (1 - d) * 80, 130 + (1 - d) * 60];
        } else {
          const b = this.biomeAt(wx, wz);
          col = b === "beach" ? [214, 196, 146] : b === "grassland" ? [110, 150, 70] : b === "forest" ? [62, 106, 50] : b === "hills" ? [120, 118, 96] : [210, 214, 222];
          col = col.map((v) => v * shade) as [number, number, number];
        }
        const i = (y * px + x) * 4;
        img.data[i] = col[0]; img.data[i + 1] = col[1]; img.data[i + 2] = col[2]; img.data[i + 3] = 255;
      }
    ctx.putImageData(img, 0, 0);
    // grid lines
    ctx.strokeStyle = "rgba(0,0,0,0.12)";
    for (let g = 1; g < 8; g++) {
      ctx.beginPath(); ctx.moveTo((g / 8) * px, 0); ctx.lineTo((g / 8) * px, px); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, (g / 8) * px); ctx.lineTo(px, (g / 8) * px); ctx.stroke();
    }
    return c;
  }

  /** Ray march against the heightfield. Returns distance or -1. */
  raycast(o: THREE.Vector3, d: THREE.Vector3, maxDist: number): number {
    let t = 0;
    const step = 0.5;
    let prevAbove = o.y - this.heightAt(o.x, o.z);
    if (prevAbove < 0) return 0;
    while (t < maxDist) {
      t += step;
      const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
      const above = y - this.heightAt(x, z);
      if (above <= 0) {
        // refine
        const f = prevAbove / (prevAbove - above);
        return t - step + step * f;
      }
      prevAbove = above;
    }
    return -1;
  }
}
