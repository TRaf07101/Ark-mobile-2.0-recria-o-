import { useEffect, useMemo, useState } from "react";
import type { Game } from "../game";
import { ITEMS, CAT_LABEL, type ItemCategory } from "../data/items";
import { ENGRAMS, type Engram } from "../data/engrams";
import { SPECIES_LIST } from "../data/species";
import { STAT_KEYS, STAT_LABEL, ARMOR_SLOTS, SLOT_LABEL, type StatKey } from "../entities/player";
import { CONFIG } from "../core/config";
import { Bar, Btn, ItemDetails, ItemImg, ItemSlot, Panel, Tab } from "./common";
import { Icon } from "./svg";
import { iconFor } from "./icons";
import { worldMarkers } from "./Hud";
import type { Structure } from "../systems/building";
import type { Container } from "../systems/container";

export type InvTab = "inv" | "craft" | "engrams" | "char" | "map" | "journal";

export function InventoryScreen({ game, onClose, initialTab = "inv" }: { game: Game; onClose: () => void; initialTab?: InvTab }) {
  const [tab, setTab] = useState<InvTab>(initialTab);
  const p = game.player;
  const [, tick] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => { if (p.queue.entries.length || game.building.list.some((s) => s.queue?.entries.length)) tick((x) => x + 1); }, 250);
    return () => clearInterval(iv);
  }, [game, p]);
  return (
    <Panel title="Sobrevivente" icon="person" onClose={onClose} wide tabs={
      <>
        <Tab active={tab === "inv"} onClick={() => setTab("inv")} icon="bag">Inventário</Tab>
        <Tab active={tab === "craft"} onClick={() => setTab("craft")} icon="hammer">Criar</Tab>
        <Tab active={tab === "engrams"} onClick={() => setTab("engrams")} icon="engram" dot={p.engramPoints > 0}>Engramas</Tab>
        <Tab active={tab === "char"} onClick={() => setTab("char")} icon="person" dot={p.statPoints > 0}>Personagem</Tab>
        <Tab active={tab === "map"} onClick={() => setTab("map")} icon="map">Mapa</Tab>
        <Tab active={tab === "journal"} onClick={() => setTab("journal")} icon="note">Diário</Tab>
      </>
    }>
      {tab === "inv" && <InventoryTab game={game} />}
      {tab === "craft" && <CraftTab game={game} station={null} />}
      {tab === "engrams" && <EngramTab game={game} />}
      {tab === "char" && <CharTab game={game} />}
      {tab === "map" && <MapTab game={game} />}
      {tab === "journal" && <JournalTab game={game} />}
    </Panel>
  );
}

