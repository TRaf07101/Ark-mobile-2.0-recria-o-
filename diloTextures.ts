import { mulberry32, hash2 } from "../core/noise";
import { layer, scaleTile, type MapPair } from "./rexTextures";

/**
 * Procedural skin for the ARK Mobile Dilophosaurus (plain 2D canvas, no three.js).
 *
 * Reference look (ARK original):
 *  - olive / leaf-green hide of very fine pebbly scales, darker along the spine, yellow-green on the flanks;
 *  - black-green tiger stripes that fall from the spine down the flanks, tail and thighs;
 *  - pale cream belly and throat crossed by fine transverse wrinkles;
 *  - amber cheek blush, a dark streak running from the eye to the nostril;
 *  - a huge neck frill: dark rim, yellow → orange → crimson membrane, black ribs with a fan of veins;
 *  - two thin head crests painted yellow → orange → red with dark veins.
 *
 * UV convention used by the lofts: canvas x = distance along the body (wraps), canvas y = around the
 * cross-section with y = 0 on top / front, y = H/2 on the flank and y = H on the belly / back.
 */

const TAU = Math.PI * 2;

function wrapDraw(W: number, x: number, reach: number, fn: (ox: number) => void) {
  for (const o of [0, -W, W]) {
    const px = x + o;
    if (px < -reach || px > W + reach) continue;
    fn(o);
  }
}

