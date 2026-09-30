import * as THREE from "three";
import { Noise, mulberry32 } from "./noise";

/**
 * Procedural texture library. Everything is painted into canvases at runtime,
 * so the game ships with zero external image assets.
 */
type RGB = [number, number, number];
const cache = new Map<string, THREE.Texture>();
const noise = new Noise(9173);

function canvas(w: number, h = w) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

/** Tileable fbm: samples noise on a torus so edges wrap seamlessly. */
function tileFbm(x: number, y: number, size: number, freq: number, oct: number, seed = 0) {
  let a = 1, f = freq, s = 0, n = 0;
  for (let o = 0; o < oct; o++) {
    const ax = (x / size) * Math.PI * 2, ay = (y / size) * Math.PI * 2;
    const r = f / (Math.PI * 2);
    s += noise.noise3(Math.cos(ax) * r + seed, Math.sin(ax) * r + o * 7.3, Math.cos(ay) * r + Math.sin(ay) * r * 0.7 + seed * 1.7) * a;
    n += a;
    a *= 0.5;
    f *= 2;
  }
  return s / n;
}

function toTexture(c: HTMLCanvasElement, repeat = true, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

function paint(size: number, fn: (x: number, y: number) => RGB): HTMLCanvasElement {
  const c = canvas(size);
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const [r, g, b] = fn(x, y);
      const i = (y * size + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  return c;
}

const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

function cached(key: string, make: () => THREE.Texture) {
  let t = cache.get(key);
  if (!t) {
    t = make();
    cache.set(key, t);
  }
  return t;
}

// ------------------------------------------------------------------ terrain
export function terrainTextures() {
  const S = 256;
  const rng = mulberry32(44);
  const grass = cached("grass", () => {
    const c = paint(S, (x, y) => {
      const n = tileFbm(x, y, S, 6, 4, 1) * 0.5 + 0.5;
      const d = tileFbm(x, y, S, 32, 2, 3) * 0.5 + 0.5;
      return mix(mix([62, 96, 38], [104, 140, 58], n), [80, 118, 44], d * 0.5).map((v) => v * (0.9 + rng() * 0.2)) as RGB;
    });
    // blades
    const ctx = c.getContext("2d")!;
    for (let i = 0; i < 1600; i++) {
      const x = rng() * S, y = rng() * S, l = 2 + rng() * 5;
      ctx.strokeStyle = rng() < 0.5 ? "rgba(140,180,80,0.35)" : "rgba(40,70,25,0.35)";
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (rng() - 0.5) * 2, y - l);
      ctx.stroke();
    }
    return toTexture(c);
  });
  const sand = cached("sand", () =>
    toTexture(paint(S, (x, y) => {
      const n = tileFbm(x, y, S, 5, 3, 5) * 0.5 + 0.5;
      const ripple = Math.sin((y + tileFbm(x, y, S, 3, 2, 8) * 30) * 0.35) * 0.5 + 0.5;
      const g = rng();
      return mix([196, 176, 128], [226, 208, 160], n * 0.7 + ripple * 0.3).map((v) => v * (0.92 + g * 0.16)) as RGB;
    })),
  );
  const rock = cached("rock", () =>
    toTexture(paint(S, (x, y) => {
      const n = tileFbm(x, y, S, 4, 5, 11) * 0.5 + 0.5;
      const cr = Math.abs(tileFbm(x, y, S, 8, 3, 13));
      const strata = Math.sin(y * 0.12 + n * 6) * 0.5 + 0.5;
      let c = mix([92, 86, 78], [150, 142, 130], n);
      c = mix(c, [120, 112, 100], strata * 0.3);
      if (cr < 0.04) c = c.map((v) => v * 0.6) as RGB;
      return c.map((v) => v * (0.94 + rng() * 0.12)) as RGB;
    })),
  );
  const dirt = cached("dirt", () =>
    toTexture(paint(S, (x, y) => {
      const n = tileFbm(x, y, S, 6, 4, 17) * 0.5 + 0.5;
      const p = rng();
      let c = mix([74, 56, 38], [118, 92, 62], n);
      if (p > 0.985) c = [140, 132, 120];
      return c.map((v) => v * (0.9 + rng() * 0.2)) as RGB;
    })),
  );
  const snow = cached("snow", () =>
    toTexture(paint(S, (x, y) => {
      const n = tileFbm(x, y, S, 5, 3, 21) * 0.5 + 0.5;
      return mix([206, 214, 226], [246, 248, 252], n).map((v) => Math.min(255, v * (0.97 + rng() * 0.06))) as RGB;
    })),
  );
  return { grass, sand, rock, dirt, snow };
}

// ------------------------------------------------------------------ materials for props / structures
export function thatchTexture() {
  return cached("thatch", () => {
    const S = 256;
    const c = paint(S, () => [150, 118, 62]);
    const ctx = c.getContext("2d")!;
    const r = mulberry32(3);
    for (let i = 0; i < 3500; i++) {
      const x = r() * S, y = r() * S, l = 10 + r() * 30;
      const t = r();
      ctx.strokeStyle = `rgba(${170 + t * 60},${135 + t * 50},${60 + t * 40},0.7)`;
      ctx.lineWidth = 1 + r();
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (r() - 0.5) * 6, y + l);
      ctx.stroke();
    }
    // horizontal bindings
    for (let y = 0; y < S; y += 64) {
      ctx.fillStyle = "rgba(70,52,28,0.8)";
      ctx.fillRect(0, y + 30, S, 5);
    }
    return toTexture(c);
  });
}

