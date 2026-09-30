import { mulberry32, hash2 } from "../core/noise";

/**
 * Procedural skin for the ARK Mobile Tyrannosaurus.
 * Everything here is plain 2D canvas (no three.js) so the maps can be previewed on their own.
 *
 * Reference look (ARK original):
 *  - rust / brick-orange hide made of very fine pebbly scales;
 *  - a muted blue-mauve band along the spine that sends tapered streaks down the flanks;
 *  - pale lavender oval osteoderms with dark rims, in loose rows along the back, flanks, thighs and tail;
 *  - tan belly and throat crossed by dark transverse wrinkles;
 *  - legs stay rust; only a ladder of overlapping blue plates runs down the front of the shin and over the toes.
 *
 * UV convention used by the lofts: canvas x = distance along the body (wraps), canvas y = around the
 * cross-section with y = 0 on top / front, y = H/2 on the flank and y = H on the belly / back.
 */

export interface Layer { c: HTMLCanvasElement; x: CanvasRenderingContext2D }
export interface MapPair { color: HTMLCanvasElement; bump: HTMLCanvasElement }

export function layer(w: number, h: number): Layer {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return { c, x: c.getContext("2d")! };
}

const TAU = Math.PI * 2;

/**
 * Seamless tile of small hex-packed pebble scales.
 * bump = false → translucent light/dark shading + dark gaps (drawn over the base colour);
 * bump = true  → height map (domed cells, deep gaps).
 * Both variants share the same lattice, so gaps in the colour line up with valleys in the relief.
 */
export function scaleTile(S: number, bump: boolean, seed: number, cols = 32, rows = 20): HTMLCanvasElement {
  const { c, x } = layer(S, S);
  const CW = S / cols, CH = S / rows;
  if (bump) {
    x.fillStyle = "rgb(56,56,56)";
    x.fillRect(0, 0, S, S);
  }
  for (let gy = -1; gy <= rows; gy++) {
    for (let gx = -1; gx <= cols; gx++) {
      const mx = ((gx % cols) + cols) % cols, my = ((gy % rows) + rows) % rows;
      const jx = (hash2(mx, my, seed) - 0.5) * 0.3, jy = (hash2(mx, my, seed + 1) - 0.5) * 0.3;
      const px = (gx + (my & 1 ? 0.5 : 0) + jx + 0.5) * CW;
      const py = (gy + 0.5 + jy) * CH;
      const rx = CW * (0.58 + 0.1 * hash2(mx, my, seed + 2));
      const ry = CH * (0.58 + 0.1 * hash2(mx, my, seed + 3));
      if (bump) {
        const h = 150 + Math.floor(hash2(mx, my, seed + 4) * 70);
        x.save();
        x.translate(px, py);
        x.scale(1, ry / rx);
        const g = x.createRadialGradient(0, -rx * 0.12, 0, 0, 0, rx);
        g.addColorStop(0, `rgb(${h},${h},${h})`);
        g.addColorStop(0.7, "rgb(112,112,112)");
        g.addColorStop(1, "rgb(50,50,50)");
        x.fillStyle = g;
        x.beginPath();
        x.arc(0, 0, rx, 0, TAU);
        x.fill();
        x.restore();
      } else {
        const dark = hash2(mx, my, seed + 5) < 0.5;
        const a = hash2(mx, my, seed + 6);
        x.beginPath();
        x.ellipse(px, py, rx, ry, 0, 0, TAU);
        x.fillStyle = dark ? `rgba(28,10,5,${0.05 + a * 0.11})` : `rgba(255,226,192,${0.03 + a * 0.11})`;
        x.fill();
        x.strokeStyle = "rgba(20,8,4,0.45)";
        x.lineWidth = Math.max(1, CW * 0.14);
        x.stroke();
      }
    }
  }
  return c;
}

interface Ov { x: number; y: number; rx: number; ry: number; rot: number; lav: boolean }

