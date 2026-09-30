import * as THREE from "three";

export type FxKind = "wood" | "stone" | "blood" | "leaf" | "dust" | "spark" | "ember" | "smoke" | "splash" | "heal" | "metal" | "hit" | "tame";

interface Preset {
  color: [number, number, number];
  colorVar: number;
  speed: number;
  up: number;
  gravity: number;
  life: [number, number];
  size: [number, number];
  drag: number;
  additive?: boolean;
  grow?: number;
}

const PRESETS: Record<FxKind, Preset> = {
  wood: { color: [0.55, 0.38, 0.2], colorVar: 0.25, speed: 3, up: 3, gravity: 14, life: [0.5, 0.9], size: [0.07, 0.13], drag: 0.5 },
  stone: { color: [0.55, 0.53, 0.5], colorVar: 0.2, speed: 3.5, up: 3, gravity: 16, life: [0.4, 0.8], size: [0.06, 0.12], drag: 0.4 },
  metal: { color: [0.8, 0.82, 0.86], colorVar: 0.1, speed: 4, up: 3, gravity: 16, life: [0.3, 0.6], size: [0.05, 0.09], drag: 0.4 },
  blood: { color: [0.6, 0.05, 0.04], colorVar: 0.3, speed: 2.8, up: 2.5, gravity: 12, life: [0.4, 0.8], size: [0.07, 0.14], drag: 0.6 },
  leaf: { color: [0.3, 0.55, 0.18], colorVar: 0.3, speed: 1.6, up: 1.5, gravity: 2.5, life: [1.0, 1.8], size: [0.08, 0.14], drag: 1.8 },
  dust: { color: [0.62, 0.55, 0.42], colorVar: 0.15, speed: 0.8, up: 0.6, gravity: -0.2, life: [0.6, 1.0], size: [0.2, 0.4], drag: 2, grow: 1.4 },
  spark: { color: [1, 0.75, 0.3], colorVar: 0.1, speed: 5, up: 3, gravity: 14, life: [0.2, 0.45], size: [0.05, 0.08], drag: 0.3, additive: true },
  ember: { color: [1, 0.55, 0.15], colorVar: 0.15, speed: 0.35, up: 1.3, gravity: -0.6, life: [0.8, 1.6], size: [0.04, 0.08], drag: 0.6, additive: true },
  smoke: { color: [0.32, 0.32, 0.34], colorVar: 0.1, speed: 0.25, up: 0.9, gravity: -0.35, life: [1.8, 3.2], size: [0.3, 0.55], drag: 0.7, grow: 1.2 },
  splash: { color: [0.8, 0.92, 1], colorVar: 0.05, speed: 2.5, up: 4, gravity: 14, life: [0.4, 0.8], size: [0.08, 0.16], drag: 0.4 },
  heal: { color: [0.4, 1, 0.5], colorVar: 0.1, speed: 0.4, up: 1.4, gravity: -0.5, life: [0.8, 1.2], size: [0.08, 0.12], drag: 0.5, additive: true },
  hit: { color: [1, 0.95, 0.8], colorVar: 0, speed: 3, up: 1, gravity: 0, life: [0.12, 0.2], size: [0.1, 0.18], drag: 3, additive: true },
  tame: { color: [1, 0.5, 0.75], colorVar: 0.2, speed: 1.2, up: 2.2, gravity: -0.4, life: [1.2, 2], size: [0.12, 0.2], drag: 0.6, additive: true },
};

