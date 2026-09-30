import type React from "react";
import { ITEMS, CAT_LABEL } from "../data/items";
import type { ItemStack } from "../systems/container";
import { iconFor } from "./icons";
import { Icon } from "./svg";

export function ItemImg({ id, size }: { id: string; size: number }) {
  const src = iconFor(id);
  if (src) return <img src={src} width={size} height={size} draggable={false} alt="" style={{ width: size, height: size, pointerEvents: "none" }} />;
  return <span style={{ fontSize: size * 0.7, lineHeight: 1 }}>{ITEMS[id]?.icon}</span>;
}

export function Bar({ value, max, color, icon, label, warn, h = 7 }: { value: number; max: number; color: string; icon?: string; label?: string; warn?: boolean; h?: number }) {
  const pct = Math.max(0, Math.min(1, value / Math.max(1e-6, max)));
  return (
    <div className="flex items-center gap-1.5 w-full">
      {icon && <span className={warn ? "ark-pulse" : ""} style={{ color }}><Icon name={icon} size={13} color={color} /></span>}
      <div className="ark-bar flex-1" style={{ height: h }}>
        <i style={{ width: `${pct * 100}%`, background: `linear-gradient(90deg, ${color}bb, ${color})`, color }} />
        {label && <span className="absolute inset-0 flex items-center px-1 text-[8px] font-bold text-white/95 leading-none" style={{ textShadow: "0 1px 2px #000" }}>{label}</span>}
      </div>
    </div>
  );
}

export function ItemSlot({ stack, size = 52, selected, equipped, onClick, dim, badge }: { stack: ItemStack | null; size?: number; selected?: boolean; equipped?: boolean; onClick?: (e: React.MouseEvent) => void; dim?: boolean; badge?: string }) {
  const def = stack ? ITEMS[stack.id] : null;
  const durPct = stack && def?.tool && stack.dur !== undefined ? stack.dur / def.tool.durability : null;
  const spoilPct = stack && def?.spoil && stack.spoil !== undefined ? stack.spoil / def.spoil : null;
  return (
    <button onClick={onClick} className={`ark-slot shrink-0 ${selected ? "sel" : ""} ${equipped ? "equip" : ""}`} style={{ width: size, height: size, opacity: dim ? 0.3 : 1 }}>
      {def && (
        <>
          <span className="absolute inset-0 flex items-center justify-center"><ItemImg id={def.id} size={size * 0.8} /></span>
          {stack!.qty > 1 && <span className="absolute right-1 bottom-0.5 text-[11px] font-extrabold text-white" style={{ textShadow: "0 1px 2px #000, 0 0 3px #000" }}>{stack!.qty}</span>}
          {durPct !== null && (
            <div className="absolute left-1 right-1 bottom-[2px] h-[3px] bg-black/60 rounded-sm">
              <div className="h-full rounded-sm" style={{ width: `${durPct * 100}%`, background: durPct > 0.3 ? "var(--ark-green)" : "var(--ark-red)" }} />
            </div>
          )}
          {spoilPct !== null && (
            <div className="absolute right-[2px] top-[3px] bottom-[14px] w-[3px] bg-black/60 rounded-sm">
              <div className="absolute bottom-0 w-full rounded-sm" style={{ height: `${spoilPct * 100}%`, background: spoilPct > 0.3 ? "#9be05a" : "#e0a03a" }} />
            </div>
          )}
        </>
      )}
      {badge && <span className="absolute left-[3px] top-[1px] text-[9px] font-bold text-[var(--ark-mute)]">{badge}</span>}
    </button>
  );
}

export function Btn({ children, onClick, disabled, variant = "default", className = "", icon }: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean; variant?: "default" | "primary" | "danger" | "amber" | "ghost"; className?: string; icon?: string }) {
  return (
    <button onClick={onClick} disabled={disabled} className={`ark-btn ${variant !== "default" ? variant : ""} ${className}`}>
      {icon && <Icon name={icon} size={15} />}
      {children}
    </button>
  );
}