/** Draw one lavender oval osteoderm (with wrap copies) on the colour layer and its raised dome on the bump layer. */
function drawOval(cx: CanvasRenderingContext2D, bx: CanvasRenderingContext2D, W: number, o: Ov) {
  for (const ox of [0, -W, W]) {
    const x = o.x + ox;
    if (x < -70 || x > W + 70) continue;
    // soft contact shadow
    cx.beginPath();
    cx.ellipse(x + 1.5, o.y + 2, o.rx + 3.5, o.ry + 3.5, o.rot, 0, TAU);
    cx.fillStyle = "rgba(28,12,10,0.36)";
    cx.fill();
    const g = cx.createRadialGradient(x - o.rx * 0.22, o.y - o.ry * 0.26, 0, x, o.y, Math.max(o.rx, o.ry) * 1.05);
    g.addColorStop(0, o.lav ? "#a89bb8" : "#957f96");
    g.addColorStop(0.62, o.lav ? "#85789d" : "#745e7e");
    g.addColorStop(1, o.lav ? "#574c70" : "#4c3b55");
    cx.beginPath();
    cx.ellipse(x, o.y, o.rx, o.ry, o.rot, 0, TAU);
    cx.fillStyle = g;
    cx.fill();
    cx.strokeStyle = "rgba(34,20,40,0.7)";
    cx.lineWidth = 2.2;
    cx.stroke();
    cx.beginPath();
    cx.ellipse(x - o.rx * 0.16, o.y - o.ry * 0.22, o.rx * 0.42, o.ry * 0.42, o.rot, 0, TAU);
    cx.fillStyle = "rgba(226,218,238,0.1)";
    cx.fill();
    // relief
    const bg = bx.createRadialGradient(x, o.y - o.ry * 0.15, 0, x, o.y, Math.max(o.rx, o.ry));
    bg.addColorStop(0, "rgb(245,245,245)");
    bg.addColorStop(0.75, "rgb(170,170,170)");
    bg.addColorStop(1, "rgb(70,70,70)");
    bx.beginPath();
    bx.ellipse(x, o.y, o.rx, o.ry, o.rot, 0, TAU);
    bx.fillStyle = bg;
    bx.fill();
  }
}

/** Rejection-sampled oval placement on a wrapping canvas of width W. */
class OvalField {
  private placed: { x: number; y: number; r: number }[] = [];
  constructor(private cx: CanvasRenderingContext2D, private bx: CanvasRenderingContext2D, private W: number) {}
  tryPlace(o: Ov, gap = 0.92): boolean {
    const r = Math.max(o.rx, o.ry);
    for (const p of this.placed) {
      let dx = Math.abs(p.x - o.x);
      dx = Math.min(dx, this.W - dx);
      if (Math.hypot(dx, p.y - o.y) < (p.r + r) * gap) return false;
    }
    this.placed.push({ x: o.x, y: o.y, r });
    drawOval(this.cx, this.bx, this.W, o);
    return true;
  }
}

function stops(g: CanvasGradient, list: [number, string][]) {
  for (const [p, c] of list) g.addColorStop(p, c);
}

