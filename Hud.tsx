import { useEffect, useMemo, useState } from "react";
import type { Game, HudState } from "../game";
import type { Notice } from "../core/events";
import { Bar, ItemImg, ItemSlot } from "./common";
import { Icon } from "./svg";
import { ITEMS } from "../data/items";

interface Marker { x: number; z: number; color: string; icon?: string; label?: string }

/** Collect world markers for compass / minimap / map. */
export function worldMarkers(game: Game): Marker[] {
  const out: Marker[] = [];
  for (const p of game.pois?.pois ?? []) out.push({ x: p.pos.x, z: p.pos.z, color: p.color, icon: p.kind === "obelisk" ? "engram" : "target", label: p.name });
  for (const b of game.bags) out.push({ x: b.pos.x, z: b.pos.z, color: b.kind === "supply" ? "#5ee6ff" : b.kind === "death" ? "#ffc24a" : "#c8a070", icon: b.kind === "supply" ? "crate" : b.kind === "death" ? "skull" : "bag", label: b.label });
  for (const c of game.creatures.list) if (c.tamed && c.alive) out.push({ x: c.pos.x, z: c.pos.z, color: "#5eea8a", icon: "dino", label: c.name });
  for (const s of game.building.list) if (s.def.id === "sleeping_bag") out.push({ x: s.x, z: s.z, color: "#7fb8ff", icon: "person", label: "Saco de dormir" });
  for (const e of game.breeding.eggs) out.push({ x: e.pos.x, z: e.pos.z, color: e.status === "ok" ? "#ffe79a" : "#ff5a52", icon: "egg", label: "Ovo" });
  return out;
}

function Compass({ heading, markers, px, pz }: { heading: number; markers: Marker[]; px: number; pz: number }) {
  // heading: camYaw; forward vector = (-sin, -cos). Bearing measured from north (-z) clockwise.
  const bearing = ((-heading * 180) / Math.PI + 360) % 360;
  const W = 260;
  const ticks = [];
  for (let d = 0; d < 360; d += 15) {
    let rel = d - bearing;
    if (rel > 180) rel -= 360;
    if (rel < -180) rel += 360;
    if (Math.abs(rel) > 70) continue;
    const x = W / 2 + (rel / 70) * (W / 2);
    const main = d % 90 === 0;
    const label = d === 0 ? "N" : d === 90 ? "L" : d === 180 ? "S" : d === 270 ? "O" : d % 45 === 0 ? "·" : "";
    ticks.push(
      <div key={d} className="absolute top-0 flex flex-col items-center" style={{ left: x, transform: "translateX(-50%)" }}>
        <div style={{ width: 1, height: main ? 8 : 4, background: main ? "var(--ark-cyan)" : "rgba(200,240,250,0.4)" }} />
        {label && <div className={`text-[10px] font-extrabold ${main ? "text-[var(--ark-cyan)]" : "text-white/40"}`}>{label}</div>}
      </div>,
    );
  }
  const marks = markers.map((m, i) => {
    const b = ((Math.atan2(m.x - px, -(m.z - pz)) * 180) / Math.PI + 360) % 360;
    let rel = b - bearing;
    if (rel > 180) rel -= 360;
    if (rel < -180) rel += 360;
    if (Math.abs(rel) > 70) return null;
    const dist = Math.hypot(m.x - px, m.z - pz);
    const important = m.icon === "engram" || m.icon === "crate" || m.icon === "skull";
    if (!important && dist > 160) return null;
    return (
      <div key={i} className="absolute flex flex-col items-center" style={{ left: W / 2 + (rel / 70) * (W / 2), top: 14, transform: "translateX(-50%)" }}>
        <Icon name={m.icon ?? "target"} size={12} color={m.color} />
        {important && <span className="text-[8px] text-white/70">{Math.round(dist)}m</span>}
      </div>
    );
  });
  return (
    <div className="relative overflow-hidden ark-hud" style={{ width: W, height: 40, maskImage: "linear-gradient(90deg, transparent, #000 15%, #000 85%, transparent)" }}>
      {ticks}
      {marks}
      <div className="absolute left-1/2 bottom-0 -translate-x-1/2" style={{ width: 0, height: 0, borderLeft: "5px solid transparent", borderRight: "5px solid transparent", borderBottom: "6px solid var(--ark-amber)" }} />
    </div>
  );
}

