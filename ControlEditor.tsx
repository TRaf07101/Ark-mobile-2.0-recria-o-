import { useEffect, useRef, useState } from "react";
import type { Settings } from "../core/settings";
import { Icon } from "./svg";
import { Btn } from "./common";
import { CONTROL_DEFS, CONTROL_BY_ID, JOY_R0, OPACITY_MIN, SCALE_MAX, SCALE_MIN, ctlBase, ctlStyle, resolveCtl, sanitizeLayout, type ControlLayout, type CtlDef } from "./controlLayout";

/** Live viewport size (re-renders on resize / rotation). */
export function useViewport() {
  const [vp, setVp] = useState({ W: window.innerWidth, H: window.innerHeight });
  useEffect(() => {
    const f = () => setVp({ W: window.innerWidth, H: window.innerHeight });
    window.addEventListener("resize", f);
    window.addEventListener("orientationchange", f);
    return () => { window.removeEventListener("resize", f); window.removeEventListener("orientationchange", f); };
  }, []);
  return vp;
}

/** Visual of a control, identical to the in-game one (also used by the editor preview). */
export function CtlFace({ def }: { def: CtlDef }) {
  if (def.tone === "stick") {
    const R = JOY_R0, pad = 14;
    return (
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 rounded-full" style={{ border: "2px solid rgba(120,220,240,0.45)", background: "radial-gradient(circle, rgba(10,30,36,0.35), rgba(10,30,36,0.15))" }} />
        <div className="absolute inset-[18px] rounded-full" style={{ border: "1px dashed rgba(120,220,240,0.25)" }} />
        <div className="absolute rounded-full" style={{ width: 54, height: 54, left: R + pad - 27, top: R + pad - 27, background: "radial-gradient(circle at 40% 35%, #bff6ff, #3ab8d4)", boxShadow: "0 0 14px rgba(94,230,255,.5)" }} />
      </div>
    );
  }
  if (def.tone === "sys") return <Icon name={def.icon} size={20} />;
  return (
    <>
      <span className="pointer-events-none"><Icon name={def.icon} size={def.w >= 80 ? 30 : def.w >= 60 ? 24 : 20} /></span>
      {def.sub && <span className={`${def.w >= 80 ? "text-[9px]" : "text-[8px]"} uppercase pointer-events-none mt-0.5`}>{def.sub}</span>}
    </>
  );
}

const toneClass = (def: CtlDef) => (def.tone === "red" ? "ark-touch red" : def.tone === "green" ? "ark-touch green" : def.tone === "sys" ? "ark-hud rounded-md flex items-center justify-center text-white" : def.tone === "stick" ? "" : "ark-touch");