// ---------------------------------------------------------------------------------------------- body
/** Torso / neck / tail. x: tail tip → head, y: spine → belly. */
export function paintRexBody(): MapPair {
  const W = 2048, H = 1024;
  const col = layer(W, H), bmp = layer(W / 2, H / 2);
  const cx = col.x, bx = bmp.x;
  bx.scale(0.5, 0.5); // draw everything in colour-canvas coordinates
  const rng = mulberry32(90210);

  // 1. base gradient: blue-mauve spine → brick → rust → orange flank → tan belly
  const g = cx.createLinearGradient(0, 0, 0, H);
  stops(g, [[0, "#514d6b"], [0.05, "#5f5673"], [0.11, "#7d4837"], [0.22, "#91503a"], [0.38, "#a65d3c"], [0.52, "#b26f46"], [0.62, "#c28c5a"], [0.72, "#d0a874"], [1, "#dcbf90"]]);
  cx.fillStyle = g;
  cx.fillRect(0, 0, W, H);
  bx.fillStyle = "rgb(96,96,96)";
  bx.fillRect(0, 0, W, H);

  // 2. large soft mottling (darker brick / warmer orange), wrapped
  for (let i = 0; i < 380; i++) {
    const x = rng() * W, y = rng() * H * 0.72, r = 40 + rng() * 110;
    const dark = rng() < 0.55;
    const a = 0.06 + rng() * 0.08;
    const rgba = dark ? `rgba(58,22,14,${a})` : `rgba(216,130,78,${a * 0.9})`;
    const zero = dark ? "rgba(58,22,14,0)" : "rgba(216,130,78,0)";
    for (const ox of [0, -W, W]) {
      const gr = cx.createRadialGradient(x + ox, y, 0, x + ox, y, r);
      gr.addColorStop(0, rgba);
      gr.addColorStop(1, zero);
      cx.fillStyle = gr;
      cx.fillRect(x + ox - r, y - r, r * 2, r * 2);
    }
  }

  // 3. tapered streaks running down from the spine (blue-mauve and dark brick), soft edges by stacking layers
  const NS = 40;
  for (let i = 0; i < NS; i++) {
    const x0 = (i + 0.2 + rng() * 0.6) * (W / NS);
    const len = H * (0.16 + rng() * 0.34);
    const wid = 12 + rng() * 26;
    const blue = rng() < 0.42;
    for (const ox of [0, -W, W]) {
      for (let k = 0; k < 3; k++) {
        const s = 1 + k * 0.5;
        cx.beginPath();
        cx.moveTo(x0 + ox - wid * 0.5 * s, 0);
        cx.bezierCurveTo(x0 + ox - wid * 0.6 * s, len * 0.4, x0 + ox - wid * 0.22 * s, len * 0.75, x0 + ox, len * (1 + k * 0.08));
        cx.bezierCurveTo(x0 + ox + wid * 0.22 * s, len * 0.75, x0 + ox + wid * 0.6 * s, len * 0.4, x0 + ox + wid * 0.5 * s, 0);
        cx.closePath();
        cx.fillStyle = blue ? "rgba(84,76,118,0.16)" : "rgba(52,20,12,0.16)";
        cx.fill();
      }
    }
  }

  // 4. blue-mauve dorsal band
  const band = cx.createLinearGradient(0, 0, 0, H * 0.2);
  stops(band, [[0, "rgba(84,82,120,0.92)"], [0.55, "rgba(92,78,110,0.55)"], [1, "rgba(120,70,66,0)"]]);
  cx.fillStyle = band;
  cx.fillRect(0, 0, W, H * 0.2);

  // 5. fine pebbly scales (shared lattice for colour and relief)
  cx.fillStyle = cx.createPattern(scaleTile(256, false, 11), "repeat")!;
  cx.fillRect(0, 0, W, H);
  bx.fillStyle = bx.createPattern(scaleTile(256, true, 11), "repeat")!;
  bx.fillRect(0, 0, W, H);

  // 6. smooth tan belly (warm, not yellow) with small scutes; dark wrinkles gather toward the chest and throat
  const by = H * 0.64;
  const bg = cx.createLinearGradient(0, by - H * 0.06, 0, by + H * 0.05);
  stops(bg, [[0, "rgba(196,150,102,0)"], [1, "rgba(196,150,102,0.9)"]]);
  cx.fillStyle = bg;
  cx.fillRect(0, by - H * 0.06, W, H * 0.11);
  const bly = cx.createLinearGradient(0, by + H * 0.05, 0, H);
  stops(bly, [[0, "rgba(198,152,104,0.92)"], [1, "rgba(206,166,118,0.92)"]]);
  cx.fillStyle = bly;
  cx.fillRect(0, by + H * 0.05, W, H - (by + H * 0.05));
  const bumpGrad = bx.createLinearGradient(0, by, 0, by + H * 0.06);
  stops(bumpGrad, [[0, "rgba(100,100,100,0)"], [1, "rgba(100,100,100,0.95)"]]);
  bx.fillStyle = bumpGrad;
  bx.fillRect(0, by, W, H * 0.06);
  bx.fillStyle = "rgb(100,100,100)";
  bx.fillRect(0, by + H * 0.06, W, H - (by + H * 0.06));
  // faint transverse scute rows only (no lengthwise grid, that read as a barcode)
  for (let y = by + H * 0.05; y < H; y += 26) {
    cx.fillStyle = "rgba(96,62,36,0.10)";
    cx.fillRect(0, y, W, 1.3);
    bx.fillStyle = "rgb(76,76,76)";
    bx.fillRect(0, y, W, 1.4);
  }
  const wrinkle = (x: number, y0: number, len: number, sw: number, lw: number, a: number) => {
    for (const ox of [0, -W, W]) {
      cx.beginPath();
      cx.moveTo(x + ox, y0);
      cx.bezierCurveTo(x + ox + sw, y0 + len * 0.3, x + ox - sw * 0.7, y0 + len * 0.66, x + ox + sw * 0.5, y0 + len);
      cx.lineCap = "round";
      cx.strokeStyle = "rgba(255,232,200,0.10)";
      cx.lineWidth = lw + 3;
      cx.stroke();
      cx.strokeStyle = `rgba(58,32,18,${a})`;
      cx.lineWidth = lw;
      cx.stroke();
      bx.beginPath();
      bx.moveTo(x + ox, y0);
      bx.bezierCurveTo(x + ox + sw, y0 + len * 0.3, x + ox - sw * 0.7, y0 + len * 0.66, x + ox + sw * 0.5, y0 + len);
      bx.lineCap = "round";
      bx.strokeStyle = "rgb(40,40,40)";
      bx.lineWidth = lw + 1;
      bx.stroke();
    }
  };
  for (let i = 0; i < 120; i++) {
    // x: tail tip → head, so the chest / neck fold zone is the last stretch (0.62 – 1.0)
    const chest = i < 84;
    const x = chest ? W * (0.62 + rng() * 0.38) : rng() * W * 0.62;
    const y0 = by + H * (0.05 + rng() * 0.16);
    wrinkle(x, y0, H * (0.04 + rng() * (chest ? 0.1 : 0.06)), (rng() - 0.5) * 30, 2 + rng() * 2.5, chest ? 0.3 + rng() * 0.25 : 0.14 + rng() * 0.12);
  }

  // 7. lavender oval osteoderms: a loose row beside the spine plus clustered patches on the flanks, thigh area and tail
  const field = new OvalField(cx, bx, W);
  for (let x = rng() * 40; x < W; x += 70 + rng() * 30) {
    const rx = 8 + rng() * 3, ry = 17 + rng() * 6;
    field.tryPlace({ x, y: H * (0.075 + (rng() - 0.5) * 0.02), rx, ry, rot: (rng() - 0.5) * 0.3, lav: rng() < 0.7 }, 0.85);
  }
  const CLUSTERS = 34;
  for (let k = 0; k < CLUSTERS; k++) {
    // stratified in x so the patches cover the whole animal (tail, hips, flank, chest) instead of bunching up
    const ccx = ((k + rng()) / CLUSTERS) * W, ccy = H * (0.16 + rng() * 0.32);
    const want = 4 + Math.floor(rng() * 5);
    let got = 0;
    for (let t = 0; t < 16 && got < want; t++) {
      const rx = 7 + rng() * 5, ry = rx * (1.5 + rng() * 0.7);
      if (field.tryPlace({ x: ccx + (rng() - 0.5) * 130, y: ccy + (rng() - 0.5) * 95, rx, ry, rot: (rng() - 0.5) * 0.8, lav: rng() < 0.6 }, 1.05)) got++;
    }
  }

  // 8. sun-darkened wash along the very top
  const wash = cx.createLinearGradient(0, 0, 0, H * 0.12);
  stops(wash, [[0, "rgba(22,14,28,0.28)"], [1, "rgba(22,14,28,0)"]]);
  cx.fillStyle = wash;
  cx.fillRect(0, 0, W, H * 0.12);

  return { color: col.c, bump: bmp.c };
}