const VERT = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
varying float vAlpha;
varying vec3 vColor;
uniform float uScale;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uScale / max(0.1, -mv.z);
  vAlpha = aAlpha;
  vColor = aColor;
}`;
const FRAG = /* glsl */ `
varying float vAlpha;
varying vec3 vColor;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  float a = smoothstep(0.5, 0.2, d) * vAlpha;
  gl_FragColor = vec4(vColor, a);
  #include <colorspace_fragment>
}`;

class Pool {
  points: THREE.Points;
  pos: Float32Array;
  vel: Float32Array;
  col: Float32Array;
  size: Float32Array;
  alpha: Float32Array;
  life: Float32Array;
  maxLife: Float32Array;
  base: Float32Array;
  grav: Float32Array;
  drag: Float32Array;
  grow: Float32Array;
  next = 0;
  alive = 0;

  constructor(scene: THREE.Scene, public cap: number, additive: boolean) {
    this.pos = new Float32Array(cap * 3);
    this.vel = new Float32Array(cap * 3);
    this.col = new Float32Array(cap * 3);
    this.size = new Float32Array(cap);
    this.alpha = new Float32Array(cap);
    this.life = new Float32Array(cap);
    this.maxLife = new Float32Array(cap);
    this.base = new Float32Array(cap);
    this.grav = new Float32Array(cap);
    this.drag = new Float32Array(cap);
    this.grow = new Float32Array(cap);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aColor", new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aSize", new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aAlpha", new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 600 } }, vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 8;
    scene.add(this.points);
  }

  spawn(p: THREE.Vector3, pr: Preset, dir: THREE.Vector3 | null, tint: THREE.Color | null) {
    const i = this.next;
    this.next = (this.next + 1) % this.cap;
    const a = Math.random() * Math.PI * 2, s = pr.speed * (0.4 + Math.random() * 0.8);
    let vx = Math.cos(a) * s, vz = Math.sin(a) * s, vy = pr.up * (0.5 + Math.random());
    if (dir) { vx += dir.x * pr.speed; vy += dir.y * pr.speed; vz += dir.z * pr.speed; }
    this.pos.set([p.x + (Math.random() - 0.5) * 0.2, p.y + (Math.random() - 0.5) * 0.2, p.z + (Math.random() - 0.5) * 0.2], i * 3);
    this.vel.set([vx, vy, vz], i * 3);
    const cv = 1 + (Math.random() - 0.5) * pr.colorVar;
    const c = tint ? [tint.r, tint.g, tint.b] : pr.color;
    this.col.set([c[0] * cv, c[1] * cv, c[2] * cv], i * 3);
    const l = pr.life[0] + Math.random() * (pr.life[1] - pr.life[0]);
    this.life[i] = l;
    this.maxLife[i] = l;
    this.base[i] = pr.size[0] + Math.random() * (pr.size[1] - pr.size[0]);
    this.grav[i] = pr.gravity;
    this.drag[i] = pr.drag;
    this.grow[i] = pr.grow ?? 0;
  }

  update(dt: number, scale: number) {
    let alive = 0;
    for (let i = 0; i < this.cap; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; this.size[i] = 0; continue; }
      alive++;
      this.life[i] -= dt;
      const k = i * 3;
      const d = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[k] *= d;
      this.vel[k + 2] *= d;
      this.vel[k + 1] = this.vel[k + 1] * d - this.grav[i] * dt;
      this.pos[k] += this.vel[k] * dt;
      this.pos[k + 1] += this.vel[k + 1] * dt;
      this.pos[k + 2] += this.vel[k + 2] * dt;
      const t = Math.max(0, this.life[i] / this.maxLife[i]);
      this.alpha[i] = Math.min(1, t * 2.2);
      this.size[i] = this.base[i] * (1 + (1 - t) * this.grow[i]);
    }
    this.alive = alive;
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.aColor.needsUpdate = true;
    g.attributes.aSize.needsUpdate = true;
    g.attributes.aAlpha.needsUpdate = true;
    (this.points.material as THREE.ShaderMaterial).uniforms.uScale.value = scale;
  }
}

interface Floater { sprite: THREE.Sprite; vel: THREE.Vector3; life: number; }

export class Fx {
  private normal: Pool;
  private add: Pool;
  private floaters: Floater[] = [];
  private texCache = new Map<string, THREE.Texture>();
  budget = 1;
  textEnabled = true;

  constructor(private scene: THREE.Scene, cap = 700) {
    this.normal = new Pool(scene, cap, false);
    this.add = new Pool(scene, Math.floor(cap * 0.6), true);
  }

  burst(kind: FxKind, p: THREE.Vector3, count: number, dir: THREE.Vector3 | null = null, tint: THREE.Color | null = null) {
    const pr = PRESETS[kind];
    const pool = pr.additive ? this.add : this.normal;
    const n = Math.max(1, Math.round(count * this.budget));
    for (let i = 0; i < n; i++) pool.spawn(p, pr, dir, tint);
  }

  private textTex(text: string, color: string) {
    const key = text + color;
    let t = this.texCache.get(key);
    if (t) return t;
    const c = document.createElement("canvas");
    c.width = 128;
    c.height = 64;
    const ctx = c.getContext("2d")!;
    ctx.font = "bold 38px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 6;
    ctx.strokeStyle = "rgba(0,0,0,0.85)";
    ctx.strokeText(text, 64, 32);
    ctx.fillStyle = color;
    ctx.fillText(text, 64, 32);
    t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    if (this.texCache.size > 200) this.texCache.clear();
    this.texCache.set(key, t);
    return t;
  }

  /** Floating combat text (damage, torpor, xp). */
  text(p: THREE.Vector3, text: string, color = "#ffffff", scale = 1) {
    if (!this.textEnabled) return;
    const mat = new THREE.SpriteMaterial({ map: this.textTex(text, color), depthTest: false, transparent: true });
    const s = new THREE.Sprite(mat);
    s.scale.set(0.9 * scale, 0.45 * scale, 1);
    s.position.copy(p);
    s.renderOrder = 20;
    this.scene.add(s);
    this.floaters.push({ sprite: s, vel: new THREE.Vector3((Math.random() - 0.5) * 0.6, 1.4, (Math.random() - 0.5) * 0.6), life: 1.1 });
  }

  update(dt: number, viewportHeight: number, fovDeg: number) {
    const scale = viewportHeight / (2 * Math.tan((fovDeg * Math.PI) / 360));
    this.normal.update(dt, scale);
    this.add.update(dt, scale);
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.life -= dt;
      f.sprite.position.addScaledVector(f.vel, dt);
      f.vel.y -= dt * 1.2;
      (f.sprite.material as THREE.SpriteMaterial).opacity = Math.min(1, f.life * 2.5);
      if (f.life <= 0) {
        this.scene.remove(f.sprite);
        (f.sprite.material as THREE.SpriteMaterial).dispose();
        this.floaters.splice(i, 1);
      }
    }
  }

  dispose() {
    this.scene.remove(this.normal.points, this.add.points);
    for (const f of this.floaters) this.scene.remove(f.sprite);
    this.floaters = [];
  }
}
