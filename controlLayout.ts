import type React from "react";

/**
 * Configurable touch-control layout.
 * Every on-screen control has an id, a default position (the original hard-coded one) and can be
 * overridden by the player: position (fraction of the screen, so it survives rotation / other
 * screens), size multiplier and opacity. Stored in Settings.controlLayout.
 */
export interface CtlOverride {
  x?: number; // centre, 0..1 of the screen width
  y?: number; // centre, 0..1 of the screen height
  scale?: number; // multiplier on top of the global button (or joystick) size
  opacity?: number; // 0.1..1, replaces the global button opacity
}
export type ControlLayout = Record<string, CtlOverride>;

export type CtlTone = "red" | "green" | "plain" | "sys" | "stick";

export interface CtlDef {
  id: string;
  label: string;
  hint?: string; // when the button appears in game
  icon: string;
  sub?: string; // small caption drawn under the icon
  w: number;
  h: number;
  tone: CtlTone;
  /** default centre in px for the current screen and hotbar layout */
  at: (mb: boolean, W: number, H: number) => { cx: number; cy: number };
}

export const JOY_R0 = 60; // joystick radius at 100%
const fromRB = (right: number, bottom: number, w: number, h: number, W: number, H: number) => ({ cx: W - right - w / 2, cy: H - bottom - h / 2 });
const sysAt = (idx: number, W: number) => ({ cx: W - 8 - 22 - idx * 50, cy: 8 + 22 });

export const CONTROL_DEFS: CtlDef[] = [
  { id: "stick", label: "Joystick", hint: "sempre", icon: "target", w: (JOY_R0 + 14) * 2, h: (JOY_R0 + 14) * 2, tone: "stick", at: (_m, _W, H) => ({ cx: 118, cy: H - 112 }) },
  { id: "attack", label: "Atacar", hint: "sempre", icon: "sword", sub: "Atacar", w: 88, h: 88, tone: "red", at: (m, W, H) => (m ? fromRB(24, 122, 88, 88, W, H) : fromRB(24, 92, 88, 88, W, H)) },
  { id: "jump", label: "Pular", hint: "sempre", icon: "jump", sub: "Pular", w: 64, h: 64, tone: "plain", at: (m, W, H) => (m ? fromRB(262, 20, 64, 64, W, H) : fromRB(122, 22, 64, 64, W, H)) },
  { id: "sprint", label: "Correr", hint: "sempre", icon: "run", w: 54, h: 54, tone: "plain", at: (m, W, H) => (m ? fromRB(262, 96, 54, 54, W, H) : fromRB(28, 192, 54, 54, W, H)) },
  { id: "action", label: "Interagir / Desmontar", hint: "ao mirar algo ou montado", icon: "hand", sub: "Usar", w: 70, h: 70, tone: "green", at: (m, W, H) => (m ? fromRB(122, 124, 70, 70, W, H) : fromRB(124, 102, 70, 70, W, H)) },
  { id: "action2", label: "Ação secundária", hint: "ao mirar uma criatura", icon: "dino", sub: "Ação", w: 54, h: 54, tone: "plain", at: (m, W, H) => (m ? fromRB(262, 162, 54, 54, W, H) : fromRB(200, 108, 54, 54, W, H)) },
  { id: "carry", label: "Agarrar / Soltar", hint: "voando com criatura que carrega", icon: "hand", sub: "Agarrar", w: 56, h: 56, tone: "plain", at: (m, W, H) => fromRB(200, m ? 124 : 104, 56, 56, W, H) },
  { id: "barrel", label: "Giro (Barrel Roll)", hint: "voando com criatura que carrega", icon: "rotate", sub: "Rolar", w: 56, h: 56, tone: "plain", at: (m, W, H) => fromRB(262, m ? 124 : 104, 56, 56, W, H) },
  { id: "ammo", label: "Trocar munição", hint: "com arma de projétil", icon: "ammo", sub: "12", w: 48, h: 48, tone: "plain", at: (m, W, H) => (m ? fromRB(200, 208, 48, 48, W, H) : fromRB(92, 188, 48, 48, W, H)) },
  { id: "whistle", label: "Apito", hint: "com criaturas domesticadas", icon: "whistle", w: 48, h: 48, tone: "plain", at: (_m, _W, H) => ({ cx: 14 + 24, cy: H * 0.42 + 24 }) },
  { id: "rotate", label: "Girar construção", hint: "ao posicionar estrutura", icon: "rotate", sub: "Girar", w: 56, h: 56, tone: "plain", at: (m, W, H) => (m ? fromRB(330, 20, 56, 56, W, H) : fromRB(206, 26, 56, 56, W, H)) },
  { id: "cancel", label: "Cancelar construção", hint: "ao posicionar estrutura", icon: "close", sub: "Cancelar", w: 56, h: 56, tone: "plain", at: (m, W, H) => (m ? fromRB(330, 88, 56, 56, W, H) : fromRB(206, 94, 56, 56, W, H)) },
  { id: "descend", label: "Descer (modo voo)", hint: "modo desenvolvedor voando", icon: "jump", sub: "Descer", w: 58, h: 58, tone: "plain", at: (m, W, H) => fromRB(m ? 328 : 194, 22, 58, 58, W, H) },
  { id: "camera", label: "Câmera", hint: "sempre", icon: "camera", w: 44, h: 44, tone: "sys", at: (_m, W) => sysAt(3, W) },
  { id: "map", label: "Mapa", hint: "sempre", icon: "map", w: 44, h: 44, tone: "sys", at: (_m, W) => sysAt(2, W) },
  { id: "bag", label: "Inventário", hint: "sempre", icon: "bag", w: 44, h: 44, tone: "sys", at: (_m, W) => sysAt(1, W) },
  { id: "menu", label: "Menu", hint: "sempre", icon: "menu", w: 44, h: 44, tone: "sys", at: (_m, W) => sysAt(0, W) },
];