// ---------------------------------------------------------------------------------------------- head
/** Skull + jaw. x: back of skull → snout tip (only the first third is used), y: crown → throat. */
export function paintRexHead(): MapPair {
  const W = 1024, H = 512;
  const col = layer(W, H), bmp = layer(W / 2, H / 2);
  const cx = col.x, bx = bmp.x;
  bx.scale(0.5, 0.5);
  const rng = mulberry32(5150);

  const g = cx.createLinearGradient(0, 0, 0, H);
  stops(g, [[0, "#57536f"], [0.06, "#625873"], [0.15, "#824a38"], [0.32, "#a25b3b"], [0.5, "#b56a41"], [0.66, "#c4885a"], [0.8, "#d0a473"], [1, "#d9b886"]]);
  cx.fillStyle = g;
  cx.fillRect(0, 0, W, H);
  bx.fillStyle = "rgb(98,98,98)";
  bx.fillRect(0, 0, W, H);

  for (let i = 0; i < 160; i++) {
    const x = rng() * W, y = rng() * H * 0.7, r = 24 + rng() * 70;
    const dark = rng() < 0.55;
    const a = 0.06 + rng() * 0.08;
    const rgba = dark ? `rgba(58,22,14,${a})` : `rgba(216,130,78,${a * 0.9})`;
    const zero = dark ? "rgba(58,22,14,0)" : "rgba(216,130,78,0)";
    for (const ox of [0, -W, W]) {
      const gr = cx.createRadialGradient(x + ox, y, 0, x + ox, y, r);
      gr.addColorStop(0, rgba);
      gr.addColorStop(1, zero);
      cx.fillStyle = gr;
      cx.fillRect(x + ox - r, y - r, r * 2, r * 2);
    }
  }

  // blue-mauve crown that fades into the rust cheeks
  const crown = cx.createLinearGradient(0, 0, 0, H * 0.24);
  stops(crown, [[0, "rgba(88,84,124,0.9)"], [0.6, "rgba(96,80,112,0.5)"], [1, "rgba(120,70,66,0)"]]);
  cx.fillStyle = crown;
  cx.fillRect(0, 0, W, H * 0.24);

  // finer pebbles than the body
  cx.fillStyle = cx.createPattern(scaleTile(256, false, 23, 40, 26), "repeat")!;
  cx.fillRect(0, 0, W, H);
  bx.fillStyle = bx.createPattern(scaleTile(256, true, 23, 40, 26), "repeat")!;
  bx.fillRect(0, 0, W, H);

  // rugose bluish scutes along the crown
  const field = new OvalField(cx, bx, W);
  for (let attempt = 0; attempt < 260; attempt++) {
    const rx = 4.5 + rng() * 4, ry = rx * (1.2 + rng() * 0.7);
    field.tryPlace({ x: rng() * W, y: H * (0.03 + Math.pow(rng(), 1.5) * 0.16), rx, ry, rot: (rng() - 0.5) * 0.8, lav: rng() < 0.6 }, 1.15);
  }

  // cheek folds and throat wrinkles
  for (let i = 0; i < 46; i++) {
    const x = rng() * W;
    const y0 = H * (0.46 + rng() * 0.3);
    const len = H * (0.06 + rng() * 0.16);
    const bend = (rng() - 0.5) * 24;
    const lw = 2 + rng() * 3, a = 0.25 + rng() * 0.3;
    for (const ox of [0, -W, W]) {
      cx.beginPath();
      cx.moveTo(x + ox, y0);
      cx.quadraticCurveTo(x + ox + bend, y0 + len * 0.5, x + ox + bend * 0.4, y0 + len);
      cx.lineCap = "round";
      cx.strokeStyle = `rgba(52,26,14,${a})`;
      cx.lineWidth = lw;
      cx.stroke();
      bx.beginPath();
      bx.moveTo(x + ox, y0);
      bx.quadraticCurveTo(x + ox + bend, y0 + len * 0.5, x + ox + bend * 0.4, y0 + len);
      bx.strokeStyle = "rgb(34,34,34)";
      bx.lineWidth = lw + 1;
      bx.stroke();
    }
  }
  return { color: col.c, bump: bmp.c };
}