/** Soft round blotch (with horizontal wrap copies). */
function blotch(cx: CanvasRenderingContext2D, W: number, x: number, y: number, r: number, rgb: string, a: number) {
  wrapDraw(W, x, r, (o) => {
    const g = cx.createRadialGradient(x + o, y, 0, x + o, y, r);
    g.addColorStop(0, `rgba(${rgb},${a})`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    cx.fillStyle = g;
    cx.fillRect(x + o - r, y - r, r * 2, r * 2);
  });
}

/** A tapering tiger stripe that falls from (x, y0) to a point at (x + wob, y1). */
function stripe(cx: CanvasRenderingContext2D, W: number, x: number, y0: number, y1: number, w0: number, wob: number, fill: string) {
  wrapDraw(W, x, w0 + Math.abs(wob) + 4, (o) => {
    const xx = x + o, ym = (y0 + y1) / 2;
    cx.beginPath();
    cx.moveTo(xx - w0 / 2, y0);
    cx.quadraticCurveTo(xx - w0 * 0.34 + wob * 0.5, ym, xx + wob, y1);
    cx.quadraticCurveTo(xx + w0 * 0.34 + wob * 0.5, ym, xx + w0 / 2, y0);
    cx.closePath();
    cx.fillStyle = fill;
    cx.fill();
  });
}

function speckle(cx: CanvasRenderingContext2D, W: number, rng: () => number, n: number, y0: number, y1: number, rMin: number, rMax: number, rgb: string, aMin: number, aMax: number) {
  for (let i = 0; i < n; i++) {
    const x = rng() * W, y = y0 + rng() * (y1 - y0), r = rMin + rng() * (rMax - rMin);
    wrapDraw(W, x, r, (o) => {
      cx.beginPath();
      cx.ellipse(x + o, y, r, r * (0.7 + rng() * 0.5), rng() * Math.PI, 0, TAU);
      cx.fillStyle = `rgba(${rgb},${aMin + rng() * (aMax - aMin)})`;
      cx.fill();
    });
  }
}

function scaleOverlay(c: { x: CanvasRenderingContext2D }, b: { x: CanvasRenderingContext2D }, W: number, H: number, seed: number, cols = 32, rows = 20) {
  c.x.fillStyle = c.x.createPattern(scaleTile(256, false, seed, cols, rows), "repeat")!;
  c.x.fillRect(0, 0, W, H);
  b.x.fillStyle = b.x.createPattern(scaleTile(256, true, seed, cols, rows), "repeat")!;
  b.x.fillRect(0, 0, W, H);
}

// ---------------------------------------------------------------- body (torso, tail, neck)
export function paintDiloBody(): MapPair {
  const W = 1024, H = 512;
  const c = layer(W, H), b = layer(W, H);
  const cx = c.x;
  const rng = mulberry32(2024);

  const base = cx.createLinearGradient(0, 0, 0, H);
  base.addColorStop(0, "#2f4a1c");
  base.addColorStop(0.12, "#3f5e24");
  base.addColorStop(0.34, "#62833a");
  base.addColorStop(0.52, "#85a048");
  base.addColorStop(0.66, "#b2b867");
  base.addColorStop(0.78, "#d9d495");
  base.addColorStop(1, "#ece6b8");
  cx.fillStyle = base;
  cx.fillRect(0, 0, W, H);

  // mottling: soft dark and light patches
  for (let i = 0; i < 520; i++) {
    const y = Math.pow(rng(), 1.15) * H * 0.78;
    const dark = rng() < 0.5;
    blotch(cx, W, rng() * W, y, 8 + rng() * 26, dark ? "22,38,14" : "196,210,110", 0.05 + rng() * 0.12);
  }

  // tiger stripes: soft halo then a hard black-green core
  const n = 30;
  const pitch = W / n;
  for (let pass = 0; pass < 2; pass++) {
    const r2 = mulberry32(99);
    for (let i = 0; i < n; i++) {
      const x = (i + 0.5) * pitch + (r2() - 0.5) * 16;
      const y1 = H * (0.4 + r2() * 0.28);
      const w0 = 15 + r2() * 15;
      const wob = (r2() - 0.5) * 26;
      if (pass === 0) stripe(cx, W, x, -6, y1 + 10, w0 * 1.7, wob, "rgba(20,34,12,0.28)");
      else {
        stripe(cx, W, x, -6, y1, w0, wob, "rgba(14,24,9,0.9)");
        // forked half-stripe between the big ones
        if (i % 2 === 0) stripe(cx, W, x + pitch * 0.5, -6, y1 * 0.5, w0 * 0.55, wob * 0.4, "rgba(14,24,9,0.78)");
      }
    }
  }
  // dark spine band
  const spine = cx.createLinearGradient(0, 0, 0, H * 0.09);
  spine.addColorStop(0, "rgba(10,18,6,0.85)");
  spine.addColorStop(1, "rgba(10,18,6,0)");
  cx.fillStyle = spine;
  cx.fillRect(0, 0, W, H * 0.09);

  // pale yellow flecks on the flank + dark freckles + amber dots under the stripes
  speckle(cx, W, rng, 220, H * 0.3, H * 0.7, 1.2, 3.6, "232,214,96", 0.25, 0.6);
  speckle(cx, W, rng, 260, H * 0.08, H * 0.72, 1, 2.8, "18,28,10", 0.18, 0.5);
  speckle(cx, W, rng, 70, H * 0.42, H * 0.66, 2, 4.5, "222,120,40", 0.25, 0.5);

  // belly: fine transverse wrinkles and a soft darker edge where the flank meets it
  cx.strokeStyle = "rgba(122,112,58,0.28)";
  cx.lineWidth = 1.4;
  for (let x = 0; x < W; x += 9) {
    cx.beginPath();
    const jitter = (hash2(x, 3, 71) - 0.5) * 3;
    cx.moveTo(x + jitter, H * 0.74);
    cx.quadraticCurveTo(x + 4, H * 0.86, x + jitter, H);
    cx.stroke();
  }
  const edge = cx.createLinearGradient(0, H * 0.6, 0, H * 0.76);
  edge.addColorStop(0, "rgba(90,100,40,0)");
  edge.addColorStop(0.5, "rgba(90,100,40,0.18)");
  edge.addColorStop(1, "rgba(90,100,40,0)");
  cx.fillStyle = edge;
  cx.fillRect(0, H * 0.6, W, H * 0.16);

  scaleOverlay(c, b, W, H, 41, 32, 20);
  return { color: c.c, bump: b.c };
}

// ---------------------------------------------------------------- head (skull)
export function paintDiloHead(): MapPair {
  const W = 512, H = 256;
  const c = layer(W, H), b = layer(W, H);
  const cx = c.x;
  const rng = mulberry32(611);

  const base = cx.createLinearGradient(0, 0, 0, H);
  base.addColorStop(0, "#35511e");
  base.addColorStop(0.22, "#4f7030");
  base.addColorStop(0.48, "#7c9a44");
  base.addColorStop(0.66, "#c2bf72");
  base.addColorStop(1, "#ece4ae");
  cx.fillStyle = base;
  cx.fillRect(0, 0, W, H);

  for (let i = 0; i < 160; i++) blotch(cx, W, rng() * W, rng() * H * 0.7, 6 + rng() * 14, rng() < 0.5 ? "20,34,12" : "200,214,110", 0.06 + rng() * 0.1);

  // amber blush on the cheek / behind the jaw and a warm wash over the snout tip
  blotch(cx, W, W * 0.1, H * 0.46, 70, "226,120,40", 0.5);
  blotch(cx, W, W * 0.2, H * 0.36, 40, "240,170,50", 0.32);
  blotch(cx, W, W * 0.97, H * 0.4, 46, "230,140,60", 0.3);

  // dark streak from the eye toward the nostril + short stripes across the crown
  cx.save();
  cx.fillStyle = "rgba(18,26,10,0.85)";
  cx.beginPath();
  cx.moveTo(W * 0.3, H * 0.27);
  cx.quadraticCurveTo(W * 0.56, H * 0.22, W * 0.82, H * 0.3);
  cx.quadraticCurveTo(W * 0.56, H * 0.34, W * 0.3, H * 0.33);
  cx.closePath();
  cx.fill();
  cx.restore();
  for (let i = 0; i < 9; i++) stripe(cx, W, W * (0.05 + i * 0.035), -4, H * (0.16 + rng() * 0.1), 10, (rng() - 0.5) * 8, "rgba(14,22,8,0.8)");
  // cream lip line
  cx.strokeStyle = "rgba(246,236,170,0.65)";
  cx.lineWidth = 5;
  cx.beginPath();
  cx.moveTo(W * 0.18, H * 0.62);
  cx.quadraticCurveTo(W * 0.6, H * 0.66, W, H * 0.6);
  cx.stroke();

  speckle(cx, W, rng, 120, H * 0.1, H * 0.6, 1, 2.6, "232,214,96", 0.3, 0.6);
  speckle(cx, W, rng, 140, H * 0.05, H * 0.6, 0.8, 2.2, "16,26,10", 0.2, 0.5);

  scaleOverlay(c, b, W, H, 52, 40, 24);
  return { color: c.c, bump: b.c };
}

// ---------------------------------------------------------------- legs
export function paintDiloLeg(): MapPair {
  const W = 256, H = 256;
  const c = layer(W, H), b = layer(W, H);
  const cx = c.x;
  const rng = mulberry32(733);

  const base = cx.createLinearGradient(0, 0, 0, H);
  base.addColorStop(0, "#3f5c25");
  base.addColorStop(0.3, "#5f8038");
  base.addColorStop(0.5, "#86a049");
  base.addColorStop(0.76, "#c3c07a");
  base.addColorStop(1, "#dcd6a0");
  cx.fillStyle = base;
  cx.fillRect(0, 0, W, H);
  for (let i = 0; i < 160; i++) blotch(cx, W, rng() * W, rng() * H * 0.8, 6 + rng() * 14, rng() < 0.5 ? "22,36,14" : "210,216,120", 0.06 + rng() * 0.1);

  // thigh stripes (x small = hip), fading out over the shin
  for (let i = 0; i < 5; i++) {
    const x = W * (0.05 + i * 0.085);
    stripe(cx, W, x, -6, H * (0.62 - i * 0.06), 22 - i * 2, (rng() - 0.5) * 12, "rgba(14,24,9,0.85)");
  }
  // shin + ankle: duller, sandier scales with pale flecks
  const shin = cx.createLinearGradient(W * 0.5, 0, W, 0);
  shin.addColorStop(0, "rgba(170,160,90,0)");
  shin.addColorStop(1, "rgba(170,160,90,0.32)");
  cx.fillStyle = shin;
  cx.fillRect(W * 0.5, 0, W * 0.5, H);
  speckle(cx, W, rng, 90, 0, H * 0.7, 1, 2.4, "236,222,120", 0.25, 0.55);

  scaleOverlay(c, b, W, H, 63, 26, 24);
  return { color: c.c, bump: b.c };
}

// ---------------------------------------------------------------- feet
export function paintDiloFoot(): MapPair {
  const S = 128;
  const c = layer(S, S), b = layer(S, S);
  const cx = c.x;
  const rng = mulberry32(81);
  const base = cx.createLinearGradient(0, 0, 0, S);
  base.addColorStop(0, "#5c6f3b");
  base.addColorStop(0.55, "#7d8b4c");
  base.addColorStop(1, "#b4a97b");
  cx.fillStyle = base;
  cx.fillRect(0, 0, S, S);
  for (let i = 0; i < 50; i++) blotch(cx, S, rng() * S, rng() * S, 5 + rng() * 9, rng() < 0.5 ? "30,36,16" : "214,200,140", 0.1);
  scaleOverlay(c, b, S, S, 77, 16, 14);
  return { color: c.c, bump: b.c };
}

// ---------------------------------------------------------------- neck frill (one rib-to-rib cell, repeats around the collar)
// canvas x: 0 and W are rib lines. canvas y: 0 = outer rim, H = root at the neck.
export function paintDiloFrill(): MapPair {
  const W = 128, H = 256;
  const c = layer(W, H), b = layer(W, H);
  const cx = c.x, bx = b.x;
  const rng = mulberry32(5150);

  const g = cx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#22100a");
  g.addColorStop(0.035, "#2a120c");
  g.addColorStop(0.055, "#f8da4c");
  g.addColorStop(0.17, "#f4b72f");
  g.addColorStop(0.34, "#ee7d29");
  g.addColorStop(0.54, "#d2421f");
  g.addColorStop(0.76, "#a42a20");
  g.addColorStop(0.9, "#5d3a22");
  g.addColorStop(1, "#33502a");
  cx.fillStyle = g;
  cx.fillRect(0, 0, W, H);

  // soft dark core in the middle of each panel, like stretched skin between the ribs
  const cell = cx.createLinearGradient(0, 0, W, 0);
  cell.addColorStop(0, "rgba(40,14,8,0.4)");
  cell.addColorStop(0.3, "rgba(40,14,8,0)");
  cell.addColorStop(0.7, "rgba(40,14,8,0)");
  cell.addColorStop(1, "rgba(40,14,8,0.4)");
  cx.fillStyle = cell;
  cx.fillRect(0, 0, W, H);
  blotch(cx, W, W * 0.5, H * 0.46, 34, "60,16,10", 0.22);

  bx.fillStyle = "rgb(96,96,96)";
  bx.fillRect(0, 0, W, H);

  // fan of veins from the root to the rim
  cx.lineCap = "round";
  for (let i = 0; i < 7; i++) {
    const tx = W * (0.12 + 0.76 * (i / 6)) + (rng() - 0.5) * 6;
    const mx = W * 0.5 + (tx - W * 0.5) * 0.55 + (rng() - 0.5) * 10;
    for (const [ctx2, col, lw] of [[cx, "rgba(38,10,6,0.46)", 2.2], [bx, "rgba(140,140,140,0.9)", 2.4]] as const) {
      ctx2.strokeStyle = col;
      ctx2.lineWidth = lw;
      ctx2.beginPath();
      ctx2.moveTo(W * 0.5, H);
      ctx2.quadraticCurveTo(mx, H * 0.5, tx, H * 0.07);
      ctx2.stroke();
    }
  }
  // cross-veins
  cx.strokeStyle = "rgba(38,10,6,0.18)";
  cx.lineWidth = 1.2;
  for (let k = 0; k < 7; k++) {
    const y = H * (0.16 + k * 0.1);
    cx.beginPath();
    cx.moveTo(W * 0.1, y + (rng() - 0.5) * 6);
    cx.bezierCurveTo(W * 0.35, y - 8 + rng() * 8, W * 0.65, y - 8 + rng() * 8, W * 0.9, y + (rng() - 0.5) * 6);
    cx.stroke();
  }
  speckle(cx, W, rng, 70, H * 0.12, H * 0.74, 0.8, 2, "40,12,8", 0.15, 0.4);
  speckle(cx, W, rng, 40, H * 0.08, H * 0.4, 1, 2.4, "255,236,140", 0.18, 0.45);

  // ribs (they sit on the cell edges, so each half is drawn on its own side)
  const rib = 8;
  for (const [x0, dir] of [[0, 1], [W, -1]] as const) {
    const rg = cx.createLinearGradient(x0, 0, x0 + dir * rib, 0);
    rg.addColorStop(0, "#6f3c22");
    rg.addColorStop(0.35, "#2d170d");
    rg.addColorStop(1, "rgba(30,14,8,0)");
    cx.fillStyle = rg;
    cx.fillRect(dir > 0 ? x0 : x0 - rib, 0, rib, H);
    const bg = bx.createLinearGradient(x0, 0, x0 + dir * rib, 0);
    bg.addColorStop(0, "rgb(235,235,235)");
    bg.addColorStop(1, "rgba(96,96,96,0)");
    bx.fillStyle = bg;
    bx.fillRect(dir > 0 ? x0 : x0 - rib, 0, rib, H);
  }
  // rim: dark beaded edge
  bx.fillStyle = "rgb(200,200,200)";
  bx.fillRect(0, 0, W, H * 0.04);
  return { color: c.c, bump: b.c };
}

// ---------------------------------------------------------------- head crests
// canvas x: front (snout side) → rear. canvas y: 0 = tip of the crest, H = base on the skull.
export function paintDiloCrest(): HTMLCanvasElement {
  const W = 256, H = 128;
  const c = layer(W, H);
  const cx = c.x;
  const rng = mulberry32(8080);
  const g = cx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#f7d13c");
  g.addColorStop(0.3, "#f09a2c");
  g.addColorStop(0.62, "#d5492a");
  g.addColorStop(0.86, "#8a3a22");
  g.addColorStop(1, "#36532a");
  cx.fillStyle = g;
  cx.fillRect(0, 0, W, H);
  // veins radiate from the base up to the scalloped rim
  cx.lineCap = "round";
  for (let i = 0; i < 16; i++) {
    const tx = W * (0.08 + 0.84 * (i / 15));
    cx.strokeStyle = "rgba(40,12,8,0.5)";
    cx.lineWidth = 1.8;
    cx.beginPath();
    cx.moveTo(W * (0.3 + 0.4 * (i / 15)), H * 1.05);
    cx.quadraticCurveTo((tx + W * 0.5) / 2, H * 0.5, tx, H * 0.08);
    cx.stroke();
  }
  speckle(cx, W, rng, 60, H * 0.05, H * 0.7, 0.8, 1.8, "40,12,8", 0.15, 0.4);
  // dark rim along the crest edge (top and both ends)
  const rim = cx.createLinearGradient(0, 0, 0, H * 0.14);
  rim.addColorStop(0, "rgba(34,14,8,0.95)");
  rim.addColorStop(1, "rgba(34,14,8,0)");
  cx.fillStyle = rim;
  cx.fillRect(0, 0, W, H * 0.14);
  for (const [x0, dir] of [[0, 1], [W, -1]] as const) {
    const eg = cx.createLinearGradient(x0, 0, x0 + dir * 20, 0);
    eg.addColorStop(0, "rgba(34,14,8,0.85)");
    eg.addColorStop(1, "rgba(34,14,8,0)");
    cx.fillStyle = eg;
    cx.fillRect(dir > 0 ? 0 : W - 20, 0, 20, H);
  }
  return c.c;
}
