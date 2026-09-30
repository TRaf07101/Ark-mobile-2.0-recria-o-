import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { Game } from "../game";
import { ENGRAMS } from "../data/engrams";
import { cmdLabel, temperLabel } from "../game";
import { transfer, type Container } from "../systems/container";
import { ITEMS } from "../data/items";
import { Bar, Btn, ItemDetails, ItemImg, ItemSlot, Panel } from "./common";
import { iconFor } from "./icons";
import { CraftTab } from "./Inventory";
import type { PanelRequest } from "../core/events";

/**
 * Two-pane transfer UI shared by storage, campfire, stations, creatures and bags.
 * Tap an item to select it, then tap the other pane (an empty slot or the empty area) to move it there.
 * Double-tap an item to move it right away. The details bar with the Transfer buttons stays pinned at the bottom.
 */
function TransferGrid({ game, other, otherLabel, extraActions }: { game: Game; other: Container; otherLabel: string; extraActions?: (c: Container, i: number) => { label: string; onClick: () => void; variant?: "primary" | "danger" | "default" }[] }) {
  const p = game.player;
  const [sel, setSel] = useState<{ side: "me" | "other"; i: number } | null>(null);
  const lastTap = useRef<{ side: "me" | "other"; i: number; t: number } | null>(null);
  const S = window.innerWidth < 700 ? 42 : 48;
  const cont = (side: "me" | "other") => (side === "me" ? p.inv : other);
  const stack = sel ? cont(sel.side).slots[sel.i] : null;
  const refresh = () => game.events.emit("inventory", undefined);
  const move = (side: "me" | "other", i: number, amount?: number) => {
    const ok = transfer(cont(side), i, side === "me" ? other : p.inv, amount);
    if (!ok) game.notify("Sem espaço para mover esse item.", "warn");
    // keep the selection only while something is left in that slot
    if (!cont(side).slots[i]) setSel(null);
    refresh();
  };
  const takeAll = () => {
    for (let i = 0; i < other.slots.length; i++) if (other.slots[i]) transfer(other, i, p.inv);
    setSel(null);
    refresh();
  };
  /** Tap on the empty area / empty slot of a pane: move the selected stack into it. */
  const dropOn = (side: "me" | "other") => {
    if (sel && sel.side !== side && cont(sel.side).slots[sel.i]) move(sel.side, sel.i);
    else if (sel && sel.side === side) setSel(null);
  };
  const tapSlot = (e: ReactMouseEvent, side: "me" | "other", i: number) => {
    e.stopPropagation();
    const st = cont(side).slots[i];
    if (!st) { dropOn(side); return; }
    const now = performance.now();
    const lt = lastTap.current;
    lastTap.current = { side, i, t: now };
    if (lt && lt.side === side && lt.i === i && now - lt.t < 350) { move(side, i); lastTap.current = null; return; } // double tap
    setSel({ side, i });
  };
  const paneCls = (side: "me" | "other") => `rounded-md p-1 -m-1 ${sel && sel.side !== side ? "outline outline-2 outline-dashed outline-[var(--ark-cyan)]/70 bg-[var(--ark-cyan)]/5" : ""}`;
  const hint = (side: "me" | "other") => sel && sel.side !== side ? <span className="text-[var(--ark-cyan)] text-[10px] font-bold">TOQUE AQUI PARA MOVER</span> : null;
  return (
    <div className="flex flex-col gap-2">
      <div className="grid md:grid-cols-2 gap-3">
        <div className={paneCls("me")} onClick={() => dropOn("me")}>
          <div className="ark-label mb-1 flex justify-between gap-2"><span>Seu inventário ({p.weight().toFixed(0)}/{Number.isFinite(p.max("weight")) ? p.max("weight") : "∞"})</span>{hint("me")}</div>
          <div className="flex flex-wrap gap-1">
            {p.inv.slots.map((s, i) => <ItemSlot key={i} stack={s} size={S} selected={sel?.side === "me" && sel.i === i} onClick={(e) => tapSlot(e, "me", i)} />)}
          </div>
        </div>
        <div className={paneCls("other")} onClick={() => dropOn("other")}>
          <div className="ark-label mb-1 flex justify-between gap-2"><span>{otherLabel}</span>{hint("other")}<button className="text-[var(--ark-cyan)] font-bold" onClick={(e) => { e.stopPropagation(); takeAll(); }}>PEGAR TUDO</button></div>
          <div className="flex flex-wrap gap-1">
            {other.slots.map((s, i) => <ItemSlot key={i} stack={s} size={S} selected={sel?.side === "other" && sel.i === i} onClick={(e) => tapSlot(e, "other", i)} />)}
          </div>
        </div>
      </div>
      <div className="sticky bottom-0 z-10 border-t border-[var(--ark-line)] pt-2 pb-1 bg-[rgb(10,20,26)]">
        <ItemDetails stack={stack} actions={sel && stack ? [
          { label: sel.side === "me" ? "Transferir →" : "← Pegar", variant: "primary", onClick: () => move(sel.side, sel.i) },
          ...(stack.qty > 1 ? [{ label: sel.side === "me" ? "Transferir 1" : "Pegar 1", onClick: () => move(sel.side, sel.i, 1) }] : []),
          ...(extraActions ? extraActions(cont(sel.side), sel.i) : []),
        ] : []} />
      </div>
    </div>
  );
}