function Minimap({ game, hud, size = 104 }: { game: Game; hud: HudState; size?: number }) {
  const src = useMemo(() => game.mapCanvas?.toDataURL() ?? "", [game.mapCanvas]);
  const world = game.terrain?.size ?? 640;
  const zoom = 4.2; // map px per world px scale factor
  const mapPx = size * zoom;
  const [px, , pz] = hud.pos;
  const u = (px + world / 2) / world, v = (pz + world / 2) / world;
  const rot = (hud.heading * 180) / Math.PI;
  const markers = worldMarkers(game);
  return (
    <div className="relative rounded-full overflow-hidden" style={{ width: size, height: size, border: "2px solid var(--ark-line-strong)", boxShadow: "0 0 12px rgba(0,0,0,0.6)" }}>
      <div className="absolute" style={{ left: size / 2, top: size / 2, transform: `rotate(${rot}deg)` }}>
        <div className="absolute" style={{ width: mapPx, height: mapPx, left: -u * mapPx, top: -v * mapPx, backgroundImage: `url(${src})`, backgroundSize: "100% 100%", filter: "saturate(0.9) brightness(0.9)" }}>
          {markers.map((m, i) => (
            <div key={i} className="absolute" style={{ left: ((m.x + world / 2) / world) * mapPx, top: ((m.z + world / 2) / world) * mapPx, transform: `translate(-50%,-50%) rotate(${-rot}deg)` }}>
              <Icon name={m.icon ?? "target"} size={10} color={m.color} />
            </div>
          ))}
        </div>
      </div>
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ width: 0, height: 0, borderLeft: "5px solid transparent", borderRight: "5px solid transparent", borderBottom: "11px solid var(--ark-amber)", filter: "drop-shadow(0 0 2px #000)" }} />
      <div className="absolute top-0.5 left-1/2 text-[9px] font-extrabold text-[var(--ark-cyan)]" style={{ transform: `translateX(-50%)` }}>{Math.round(px)}, {Math.round(pz)}</div>
    </div>
  );
}