export function Panel({ title, icon, onClose, children, wide, tabs }: { title: string; icon?: string; onClose: () => void; children: React.ReactNode; wide?: boolean; tabs?: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center p-2" style={{ background: "radial-gradient(ellipse at center, rgba(0,10,14,0.55), rgba(0,0,0,0.78))" }} onPointerDown={(e) => e.stopPropagation()}>
      <div className={`ark-panel ark-pop flex flex-col max-h-full ${wide ? "w-[min(1000px,100%)]" : "w-[min(640px,100%)]"}`}>
        <div className="flex items-center gap-2 px-3 pt-2 pb-1 border-b border-[var(--ark-line)]">
          {icon && <span className="text-[var(--ark-cyan)]"><Icon name={icon} size={18} /></span>}
          <div className="ark-title text-[13px] text-[var(--ark-cyan)]">{title}</div>
          <div className="flex-1 flex items-center gap-0 overflow-x-auto ml-2">{tabs}</div>
          <button onClick={onClose} className="ark-btn ghost !p-1.5" aria-label="Fechar"><Icon name="close" size={18} /></button>
        </div>
        <div className="p-3 overflow-y-auto ark-scroll" style={{ touchAction: "pan-y" }}>{children}</div>
      </div>
    </div>
  );
}

export function Tab({ active, onClick, icon, children, dot }: { active: boolean; onClick: () => void; icon?: string; children: React.ReactNode; dot?: boolean }) {
  return (
    <button className={`ark-tab ${active ? "active" : ""} relative shrink-0`} onClick={onClick}>
      {icon && <Icon name={icon} size={14} />}
      {children}
      {dot && <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[var(--ark-amber)]" />}
    </button>
  );
}

export function ItemDetails({ stack, actions }: { stack: ItemStack | null; actions: { label: string; onClick: () => void; variant?: "default" | "primary" | "danger" | "amber"; disabled?: boolean }[] }) {
  if (!stack) return <div className="text-[var(--ark-mute)] text-xs h-[64px] flex items-center">Toque em um item para ver detalhes e ações.</div>;
  const d = ITEMS[stack.id];
  const stats: [string, string][] = [];
  if (d.food) stats.push(["Comida", `${d.food > 0 ? "+" : ""}${d.food}`]);
  if (d.water) stats.push(["Água", `${d.water > 0 ? "+" : ""}${d.water}`]);
  if (d.health) stats.push(["Vida", `${d.health > 0 ? "+" : ""}${d.health}`]);
  if (d.torpor) stats.push(["Torpor", `${d.torpor > 0 ? "+" : ""}${d.torpor}`]);
  if (d.tool && d.tool.damage) stats.push(["Dano", `${d.tool.damage}`]);
  if (d.tool && d.tool.torpor) stats.push(["Torpor", `${d.tool.torpor}`]);
  if (d.tool && stack.dur !== undefined) stats.push(["Durab.", `${stack.dur}/${d.tool.durability}`]);
  if (d.ammoDamage) stats.push(["Dano", `${d.ammoDamage}`]);
  if (d.ammoTorpor) stats.push(["Torpor", `${d.ammoTorpor}`]);
  if (d.spoil && stack.spoil !== undefined) stats.push(["Estraga", `${Math.ceil(stack.spoil)}s`]);
  stats.push(["Peso", (d.weight * stack.qty).toFixed(1)]);
  return (
    <div className="flex flex-wrap items-center gap-3 min-h-[64px]">
      <div className="ark-slot flex items-center justify-center" style={{ width: 60, height: 60 }}><ItemImg id={d.id} size={52} /></div>
      <div className="flex-1 min-w-[170px]">
        <div className="flex items-baseline gap-2"><span className="font-bold text-sm">{d.name}</span>{stack.qty > 1 && <span className="text-[var(--ark-mute)] text-xs">x{stack.qty}</span>}<span className="ark-label">{CAT_LABEL[d.cat]}</span></div>
        <div className="text-[11px] text-[var(--ark-mute)]">{d.desc}</div>
        <div className="flex flex-wrap gap-x-3 text-[11px] mt-0.5">{stats.map(([k, v], i) => <span key={i}><span className="text-[var(--ark-mute)]">{k} </span><b className="text-[var(--ark-amber)]">{v}</b></span>)}</div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {actions.map((a) => <Btn key={a.label} onClick={a.onClick} variant={a.variant} disabled={a.disabled}>{a.label}</Btn>)}
      </div>
    </div>
  );
}
