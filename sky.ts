import * as THREE from "three";

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww; // always at far plane
}`;

const FRAG = /* glsl */ `
precision highp float;
varying vec3 vDir;
uniform vec3 uSunDir;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uSunColor;
uniform float uDay;
uniform float uDusk;
uniform float uTime;
uniform float uClouds;
uniform float uCloudCover;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float hash3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += vnoise(p) * a; p *= 2.03; a *= 0.5; }
  return s;
}

void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  // atmospheric gradient
  float t = pow(clamp(h, 0.0, 1.0), 0.45);
  vec3 col = mix(uHorizon, uZenith, t);
  if (h < 0.0) col = mix(uHorizon, uHorizon * 0.55, clamp(-h * 4.0, 0.0, 1.0));
  // sun scattering glow and dusk band
  float sd = max(dot(d, uSunDir), 0.0);
  col += uSunColor * pow(sd, 8.0) * 0.35 * (0.4 + uDusk);
  col += vec3(1.0, 0.45, 0.2) * pow(sd, 3.0) * uDusk * (1.0 - clamp(abs(h) * 3.0, 0.0, 1.0)) * 0.6;
  // sun disc
  col += uSunColor * smoothstep(0.9993, 0.9997, sd) * 3.0 * step(-0.05, uSunDir.y);
  // moon (opposite)
  float md = max(dot(d, -uSunDir), 0.0);
  float moon = smoothstep(0.9990, 0.9994, md);
  col += vec3(0.85, 0.9, 1.0) * moon * (1.0 - uDay) * 1.2;
  col += vec3(0.4, 0.5, 0.7) * pow(md, 30.0) * (1.0 - uDay) * 0.25;
  // stars
  if (uDay < 0.6 && h > 0.0) {
    vec3 sp = floor(d * 220.0);
    float s = hash3(sp);
    float star = step(0.9975, s) * (0.6 + 0.4 * sin(uTime * 3.0 + s * 100.0));
    col += vec3(star) * (1.0 - uDay / 0.6) * clamp(h * 4.0, 0.0, 1.0);
  }
  // clouds
  if (uClouds > 0.5 && h > 0.02) {
    vec2 uv = d.xz / (h + 0.12) * 1.6 + vec2(uTime * 0.012, uTime * 0.004);
    float n = fbm(uv);
    float c = smoothstep(uCloudCover, uCloudCover + 0.25, n);
    float lit = 0.75 + 0.25 * fbm(uv * 2.0 + 3.0);
    vec3 cloudCol = mix(vec3(0.12, 0.14, 0.2), vec3(1.0, 0.98, 0.95), uDay) * lit;
    cloudCol = mix(cloudCol, vec3(1.0, 0.6, 0.4), uDusk * 0.5);
    col = mix(col, cloudCol, c * clamp(h * 5.0, 0.0, 1.0) * 0.9);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Sky {
  mesh: THREE.Mesh;
  uniforms = {
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uZenith: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uSunColor: { value: new THREE.Color("#fff2d6") },
    uDay: { value: 1 },
    uDusk: { value: 0 },
    uTime: { value: 0 },
    uClouds: { value: 1 },
    uCloudCover: { value: 0.52 },
  };

  constructor(scene: THREE.Scene) {
    const mat = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG, side: THREE.BackSide, depthWrite: false, fog: false });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -100;
    scene.add(this.mesh);
  }

  /** Computes sky colors for the given sun elevation; returns horizon color for fog. */
  update(camPos: THREE.Vector3, sunDir: THREE.Vector3, day: number, dusk: number, time: number, cover: number) {
    const u = this.uniforms;
    this.mesh.position.copy(camPos);
    u.uSunDir.value.copy(sunDir);
    u.uDay.value = day;
    u.uDusk.value = dusk;
    u.uTime.value = time;
    u.uCloudCover.value = cover;
    u.uZenith.value.set("#0f1a3c").lerp(new THREE.Color("#3f86d8"), day);
    u.uHorizon.value.set("#223252").lerp(new THREE.Color("#b6d7ee"), day).lerp(new THREE.Color("#f0a070"), dusk * 0.55);
    u.uSunColor.value.set("#fff2d6").lerp(new THREE.Color("#ff9a50"), dusk);
    return u.uHorizon.value;
  }
}