export function Hud({ game, hud, isTouch, onInventory }: { game: Game; hud: HudState; isTouch: boolean; onInventory: () => void }) {
  const [notices, setNotices] = useState<(Notice & { t: number; count: number })[]>([]);
  useEffect(() => {
    const off = game.events.on("notice", (n) =>
      setNotices((l) => {
        // merge repeated item pickups ("+3 Palha" + "+2 Palha" => "+5 Palha")
        if (n.kind === "item") {
          const m = /^\+(\d+) (.+)$/.exec(n.text);
          const last = l[l.length - 1];
          const lm = last && last.kind === "item" ? /^\+(\d+) (.+)$/.exec(last.text) : null;
          if (m && lm && lm[2] === m[2] && Date.now() - last.t < 2500) {
            const total = Number(lm[1]) + Number(m[1]);
            return [...l.slice(0, -1), { ...last, text: `+${total} ${m[2]}`, t: Date.now(), count: last.count + 1 }];
          }
        }
        return [...l.slice(-5), { ...n, t: Date.now(), count: 1 }];
      }),
    );
    const iv = setInterval(() => setNotices((l) => l.filter((n) => Date.now() - n.t < (n.kind === "item" ? 3000 : 5500))), 400);
    return () => { off(); clearInterval(iv); };
  }, [game]);

  const f = hud.focus;
  const S = game.settings;
  const tempTxt = (c: number) => (S.fahrenheit ? `${Math.round(c * 1.8 + 32)}°F` : `${Math.round(c)}°C`);
  const hh = Math.floor(hud.hour), mm = Math.floor((hud.hour - hh) * 60);
  const night = hud.hour < 6 || hud.hour > 19;
  const mobileBar = S.hotbarLayout === "mobile";
  const slot = Math.round((mobileBar ? Math.max(42, Math.min(52, Math.floor(window.innerHeight / 8.2))) : Math.max(40, Math.min(54, Math.floor(window.innerWidth / 17.5)))) * game.settings.hotbarScale);
  const barBottom = mobileBar ? 8 : slot + 8; // vertical space the bar takes at the bottom-center
  const markers = worldMarkers(game);
  const itemIdFor = (text: string) => Object.values(ITEMS).find((d) => text.endsWith(" " + d.name) || text.includes(d.name))?.id;

  return (
    <>
      {S.torpidityEffect && hud.torpor > hud.maxTorpor * 0.15 && <div className="absolute inset-0 pointer-events-none z-[5]" style={{ boxShadow: `inset 0 0 160px 60px rgba(120,40,200,${Math.min(0.5, (hud.torpor / hud.maxTorpor) * 0.6)})` }} />}
      {S.bloodOverlay && hud.hurt > 0 && <div className="absolute inset-0 pointer-events-none z-[5]" style={{ boxShadow: `inset 0 0 160px 60px rgba(180,0,0,${hud.hurt * 0.55})` }} />}
      {hud.health < hud.maxHealth * 0.25 && !hud.dead && <div className="absolute inset-0 pointer-events-none z-[5] ark-pulse" style={{ boxShadow: "inset 0 0 120px 30px rgba(120,0,0,0.35)" }} />}
      {hud.flash > 0 && <div className="absolute inset-0 pointer-events-none z-[6]" style={{ background: `rgba(230,240,255,${hud.flash * 0.35})` }} />}
      {hud.temp < 5 && <div className="absolute inset-0 pointer-events-none z-[5]" style={{ boxShadow: `inset 0 0 140px 40px rgba(160,210,255,${Math.min(0.45, (5 - hud.temp) * 0.04)})` }} />}
      {hud.temp > 38 && <div className="absolute inset-0 pointer-events-none z-[5]" style={{ boxShadow: `inset 0 0 140px 40px rgba(255,150,60,${Math.min(0.4, (hud.temp - 38) * 0.04)})` }} />}
      {hud.swimming && <div className="absolute inset-0 pointer-events-none z-[5]" style={{ background: "linear-gradient(180deg, rgba(20,90,120,0.18), rgba(10,40,70,0.3))" }} />}

      {/* crosshair + hit marker */}
      {S.crosshair && <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-20">
        <div className="relative w-6 h-6">
          <div className={`absolute left-1/2 top-1/2 w-1.5 h-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${f ? (f.hostile ? "bg-[var(--ark-red)]" : "bg-[var(--ark-cyan)]") : "bg-white/85"}`} style={{ boxShadow: "0 0 4px #000" }} />
          {S.hitMarkers && hud.hitMarker > 0 && [45, 135, 225, 315].map((a) => (
            <div key={a} className="absolute left-1/2 top-1/2 bg-white" style={{ width: 2, height: 7, opacity: hud.hitMarker, transform: `translate(-50%,-50%) rotate(${a}deg) translateY(-8px)` }} />
          ))}
        </div>
      </div>}

      {hud.net && (
        <div className="absolute z-20 pointer-events-none ark-hud px-2 py-0.5 flex items-center gap-1.5 text-[11px] font-bold" style={{ right: 8, top: S.minimap ? (isTouch ? 160 : 176) : (isTouch ? 58 : 50) }}>
          <span className="w-2 h-2 rounded-full bg-[var(--ark-green)] ark-pulse" />
          <span className="text-[var(--ark-cyan)] ark-font tracking-[0.2em]">{hud.net.code}</span>
          <span className="text-white/70">· {hud.net.count} jogador{hud.net.count > 1 ? "es" : ""}{hud.net.role === "guest" ? " · convidado" : " · anfitrião"}</span>
        </div>
      )}
      {/* top-left: level + stats */}
      <div className="absolute top-2 left-2 z-20 w-[178px] pointer-events-none ark-hud p-1.5 flex flex-col gap-[5px]">
        <div className="flex items-center gap-2">
          <div className="relative w-9 h-9 shrink-0">
            <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90">
              <circle cx="18" cy="18" r="15.5" fill="rgba(0,0,0,0.5)" stroke="rgba(120,220,240,0.2)" strokeWidth="3" />
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--ark-cyan)" strokeWidth="3" strokeDasharray={`${(hud.xpIn / Math.max(1, hud.xpNext)) * 97.4} 97.4`} />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center text-[13px] font-extrabold">{hud.level}</div>
          </div>
          <div className="flex-1 leading-tight">
            <div className="text-[10px] ark-label !text-[var(--ark-cyan)]">Sobrevivente</div>
            <div className="text-[11px] font-bold flex items-center gap-1">
              <span style={{ color: night ? "#9fb8ff" : "var(--ark-amber)" }}>{night ? "☾" : "☀"}</span>
              Dia {hud.day} · {String(hh).padStart(2, "0")}:{String(mm).padStart(2, "0")}
            </div>
          </div>
        </div>
        <Bar value={hud.health} max={hud.maxHealth} color="#ff5a52" icon="health" label={`${Math.ceil(hud.health)}`} warn={hud.health < hud.maxHealth * 0.25} />
        <Bar value={hud.stamina} max={hud.maxStamina} color={hud.exhausted ? "#a16a20" : "#ffd24a"} icon="stamina" warn={hud.exhausted} />
        <Bar value={hud.food} max={hud.maxFood} color="#ff9a3c" icon="food" warn={hud.food < hud.maxFood * 0.15} />
        <Bar value={hud.water} max={hud.maxWater} color="#4ac6ff" icon="water" warn={hud.water < hud.maxWater * 0.15} />
        <Bar value={hud.weight} max={Number.isFinite(hud.maxWeight) ? hud.maxWeight : Math.max(hud.weight, 1)} color={hud.encumbered ? "#ff5a52" : "#b7c4c8"} icon="weight" label={`${hud.weight.toFixed(0)}/${Number.isFinite(hud.maxWeight) ? hud.maxWeight : "∞"}`} />
        {hud.torpor > 1 && <Bar value={hud.torpor} max={hud.maxTorpor} color="#b07aff" icon="torpor" />}
        <div className="flex items-center justify-between text-[10px] font-bold">
          <span className={`flex items-center gap-1 ${hud.temp < 8 ? "text-sky-300 ark-pulse" : hud.temp > 36 ? "text-orange-300 ark-pulse" : "text-white/80"}`}><Icon name="temp" size={12} />{tempTxt(hud.temp)}</span>
          <span className="flex items-center gap-1 text-white/70"><Icon name={hud.weatherKind === "clear" ? "sun" : hud.weatherKind === "fog" ? "cloud" : hud.weatherKind === "cloudy" ? "cloud" : "rain"} size={12} />{hud.weather}</span>
          {hud.armor > 0 && <span className="flex items-center gap-1 text-white/70"><Icon name="shield" size={12} />{Math.round(hud.armor)}</span>}
        </div>
        {(hud.statPoints > 0 || hud.engramPoints > 0) && (
          <div className="text-[10px] font-bold text-[var(--ark-amber)] ark-pulse">▲ {hud.statPoints > 0 ? `${hud.statPoints} pt atributo` : ""}{hud.statPoints > 0 && hud.engramPoints > 0 ? " · " : ""}{hud.engramPoints > 0 ? `${hud.engramPoints} pts engrama` : ""}</div>
        )}
        {game.settings.showFps && <div className="text-[10px] text-[var(--ark-mute)]">{hud.fps} FPS</div>}
      </div>

      {/* top-center: compass */}
      {S.compass && <div className="absolute top-1.5 left-1/2 -translate-x-1/2 z-20 pointer-events-none"><Compass heading={hud.heading} markers={markers} px={hud.pos[0]} pz={hud.pos[2]} /></div>}

      {/* minimap */}
      {S.minimap && <div className="absolute z-20 pointer-events-none" style={{ right: 8, top: isTouch ? 58 : 50 }}><Minimap game={game} hud={hud} size={isTouch ? 96 : 120} /></div>}

      {/* target card */}
      {f && !hud.mount && (
        <div className="absolute left-1/2 top-[52px] -translate-x-1/2 z-20 pointer-events-none ark-hud px-3 py-1.5 min-w-[200px] text-center ark-pop">
          <div className={`text-[13px] font-extrabold ${f.hostile ? "text-[var(--ark-red)]" : f.tamed ? "text-[var(--ark-green)]" : "text-white"}`}>{f.label}</div>
          {f.sub && <div className="text-[10px] ark-label">{f.sub}</div>}
          <div className="flex flex-col gap-1 mt-1">
            {f.hp !== undefined && f.maxHp !== undefined && <Bar value={f.hp} max={f.maxHp} color="#ff5a52" icon="health" label={`${Math.ceil(f.hp)} / ${Math.round(f.maxHp)}`} h={9} />}
            {f.torpor !== undefined && f.maxTorpor !== undefined && f.torpor > 0 && <Bar value={f.torpor} max={f.maxTorpor} color="#b07aff" icon="torpor" label={`${Math.round(f.torpor)} / ${Math.round(f.maxTorpor)}`} h={9} />}
            {f.taming !== undefined && <Bar value={f.taming} max={1} color="#5eea8a" icon="dino" label={`Domesticação ${Math.round(f.taming * 100)}%`} h={9} />}
          </div>
          {f.hitHint && <div className="text-[10px] text-[var(--ark-amber)] mt-0.5">{f.hitHint}</div>}
          {!isTouch && f.action && <div className="text-[10px] text-[var(--ark-cyan)] mt-0.5 font-bold">[E] {f.action}</div>}
        </div>
      )}

      {/* placement */}
      {hud.placing && (
        <div className="absolute left-1/2 -translate-x-1/2 z-20 pointer-events-none ark-hud px-3 py-1 text-center" style={{ bottom: barBottom + 40 }}>
          <div className="text-[12px] font-bold flex items-center gap-1.5 justify-center"><Icon name="hammer" size={13} color="var(--ark-cyan)" />{hud.placing.name}</div>
          <div className={`text-[11px] font-bold ${hud.placing.valid ? "text-[var(--ark-green)]" : "text-[var(--ark-red)]"}`}>{hud.placing.valid ? "Local válido" : hud.placing.reason}</div>
          {!isTouch && <div className="text-[10px] text-[var(--ark-mute)]">Clique: colocar · R: girar · Q: cancelar</div>}
        </div>
      )}

      {hud.mission && (
        <div className="absolute z-20 ark-hud px-2 py-1.5 w-[178px]" style={{ left: 8, top: hud.torpor > 1 ? 222 : 206 }} onPointerDown={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between"><span className="ark-label !text-[var(--ark-amber)]">Missão {hud.mission.index}/{hud.mission.total}</span><button className="text-white/40 text-[10px]" onClick={() => { game.tutorial.enabled = false; }}>ocultar</button></div>
          <div className="text-[11px] font-bold leading-tight">{hud.mission.title}</div>
          <div className="text-[10px] text-[var(--ark-mute)] leading-tight">{hud.mission.hint}</div>
        </div>
      )}
      {hud.mount && (
        <div className="absolute z-20 ark-hud px-2 py-1.5 w-[200px] pointer-events-none" style={{ left: "50%", transform: "translateX(-50%)", top: 48 }}>
          <div className="flex justify-between text-[11px] font-bold"><span className="flex items-center gap-1"><Icon name="dino" size={13} color="var(--ark-green)" />{hud.mount.name}</span><span className="text-[var(--ark-mute)]">Nv {hud.mount.level}{hud.mount.flying ? " · Voando" : ""}{hud.mount.carrying ? ` · Carregando ${hud.mount.carrying}` : ""}</span></div>
          <Bar value={hud.mount.hp} max={hud.mount.maxHp} color="#ff5a52" icon="health" h={6} />
          <Bar value={hud.mount.stamina} max={hud.mount.maxStamina} color="#ffd24a" icon="stamina" h={6} />
        </div>
      )}
      {/* notifications feed (left) */}
      <div className="absolute left-2 z-20 flex flex-col gap-1 pointer-events-none max-w-[44%]" style={{ top: (hud.torpor > 1 ? 222 : 206) + (hud.mission ? 64 : 0) }}>
        {notices.map((n) => {
          const itemId = n.kind === "item" ? itemIdFor(n.text) : undefined;
          const color = n.kind === "warn" ? "var(--ark-red)" : n.kind === "good" ? "var(--ark-green)" : n.kind === "level" ? "#c49aff" : n.kind === "item" ? "var(--ark-amber)" : "var(--ark-cyan)";
          return (
            <div key={n.id} className="ark-feed flex items-center gap-1.5 text-[11px] font-semibold px-2 py-1 rounded" style={{ background: "linear-gradient(90deg, rgba(4,14,18,0.8), rgba(4,14,18,0.2))", borderLeft: `2px solid ${color}` }}>
              {itemId && <ItemImg id={itemId} size={20} />}
              <span style={{ color: n.kind === "item" ? "#fff" : color }}>{n.text}</span>
            </div>
          );
        })}
      </div>

      {/* crafting progress */}
      {hud.craft && (
        <div className="absolute z-20 pointer-events-none ark-hud px-2 py-1 flex items-center gap-2" style={{ left: "50%", transform: "translateX(-50%)", bottom: barBottom + 30 }}>
          <ItemImg id={hud.craft.id} size={22} />
          <div className="w-28"><div className="text-[10px] font-bold">{ITEMS[hud.craft.id].name} ×{hud.craft.count}</div><Bar value={hud.craft.progress} max={1} color="#ffc24a" /></div>
        </div>
      )}

      {/* status chips */}
      <div className="absolute left-1/2 -translate-x-1/2 z-20 pointer-events-none flex gap-1.5 text-[10px] font-extrabold uppercase tracking-wider" style={{ bottom: barBottom + 6 }}>
        {hud.encumbered > 0 && <span className="px-2 py-0.5 rounded bg-[var(--ark-red)]/80">{hud.encumbered === 2 ? "Sobrecarregado · imóvel" : "Sobrecarregado"}</span>}
        {S.statusNotifications && hud.starving && <span className="px-2 py-0.5 rounded bg-orange-700/80 ark-pulse">Faminto</span>}
        {S.statusNotifications && hud.dehydrated && <span className="px-2 py-0.5 rounded bg-sky-700/80 ark-pulse">Desidratado</span>}
        {hud.ammo && (
          <span className="px-2 py-0.5 rounded bg-black/60 flex items-center gap-1 normal-case tracking-normal"><ItemImg id={hud.ammo.id} size={14} />{ITEMS[hud.ammo.id].name}: {hud.ammo.count}</span>
        )}
      </div>

      {/* hotbar */}
      {mobileBar ? (
        // ARK Mobile style: two rows of five in the bottom-right corner
        <div className="absolute right-1.5 bottom-1.5 z-30 grid grid-cols-5 gap-1 p-1 ark-hud" onPointerDown={(e) => e.stopPropagation()}>
          {hud.bar.map((s, i) => (
            <ItemSlot key={i} stack={s} size={slot} equipped={i === hud.selected} badge={isTouch ? undefined : String((i + 1) % 10)} onClick={() => game.selectSlot(i)} />
          ))}
        </div>
      ) : (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-1.5 z-30 flex gap-1 p-1 ark-hud" onPointerDown={(e) => e.stopPropagation()}>
          {hud.bar.map((s, i) => (
            <ItemSlot key={i} stack={s} size={slot} equipped={i === hud.selected} badge={isTouch ? undefined : String((i + 1) % 10)} onClick={() => game.selectSlot(i)} />
          ))}
          {!isTouch && <button className="ark-btn ghost !px-2" onClick={onInventory}><Icon name="bag" size={18} /></button>}
        </div>
      )}
    </>
  );
}