// ---------------------------------------------------------------------------------------------- legs
/** Legs. x: hip → foot, y: front of the leg (0) → back (H). Rust all over; blue plate ladder below the knee. */
export function paintRexLeg(): MapPair {
  const W = 1024, H = 256;
  const col = layer(W, H), bmp = layer(W / 2, H / 2);
  const cx = col.x, bx = bmp.x;
  bx.scale(0.5, 0.5);
  const rng = mulberry32(4471);

  const g = cx.createLinearGradient(0, 0, 0, H);
  stops(g, [[0, "#9a583b"], [0.45, "#a45f3e"], [0.8, "#8b4b32"], [1, "#7c432d"]]);
  cx.fillStyle = g;
  cx.fillRect(0, 0, W, H);
  bx.fillStyle = "rgb(100,100,100)";
  bx.fillRect(0, 0, W, H);
  // shins are a touch browner than the thighs
  const gx = cx.createLinearGradient(W * 0.42, 0, W * 0.75, 0);
  stops(gx, [[0, "rgba(70,32,18,0)"], [1, "rgba(70,32,18,0.2)"]]);
  cx.fillStyle = gx;
  cx.fillRect(W * 0.42, 0, W * 0.58, H);
  for (let i = 0; i < 60; i++) {
    const x = rng() * W, y = rng() * H, r = 26 + rng() * 60;
    const dark = rng() < 0.55;
    const a = 0.06 + rng() * 0.08;
    const rgba = dark ? `rgba(58,22,14,${a})` : `rgba(216,130,78,${a * 0.9})`;
    const zero = dark ? "rgba(58,22,14,0)" : "rgba(216,130,78,0)";
    const gr = cx.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, rgba);
    gr.addColorStop(1, zero);
    cx.fillStyle = gr;
    cx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  cx.fillStyle = cx.createPattern(scaleTile(256, false, 37, 24, 24), "repeat")!;
  cx.fillRect(0, 0, W, H);
  bx.fillStyle = bx.createPattern(scaleTile(256, true, 37, 24, 24), "repeat")!;
  bx.fillRect(0, 0, W, H);

  // a few lavender osteoderms on the outer thigh
  const field = new OvalField(cx, bx, W);
  for (let attempt = 0; attempt < 400; attempt++) {
    const rx = 12 + rng() * 6, ry = rx * (1.25 + rng() * 0.5);
    const x = W * (0.03 + rng() * 0.38), y = H * (0.12 + rng() * 0.62);
    field.tryPlace({ x, y, rx, ry, rot: (rng() - 0.5) * 0.6, lav: rng() < 0.6 }, 1.0);
  }

  // blue plate ladder down the front of the shin and over the metatarsus: short-along-the-leg, wide-across shingles.
  // (uScale in rex.ts is chosen so that x = 0.52 W is about the knee and x = 0.98 W the toe base.)
  const plate = (x: number, y: number, rx: number, ry: number, blue: string, edge: string, dark: boolean) => {
    cx.beginPath();
    cx.ellipse(x + 2, y + 2, rx + 1.5, ry + 2, 0, 0, TAU);
    cx.fillStyle = "rgba(24,12,12,0.4)";
    cx.fill();
    const gr = cx.createRadialGradient(x - rx * 0.1, y - ry * 0.1, 0, x, y, Math.max(rx, ry));
    gr.addColorStop(0, edge);
    gr.addColorStop(0.7, blue);
    gr.addColorStop(1, dark ? "#4b4468" : "#5a5278");
    cx.beginPath();
    cx.ellipse(x, y, rx, ry, 0, 0, TAU);
    cx.fillStyle = gr;
    cx.fill();
    cx.strokeStyle = "rgba(28,22,44,0.85)";
    cx.lineWidth = 2.2;
    cx.stroke();
    const bgr = bx.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
    bgr.addColorStop(0, "rgb(215,215,215)");
    bgr.addColorStop(1, "rgb(70,70,70)");
    bx.beginPath();
    bx.ellipse(x, y, rx, ry, 0, 0, TAU);
    bx.fillStyle = bgr;
    bx.fill();
  };
  const wash = cx.createLinearGradient(0, 0, 0, H * 0.34);
  stops(wash, [[0, "rgba(96,90,132,0.45)"], [1, "rgba(96,90,132,0)"]]);
  cx.fillStyle = wash;
  cx.fillRect(W * 0.52, 0, W * 0.47, H * 0.34);
  for (let x = W * 0.53; x < W * 0.97; x += 31) {
    // the ladder widens a little toward the ankle, like the reference
    const k = (x - W * 0.53) / (W * 0.44);
    plate(x + 13, (rng() - 0.5) * 3, 15.5, H * (0.15 + 0.03 * k), "#77739a", "#9c98bd", false);
  }
  // narrower ladder on the outer side of the shin (canvas y = 0.5 H is the flank)
  for (let x = W * 0.57; x < W * 0.97; x += 24) {
    plate(x + 8, H * 0.5 + (rng() - 0.5) * 3, 10, H * 0.06, "#706c92", "#918db3", true);
  }
  return { color: col.c, bump: bmp.c };
}

