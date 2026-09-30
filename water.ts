import * as THREE from "three";
import type { Terrain } from "./terrain";

const VERT = /* glsl */ `
uniform float uTime;
uniform vec2 uOffset;
varying vec3 vWorld;
varying vec3 vNormal2;
varying float vFogDepth;
float wave(vec2 p, vec2 dir, float freq, float speed) { return sin(dot(p, dir) * freq + uTime * speed); }
void main() {
  vec3 p = position;
  p.xz += uOffset;
  float h = wave(p.xz, vec2(0.8, 0.6), 0.35, 1.3) * 0.12 + wave(p.xz, vec2(-0.5, 0.9), 0.6, 1.9) * 0.06 + wave(p.xz, vec2(0.2, -1.0), 1.3, 2.7) * 0.025;
  p.y += h;
  float e = 0.3;
  float hx = wave(p.xz + vec2(e, 0.0), vec2(0.8, 0.6), 0.35, 1.3) * 0.12 + wave(p.xz + vec2(e, 0.0), vec2(-0.5, 0.9), 0.6, 1.9) * 0.06;
  float hz = wave(p.xz + vec2(0.0, e), vec2(0.8, 0.6), 0.35, 1.3) * 0.12 + wave(p.xz + vec2(0.0, e), vec2(-0.5, 0.9), 0.6, 1.9) * 0.06;
  vNormal2 = normalize(vec3(h - hx, e, h - hz));
  vWorld = p;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  vFogDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */ `
precision highp float;
uniform float uTime;
uniform sampler2D uHeight;
uniform vec4 uHeightInfo; // half, size, minH, rangeH
uniform vec3 uSunDir;
uniform vec3 uSky;
uniform vec3 uSunColor;
uniform float uDay;
uniform vec3 uFogColor;
uniform vec2 uFog;
varying vec3 vWorld;
varying vec3 vNormal2;
varying float vFogDepth;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
void main() {
  vec2 huv = (vWorld.xz + uHeightInfo.x) / uHeightInfo.y;
  float ground = texture2D(uHeight, huv).r * uHeightInfo.w + uHeightInfo.z;
  if (huv.x < 0.0 || huv.y < 0.0 || huv.x > 1.0 || huv.y > 1.0) ground = uHeightInfo.z;
  float depth = max(0.0, vWorld.y - ground);
  vec3 n = normalize(vNormal2 + vec3(vnoise(vWorld.xz * 1.5 + uTime * 0.6) - 0.5, 0.0, vnoise(vWorld.zx * 1.5 - uTime * 0.5) - 0.5) * 0.25);
  vec3 viewDir = normalize(cameraPosition - vWorld);
  float fres = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0);
  vec3 shallow = vec3(0.16, 0.62, 0.62);
  vec3 deep = vec3(0.02, 0.16, 0.30);
  vec3 col = mix(shallow, deep, smoothstep(0.0, 7.0, depth));
  col *= 0.28 + 0.72 * uDay;
  col = mix(col, uSky, fres * 0.65);
  vec3 h = normalize(uSunDir + viewDir);
  float spec = pow(max(dot(n, h), 0.0), 120.0) * step(0.0, uSunDir.y);
  col += uSunColor * spec * 1.6;
  // shoreline foam
  float foamN = vnoise(vWorld.xz * 2.5 + vec2(uTime * 0.4, -uTime * 0.3));
  float foam = smoothstep(0.9, 0.0, depth) * smoothstep(0.35, 0.75, foamN + sin(uTime * 1.5 + depth * 6.0) * 0.2);
  col = mix(col, vec3(0.92) * (0.4 + 0.6 * uDay), foam * 0.8);
  float alpha = clamp(0.55 + smoothstep(0.0, 3.0, depth) * 0.4 + fres * 0.2 + foam * 0.3, 0.0, 0.97);
  float f = smoothstep(uFog.x, uFog.y, vFogDepth);
  col = mix(col, uFogColor, f);
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Water {
  mesh: THREE.Mesh;
  uniforms: Record<string, THREE.IUniform>;
  private grid: number;

  constructor(scene: THREE.Scene, terrain: Terrain, segments = 128) {
    const size = 520;
    this.grid = size / segments;
    const geo = new THREE.PlaneGeometry(size, size, segments, segments);
    geo.rotateX(-Math.PI / 2);
    this.uniforms = {
      uTime: { value: 0 },
      uOffset: { value: new THREE.Vector2() },
      uHeight: { value: this.bakeHeights(terrain) },
      uHeightInfo: { value: new THREE.Vector4(terrain.half, terrain.size, -14, 60) },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSky: { value: new THREE.Color() },
      uSunColor: { value: new THREE.Color() },
      uDay: { value: 1 },
      uFogColor: { value: new THREE.Color() },
      uFog: { value: new THREE.Vector2(100, 300) },
    };
    const mat = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    scene.add(this.mesh);
  }

  private bakeHeights(t: Terrain) {
    const n = t.res + 1;
    const data = new Uint8Array(n * n * 4);
    for (let i = 0; i < n * n; i++) {
      const v = Math.max(0, Math.min(255, Math.round(((t.heights[i] + 14) / 60) * 255)));
      data[i * 4] = v;
      data[i * 4 + 3] = 255;
    }
    const tex = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    return tex;
  }

  update(camPos: THREE.Vector3, time: number, sunDir: THREE.Vector3, sky: THREE.Color, sunColor: THREE.Color, day: number, fogColor: THREE.Color, fogNear: number, fogFar: number) {
    const u = this.uniforms;
    u.uTime.value = time;
    u.uOffset.value.set(Math.round(camPos.x / this.grid) * this.grid, Math.round(camPos.z / this.grid) * this.grid);
    u.uSunDir.value.copy(sunDir);
    u.uSky.value.copy(sky);
    u.uSunColor.value.copy(sunColor);
    u.uDay.value = day;
    u.uFogColor.value.copy(fogColor);
    u.uFog.value.set(fogNear, fogFar);
  }

  dispose(scene: THREE.Scene) {
    scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.uniforms.uHeight.value as THREE.Texture).dispose();
  }
}

/** Utility: estimate wave height for floating objects & swimming. */
export function waveHeight(x: number, z: number, t: number) {
  return Math.sin((x * 0.8 + z * 0.6) * 0.35 + t * 1.3) * 0.12 + Math.sin((-x * 0.5 + z * 0.9) * 0.6 + t * 1.9) * 0.06;
}