export function ContextPanel({ game, req, onClose }: { game: Game; req: PanelRequest; onClose: () => void }) {
  const [, tick] = useState(0);
  useEffect(() => {
    // stations keep crafting/cooking while their panel is open — refresh progress
    const iv = setInterval(() => tick((x) => x + 1), 400);
    return () => clearInterval(iv);
  }, []);
  if (req.kind === "container") return <StructurePanel game={game} id={req.structureId} onClose={onClose} />;
  if (req.kind === "creature") return <CreaturePanel game={game} id={req.creatureId} onClose={onClose} />;
  if (req.kind === "note") return <NotePanel game={game} id={req.noteId} onClose={onClose} />;
  if (req.kind === "obelisk") return <ObeliskPanel game={game} id={req.obeliskId} onClose={onClose} />;
  return <BagPanel game={game} id={req.bagId} onClose={onClose} />;
}

function StructurePanel({ game, id, onClose }: { game: Game; id: number; onClose: () => void }) {
  const s = game.building.get(id);
  const [tab, setTab] = useState<"items" | "craft">("items");
  const [confirm, setConfirm] = useState(false);
  if (!s) return <Panel title="Estrutura" onClose={onClose}>Estrutura não encontrada.</Panel>;
  return (
    <Panel title={s.def.name} icon={s.def.interact === "campfire" ? "stamina" : "crate"} onClose={onClose} wide>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="w-36"><Bar value={s.hp} max={s.def.hp} color="#ff5a52" icon="health" label={`${Math.round(s.hp)}/${s.def.hp}`} h={10} /></div>
        {s.def.id === "crop_plot" && (
          <>
            <div className="w-36"><Bar value={s.water ?? 0} max={100} color="#4ac6ff" icon="water" label={`Água ${Math.round(s.water ?? 0)}%`} h={10} /></div>
            <Btn variant="primary" icon="water" onClick={() => game.waterCrop(s.id)}>Regar (cantil)</Btn>
            <span className="text-xs text-[var(--ark-mute)]">Coloque sementes. A chuva também rega. {s.grow && s.grow > 0 ? `Crescimento ${Math.min(100, Math.round((s.grow ?? 0) * 100))}%` : ""}</span>
          </>
        )}
        {(() => { const cost = game.building.repairCost(s); return cost.length > 0 && (
          <Btn variant="amber" icon="hammer" onClick={() => game.repairStructure(s.id)}>Reparar ({cost.map(([id, n]) => `${n} ${ITEMS[id].name}`).join(", ")})</Btn>
        ); })()}
        {(s.def.interact === "campfire" || s.def.interact === "forge") && (
          <>
            <Btn variant={s.lit ? "danger" : "primary"} onClick={() => { game.building.lightCampfire(s, !s.lit); game.events.emit("inventory", undefined); }}>{s.lit ? "Apagar" : "Acender"}</Btn>
            <span className="text-xs text-[var(--ark-mute)]">{s.lit ? (s.def.id === "campfire" ? "Queimando · cozinha carne crua automaticamente" : s.def.id === "forge" ? "Queimando · derretendo minério de metal em lingotes" : "Queimando · iluminando e aquecendo a área") : s.def.id === "forge" ? "Coloque madeira e minério de metal, depois acenda." : s.def.id === "campfire" ? "Coloque madeira ou palha e carne crua, depois acenda." : "Coloque madeira ou palha como combustível, depois acenda."}</span>
          </>
        )}
        {s.queue && (
          <>
            <Btn onClick={() => setTab("items")} variant={tab === "items" ? "primary" : "default"}>Itens</Btn>
            <Btn onClick={() => setTab("craft")} variant={tab === "craft" ? "primary" : "default"}>Criar</Btn>
          </>
        )}
        <div className="flex-1" />
        {confirm ? (
          <>
            <span className="text-xs text-red-200">Recolher? Estruturas dependentes também serão removidas.</span>
            <Btn variant="danger" onClick={() => game.demolish(s.id)}>Confirmar</Btn>
            <Btn onClick={() => setConfirm(false)}>Não</Btn>
          </>
        ) : (
          <Btn variant="danger" onClick={() => setConfirm(true)}>Recolher</Btn>
        )}
      </div>
      {s.inv && tab === "items" && <TransferGrid game={game} other={s.inv} otherLabel={s.def.name} />}
      {s.queue && tab === "craft" && <CraftTab game={game} station={s} />}
      {!s.inv && <div className="text-sm text-white/60">Esta estrutura não tem inventário.</div>}
    </Panel>
  );
}