// ---------------------------------------------------------------------------------------------- feet
/** Toes. x: base → tip, y: top (0) → sole (H). Blue ribbed scutes on top, rust flanks, tan soles. */
export function paintRexFoot(): MapPair {
  const W = 512, H = 128;
  const col = layer(W, H), bmp = layer(W / 2, H / 2);
  const cx = col.x, bx = bmp.x;
  bx.scale(0.5, 0.5);
  const g = cx.createLinearGradient(0, 0, 0, H);
  stops(g, [[0, "#716d95"], [0.3, "#7a7396"], [0.46, "#a15e40"], [0.6, "#b9834f"], [1, "#c99b6a"]]);
  cx.fillStyle = g;
  cx.fillRect(0, 0, W, H);
  bx.fillStyle = "rgb(100,100,100)";
  bx.fillRect(0, 0, W, H);
  cx.fillStyle = cx.createPattern(scaleTile(128, false, 71, 16, 16), "repeat")!;
  cx.globalAlpha = 0.6;
  cx.fillRect(0, 0, W, H);
  cx.globalAlpha = 1;
  bx.fillStyle = bx.createPattern(scaleTile(128, true, 71, 16, 16), "repeat")!;
  bx.globalAlpha = 0.5;
  bx.fillRect(0, 0, W, H);
  bx.globalAlpha = 1;
  // ladder of blue shingles along the top of the toe
  for (let x = 6; x < W - 6; x += 17) {
    const grad = cx.createRadialGradient(x, H * 0.04, 0, x, H * 0.14, H * 0.3);
    grad.addColorStop(0, "#9b97bd");
    grad.addColorStop(0.7, "#76729a");
    grad.addColorStop(1, "#54496f");
    cx.beginPath();
    cx.ellipse(x, H * 0.1, 8, H * 0.2, 0, 0, TAU);
    cx.fillStyle = grad;
    cx.fill();
    cx.strokeStyle = "rgba(26,20,42,0.8)";
    cx.lineWidth = 1.8;
    cx.stroke();
    bx.beginPath();
    bx.ellipse(x, H * 0.1, 8, H * 0.2, 0, 0, TAU);
    bx.fillStyle = "rgb(190,190,190)";
    bx.fill();
    bx.strokeStyle = "rgb(60,60,60)";
    bx.lineWidth = 2.4;
    bx.stroke();
  }
  return { color: col.c, bump: bmp.c };
}

// ---------------------------------------------------------------------------------------------- dorsal fan plates
/** Ribbed rust fin. On a cone the canvas top is the tip and vertical lines are the ribs running base → tip. */
export function paintRexPlate(): HTMLCanvasElement {
  const W = 128, H = 128;
  const { c, x } = layer(W, H);
  const g = x.createLinearGradient(0, 0, 0, H);
  stops(g, [[0, "#b06a48"], [0.5, "#96513a"], [1, "#6e3626"]]);
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);
  const rng = mulberry32(808);
  for (let i = 0; i < W; i += 8) {
    x.fillStyle = `rgba(36,14,8,${0.4 + rng() * 0.25})`;
    x.fillRect(i, 0, 2.5, H);
    x.fillStyle = "rgba(255,210,170,0.12)";
    x.fillRect(i + 3, 0, 1.5, H);
  }
  for (let y = 10; y < H; y += 22) {
    x.fillStyle = "rgba(30,12,8,0.14)";
    x.fillRect(0, y, W, 2);
  }
  return c;
}