function InventoryTab({ game }: { game: Game }) {
  const p = game.player;
  const [sel, setSel] = useState<{ c: "inv" | "bar"; i: number } | null>(null);
  const [filter, setFilter] = useState<ItemCategory | "all">("all");
  const cont = (k: "inv" | "bar"): Container => (k === "inv" ? p.inv : p.bar);
  const stack = sel ? cont(sel.c).slots[sel.i] : null;
  /** First tap selects; second tap on another slot moves / swaps / merges into that exact slot. */
  const tapSlot = (c: "inv" | "bar", idx: number) => {
    if (sel) {
      if (sel.c === c && sel.i === idx) { setSel(null); return; }
      game.moveSlot(sel.c, sel.i, c, idx);
      setSel(null);
      return;
    }
    if (cont(c).slots[idx]) setSel({ c, i: idx });
  };
  const def = stack ? ITEMS[stack.id] : null;
  const usable = def && (def.food !== undefined || def.torpor !== undefined || def.water !== undefined || def.health !== undefined);
  const S = window.innerWidth < 700 ? 46 : 54;
  const ins = p.insulation();
  const sortInv = () => {
    const items = p.inv.slots.filter(Boolean).sort((a, b) => ITEMS[a!.id].cat.localeCompare(ITEMS[b!.id].cat) || ITEMS[a!.id].name.localeCompare(ITEMS[b!.id].name));
    p.inv.load([]);
    for (const it of items) p.inv.addStack(it!);
    game.events.emit("inventory", undefined);
    setSel(null);
  };
  const cats: (ItemCategory | "all")[] = ["all", "resource", "food", "consumable", "tool", "weapon", "ammo", "structure", "deployable"];
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="w-44"><Bar value={p.weight()} max={Number.isFinite(p.max("weight")) ? p.max("weight") : Math.max(p.weight(), 1)} color={p.encumbrance() ? "#ff5a52" : "#b7c4c8"} icon="weight" label={`${p.weight().toFixed(1)} / ${Number.isFinite(p.max("weight")) ? p.max("weight") : "∞"}`} h={10} /></div>
        <div className="flex gap-1 flex-wrap">
          {cats.map((c) => (
            <button key={c} onClick={() => setFilter(c)} className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${filter === c ? "border-[var(--ark-cyan)] text-[var(--ark-cyan)] bg-[var(--ark-cyan)]/10" : "border-white/10 text-[var(--ark-mute)]"}`}>{c === "all" ? "Todos" : CAT_LABEL[c]}</button>
          ))}
        </div>
        <div className="flex-1" />
        <Btn variant="ghost" onClick={sortInv}>Organizar</Btn>
      </div>
      <div className="flex flex-wrap items-center gap-2 ark-card p-1.5">
        <span className="ark-label">Equipamento</span>
        {ARMOR_SLOTS.map((sl) => {
          const st = p.armorAt(sl);
          return (
            <div key={sl} className="flex flex-col items-center">
              <ItemSlot stack={st} size={S - 6} onClick={() => st && game.unequipArmor(sl)} />
              <span className="text-[9px] text-[var(--ark-mute)]">{SLOT_LABEL[sl]}</span>
            </div>
          );
        })}
        <div className="text-[11px] leading-tight ml-1">
          <div><span className="text-[var(--ark-mute)]">Armadura </span><b>{Math.round(p.armorValue())}</b></div>
          <div><span className="text-[var(--ark-mute)]">Isolamento </span><b className="text-sky-300">❄{Math.round(ins.cold)}</b> <b className="text-orange-300">☀{Math.round(ins.heat)}</b></div>
          <div><span className="text-[var(--ark-mute)]">Temperatura </span><b>{Math.round(p.bodyTemp)}°C</b> <span className="text-white/40">(amb. {Math.round(p.ambientTemp)}°C)</span></div>
        </div>
        <span className="text-[10px] text-white/35">Toque numa peça equipada para removê-la</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {p.inv.slots.map((s, i) => (
          <ItemSlot key={i} stack={s} size={S} selected={sel?.c === "inv" && sel.i === i} dim={!!s && filter !== "all" && ITEMS[s.id].cat !== filter} onClick={() => tapSlot("inv", i)} />
        ))}
      </div>
      <div className="ark-label mt-1">Barra rápida — toque num item e depois em qualquer espaço (inventário ou barra) para colocá-lo exatamente ali</div>
      <div className="flex flex-wrap gap-1">
        {p.bar.slots.map((s, i) => (
          <ItemSlot key={i} stack={s} size={S} selected={sel?.c === "bar" && sel.i === i} equipped={p.selected === i} badge={String((i + 1) % 10)} onClick={() => tapSlot("bar", i)} />
        ))}
      </div>
      <div className="border-t border-[var(--ark-line)] pt-2 mt-1">
        <ItemDetails stack={stack} actions={sel && stack ? [
          ...(usable ? [{ label: "Usar", variant: "primary" as const, onClick: () => game.useItem(cont(sel.c), sel.i) }] : []),
          ...(def?.armor ? [{ label: "Equipar", variant: "primary" as const, onClick: () => { game.equipArmor(cont(sel.c), sel.i); setSel(null); } }] : []),
          { label: sel.c === "inv" ? "→ Barra" : "→ Inventário", onClick: () => { game.quickMove(sel.c, sel.i); setSel(null); } },
          ...(stack.qty > 1 ? [{ label: "Largar 1", onClick: () => game.dropFrom(cont(sel.c), sel.i, 1) }] : []),
          { label: "Largar", variant: "danger" as const, onClick: () => { game.dropFrom(cont(sel.c), sel.i); setSel(null); } },
        ] : []} />
      </div>
    </div>
  );
}

export function CraftTab({ game, station }: { game: Game; station: Structure | null }) {
  const p = game.player;
  const stationId = station?.def.id === "mortar_pestle" || station?.def.id === "smithy" ? station.def.id : "inventory";
  const list = ENGRAMS.filter((e) => e.station === stationId && p.learned.has(e.id));
  const locked = ENGRAMS.filter((e) => e.station === stationId && !p.learned.has(e.id)).length;
  const queue = station?.queue ?? p.queue;
  const sources = game.sourcesFor(station);
  const [onlyCraftable, setOnly] = useState(false);
  const shown = onlyCraftable ? list.filter((e) => game.canCraft(e.id, station) > 0) : list;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        {station && <div className="text-xs text-[var(--ark-mute)]">Usa os recursos guardados no {station.def.name}. Itens criados ficam nele.</div>}
        <div className="flex-1" />
        <Btn variant={onlyCraftable ? "primary" : "ghost"} onClick={() => setOnly((v) => !v)}>Só disponíveis</Btn>
      </div>
      {queue.entries.length > 0 && (
        <div className="ark-card p-2 flex flex-wrap gap-2 items-center">
          <span className="ark-label">Fila</span>
          {queue.entries.map((q, i) => (
            <button key={i} onClick={() => { queue.cancel(i, station?.inv ?? p.inv); game.events.emit("inventory", undefined); }} className="flex items-center gap-1.5 px-2 py-1 ark-card text-xs">
              <ItemImg id={q.id} size={22} /> {q.count}× {i === 0 && <span className="text-[var(--ark-amber)]">{Math.round(queue.progress() * 100)}%</span>}<Icon name="close" size={12} />
            </button>
          ))}
        </div>
      )}
      {shown.length === 0 && <div className="text-[var(--ark-mute)] text-sm">Nenhuma receita {onlyCraftable ? "disponível" : "aprendida para esta estação"}.</div>}
      <div className="grid gap-1.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(270px, 1fr))" }}>
        {shown.map((e) => <RecipeRow key={e.id} e={e} game={game} station={station} sources={sources} />)}
      </div>
      {locked > 0 && <div className="text-[11px] text-[var(--ark-mute)]">{locked} receita(s) bloqueada(s) — aprenda na aba Engramas.</div>}
    </div>
  );
}

function RecipeRow({ e, game, station, sources }: { e: Engram; game: Game; station: Structure | null; sources: Container[] }) {
  const max = game.canCraft(e.id, station);
  const d = ITEMS[e.id];
  return (
    <div className={`flex items-center gap-2 p-1.5 rounded-md border ${max > 0 ? "border-[var(--ark-cyan)]/40 bg-[var(--ark-cyan)]/[0.06]" : "border-white/10 bg-black/25"}`}>
      <div className="ark-slot flex items-center justify-center" style={{ width: 46, height: 46 }}><ItemImg id={d.id} size={40} /></div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-bold truncate">{d.name}{e.qty > 1 && <span className="text-[var(--ark-mute)]"> ×{e.qty}</span>}<span className="text-[10px] text-[var(--ark-mute)] font-normal"> · {e.time}s</span></div>
        <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[11px]">
          {e.inputs.map(([id, n]) => {
            const have = sources.reduce((a, c) => a + c.count(id), 0);
            return <span key={id} className={`flex items-center gap-0.5 ${have >= n ? "text-white/85" : "text-[var(--ark-red)]"}`}><ItemImg id={id} size={16} />{n}<span className="text-white/35">({have})</span></span>;
          })}
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <Btn variant="primary" disabled={max <= 0} onClick={() => game.craft(e.id, 1, station)}>1</Btn>
        {max > 1 && <Btn onClick={() => game.craft(e.id, Math.min(max, 10), station)}>×{Math.min(max, 10)}</Btn>}
      </div>
    </div>
  );
}

function EngramTab({ game }: { game: Game }) {
  const p = game.player;
  const [, force] = useState(0);
  const levels = [...new Set(ENGRAMS.map((e) => e.level))].sort((a, b) => a - b);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <span className="ark-label">Pontos de engrama</span><b className="text-[var(--ark-amber)] text-lg">{p.engramPoints}</b>
        <span className="ark-label">Nível</span><b>{p.level}</b>
      </div>
      {levels.map((lv) => (
        <div key={lv} className="flex gap-2 items-start">
          <div className={`w-10 shrink-0 text-center text-[11px] font-extrabold pt-3 ${p.level >= lv ? "text-[var(--ark-cyan)]" : "text-white/30"}`}>Nv {lv}</div>
          <div className="flex flex-wrap gap-1.5 flex-1">
            {ENGRAMS.filter((e) => e.level === lv).map((e) => {
              const learned = p.learned.has(e.id);
              const can = !learned && p.level >= e.level && p.engramPoints >= e.cost;
              return (
                <button key={e.id} disabled={!can} onClick={() => { if (game.learnEngram(e.id)) force((x) => x + 1); }}
                  className={`relative flex flex-col items-center w-[84px] p-1 rounded-md border ${learned ? "border-[var(--ark-cyan)]/50 bg-[var(--ark-cyan)]/10" : can ? "border-[var(--ark-amber)] bg-[var(--ark-amber)]/10 ark-pop" : "border-white/10 bg-black/30 opacity-50"}`}>
                  <ItemImg id={e.id} size={44} />
                  <span className="text-[10px] font-bold text-center leading-tight h-6 overflow-hidden">{ITEMS[e.id].name}</span>
                  <span className={`text-[9px] font-extrabold ${learned ? "text-[var(--ark-cyan)]" : "text-[var(--ark-amber)]"}`}>{learned ? "APRENDIDO" : `${e.cost} PTS`}</span>
                  {e.station !== "inventory" && <span className="absolute top-0.5 right-0.5 text-[8px] px-1 rounded bg-black/60 text-[var(--ark-mute)]">{e.station === "smithy" ? "FERRARIA" : "PILÃO"}</span>}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function CharTab({ game }: { game: Game }) {
  const p = game.player;
  const cur: Partial<Record<StatKey, number>> = { health: p.health, stamina: p.stamina, food: p.food, water: p.water, weight: p.weight() };
  const color: Record<StatKey, string> = { health: "#ff5a52", stamina: "#ffd24a", food: "#ff9a3c", water: "#4ac6ff", weight: "#b7c4c8", melee: "#ff7a5a", speed: "#5eea8a" };
  const icon: Record<StatKey, string> = { health: "health", stamina: "stamina", food: "food", water: "water", weight: "weight", melee: "sword", speed: "run" };
  const portrait = iconFor("__player");
  return (
    <div className="flex flex-wrap gap-4">
      <div className="ark-card p-2 flex flex-col items-center w-[190px]">
        {portrait ? <img src={portrait} className="w-[170px] h-[170px]" alt="" /> : <div className="w-[170px] h-[170px]" />}
        <div className="font-extrabold">Sobrevivente</div>
        <div className="ark-label">Nível {p.level}</div>
        <div className="w-full mt-1"><Bar value={p.xpInLevel()} max={p.xpToNext()} color="#5ee6ff" icon="xp" label={`${Math.floor(p.xpInLevel())} / ${p.xpToNext()} XP`} h={10} /></div>
        <div className="text-[10px] text-[var(--ark-mute)] mt-1 text-center">Notas: {p.notes.length} · Locais: {p.explored.length} · Engramas: {p.learned.size}</div>
        <div className="grid grid-cols-2 gap-x-3 text-[10px] mt-1 w-full">
          <span className="text-[var(--ark-mute)]">Abates</span><b className="text-right">{game.stats.kills}</b>
          <span className="text-[var(--ark-mute)]">Domesticados</span><b className="text-right">{game.stats.tamed}</b>
          <span className="text-[var(--ark-mute)]">Nascidos</span><b className="text-right">{game.stats.hatched}</b>
          <span className="text-[var(--ark-mute)]">Itens criados</span><b className="text-right">{Object.values(game.stats.crafted).reduce((a, b) => a + b, 0)}</b>
          <span className="text-[var(--ark-mute)]">Missões</span><b className="text-right">{game.tutorial.done.size}</b>
        </div>
      </div>
      <div className="flex-1 min-w-[280px] flex flex-col gap-1.5">
        <div className="flex items-center gap-2"><span className="ark-label">Pontos disponíveis</span><b className="text-[var(--ark-amber)] text-lg">{p.statPoints}</b></div>
        {STAT_KEYS.map((k) => (
          <div key={k} className="flex items-center gap-2 ark-card p-1.5">
            <span style={{ color: color[k] }}><Icon name={icon[k]} size={18} color={color[k]} /></span>
            <div className="flex-1">
              <div className="flex justify-between text-[12px]"><span className="font-bold">{STAT_LABEL[k]}</span><span className="text-white/80">{k === "melee" || k === "speed" ? `${p.max(k)}%` : `${Math.round(cur[k] ?? 0)} / ${p.max(k)}`}</span></div>
              <div className="flex gap-[2px] mt-0.5">{Array.from({ length: 12 }, (_, i) => <div key={i} className="h-[4px] flex-1 rounded-sm" style={{ background: i < p.points[k] ? color[k] : "rgba(255,255,255,0.08)" }} />)}</div>
            </div>
            <span className="text-[10px] text-[var(--ark-mute)] w-8 text-right">+{CONFIG.player.perLevel[k]}</span>
            <Btn variant="primary" disabled={p.statPoints <= 0} onClick={() => game.spendStat(k)}>+</Btn>
          </div>
        ))}
      </div>
    </div>
  );
}

function MapTab({ game }: { game: Game }) {
  const src = useMemo(() => game.mapCanvas?.toDataURL() ?? "", [game.mapCanvas]);
  const world = game.terrain.size;
  const p = game.player.pos;
  const markers = worldMarkers(game);
  const size = Math.min(window.innerHeight - 150, 520, window.innerWidth - 60);
  const heading = game.camYaw;
  return (
    <div className="flex flex-wrap gap-3 justify-center">
      <div className="relative ark-card overflow-hidden" style={{ width: size, height: size }}>
        <img src={src} className="absolute inset-0 w-full h-full" alt="" />
        {markers.map((m, i) => (
          <div key={i} className="absolute flex flex-col items-center" style={{ left: ((m.x + world / 2) / world) * size, top: ((m.z + world / 2) / world) * size, transform: "translate(-50%,-50%)" }}>
            <Icon name={m.icon ?? "target"} size={14} color={m.color} />
            {m.icon === "engram" && <span className="text-[8px] font-bold whitespace-nowrap" style={{ color: m.color, textShadow: "0 1px 2px #000" }}>{m.label}</span>}
          </div>
        ))}
        <div className="absolute" style={{ left: ((p.x + world / 2) / world) * size, top: ((p.z + world / 2) / world) * size, transform: `translate(-50%,-50%) rotate(${(-heading * 180) / Math.PI}deg)` }}>
          <div style={{ width: 0, height: 0, borderLeft: "6px solid transparent", borderRight: "6px solid transparent", borderBottom: "14px solid var(--ark-amber)", filter: "drop-shadow(0 0 3px #000)" }} />
        </div>
        <div className="absolute top-1 left-1/2 -translate-x-1/2 text-[10px] font-extrabold text-white/80">N</div>
      </div>
      <div className="flex flex-col gap-1 text-[11px] min-w-[170px]">
        <div className="ark-label">Legenda</div>
        {[["engram", "#ff4a3a", "Obeliscos"], ["target", "#d8c38a", "Ruínas"], ["crate", "#5ee6ff", "Suprimentos"], ["skull", "#ffc24a", "Sua bolsa (morte)"], ["dino", "#5eea8a", "Criaturas domesticadas"], ["person", "#7fb8ff", "Saco de dormir"]].map(([i, c, l]) => (
          <div key={l} className="flex items-center gap-2"><Icon name={i} size={14} color={c} />{l}</div>
        ))}
        <div className="ark-label mt-2">Posição</div>
        <div>{Math.round(p.x)}, {Math.round(p.z)} · alt. {Math.round(p.y)}m</div>
        <div className="ark-label mt-2">Locais descobertos</div>
        {(game.pois?.pois ?? []).map((poi) => <div key={poi.id} className={game.player.explored.includes(poi.id) ? "text-white" : "text-white/30"}>{game.player.explored.includes(poi.id) ? poi.name : "???"}</div>)}
      </div>
    </div>
  );
}

function JournalTab({ game }: { game: Game }) {
  const [mode, setMode] = useState<"notes" | "dossier">("notes");
  const notes = (game.pois?.notes ?? []).filter((n) => n.collected);
  const [open, setOpen] = useState<number | null>(notes[0]?.id ?? null);
  const note = notes.find((n) => n.id === open);
  const seen = new Set(game.creatures.list.map((c) => c.sp.id));
  const [sp, setSp] = useState(SPECIES_LIST[0].id);
  const s = SPECIES_LIST.find((x) => x.id === sp)!;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2"><Btn variant={mode === "notes" ? "primary" : "ghost"} onClick={() => setMode("notes")} icon="note">Notas ({notes.length}/{game.pois?.notes.length ?? 0})</Btn><Btn variant={mode === "dossier" ? "primary" : "ghost"} onClick={() => setMode("dossier")} icon="dino">Dossiês</Btn></div>
      {mode === "notes" ? (
        notes.length === 0 ? <div className="text-sm text-[var(--ark-mute)]">Nenhuma nota encontrada. Explore ruínas e obeliscos — as notas brilham no chão.</div> : (
          <div className="flex flex-wrap gap-3">
            <div className="flex flex-col gap-1 w-[200px]">
              {notes.map((n) => <button key={n.id} onClick={() => setOpen(n.id)} className={`text-left px-2 py-1.5 rounded text-[12px] ${open === n.id ? "bg-[var(--ark-cyan)]/15 text-[var(--ark-cyan)]" : "text-white/80"}`}>{n.title}<div className="text-[10px] text-[var(--ark-mute)]">{n.author}</div></button>)}
            </div>
            {note && <div className="flex-1 min-w-[260px] p-3 rounded" style={{ background: "#efe4c6", color: "#3a2e1c", fontFamily: "Georgia, serif" }}>
              <div className="font-bold text-lg">{note.title}</div>
              <div className="text-xs italic mb-2">— {note.author} · encontrada em {note.poi}</div>
              <div className="text-[14px] leading-relaxed">{note.text}</div>
            </div>}
          </div>
        )
      ) : (
        <div className="flex flex-wrap gap-3">
          <div className="flex flex-col gap-1 w-[170px]">
            {SPECIES_LIST.map((x) => <button key={x.id} onClick={() => setSp(x.id)} className={`flex items-center gap-2 text-left px-2 py-1 rounded text-[12px] ${sp === x.id ? "bg-[var(--ark-cyan)]/15 text-[var(--ark-cyan)]" : "text-white/80"}`}>{iconFor("__sp_" + x.id) && <img src={iconFor("__sp_" + x.id)} className="w-8 h-8" alt="" />}{x.name}</button>)}
          </div>
          <div className="flex-1 min-w-[260px] ark-card p-3 flex flex-wrap gap-3">
            {iconFor("__sp_" + s.id) && <img src={iconFor("__sp_" + s.id)} className="w-[200px] h-[200px]" alt="" />}
            <div className="flex-1 min-w-[180px] text-[12px] flex flex-col gap-1">
              <div className="text-lg font-extrabold">{s.name}</div>
              <div><span className="ark-label">Temperamento </span>{({ passive: s.retaliates ? "Passivo (revida se atacado)" : "Passivo", skittish: "Assustadiço", defensive: "Defensivo", docile: "Dócil", territorial: "Territorial", aggressive: "Agressivo" } as Record<string, string>)[s.temperament]}</div>
              {s.special && <div className="text-[var(--ark-amber)] text-[11px]">{s.special}</div>}
              <div><span className="ark-label">Dieta </span>{s.diet === "herbivore" ? "Herbívoro" : "Carnívoro"}</div>
              <div><span className="ark-label">Vida base </span>{s.health} · <span className="ark-label">Dano </span>{s.damage}</div>
              <div><span className="ark-label">Domesticação </span>Desmaio (torpor base {s.torpor})</div>
              <div className="flex items-center gap-1 flex-wrap"><span className="ark-label">Comida preferida </span>{s.foods.map((f) => <ItemImg key={f.item} id={f.item} size={20} />)}</div>
              <div className="flex items-center gap-1 flex-wrap"><span className="ark-label">Coleta </span>{s.harvest.map((h) => <ItemImg key={h.item} id={h.item} size={20} />)}</div>
              <div><span className="ark-label">Habitat </span>{Object.keys(s.spawn).map((b) => ({ beach: "Praias", grassland: "Campos", forest: "Florestas", hills: "Colinas", peak: "Picos" } as Record<string, string>)[b]).join(", ")}</div>
              {!seen.has(s.id) && <div className="text-[var(--ark-mute)] text-[11px]">Ainda não avistado nesta sessão.</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