function CreaturePanel({ game, id, onClose }: { game: Game; id: number; onClose: () => void }) {
  const c = game.creatures.get(id);
  const [name, setName] = useState(c?.name ?? "");
  if (!c || !c.alive) return <Panel title="Criatura" onClose={onClose}>A criatura não está mais disponível.</Panel>;
  const p = game.player;
  const feedables = [...new Set([...p.inv.slots, ...p.bar.slots].filter(Boolean).map((s) => s!.id))].filter((id2) => {
    const d = ITEMS[id2];
    return d.torpor || c.sp.foods.some((f) => f.item === id2) || (c.tamed && !!d.saddle && d.saddle.species === c.sp.id);
  });
  return (
    <Panel title={`${c.name} · ${c.sp.name} Nv ${c.level}`} icon="dino" onClose={onClose} wide>
      <div className="grid md:grid-cols-2 gap-3 mb-3">
        <div className="flex flex-col gap-1 text-xs">
          {iconFor("__sp_" + c.sp.id) && <img src={iconFor("__sp_" + c.sp.id)} className="w-28 h-28 self-center" alt="" />}
          <Bar value={c.health} max={c.maxHealth} color="#e5484d" icon="❤" label={`${Math.round(c.health)}/${Math.round(c.maxHealth)}`} />
          <Bar value={c.torpor} max={c.maxTorpor} color="#8b5cf6" icon="💤" label={`Torpor ${Math.round(c.torpor)}/${Math.round(c.maxTorpor)}`} />
          <Bar value={c.food} max={c.maxFood} color="#c2410c" icon="🍖" label={`Comida ${Math.round(c.food)}`} />
          {c.taming && (
            <>
              <Bar value={c.taming.affinity} max={c.taming.needed} color="#34d399" icon="♥" label={`Domesticação ${Math.round((c.taming.affinity / c.taming.needed) * 100)}%`} />
              <div className="text-white/70">Eficiência: {Math.round(c.taming.effectiveness)}% · Come a cada {c.sp.eatInterval}s</div>
              <div className="text-white/50">Comidas preferidas: {c.sp.foods.map((f) => ITEMS[f.item].name).join(" > ")}</div>
              <div className="text-white/50">Mantenha o torpor alto com Narcoberry/Narcótico. Se acordar, a domesticação falha.</div>
            </>
          )}
          {c.tamed && <div className="text-white/70">{temperLabel(c.sp.temperament)} · {c.sp.diet === "herbivore" ? "Herbívoro" : "Carnívoro"} · {c.gender === "M" ? "♂ Macho" : "♀ Fêmea"} · Dano {Math.round(c.sp.damage * c.damageMult)}</div>}
          {c.tamed && <Bar value={c.stamina} max={c.maxStamina} color="#ffd24a" icon="stamina" label={`Stamina ${Math.round(c.stamina)}/${Math.round(c.maxStamina)}`} />}
          {c.tamed && <Bar value={c.inventory.weight()} max={c.maxWeight()} color="#b7c4c8" icon="weight" label={`Peso ${Math.round(c.inventory.weight())}/${Math.round(c.maxWeight())}`} />}
          {c.tamed && <Bar value={c.xp} max={c.xpToNext()} color="#5ee6ff" icon="xp" label={`XP ${Math.floor(c.xp)}/${c.xpToNext()}`} />}
          {c.tamed && c.age < 1 && (
            <div className="ark-card p-1.5 flex flex-col gap-1">
              <Bar value={c.age} max={1} color="#5eea8a" icon="dino" label={`Maturação ${Math.round(c.age * 100)}%`} />
              <Bar value={c.imprint} max={1} color="#ff8ac8" icon="heart" label={`Impressão ${Math.round(c.imprint * 100)}%`} />
              <div className="text-white/70">{c.imprintRequest === "cuddle" ? "Quer carinho!" : c.imprintRequest === "feed" ? "Quer ração básica!" : "Satisfeito. Nova necessidade em breve."}</div>
              {c.imprintRequest === "cuddle" && <Btn variant="primary" icon="heart" onClick={() => game.imprintCare(c)}>Fazer carinho</Btn>}
              <div className="text-white/45">Filhotes comem rápido: mantenha comida no inventário dele.</div>
            </div>
          )}
          {c.tamed && c.statPoints > 0 && <div className="text-[var(--ark-amber)] font-bold">{c.statPoints} ponto(s) de atributo para distribuir</div>}
          {c.tamed && (
            <div className="grid grid-cols-2 gap-1">
              {(["health", "damage", "stamina", "speed", "weight"] as const).map((k) => (
                <div key={k} className="flex items-center justify-between ark-card px-1.5 py-0.5">
                  <span>{{ health: "Vida", damage: "Dano", stamina: "Stamina", speed: "Velocidade", weight: "Peso" }[k]} <b className="text-[var(--ark-cyan)]">+{c.statLv[k]}</b></span>
                  <button className="ark-btn !px-2 !py-0.5" disabled={c.statPoints <= 0} onClick={() => game.allocateCreatureStat(c, k)}>+</button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2">
          {feedables.length > 0 && (
            <div>
              <div className="text-xs text-white/60 mb-1">{c.tamed ? "Alimentar" : "Dar ao animal (comida vai para o inventário; torpor é forçado)"}</div>
              <div className="flex flex-wrap gap-1">
                {feedables.map((fid) => (
                  <button key={fid} className="ark-btn !px-2 !normal-case !tracking-normal" onClick={() => game.feedFromPlayer(c, fid)}><ItemImg id={fid} size={22} />{ITEMS[fid].name} <span className="text-[var(--ark-mute)]">({p.count(fid)})</span></button>
                ))}
              </div>
            </div>
          )}
          {c.tamed && (
            <>
              {c.sp.rideable && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs ${c.hasSaddle() ? "text-[var(--ark-green)]" : "text-[var(--ark-mute)]"}`}>{c.hasSaddle() ? "Sela equipada" : `Precisa de: Sela de ${c.sp.name}`}</span>
                  {game.canMount(c) && <Btn variant="primary" icon="saddle" onClick={() => { game.mount(c); onClose(); }}>Montar</Btn>}
                </div>
              )}
              <div className="flex items-center gap-2">
                <Btn variant={c.mating ? "primary" : "ghost"} icon="heart" onClick={() => { c.mating = !c.mating; if (c.mating) game.setCommand(c, "wander"); game.events.emit("inventory", undefined); }}>{c.mating ? "Acasalamento: ON" : "Acasalamento: OFF"}</Btn>
                {c.gender === "F" && c.mateProgress > 0 && <span className="text-xs text-pink-300">Acasalando {Math.round(c.mateProgress * 100)}%</span>}
                {c.mateCooldown > 0 && <span className="text-xs text-[var(--ark-mute)]">Recarga {Math.ceil(c.mateCooldown / 60)} min</span>}
              </div>
              <div className="text-xs text-white/60">Comando: {cmdLabel(c.command)}</div>
              <div className="flex gap-1 flex-wrap">
                <Btn variant={c.command === "follow" ? "primary" : "default"} onClick={() => game.setCommand(c, "follow")}>Seguir</Btn>
                <Btn variant={c.command === "stay" ? "primary" : "default"} onClick={() => game.setCommand(c, "stay")}>Ficar</Btn>
                <Btn variant={c.command === "wander" ? "primary" : "default"} onClick={() => game.setCommand(c, "wander")}>Vagar</Btn>
              </div>
              <div className="text-xs text-white/60">Postura</div>
              <div className="flex gap-1 flex-wrap">
                <Btn variant={c.stance === "passive" ? "primary" : "default"} onClick={() => game.setStance(c, "passive")}>Passivo</Btn>
                <Btn variant={c.stance === "neutral" ? "primary" : "default"} onClick={() => game.setStance(c, "neutral")}>Neutro</Btn>
                <Btn variant={c.stance === "aggressive" ? "primary" : "default"} onClick={() => game.setStance(c, "aggressive")}>Agressivo</Btn>
              </div>
              <div className="flex gap-1 items-center">
                <input value={name} maxLength={18} onChange={(e) => setName(e.target.value)} className="bg-black/50 border border-white/20 rounded px-2 py-1 text-sm flex-1" />
                <Btn onClick={() => { c.name = name.trim() || c.sp.name; game.events.emit("inventory", undefined); }}>Renomear</Btn>
              </div>
              <Btn variant="danger" onClick={() => game.releaseCreature(c)}>Libertar</Btn>
            </>
          )}
        </div>
      </div>
      <TransferGrid game={game} other={c.inventory} otherLabel={`Inventário de ${c.name}`} />
    </Panel>
  );
}

function BagPanel({ game, id, onClose }: { game: Game; id: number; onClose: () => void }) {
  const b = game.getBag(id);
  if (!b || b.inv.isEmpty()) return <Panel title="Bolsa" onClose={onClose}>A bolsa está vazia.</Panel>;
  return (
    <Panel title={b.label} icon={b.kind === "supply" ? "crate" : b.kind === "death" ? "skull" : "bag"} onClose={onClose} wide>
      <div className="text-xs text-[var(--ark-mute)] mb-2">Desaparece em {Math.max(0, Math.round((b.expires - game.time) / 60))} min.</div>
      <TransferGrid game={game} other={b.inv} otherLabel={b.label} />
    </Panel>
  );
}

function NotePanel({ game, id, onClose }: { game: Game; id: number; onClose: () => void }) {
  const n = game.getNote(id);
  if (!n) return <Panel title="Nota" onClose={onClose}>Nota não encontrada.</Panel>;
  return (
    <Panel title="Nota de Explorador" icon="note" onClose={onClose}>
      <div className="p-4 rounded" style={{ background: "linear-gradient(180deg,#f3e8cb,#e4d4ab)", color: "#3a2e1c", fontFamily: "Georgia, serif", boxShadow: "inset 0 0 30px rgba(120,90,40,0.3)" }}>
        <div className="font-bold text-xl">{n.title}</div>
        <div className="text-xs italic mb-3">— {n.author} · {n.poi}</div>
        <div className="text-[15px] leading-relaxed">{n.text}</div>
      </div>
      <div className="text-[11px] text-[var(--ark-mute)] mt-2">+25 XP · Guardada no Diário (Inventário → Diário).</div>
    </Panel>
  );
}

function ObeliskPanel({ game, id, onClose }: { game: Game; id: string; onClose: () => void }) {
  const poi = game.getObelisk(id);
  const [tab, setTab] = useState<"data" | "dinos" | "tribute" | "replicator" | "info">("data");
  const [, force] = useState(0);
  if (!poi) return <Panel title="Terminal" onClose={onClose}>Terminal indisponível.</Panel>;
  const found = game.player.explored.filter((e) => game.getObelisk(e)).length;
  const trib = Game.TRIBUTES[poi.id];
  const check = game.tributeCheck(poi.id);
  const nearTames = game.creatures.list.filter((c) => c.tamed && c.alive && !c.rider && c.pos.distanceTo(poi.pos) < 40);
  const reps = ENGRAMS.filter((e) => e.station === "replicator");
  const T = (k: typeof tab, l: string) => <button className={`ark-tab ${tab === k ? "active" : ""}`} onClick={() => setTab(k)}>{l}</button>;
  return (
    <Panel title={`Terminal de Tributo · ${poi.name}`} icon="engram" onClose={onClose} wide tabs={<>{T("data", "Itens da ARK")}{T("dinos", "Criaturas da ARK")}{T("tribute", "Tributo")}{T("replicator", "Replicador")}{T("info", "Informações")}</>}>
      {tab === "data" && (
        <>
          <div className="text-xs text-[var(--ark-mute)] mb-2">Envie itens aos Dados da ARK: ficam guardados no sistema da ilha, não se perdem ao morrer e podem ser recuperados em qualquer obelisco.</div>
          <TransferGrid game={game} other={game.arkData} otherLabel="Dados da ARK (upload)" />
        </>
      )}
      {tab === "dinos" && (
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <div className="ark-label mb-1">Suas criaturas próximas (40 m)</div>
            {nearTames.length === 0 && <div className="text-xs text-[var(--ark-mute)]">Nenhuma criatura domesticada perto do obelisco.</div>}
            {nearTames.map((c) => (
              <div key={c.id} className="flex items-center gap-2 ark-card px-2 py-1 mb-1">
                {iconFor("__sp_" + c.sp.id) && <img src={iconFor("__sp_" + c.sp.id)} className="w-9 h-9" alt="" />}
                <div className="flex-1 text-[12px]"><b>{c.name}</b><div className="text-[var(--ark-mute)]">{c.sp.name} · Nv {c.level}</div></div>
                <Btn variant="primary" onClick={() => { game.uploadCreature(c); force((x) => x + 1); }}>Enviar ↑</Btn>
              </div>
            ))}
          </div>
          <div>
            <div className="ark-label mb-1">Criaturas nos Dados da ARK ({game.arkCreatures.length}/10)</div>
            {game.arkCreatures.length === 0 && <div className="text-xs text-[var(--ark-mute)]">Vazio. Criaturas enviadas ficam em estase e podem ser baixadas em qualquer obelisco.</div>}
            {game.arkCreatures.map((s, i) => (
              <div key={i} className="flex items-center gap-2 ark-card px-2 py-1 mb-1">
                {iconFor("__sp_" + s.species) && <img src={iconFor("__sp_" + s.species)} className="w-9 h-9" alt="" />}
                <div className="flex-1 text-[12px]"><b>{s.name}</b><div className="text-[var(--ark-mute)]">Nv {s.level} · {s.gender === "F" ? "♀" : "♂"}</div></div>
                <Btn onClick={() => { game.downloadCreature(i, poi.id); force((x) => x + 1); }}>Baixar ↓</Btn>
              </div>
            ))}
          </div>
        </div>
      )}
      {tab === "tribute" && trib && (
        <div className="flex flex-col gap-2">
          <div className="text-[13px]">Ofereça o tributo para invocar o <b style={{ color: poi.color }}>{trib.label}</b> na arena do obelisco. Derrotá-lo concede Elemento, um troféu e muita XP.</div>
          <div className="flex flex-wrap gap-2">
            {([[trib.artifact, 1], ...trib.items] as [string, number][]).map(([it, n]) => {
              const have = game.player.count(it) + game.arkData.count(it);
              return (
                <div key={it} className={`flex items-center gap-2 ark-card px-2 py-1 ${have >= n ? "border-[var(--ark-green)]/50" : ""}`}>
                  <ItemImg id={it} size={32} />
                  <div className="text-[12px]"><div className="font-bold">{ITEMS[it].name}</div><div className={have >= n ? "text-[var(--ark-green)]" : "text-[var(--ark-red)]"}>{have} / {n}</div></div>
                </div>
              );
            })}
          </div>
          <div className="text-[11px] text-[var(--ark-mute)]">Artefatos ficam escondidos em ruínas (bolsas "Relíquia antiga"). Itens nos Dados da ARK também contam.</div>
          <div className="flex gap-2 items-center">
            <Btn variant="danger" icon="skull" disabled={!check.ok || !!(game.guardian && game.guardian.alive)} onClick={() => { if (game.summonGuardian(poi.id)) onClose(); }}>Invocar Guardião</Btn>
            {game.guardian && game.guardian.alive && <span className="text-xs text-[var(--ark-red)]">Um guardião está ativo na ilha.</span>}
          </div>
        </div>
      )}
      {tab === "replicator" && (
        <div className="flex flex-col gap-2">
          <div className="text-xs text-[var(--ark-mute)]">O Replicador do obelisco fabrica itens avançados usando Elemento (obtido de guardiões). Usa seu inventário e os Dados da ARK.</div>
          {reps.map((e) => {
            const src = [game.player.inv, game.player.bar, game.arkData];
            const ok = e.inputs.every(([it, n]) => src.reduce((a, c) => a + c.count(it), 0) >= n);
            return (
              <div key={e.key} className="flex items-center gap-2 ark-card px-2 py-1">
                <ItemImg id={e.id} size={36} />
                <div className="flex-1 text-[12px]"><b>{ITEMS[e.id].name}{e.qty > 1 ? ` ×${e.qty}` : ""}</b>
                  <div className="flex gap-2 flex-wrap">{e.inputs.map(([it, n]) => <span key={it} className="flex items-center gap-0.5"><ItemImg id={it} size={14} />{n}</span>)}</div>
                </div>
                <Btn variant="primary" disabled={!ok} onClick={() => { game.replicatorCraft(e.key!, 1); force((x) => x + 1); }}>Replicar</Btn>
              </div>
            );
          })}
        </div>
      )}
      {tab === "info" && (
        <div className="flex flex-col gap-2 text-[13px]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full" style={{ background: poi.color, boxShadow: `0 0 18px ${poi.color}` }} />
            <div><div className="font-bold text-base">{poi.name}</div><div className="text-[var(--ark-mute)] text-xs">Torre flutuante · Terminal de Tributo ativo</div></div>
          </div>
          <div className="text-white/80">As três torres flutuam sobre a ilha desde antes do primeiro sobrevivente acordar. Seus feixes descem até os terminais, onde o implante no seu braço é reconhecido.</div>
          <div className="grid grid-cols-2 gap-1 max-w-[360px] text-xs">
            <span className="text-[var(--ark-mute)]">Obeliscos descobertos</span><b>{found} / 3</b>
            <span className="text-[var(--ark-mute)]">Itens nos Dados da ARK</span><b>{game.arkData.slots.filter(Boolean).length} / {game.arkData.size}</b>
            <span className="text-[var(--ark-mute)]">Criaturas nos Dados da ARK</span><b>{game.arkCreatures.length} / 10</b>
            <span className="text-[var(--ark-mute)]">Troféus de guardião</span><b>{game.player.count("guardian_trophy")}</b>
          </div>
        </div>
      )}
    </Panel>
  );
}