export function plankTexture(base: RGB = [140, 94, 52]) {
  return cached("plank" + base.join(","), () => {
    const S = 256;
    const r = mulberry32(7);
    const boards = 5;
    const bw = S / boards;
    const tints = Array.from({ length: boards }, () => 0.82 + r() * 0.3);
    const c = paint(S, (x, y) => {
      const b = Math.floor(x / bw);
      const lx = x - b * bw;
      const grain = Math.sin(y * 0.09 + tileFbm(x, y, S, 5, 3, b * 3) * 9 + b) * 0.5 + 0.5;
      let col = mix(base, base.map((v) => v * 0.7) as RGB, grain * 0.55).map((v) => v * tints[b]) as RGB;
      if (lx < 1.5 || lx > bw - 1.5) col = col.map((v) => v * 0.45) as RGB;
      return col;
    });
    const ctx = c.getContext("2d")!;
    for (let b = 0; b < boards; b++) for (const yy of [18, S - 18]) {
      ctx.fillStyle = "rgba(40,30,20,0.9)";
      ctx.beginPath();
      ctx.arc(b * bw + bw / 2, yy, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    return toTexture(c);
  });
}

export function stoneBlockTexture() {
  return cached("stoneblock", () => {
    const S = 256;
    const c = paint(S, (x, y) => {
      const n = tileFbm(x, y, S, 6, 4, 31) * 0.5 + 0.5;
      const row = Math.floor(y / 64);
      const off = row % 2 ? 64 : 0;
      const bx = (x + off) % 128, by = y % 64;
      const mortar = bx < 3 || by < 3;
      const col = mix([110, 106, 98], [160, 154, 142], n);
      return mortar ? col.map((v) => v * 0.5) as RGB : col;
    });
    return toTexture(c);
  });
}

export function barkTexture(base: RGB = [92, 66, 44]) {
  return cached("bark" + base.join(","), () => {
    const S = 128;
    return toTexture(paint(S, (x, y) => {
      const n = tileFbm(x * 3, y * 0.5, S, 4, 3, 41) * 0.5 + 0.5;
      const ridge = Math.abs(Math.sin((x / S) * Math.PI * 14 + n * 4));
      return mix(base.map((v) => v * 0.55) as RGB, base, clamp01(ridge * 0.8 + n * 0.4));
    }));
  });
}

export function hideTexture() {
  return cached("hide", () => {
    const S = 128;
    return toTexture(paint(S, (x, y) => {
      const n = tileFbm(x, y, S, 5, 4, 51) * 0.5 + 0.5;
      return mix([110, 74, 44], [160, 116, 74], n);
    }));
  });
}

// ------------------------------------------------------------------ creature skins
export type SkinPattern = "plain" | "stripes" | "spots" | "mottled" | "bands";

/**
 * Skin texture mapped onto sphere-like UVs: v=0 bottom (belly), v=1 top (back).
 * Pattern colors painted on the upper half only, with a soft belly gradient.
 */
export function skinTexture(key: string, base: string, belly: string, accent: string, pattern: SkinPattern) {
  return cached("skin:" + key, () => {
    const W = 256, H = 128;
    const cb = new THREE.Color(base), cl = new THREE.Color(belly), ca = new THREE.Color(accent);
    const B: RGB = [cb.r * 255, cb.g * 255, cb.b * 255];
    const L: RGB = [cl.r * 255, cl.g * 255, cl.b * 255];
    const A: RGB = [ca.r * 255, ca.g * 255, ca.b * 255];
    const r = mulberry32(key.length * 97 + key.charCodeAt(0));
    const spots = Array.from({ length: 26 }, () => [r() * W, H * 0.45 + r() * H * 0.55, 4 + r() * 9]);
    const c = canvas(W, H);
    const ctx = c.getContext("2d")!;
    const img = ctx.createImageData(W, H);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const v = 1 - y / H; // canvas top = v 1
        const n = tileFbm(x, y, W, 8, 3, key.length) * 0.5 + 0.5;
        const scale = (Math.sin(x * 0.9) * Math.sin(y * 0.9)) * 0.04;
        let col = mix(L, B, clamp01((v - 0.28) * 3.2 + (n - 0.5) * 0.4));
        const upper = clamp01((v - 0.45) * 4);
        if (pattern === "stripes") {
          const s = Math.sin(x * 0.19 + n * 3) > 0.45 ? 1 : 0;
          col = mix(col, A, s * upper * 0.85);
        } else if (pattern === "bands") {
          const s = Math.sin(x * 0.09 + n * 2) > 0.6 ? 1 : 0;
          col = mix(col, A, s * upper * 0.7);
        } else if (pattern === "spots") {
          for (const [sx, sy, sr] of spots) {
            let dx = Math.abs(x - sx);
            if (dx > W / 2) dx = W - dx;
            if (Math.hypot(dx, y - (H - sy)) < sr * (0.8 + n * 0.4)) { col = mix(col, A, 0.8 * upper); break; }
          }
        } else if (pattern === "mottled") {
          const m = tileFbm(x, y, W, 14, 2, 77);
          if (m > 0.15) col = mix(col, A, 0.55 * upper);
        }
        // dorsal stripe darkening
        col = col.map((ch) => ch * (1 - Math.pow(clamp01((v - 0.85) * 6), 2) * 0.25 + scale)) as RGB;
        col = col.map((ch) => ch * (0.94 + n * 0.12)) as RGB;
        const i = (y * W + x) * 4;
        img.data[i] = col[0];
        img.data[i + 1] = col[1];
        img.data[i + 2] = col[2];
        img.data[i + 3] = 255;
      }
    ctx.putImageData(img, 0, 0);
    return toTexture(c, true);
  });
}

export function clothTexture(base: RGB, key: string) {
  return cached("cloth" + key, () => {
    const S = 64;
    return toTexture(paint(S, (x, y) => {
      const weave = ((x + y) % 4 < 2 ? 0.92 : 1.05) * (x % 3 === 0 ? 0.95 : 1);
      const n = tileFbm(x, y, S, 4, 2, 61) * 0.5 + 0.5;
      return base.map((v) => v * weave * (0.85 + n * 0.3)) as RGB;
    }));
  });
}

/** Radial glow sprite (soft particles, flames, sun halo). */
export function glowTexture() {
  return cached("glow", () => {
    const S = 64;
    const c = canvas(S);
    const ctx = c.getContext("2d")!;
    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.35, "rgba(255,255,255,0.55)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    const t = new THREE.CanvasTexture(c);
    return t;
  });
}

/** Grayscale bump map of overlapping reptile scales (tileable). */
export function scaleBumpTexture() {
  return cached("scalebump", () => {
    const S = 256;
    const c = canvas(S);
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#808080";
    ctx.fillRect(0, 0, S, S);
    const r = mulberry32(911);
    const cell = 11;
    for (let y = -cell; y < S + cell; y += cell * 0.8)
      for (let x = -cell; x < S + cell; x += cell) {
        const ox = (Math.round(y / (cell * 0.8)) % 2) * cell * 0.5;
        const cx = x + ox + (r() - 0.5) * 2, cy = y + (r() - 0.5) * 2;
        const rad = cell * (0.55 + r() * 0.12);
        const g = ctx.createRadialGradient(cx - rad * 0.2, cy - rad * 0.25, rad * 0.1, cx, cy, rad);
        g.addColorStop(0, "#d8d8d8");
        g.addColorStop(0.7, "#8a8a8a");
        g.addColorStop(1, "#3a3a3a");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rad, rad * 0.85, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    // larger wrinkle folds
    ctx.globalAlpha = 0.35;
    for (let i = 0; i < 40; i++) {
      ctx.strokeStyle = r() < 0.5 ? "#303030" : "#e0e0e0";
      ctx.lineWidth = 1 + r() * 2;
      ctx.beginPath();
      const y = r() * S;
      ctx.moveTo(0, y);
      for (let x = 0; x <= S; x += 16) ctx.lineTo(x, y + Math.sin(x * 0.05 + i) * 6);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(6, 4);
    return tex;
  });
}

export function skinPoreTexture() {
  return cached("pores", () => {
    const S = 128;
    const r = mulberry32(55);
    const tex = toTexture(paint(S, () => { const v = 128 + (r() - 0.5) * 40; return [v, v, v]; }), true, false);
    tex.repeat.set(8, 8);
    return tex;
  });
}

/** Reptile iris with slit pupil (drawn on a disc). */
export function irisTexture(color: string, slit = true) {
  return cached("iris" + color + slit, () => {
    const S = 64;
    const c = canvas(S);
    const ctx = c.getContext("2d")!;
    const g = ctx.createRadialGradient(S / 2, S / 2, 2, S / 2, S / 2, S / 2);
    g.addColorStop(0, color);
    g.addColorStop(0.75, color);
    g.addColorStop(1, "#1a1206");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(S / 2, S / 2); ctx.lineTo(S / 2 + Math.cos(a) * S / 2, S / 2 + Math.sin(a) * S / 2); ctx.stroke(); }
    ctx.fillStyle = "#050302";
    ctx.beginPath();
    if (slit) ctx.ellipse(S / 2, S / 2, S * 0.07, S * 0.36, 0, 0, Math.PI * 2);
    else ctx.arc(S / 2, S / 2, S * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.beginPath(); ctx.arc(S * 0.36, S * 0.34, S * 0.07, 0, Math.PI * 2); ctx.fill();
    const t2 = new THREE.CanvasTexture(c);
    t2.colorSpace = THREE.SRGBColorSpace;
    return t2;
  });
}

/** Coarse woven fiber cloth (ARK cloth armor look): tan burlap weave with frays and darker seams. */
export function burlapTexture() {
  return cached("burlap", () => {
    const S = 256;
    const r = mulberry32(77);
    const c = paint(S, (x, y) => {
      const wx = Math.sin((x / S) * Math.PI * 2 * 48), wy = Math.sin((y / S) * Math.PI * 2 * 48);
      const over = ((Math.floor(x / (S / 48)) + Math.floor(y / (S / 48))) % 2) ? wx : wy;
      const n = tileFbm(x, y, S, 6, 3, 91) * 0.5 + 0.5;
      const base: RGB = [176, 150, 108];
      const k = 0.78 + over * 0.12 + n * 0.18 + (r() - 0.5) * 0.08;
      return base.map((v) => v * k) as RGB;
    });
    const ctx = c.getContext("2d")!;
    for (let i = 0; i < 90; i++) {
      ctx.strokeStyle = `rgba(${90 + r() * 40},${70 + r() * 30},${40},0.35)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      const x = r() * S, y = r() * S;
      ctx.moveTo(x, y);
      ctx.lineTo(x + (r() - 0.5) * 14, y + (r() - 0.5) * 14);
      ctx.stroke();
    }
    // stitched seams
    ctx.strokeStyle = "rgba(70,50,28,0.7)";
    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 2;
    for (const y of [S * 0.25, S * 0.75]) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(S, y); ctx.stroke(); }
    ctx.setLineDash([]);
    return toTexture(c);
  });
}

/** Feather coat texture (overlapping rounded feathers) mapped on sphere UVs: v=0 belly, v=1 back. */
export function featherTexture(key: string, back: string, belly: string, pattern: string) {
  return cached("feather:" + key, () => {
    const W = 256, H = 128;
    const c = canvas(W, H);
    const ctx = c.getContext("2d")!;
    const r = mulberry32(key.length * 31 + 5);
    const cb = new THREE.Color(back), cl = new THREE.Color(belly), cp = new THREE.Color(pattern);
    for (let row = 0; row < 22; row++) {
      const v = row / 21; // 0 top (back) .. 1 bottom (belly)
      const y = v * H;
      for (let col = -1; col < 34; col++) {
        const x = col * (W / 32) + (row % 2) * (W / 64);
        const t = THREE.MathUtils.smoothstep(v, 0.45, 0.85);
        const cc = cb.clone().lerp(cl, t);
        if (r() < 0.18 && v < 0.6) cc.lerp(cp, 0.5);
        cc.multiplyScalar(0.85 + r() * 0.25);
        const rad = W / 26;
        const g = ctx.createRadialGradient(x, y - rad * 0.4, rad * 0.1, x, y, rad * 1.1);
        g.addColorStop(0, "#" + cc.clone().multiplyScalar(1.15).getHexString());
        g.addColorStop(0.75, "#" + cc.getHexString());
        g.addColorStop(1, "#" + cc.clone().multiplyScalar(0.55).getHexString());
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(x, y, rad, rad * 1.25, 0, 0, Math.PI);
        ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.18)";
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + rad * 1.1);
        ctx.stroke();
      }
    }
    return toTexture(c, true);
  });
}