/** Full-screen editor: drag every control, pick a size and an opacity for each one. */
export function ControlLayoutEditor({ settings, onChange, onClose }: { settings: Settings; onChange: (s: Partial<Settings>) => void; onClose: () => void }) {
  const { W, H } = useViewport();
  const mb = settings.hotbarLayout === "mobile";
  const [layout, setLayout] = useState<ControlLayout>(() => sanitizeLayout(settings.controlLayout));
  const [sel, setSel] = useState<string>("attack");
  const [snap, setSnap] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const drag = useRef<{ id: string; pid: number; dx: number; dy: number } | null>(null);

  const commit = (next: ControlLayout) => {
    setLayout(next);
    layoutRef.current = next;
    onChange({ controlLayout: next });
  };
  const patch = (id: string, p: { x?: number; y?: number; scale?: number; opacity?: number }) => {
    const cur = layoutRef.current;
    return { ...cur, [id]: { ...cur[id], ...p } } as ControlLayout;
  };
  const res = (id: string, l: ControlLayout = layout) => {
    const b = ctlBase(CONTROL_BY_ID[id], settings);
    return resolveCtl(id, l, mb, W, H, b.scale, b.opacity);
  };

  const onDown = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const r = res(id);
    drag.current = { id, pid: e.pointerId, dx: e.clientX - r.cx, dy: e.clientY - r.cy };
    setSel(id);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.pid !== e.pointerId) return;
    const def = CONTROL_BY_ID[d.id];
    const r = res(d.id);
    const halfW = (def.w * r.scale) / 2, halfH = (def.h * r.scale) / 2;
    let cx = Math.min(W - halfW, Math.max(halfW, e.clientX - d.dx));
    let cy = Math.min(H - halfH, Math.max(halfH, e.clientY - d.dy));
    if (snap) {
      // 2% grid, clamped again so a snapped button never leaves the screen
      cx = Math.min(W - halfW, Math.max(halfW, Math.round(cx / (W * 0.02)) * W * 0.02));
      cy = Math.min(H - halfH, Math.max(halfH, Math.round(cy / (H * 0.02)) * H * 0.02));
    }
    setLayout(patch(d.id, { x: cx / W, y: cy / H }));
  };
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.pid !== e.pointerId) return;
    drag.current = null;
    commit(layoutRef.current);
  };

  const def = CONTROL_BY_ID[sel];
  const r = res(sel);
  const ov = layout[sel];
  const resetOne = () => {
    const next = { ...layout };
    delete next[sel];
    commit(next);
  };
  const resetAll = () => commit({});
  const nudge = (dx: number, dy: number) => {
    const cur = res(sel);
    commit(patch(sel, { x: Math.min(1, Math.max(0, (cur.cx + dx) / W)), y: Math.min(1, Math.max(0, (cur.cy + dy) / H)) }));
  };

  // faint guides of the HUD so buttons are not dropped on top of the minimap / hotbar
  const slot = Math.round((mb ? Math.max(42, Math.min(52, Math.floor(H / 8.2))) : Math.max(40, Math.min(54, Math.floor(W / 17.5)))) * (settings.hotbarScale ?? 1));
  const ghost = "absolute pointer-events-none border border-dashed border-white/25 text-[9px] uppercase tracking-wider text-white/35 flex items-center justify-center text-center";

  return (
    <div className="fixed inset-0 z-[90] select-none" style={{ touchAction: "none", background: "rgba(3,10,14,.78)", backgroundImage: "linear-gradient(rgba(120,220,240,.07) 1px, transparent 1px), linear-gradient(90deg, rgba(120,220,240,.07) 1px, transparent 1px)", backgroundSize: `${Math.max(8, W * 0.02)}px ${Math.max(8, H * 0.02)}px` }} onPointerDown={(e) => e.stopPropagation()} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
      {/* HUD ghosts */}
      <div className={ghost} style={{ left: 8, top: 8, width: 178, height: 84 }}>Status</div>
      {settings.minimap && <div className={ghost} style={{ right: 8, top: 58, width: 96, height: 96 }}>Minimapa</div>}
      {mb
        ? <div className={ghost} style={{ right: 8, bottom: 8, width: slot * 5 + 24, height: slot * 2 + 12 }}>Barra rápida</div>
        : <div className={ghost} style={{ left: "50%", transform: "translateX(-50%)", bottom: 8, width: Math.min(W - 16, slot * 10 + 40), height: slot + 6 }}>Barra rápida</div>}

      {CONTROL_DEFS.map((d) => {
        const rr = res(d.id);
        const selected = d.id === sel;
        return (
          <div key={d.id} className={`${toneClass(d)}`} style={{ ...ctlStyle(d, { ...rr, opacity: Math.max(0.3, rr.opacity) }), cursor: "grab", outline: selected ? "2px dashed var(--ark-amber)" : "1px dashed rgba(255,255,255,.18)", outlineOffset: 4, zIndex: selected ? 5 : 1, touchAction: "none" }} onPointerDown={(e) => onDown(e, d.id)}>
            <CtlFace def={d} />
          </div>
        );
      })}

      {/* editor panel */}
      <div className="absolute left-1/2 -translate-x-1/2 ark-hud p-2.5 flex flex-col gap-1.5" style={{ top: 8, width: Math.min(360, W * 0.5), zIndex: 10, maxHeight: H - 16, overflowY: "auto" }} onPointerDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <div className="ark-font text-[13px] font-bold tracking-[0.14em] uppercase text-white truncate">Editar Controles</div>
            <div className="text-[10px] text-white/50 leading-tight">Arraste os botões. Toque num para ajustar tamanho e opacidade.</div>
          </div>
          <button className="ark-btn !py-1 !px-2 !text-[11px]" onClick={() => setCollapsed((v) => !v)}>{collapsed ? "▼" : "▲"}</button>
        </div>
        {!collapsed && (
          <>
            <div className="ark-card p-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[12px] font-bold uppercase tracking-wider text-[var(--ark-amber)] truncate">{def.label}</span>
                <span className="text-[9px] text-white/40 whitespace-nowrap">{def.hint}</span>
              </div>
              <Slider label="Tamanho" value={ov?.scale ?? 1} min={SCALE_MIN} max={SCALE_MAX} step={0.05} display={`${Math.round((ov?.scale ?? 1) * 100)}%`} onChange={(v) => commit(patch(sel, { scale: v }))} />
              <Slider label="Opacidade" value={r.opacity} min={OPACITY_MIN} max={1} step={0.05} display={`${Math.round(r.opacity * 100)}%`} onChange={(v) => commit(patch(sel, { opacity: v }))} />
              <div className="flex items-center gap-1 mt-1">
                <span className="text-[10px] uppercase tracking-wider text-white/60 mr-1">Ajuste fino</span>
                {([["◀", -2, 0], ["▲", 0, -2], ["▼", 0, 2], ["▶", 2, 0]] as const).map(([l, dx, dy]) => (
                  <button key={l} className="ark-btn !py-0.5 !px-2 !text-[12px]" onPointerDown={(e) => { e.stopPropagation(); nudge(dx, dy); }}>{l}</button>
                ))}
                <div className="flex-1" />
                <button className={`flex items-center gap-1 text-[10px] uppercase tracking-wider ${snap ? "text-[var(--ark-cyan)]" : "text-white/50"}`} onClick={() => setSnap((v) => !v)}>
                  <span className="w-3.5 h-3.5 border flex items-center justify-center" style={{ borderColor: snap ? "var(--ark-cyan)" : "rgba(255,255,255,.4)" }}>{snap && <Icon name="check" size={10} color="var(--ark-cyan)" />}</span>
                  Grade
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 justify-end">
              <Btn variant="ghost" onClick={resetOne}>Restaurar botão</Btn>
              <Btn variant="danger" onClick={resetAll}>Restaurar todos</Btn>
              <Btn variant="primary" onClick={onClose}>Concluído</Btn>
            </div>
          </>
        )}
        {collapsed && <Btn variant="primary" onClick={onClose}>Concluído</Btn>}
      </div>
    </div>
  );
}

function Slider({ label, value, min, max, step, display, onChange }: { label: string; value: number; min: number; max: number; step: number; display: string; onChange: (v: number) => void }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="py-1">
      <div className="flex justify-between items-baseline">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-white/90">{label}</span>
        <span className="ark-font text-[12px] text-[var(--ark-cyan)] font-bold">{display}</span>
      </div>
      <input type="range" className="ark-slider w-full" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ background: `linear-gradient(90deg, var(--ark-cyan) ${pct}%, rgba(120,220,240,.18) ${pct}%)` }} />
    </div>
  );
}