export const CONTROL_BY_ID: Record<string, CtlDef> = Object.fromEntries(CONTROL_DEFS.map((d) => [d.id, d]));

export const SCALE_MIN = 0.4;
export const SCALE_MAX = 2.5;
export const OPACITY_MIN = 0.1;

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** Drop unknown ids / junk and clamp every value (saved data may come from anywhere). */
export function sanitizeLayout(raw: unknown): ControlLayout {
  const out: ControlLayout = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!CONTROL_BY_ID[id] || !v || typeof v !== "object") continue;
    const o = v as Record<string, unknown>;
    const e: CtlOverride = {};
    const x = num(o.x), y = num(o.y), s = num(o.scale), op = num(o.opacity);
    if (x !== undefined && y !== undefined) { e.x = clamp(x, 0, 1); e.y = clamp(y, 0, 1); }
    if (s !== undefined) e.scale = clamp(s, SCALE_MIN, SCALE_MAX);
    if (op !== undefined) e.opacity = clamp(op, OPACITY_MIN, 1);
    if (Object.keys(e).length) out[id] = e;
  }
  return out;
}

export interface Resolved {
  cx: number;
  cy: number;
  scale: number;
  opacity: number;
  moved: boolean;
}

/** Final centre / scale / opacity of a control for the current screen. */
export function resolveCtl(id: string, layout: ControlLayout | undefined, mb: boolean, W: number, H: number, baseScale: number, baseOpacity: number): Resolved {
  const def = CONTROL_BY_ID[id];
  const d = def.at(mb, W, H);
  const ov = layout?.[id];
  const moved = ov?.x !== undefined && ov?.y !== undefined;
  const scale = baseScale * (ov?.scale ?? 1);
  const halfW = (def.w * scale) / 2, halfH = (def.h * scale) / 2;
  let cx = moved ? (ov!.x as number) * W : d.cx;
  let cy = moved ? (ov!.y as number) * H : d.cy;
  // keep it on screen even after a rotation / smaller display
  cx = W > halfW * 2 ? clamp(cx, halfW, W - halfW) : W / 2;
  cy = H > halfH * 2 ? clamp(cy, halfH, H - halfH) : H / 2;
  return { cx, cy, scale, opacity: ov?.opacity ?? baseOpacity, moved };
}

/** Absolute style (centre-anchored) shared by the in-game buttons and the editor preview. */
export function ctlStyle(def: CtlDef, r: Resolved): React.CSSProperties {
  return { position: "absolute", left: r.cx, top: r.cy, width: def.w, height: def.h, transform: `translate(-50%, -50%) scale(${r.scale})`, opacity: r.opacity };
}

/** Global baseline for a control before its own override: joystick has its own size, system icons ignore the button sliders. */
export function ctlBase(def: CtlDef, st: { buttonScale?: number; buttonOpacity?: number; joystickSize?: number }): { scale: number; opacity: number } {
  if (def.tone === "stick") return { scale: st.joystickSize ?? 1, opacity: 0.55 };
  if (def.tone === "sys") return { scale: 1, opacity: 1 };
  return { scale: st.buttonScale ?? 1, opacity: st.buttonOpacity ?? 0.85 };
}
