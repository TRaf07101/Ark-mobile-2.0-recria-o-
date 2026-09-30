import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Game } from "../game";
import { ITEMS, CAT_LABEL, type ItemCategory } from "../data/items";
import { SPECIES } from "../data/species";
import type { Command, Creature, Stance } from "../entities/creatures";
import { STRUCTURES } from "../data/structures";
import { RULE_DEFS, type Rules } from "../core/settings";
import { CONFIG } from "../core/config";
import type { WeatherKind } from "../systems/weather";
import { ItemImg, Panel } from "./common";
import { Icon } from "./svg";
import { DEV_UNLOCK_CODE, DEV_UNLOCK_KEY } from "../core/developer";

export { DEV_UNLOCK_KEY };

type Page = "items" | "player" | "creatures" | "world" | "build" | "room";
type Run = (fn: () => unknown, ok?: string) => void;
interface Ctx { game: Game; run: Run; target: string; targetName: string }

const NAV: { id: Page; label: string; icon: string }[] = [
  { id: "items", label: "Itens", icon: "bag" },
  { id: "player", label: "Jogador", icon: "heart" },
  { id: "creatures", label: "Criaturas", icon: "dino" },
  { id: "world", label: "Mundo", icon: "map" },
  { id: "build", label: "Construção", icon: "hammer" },
  { id: "room", label: "Sala", icon: "person" },
];

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const fmt = (n: number) => n.toLocaleString("pt-BR");

// ------------------------------------------------------------------ small building blocks
function Group({ title, hint, children }: { title?: string; hint?: string; children: ReactNode }) {
  return (
    <section className="dv-group">
      {title && <div className="dv-title">{title}</div>}
      {hint && <div className="dv-hint">{hint}</div>}
      {children}
    </section>
  );
}

function B({ children, onClick, variant = "", disabled, block }: { children: ReactNode; onClick?: () => void; variant?: "primary" | "danger" | "amber" | ""; disabled?: boolean; block?: boolean }) {
  return <button type="button" className={`dv-btn ${variant} ${block ? "block" : ""}`} onClick={onClick} disabled={disabled}>{children}</button>;
}

function Chip({ on, onClick, children }: { on?: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" className={`dv-chip ${on ? "on" : ""}`} onClick={onClick}>{children}</button>;
}

function Seg<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="dv-seg" role="tablist">
      {options.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={value === k} className={value === k ? "on" : ""} onClick={() => onChange(k)}>{l}</button>)}
    </div>
  );
}

/** On/off row. `checked === null` (target is not the host) shows explicit On / Off buttons instead of a switch. */
function Switch({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean | null; onChange: (v: boolean) => void }) {
  return (
    <div className="dv-row">
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-semibold">{label}</div>
        {hint && <div className="dv-hint">{hint}</div>}
      </div>
      {checked === null
        ? <div className="dv-row !gap-1"><B onClick={() => onChange(true)}>Ligar</B><B onClick={() => onChange(false)}>Desligar</B></div>
        : <button type="button" role="switch" aria-checked={checked} aria-label={label} className="dv-switch" onClick={() => onChange(!checked)} />}
    </div>
  );
}

/** Number field with − / + steppers. Typing is free; the value is validated and clamped when you leave the field. */
function Num({ label, value, onChange, min, max, step = 1, unit, presets }: { label?: string; value: number; onChange: (v: number) => void; min: number; max: number; step?: number; unit?: string; presets?: number[] }) {
  const [text, setText] = useState(String(value));
  const [focus, setFocus] = useState(false);
  useEffect(() => { if (!focus) setText(String(value)); }, [value, focus]);
  const round = (v: number) => Math.round(v * 1000) / 1000;
  const commit = (raw: string) => {
    const n = Number(raw.replace(",", "."));
    const v = raw.trim() !== "" && Number.isFinite(n) ? clamp(round(n), min, max) : value;
    setText(String(v));
    if (v !== value) onChange(v);
  };
  const bump = (d: number) => { const v = clamp(round(value + d), min, max); setText(String(v)); onChange(v); };
  return (
    <div className="flex flex-col gap-1 min-w-0">
      {label && <span className="dv-label">{label}</span>}
      <div className="dv-num">
        <button type="button" aria-label="Diminuir" onClick={() => bump(-step)}>−</button>
        <input aria-label={label ?? "Valor"} inputMode="decimal" value={text} onFocus={(e) => { setFocus(true); e.target.select(); }} onBlur={() => { setFocus(false); commit(text); }} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
        {unit && <span className="dv-unit">{unit}</span>}
        <button type="button" aria-label="Aumentar" onClick={() => bump(step)}>+</button>
      </div>
      {presets && <div className="dv-wrap">{presets.map((p) => <Chip key={p} on={value === p} onClick={() => { setText(String(p)); onChange(clamp(p, min, max)); }}>{fmt(p)}</Chip>)}</div>}
    </div>
  );
}

function Slider({ label, value, onChange, min = 0, max = 100, unit = "%" }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; unit?: string }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <label className="flex flex-col gap-1">
      <span className="dv-row justify-between"><span className="dv-label">{label}</span><b className="text-[12px] text-[var(--ark-cyan)]">{value}{unit}</b></span>
      <input type="range" className="ark-slider w-full" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ background: `linear-gradient(90deg, var(--ark-cyan) ${pct}%, rgba(120,220,240,.18) ${pct}%)` }} />
    </label>
  );
}

function Search({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return <input className="dv-input" type="search" aria-label={placeholder} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />;
}

const Empty = ({ children }: { children: ReactNode }) => <div className="dv-hint text-center py-4">{children}</div>;

// ------------------------------------------------------------------ pages
function ItemsPage({ ctx, item, setItem, qty, setQty }: { ctx: Ctx; item: string; setItem: (id: string) => void; qty: number; setQty: (n: number) => void }) {
  const { game, run, targetName } = ctx;
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<"all" | ItemCategory>("all");
  const [limit, setLimit] = useState(48);
  const cats = useMemo(() => [...new Set(Object.values(ITEMS).map((i) => i.cat))] as ItemCategory[], []);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return Object.values(ITEMS).filter((it) => (cat === "all" || it.cat === cat) && (!s || it.name.toLowerCase().includes(s) || it.id.includes(s)));
  }, [q, cat]);
  const shown = useMemo(() => list.slice(0, limit), [list, limit]);
  const tiles = useMemo(() => shown.map((it) => (
    <button key={it.id} type="button" className={`dv-tile ${item === it.id ? "on" : ""}`} onClick={() => setItem(it.id)}>
      <ItemImg id={it.id} size={28} /><span className="truncate">{it.name}</span>
    </button>
  )), [shown, item, setItem]);
  const repeating = game.dev.infiniteItem === item;
  return (
    <div className="flex flex-col gap-2.5 min-h-full">
      <Search value={q} onChange={(v) => { setQ(v); setLimit(48); }} placeholder="Buscar item, arma, sela, estrutura..." />
      <div className="dv-wrap">
        <Chip on={cat === "all"} onClick={() => { setCat("all"); setLimit(48); }}>Todos</Chip>
        {cats.map((c) => <Chip key={c} on={cat === c} onClick={() => { setCat(c); setLimit(48); }}>{CAT_LABEL[c]}</Chip>)}
      </div>
      {list.length === 0 ? <Empty>Nenhum item encontrado. Tente outro nome.</Empty> : <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">{tiles}</div>}
      {list.length > limit && <B block onClick={() => setLimit((n) => n + 48)}>Mostrar mais ({list.length - limit})</B>}
      <div className="flex-1" />
      <div className="dv-dock">
        <div className="dv-row">
          <ItemImg id={item} size={36} />
          <div className="flex-1 min-w-0"><div className="font-bold truncate">{ITEMS[item]?.name}</div><div className="dv-hint">Enviar para: {targetName}</div></div>
        </div>
        <Num label="Quantidade" value={qty} onChange={setQty} min={1} max={10000} step={qty >= 100 ? 50 : qty >= 10 ? 5 : 1} presets={[1, 10, 100, 1000]} />
        <div className="dv-row">
          <div className="flex-1"><B variant="primary" block onClick={() => run(() => game.dev.giveItem(item, qty, ctx.target), "Item enviado")}>Enviar {fmt(qty)}</B></div>
          <div className="flex-1"><B variant={repeating ? "danger" : "amber"} block onClick={() => run(() => game.dev.setInfiniteItem(repeating ? "" : item), repeating ? "Reposição desligada" : "Repondo automaticamente")}>{repeating ? "Parar de repor" : "Repor sempre"}</B></div>
        </div>
      </div>
    </div>
  );
}

function PlayerPage({ ctx }: { ctx: Ctx }) {
  const { game, run, target } = ctx;
  const self = game.isGuest || target === "host";
  const [level, setLevel] = useState(game.player.level);
  const [xp, setXp] = useState(1000);
  const [statPts, setStatPts] = useState(10);
  const [engramPts, setEngramPts] = useState(50);
  const [vitals, setVitals] = useState({ health: 100, stamina: 100, food: 100, water: 100 });
  const playerTarget = game.isGuest ? "self" : target;
  const flag = (f: "invincible" | "flying" | "needs" | "weight", v: boolean) => run(() => game.dev.setPlayerFlag(f, v, playerTarget), v ? "Ligado" : "Desligado");
  return (
    <div className="flex flex-col gap-2.5">
      <Group title="Modos" hint={self ? undefined : "O estado atual de outros jogadores não é conhecido; use Ligar ou Desligar."}>
        <Switch label="Invencível" checked={self ? game.dev.invincible : null} onChange={(v) => flag("invincible", v)} />
        <Switch label="Voo livre" hint="Teclado: Espaço sobe, Shift desce. No celular, use o botão de descer." checked={self ? game.dev.flying : null} onChange={(v) => flag("flying", v)} />
        <Switch label="Necessidades infinitas" hint="Vida, vigor, comida e água nunca acabam." checked={self ? game.dev.infiniteNeeds : null} onChange={(v) => flag("needs", v)} />
        <Switch label="Peso infinito" hint="Permite carregar qualquer peso sem ficar lento ou imóvel." checked={self ? game.player.weightInfinite : null} onChange={(v) => flag("weight", v)} />
      </Group>
      <Group title="Nível e experiência">
        <div className="grid grid-cols-2 gap-2 items-end">
          <Num label={`Nível (1 a ${CONFIG.player.maxLevel})`} value={level} onChange={setLevel} min={1} max={CONFIG.player.maxLevel} />
          <B variant="primary" onClick={() => run(() => game.dev.setLevel(level, target), `Nível ${level}`)}>Definir nível</B>
        </div>
        <div className="grid grid-cols-2 gap-2 items-end">
          <Num label="Experiência" value={xp} onChange={setXp} min={1} max={10000000} step={100} />
          <B variant="primary" onClick={() => run(() => game.dev.addXp(xp, target), "XP concedido")}>Dar XP</B>
        </div>
      </Group>
      <Group title="Pontos e engramas">
        <div className="grid grid-cols-2 gap-2">
          <Num label="Pontos de atributo" value={statPts} onChange={setStatPts} min={0} max={1000} />
          <Num label="Pontos de engrama" value={engramPts} onChange={setEngramPts} min={0} max={10000} step={10} />
        </div>
        <B block onClick={() => run(() => game.dev.addPoints(statPts, engramPts, target), "Pontos concedidos")}>Conceder pontos</B>
        <B block variant="amber" onClick={() => run(() => game.dev.unlockAllEngrams(target), "Engramas aprendidos")}>Aprender todos os engramas</B>
      </Group>
      <Group title="Vida, vigor, comida e água">
        <Slider label="Vida" value={vitals.health} onChange={(v) => setVitals({ ...vitals, health: v })} />
        <Slider label="Vigor" value={vitals.stamina} onChange={(v) => setVitals({ ...vitals, stamina: v })} />
        <Slider label="Comida" value={vitals.food} onChange={(v) => setVitals({ ...vitals, food: v })} />
        <Slider label="Água" value={vitals.water} onChange={(v) => setVitals({ ...vitals, water: v })} />
        <div className="dv-row">
          <div className="flex-1"><B block variant="primary" onClick={() => run(() => game.dev.setVitals(vitals.health, vitals.stamina, vitals.food, vitals.water, target), "Barras ajustadas")}>Aplicar</B></div>
          <div className="flex-1"><B block onClick={() => { setVitals({ health: 100, stamina: 100, food: 100, water: 100 }); run(() => game.dev.setVitals(100, 100, 100, 100, target), "Barras cheias"); }}>Encher tudo</B></div>
        </div>
      </Group>
      <Group title="Recuperação">
        <B block onClick={() => run(() => game.dev.healEveryone(), "Todos curados")}>Curar todos os jogadores e criaturas</B>
        <B block onClick={() => run(() => game.dev.revivePlayer(target), "Jogador revivido")}>Reviver jogador</B>
      </Group>
    </div>
  );
}

function statusOf(c: Creature) {
  return !c.alive ? { text: "Morta", cls: "bad" } : c.tamed ? { text: "Domada", cls: "good" } : { text: "Selvagem", cls: "" };
}

function CreaturesPage({ ctx, item, qty }: { ctx: Ctx; item: string; qty: number }) {
  const { game, run } = ctx;
  const [view, setView] = useState<"spawn" | "list" | "bulk">("spawn");
  const [species, setSpecies] = useState("rex");
  const [level, setLevel] = useState(30);
  const [tamed, setTamed] = useState(false);
  const [saddled, setSaddled] = useState(false);
  const [filter, setFilter] = useState("");
  const [selId, setSelId] = useState(0);
  const [radius, setRadius] = useState(70);
  const [lvl, setLvl] = useState(30);
  const [xp, setXp] = useState(1000);
  const [pts, setPts] = useState(10);
  const [hp, setHp] = useState(100);
  const [name, setName] = useState("");
  const [cmd, setCmd] = useState<Command>("follow");
  const [stance, setStance] = useState<Stance>("neutral");
  const speciesList = useMemo(() => Object.values(SPECIES).filter((s) => s.id !== "guardian").sort((a, b) => a.name.localeCompare(b.name, "pt")), []);
  const live = game.creatures?.list ?? [];
  const sel = live.find((c) => c.id === selId);
  const open = (c: Creature) => { setSelId(c.id); setLvl(c.level); setName(c.name); setCmd(c.command); setStance(c.stance); setHp(100); setView("list"); };
  const rows = useMemo(() => {
    const s = filter.trim().toLowerCase();
    return live.filter((c) => !s || c.name.toLowerCase().includes(s) || c.sp.name.toLowerCase().includes(s))
      .sort((a, b) => a.pos.distanceTo(game.player.pos) - b.pos.distanceTo(game.player.pos)).slice(0, 60);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live.length, filter, Math.round(game.player.pos.x / 4), Math.round(game.player.pos.z / 4)]);

  return (
    <div className="flex flex-col gap-2.5">
      <Seg value={view} onChange={(v) => { setView(v); }} options={[["spawn", "Invocar"], ["list", sel ? "Selecionada" : "Lista"], ["bulk", "Em massa"]]} />

      {view === "spawn" && (
        <Group title="Invocar criatura" hint="Aparece na sua frente e não altera a população natural da ilha.">
          <label className="flex flex-col gap-1"><span className="dv-label">Espécie</span>
            <select className="dv-input" value={species} onChange={(e) => setSpecies(e.target.value)}>{speciesList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          </label>
          <Num label="Nível (1 a 250)" value={level} onChange={setLevel} min={1} max={250} presets={[1, 30, 100, 150]} />
          <Switch label="Já domesticada" checked={tamed || saddled} onChange={(v) => { setTamed(v); if (!v) setSaddled(false); }} />
          <Switch label="Com sela" hint="Só funciona em espécies que podem ser montadas." checked={saddled} onChange={(v) => { setSaddled(v); if (v) setTamed(true); }} />
          <B block variant="primary" onClick={() => run(() => { const c = game.dev.spawnCreature(species, level, tamed || saddled, saddled); if (c) open(c); }, "Criatura invocada")}>Invocar</B>
        </Group>
      )}

      {view === "list" && (sel ? (
        <>
          <Group>
            <div className="dv-row">
              <button type="button" className="dv-btn" onClick={() => setSelId(0)}>‹ Lista</button>
              <div className="flex-1 min-w-0"><div className="font-bold truncate">{sel.name}</div><div className="dv-hint">{sel.sp.name} · nível {sel.level} · {sel.alive ? `vida ${Math.round(sel.health)}/${Math.round(sel.maxHealth)}` : "morta"}</div></div>
              <span className={`dv-badge ${statusOf(sel).cls}`}>{statusOf(sel).text}</span>
            </div>
            {sel.tamed && <div className="dv-hint">Dono: {sel.ownerId === "host" ? "anfitrião" : game.net.names.get(sel.ownerId ?? "") ?? sel.ownerId ?? "anfitrião"}</div>}
          </Group>
          {!sel.alive ? (
            <Group title="Carcaça"><B block variant="primary" onClick={() => run(() => game.dev.reviveCorpse(sel, true), "Criatura revivida")}>Reviver e domar</B></Group>
          ) : (
            <>
              <Group title="Ações rápidas">
                <div className="grid grid-cols-2 gap-2">
                  <B variant="primary" onClick={() => run(() => game.dev.forceTame(sel), "Domada")}>Domar agora</B>
                  <B onClick={() => run(() => game.dev.healCreature(sel), "Curada")}>Curar</B>
                  <B onClick={() => run(() => game.dev.equipSaddle(sel), "Sela equipada")}>Equipar sela</B>
                  <B onClick={() => run(() => game.dev.teleportCreature(sel, true), "Trazida até você")}>Trazer até mim</B>
                  <B onClick={() => run(() => game.dev.setCreatureAge(sel, true), "Agora é adulta")}>Tornar adulta</B>
                  <B onClick={() => run(() => game.dev.setCreatureAge(sel, false), "Agora é filhote")}>Tornar filhote</B>
                </div>
              </Group>
              <Group title="Nível, experiência e pontos">
                <div className="grid grid-cols-2 gap-2 items-end"><Num label="Nível" value={lvl} onChange={setLvl} min={1} max={250} /><B onClick={() => run(() => game.dev.setCreatureLevel(sel, lvl), `Nível ${lvl}`)}>Definir nível</B></div>
                <div className="grid grid-cols-2 gap-2 items-end"><Num label="Experiência" value={xp} onChange={setXp} min={1} max={10000000} step={100} /><B onClick={() => run(() => game.dev.addCreatureXp(sel, xp), "XP concedido")}>Dar XP</B></div>
                <div className="grid grid-cols-2 gap-2 items-end"><Num label="Pontos de atributo" value={pts} onChange={setPts} min={1} max={1000} /><B onClick={() => run(() => game.dev.addCreaturePoints(sel, pts), "Pontos concedidos")}>Dar pontos</B></div>
              </Group>
              <Group title="Vida">
                <Slider label="Vida da criatura" value={hp} min={1} onChange={setHp} />
                <B block onClick={() => run(() => game.dev.setCreatureHealth(sel, hp), `Vida em ${hp}%`)}>Definir vida</B>
              </Group>
              <Group title="Comportamento">
                <Seg value={cmd} onChange={setCmd} options={[["follow", "Seguir"], ["stay", "Ficar"], ["wander", "Vagar"]]} />
                <Seg value={stance} onChange={setStance} options={[["passive", "Passiva"], ["neutral", "Neutra"], ["aggressive", "Agressiva"]]} />
                <B block onClick={() => run(() => game.dev.setCreatureBehavior(sel, cmd, stance), "Comportamento aplicado")}>Aplicar comportamento</B>
              </Group>
              <Group title="Nome e inventário">
                <div className="dv-row"><input className="dv-input" aria-label="Novo nome" value={name} maxLength={24} onChange={(e) => setName(e.target.value)} placeholder="Novo nome" /><B onClick={() => run(() => game.dev.rename(sel, name), "Renomeada")}>Renomear</B></div>
                <B block onClick={() => run(() => game.dev.giveCreatureItem(sel, item, qty), "Item enviado")}>Enviar {fmt(qty)} × {ITEMS[item]?.name}</B>
                <div className="dv-hint">Troque o item e a quantidade na aba Itens.</div>
              </Group>
              <B block variant="danger" onClick={() => run(() => game.dev.kill(sel), "Eliminada")}>Eliminar</B>
            </>
          )}
        </>
      ) : (
        <>
          <Search value={filter} onChange={setFilter} placeholder="Filtrar por nome ou espécie..." />
          {rows.length === 0 ? <Empty>Nenhuma criatura por perto. Invoque uma na aba Invocar.</Empty> : (
            <div className="flex flex-col gap-1.5">
              {rows.map((c) => (
                <button key={c.id} type="button" className="dv-item" onClick={() => open(c)}>
                  <div className="flex-1 min-w-0"><div className="font-semibold truncate">{c.name}</div><div className="dv-hint">{c.sp.name} · nível {c.level} · {Math.round(c.pos.distanceTo(game.player.pos))} m</div></div>
                  <span className={`dv-badge ${statusOf(c).cls}`}>{statusOf(c).text}</span>
                </button>
              ))}
            </div>
          )}
        </>
      ))}

      {view === "bulk" && (
        <>
          <Group title="Criaturas selvagens por perto" hint="Afeta só criaturas selvagens dentro do raio escolhido.">
            <Num label="Raio" value={radius} onChange={setRadius} min={5} max={500} step={10} unit="m" presets={[30, 70, 150, 300]} />
            <B block variant="primary" onClick={() => run(() => game.dev.tameNearby(radius), "Domadas")}>Domar todas</B>
            <B block variant="danger" onClick={() => run(() => game.dev.killWild(radius), "Eliminadas")}>Eliminar todas</B>
            <B block onClick={() => run(() => game.dev.removeWild(radius), "Removidas")}>Remover as que não têm carcaça</B>
          </Group>
          <Group title="Atalhos">
            <Switch label="Eliminar ao tocar" hint="Toque numa criatura no mundo para eliminá-la." checked={game.dev.killOnTap} onChange={(v) => run(() => game.dev.toggleKillTap(v), v ? "Ligado" : "Desligado")} />
            <B block onClick={() => run(() => {
              const corpses = live.filter((c) => !c.alive);
              if (corpses.length) game.dev.reviveCorpse(corpses[Math.floor(Math.random() * corpses.length)], true);
              else { const ids = Object.keys(SPECIES).filter((id) => id !== "guardian" && SPECIES[id].movement !== "swim"); game.dev.spawnCreature(ids[Math.floor(Math.random() * ids.length)], level, true); }
            }, "Feito")}>Reviver uma carcaça ou criar uma criatura aleatória</B>
          </Group>
          <Group title="Domesticadas mortas recentemente" hint="Inclui as dos seus amigos.">
            {game.dev.recent.length === 0 ? <Empty>Nenhuma criatura domesticada morreu ainda.</Empty> : game.dev.recent.map((r) => (
              <div key={r.key} className="dv-item">
                <div className="flex-1 min-w-0"><div className="font-semibold truncate">{r.creature.name} · nível {r.creature.level}</div><div className="dv-hint">Dono: {r.creature.ownerId === "host" ? "anfitrião" : game.net.names.get(r.creature.ownerId ?? "") ?? r.creature.ownerId ?? "anfitrião"}</div></div>
                <B variant="primary" onClick={() => run(() => game.dev.revive(r.key), "Revivida")}>Reviver</B>
              </div>
            ))}
          </Group>
        </>
      )}
    </div>
  );
}

const WEATHER: [WeatherKind, string][] = [["clear", "Limpo"], ["cloudy", "Nublado"], ["rain", "Chuva"], ["storm", "Tempestade"], ["fog", "Neblina"]];
const MULTIPLIERS: [("harvestAmount" | "xpMult" | "tamingSpeed" | "craftingSpeed"), string][] = [["xpMult", "Experiência"], ["tamingSpeed", "Domesticação"], ["harvestAmount", "Coleta de materiais"], ["craftingSpeed", "Criação de itens"]];
const MAIN_RULES = new Set<string>(MULTIPLIERS.map(([k]) => k));

function WorldPage({ ctx }: { ctx: Ctx }) {
  const { game, run, target } = ctx;
  const bound = Math.max(50, Math.round(game.terrain.half - 5));
  const [hour, setHour] = useState(Math.floor(game.hour()));
  const [tx, setTx] = useState(Math.round(game.player.pos.x));
  const [tz, setTz] = useState(Math.round(game.player.pos.z));
  const [radius, setRadius] = useState(70);
  const [drops, setDrops] = useState(3);
  const [allRules, setAllRules] = useState(false);
  const lastSpeed = useRef(game.rules.dayCycleSpeed || 1);
  const frozen = game.rules.dayCycleSpeed === 0;
  const zones = game.zones ?? [];
  const obelisks = (game.pois?.pois ?? []).filter((p) => p.kind === "obelisk");
  const go = (x: number, z: number, label: string) => run(() => game.dev.teleport(x, z, undefined, target), `Teleportado: ${label}`);
  return (
    <div className="flex flex-col gap-2.5">
      <Group title="Hora do dia">
        <Slider label={`Horário: ${String(hour).padStart(2, "0")}:00`} value={hour} min={0} max={23} unit="h" onChange={setHour} />
        <div className="dv-wrap">
          {([[6, "Amanhecer"], [12, "Meio-dia"], [18, "Entardecer"], [0, "Meia-noite"]] as const).map(([h, l]) => <Chip key={h} on={hour === h} onClick={() => { setHour(h); run(() => game.dev.setTime(h), `${l}`); }}>{l}</Chip>)}
        </div>
        <B block variant="primary" onClick={() => run(() => game.dev.setTime(hour), "Hora definida")}>Definir hora</B>
        <Switch label="Congelar o horário" hint="O dia e a noite param de passar." checked={frozen} onChange={(v) => {
          if (v) { lastSpeed.current = game.rules.dayCycleSpeed || 1; run(() => game.dev.setWorldRule("dayCycleSpeed", 0), "Horário congelado"); }
          else run(() => game.dev.setWorldRule("dayCycleSpeed", lastSpeed.current || 1), "Ciclo retomado");
        }} />
      </Group>

      <Group title="Clima">
        <div className="dv-wrap">{WEATHER.map(([k, l]) => <Chip key={k} on={game.weather.kind === k} onClick={() => run(() => game.dev.setWeather(k), l)}>{l}</Chip>)}</div>
      </Group>

      <Group title="Teleporte" hint={`Você está em ${Math.round(game.player.pos.x)}, ${Math.round(game.player.pos.z)}.`}>
        <div className="grid grid-cols-2 gap-2">
          <Num label="X" value={tx} onChange={setTx} min={-bound} max={bound} step={10} />
          <Num label="Z" value={tz} onChange={setTz} min={-bound} max={bound} step={10} />
        </div>
        <div className="dv-row">
          <div className="flex-1"><B block variant="primary" onClick={() => go(tx, tz, `${tx}, ${tz}`)}>Ir para as coordenadas</B></div>
          <div className="flex-1"><B block onClick={() => go(game.terrain.spawnPoint.x, game.terrain.spawnPoint.z, "praia inicial")}>Praia inicial</B></div>
        </div>
        {zones.length > 0 && <><div className="dv-label">Regiões</div><div className="dv-wrap">{zones.map((z) => <Chip key={z.id} onClick={() => go(z.pos.x, z.pos.z, z.name)}>{z.name}</Chip>)}</div></>}
        {obelisks.length > 0 && <><div className="dv-label">Obeliscos</div><div className="dv-wrap">{obelisks.map((p) => <Chip key={p.id} onClick={() => go(p.pos.x, p.pos.z + 12, p.name)}>{p.name}</Chip>)}</div></>}
      </Group>

      <Group title="Multiplicadores" hint="Valem para todos na sala e mudam na hora (0,25× a 25×).">
        {MULTIPLIERS.map(([key, label]) => <Num key={key} label={label} value={Number(game.rules[key])} min={0.25} max={25} step={0.25} unit="×" onChange={(v) => run(() => game.dev.setRule(key, v), `${label}: ${v}×`)} />)}
      </Group>

      <Group>
        <button type="button" className="dv-row w-full text-left" onClick={() => setAllRules((v) => !v)} aria-expanded={allRules}>
          <div className="flex-1 dv-title">Todas as regras da ilha</div><span className="text-[var(--ark-cyan)] font-bold">{allRules ? "Ocultar" : "Mostrar"}</span>
        </button>
        {allRules && RULE_DEFS.filter((r) => !MAIN_RULES.has(r.key)).map((r) => {
          const cur = game.rules[r.key as keyof Rules];
          return typeof cur === "boolean"
            ? <Switch key={r.key} label={r.label} hint={r.hint} checked={cur} onChange={(v) => run(() => game.dev.setWorldRule(r.key, v), `${r.label}: ${v ? "ligado" : "desligado"}`)} />
            : <div key={r.key} className="flex flex-col gap-1"><Num label={r.label} value={Number(cur)} min={r.key === "dayCycleSpeed" ? 0 : r.min ?? 0} max={r.max ?? 25} step={r.step ?? 0.25} onChange={(v) => run(() => game.dev.setWorldRule(r.key, v), `${r.label}: ${v}`)} />{r.hint && <span className="dv-hint">{r.hint}</span>}</div>;
        })}
      </Group>

      <Group title="Recursos e suprimentos">
        <Num label="Raio de reaparecimento" value={radius} onChange={setRadius} min={5} max={500} step={10} unit="m" presets={[30, 70, 150, 300]} />
        <B block onClick={() => run(() => game.dev.refillNodes(radius), "Recursos reaparecidos")}>Reaparecer árvores e rochas no raio</B>
        <B block onClick={() => run(() => game.dev.restoreAllNodes(), "Recursos do mapa restaurados")}>Reaparecer todos os recursos do mapa</B>
        <div className="grid grid-cols-2 gap-2 items-end"><Num label="Pacotes de suprimentos" value={drops} onChange={setDrops} min={1} max={12} /><B variant="amber" onClick={() => run(() => game.dev.dropSupply(drops), "Suprimentos lançados")}>Lançar</B></div>
      </Group>

      {!game.isGuest && <B block variant="primary" onClick={() => run(() => { game.save(); game.notify("Mundo salvo manualmente.", "good"); }, "Mundo salvo")}>Salvar mundo agora</B>}
    </div>
  );
}

function BuildPage({ ctx }: { ctx: Ctx }) {
  const { game, run } = ctx;
  const [structure, setStructure] = useState("campfire");
  const [q, setQ] = useState("");
  const list = Object.values(STRUCTURES).filter((s) => !q.trim() || s.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="flex flex-col gap-2.5 min-h-full">
      <Search value={q} onChange={setQ} placeholder="Buscar estrutura..." />
      {list.length === 0 ? <Empty>Nenhuma estrutura encontrada.</Empty> : <div className="dv-wrap">{list.map((s) => <Chip key={s.id} on={structure === s.id} onClick={() => setStructure(s.id)}>{s.name}</Chip>)}</div>}
      <div className="flex-1" />
      <div className="dv-dock">
        <div className="dv-hint">{game.building.list.length} estruturas no mundo. As criadas aqui têm colisão, inventário e sincronização como as normais.</div>
        <B block variant="primary" onClick={() => run(() => game.dev.spawnStructure(structure), "Estrutura criada")}>Criar {STRUCTURES[structure]?.name} à frente</B>
        <B block onClick={() => run(() => game.dev.repairAll(), "Construções reparadas")}>Reparar todas as construções</B>
      </div>
    </div>
  );
}

function RoomPage({ ctx, item, qty, xpAll, setTarget }: { ctx: Ctx; item: string; qty: number; xpAll: number; setTarget: (t: string) => void }) {
  const { game, run, target } = ctx;
  if (game.net.role === "off") {
    return <Group title="Jogo solo" hint="Todos os comandos DEV se aplicam a você e ao seu mundo. Abra uma sala no menu de multijogador para escolher outros jogadores como alvo." children={null} />;
  }
  if (game.net.role !== "host") {
    return <Group title="Você está como convidado" hint="Você também pode usar seu console DEV. Comandos que alteram o mundo passam pelo anfitrião para manter a partida sincronizada." children={null} />;
  }
  const players = game.net.players();
  const guests = players.filter((p) => p.id !== "host");
  return (
    <div className="flex flex-col gap-2.5">
      <Group title="Jogadores conectados" hint="Escolha quem recebe os comandos das outras abas.">
        {[{ id: "host", name: "Você (anfitrião)" }, ...guests].map((p) => (
          <button key={p.id} type="button" className="dv-item" onClick={() => setTarget(p.id)}>
            <span className="flex-1 font-semibold truncate">{p.name}</span>
            {target === p.id ? <span className="dv-badge good">Selecionado</span> : <span className="dv-badge">Selecionar</span>}
          </button>
        ))}
        {guests.length === 0 && <div className="dv-hint">Nenhum convidado entrou ainda. Compartilhe o código da sala.</div>}
        <div className="dv-hint">Todos os jogadores que desbloquearem o DEV podem usar seus próprios comandos. O anfitrião continua sendo a autoridade do mundo.</div>
      </Group>
      <Group title="Para todos" hint="Usa o item e a quantidade escolhidos na aba Itens.">
        <B block variant="primary" onClick={() => run(() => game.dev.giveItem(item, qty, "all"), "Item enviado a todos")}>Enviar {fmt(qty)} × {ITEMS[item]?.name}</B>
        <B block onClick={() => run(() => game.dev.addXp(xpAll, "all"), "XP concedido a todos")}>Dar {fmt(xpAll)} XP</B>
        <div className="grid grid-cols-2 gap-2">
          <B onClick={() => run(() => game.dev.toggleAllInvincible(true), "Invencíveis")}>Invencibilidade</B>
          <B onClick={() => run(() => game.dev.toggleAllNeeds(true), "Necessidades infinitas")}>Sem fome nem sede</B>
          <B onClick={() => run(() => game.dev.toggleAllWeight(true), "Peso infinito")}>Peso infinito</B>
        </div>
        <B block variant="danger" onClick={() => run(() => { game.dev.toggleAllInvincible(false); game.dev.toggleAllNeeds(false); game.dev.toggleAllWeight(false); }, "Bônus desligados")}>Desligar bônus de todos</B>
      </Group>
      <Group title="Teleporte">
        <B block disabled={target === "host"} onClick={() => run(() => game.dev.teleport(game.player.pos.x + 2, game.player.pos.z + 2, undefined, target), "Jogador trazido")}>Trazer o jogador selecionado até mim</B>
        {target === "host" && <div className="dv-hint">Selecione um convidado acima.</div>}
      </Group>
    </div>
  );
}

// ------------------------------------------------------------------ window
/** Hidden developer console. The password is an in-game gate, not server authentication. */
export function DeveloperPanel({ game, onClose, unlocked, onUnlock }: { game: Game; onClose: () => void; unlocked: boolean; onUnlock: () => void }) {
  const [password, setPassword] = useState("");
  const [gateError, setGateError] = useState("");
  const [page, setPage] = useState<Page>("items");
  const [minimized, setMinimized] = useState(false);
  const [recipient, setRecipient] = useState("host");
  const [item, setItem] = useState("wood");
  const [qty, setQty] = useState(100);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; text: string; id: number } | null>(null);
  const [, redraw] = useState(0);
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  const [pos, setPos] = useState({ x: Number.POSITIVE_INFINITY, y: 6 });
  const [drag, setDrag] = useState<{ sx: number; sy: number; ox: number; oy: number } | null>(null);

  const width = Math.min(600, size.w - 8);
  const height = minimized ? 42 : Math.min(620, size.h - 12);
  const left = clamp(pos.x === Number.POSITIVE_INFINITY ? size.w - width - 6 : pos.x, 4, Math.max(4, size.w - width - 4));
  const top = clamp(pos.y, 4, Math.max(4, size.h - height - 4));

  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => setPos({ x: drag.ox + e.clientX - drag.sx, y: drag.oy + e.clientY - drag.sy });
    const end = () => setDrag(null);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", end); window.removeEventListener("pointercancel", end); };
  }, [drag]);
  useEffect(() => {
    if (!unlocked || minimized) return;
    const t = setInterval(() => redraw((n) => n + 1), 700);
    return () => clearInterval(t);
  }, [unlocked, minimized]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.kind === "err" ? 5000 : 2000);
    return () => clearTimeout(t);
  }, [toast]);

  const run: Run = (fn, ok = "Feito") => {
    try { fn(); setToast({ kind: "ok", text: ok, id: Date.now() }); }
    catch (err) { setToast({ kind: "err", text: (err as Error).message || "Não foi possível aplicar o comando.", id: Date.now() }); }
    redraw((n) => n + 1);
  };

  if (game.state !== "playing") return (
    <Panel title="Console do desenvolvedor" icon="settings" onClose={onClose}>
      <p className="text-sm text-[var(--ark-amber)]">O console só funciona durante a partida.</p>
    </Panel>
  );
  if (!unlocked) return (
    <Panel title="Console do desenvolvedor" icon="settings" onClose={onClose}>
      <form className="mx-auto max-w-xs flex flex-col gap-3" onSubmit={(e) => {
        e.preventDefault();
        if (password === DEV_UNLOCK_CODE) { onUnlock(); setGateError(""); }
        else { setGateError("Senha incorreta. Tente de novo."); setPassword(""); }
      }}>
        <p className="dv-hint">Digite a senha de 5 dígitos. O console fica liberado só neste navegador e abre pelo botão DEV.</p>
        <input className="dv-input text-center text-xl tracking-[.4em]" aria-label="Senha do console" autoFocus autoComplete="off" type="password" inputMode="numeric" maxLength={5} value={password} onChange={(e) => setPassword(e.target.value.replace(/\D/g, ""))} placeholder="•••••" />
        {gateError && <p role="alert" className="text-xs text-[var(--ark-red)]">{gateError}</p>}
        <B variant="primary" block disabled={password.length !== 5} onClick={() => { if (password === DEV_UNLOCK_CODE) { onUnlock(); setGateError(""); } else { setGateError("Senha incorreta. Tente de novo."); setPassword(""); } }}>Desbloquear</B>
      </form>
    </Panel>
  );

  const online = game.net.role === "host";
  const players = online ? game.net.players() : [];
  const guests = players.filter((p) => p.id !== "host");
  // Guests always target themselves for player-local commands; the host keeps the full target selector.
  const target = game.isGuest ? "self" : (recipient === "host" || (recipient === "all" && online) || guests.some((p) => p.id === recipient) ? recipient : "host");
  const targetName = target === "self" || target === "host" ? "você" : target === "all" ? "todos os jogadores" : guests.find((p) => p.id === target)?.name ?? "jogador";
  const ctx: Ctx = { game, run, target, targetName };

  return (
    <div
      className="fixed z-[65] dv-win flex flex-col pointer-events-auto"
      style={{ left, top, width, height }}
      onPointerDown={(e) => e.stopPropagation()}
      // typing in a field must not walk the character, open the inventory or trigger other game shortcuts
      onKeyDown={(e) => { const t = e.target as HTMLElement; if ((t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA") && e.key !== "Escape" && !e.ctrlKey && !e.metaKey) e.stopPropagation(); }}
      onKeyUp={(e) => { const t = e.target as HTMLElement; if (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA") e.stopPropagation(); }}
    >
      <div className="dv-head flex items-center gap-2 px-2.5 h-[42px] shrink-0 touch-none cursor-move" onPointerDown={(e) => { if ((e.target as HTMLElement).closest("button,select")) return; setDrag({ sx: e.clientX, sy: e.clientY, ox: left, oy: top }); }}>
        <span className="text-[var(--ark-cyan)]"><Icon name="settings" size={16} /></span>
        <span className="font-extrabold text-[13px] truncate">Console do desenvolvedor</span>
        <span className="flex-1" />
        {online && !minimized && (
          <select aria-label="Quem recebe os comandos" className="dv-input !w-auto !min-h-[30px] !py-0 text-[12px] max-w-[42vw]" value={target} onChange={(e) => setRecipient(e.target.value)}>
            <option value="host">Alvo: você</option>
            <option value="all">Alvo: todos</option>
            {guests.map((p) => <option key={p.id} value={p.id}>Alvo: {p.name}</option>)}
          </select>
        )}
        <button type="button" aria-label={minimized ? "Expandir console" : "Minimizar console"} className="dv-btn !min-h-[30px] !px-2.5" onClick={() => setMinimized((v) => !v)}>{minimized ? "+" : "−"}</button>
        <button type="button" aria-label="Fechar console" className="dv-btn !min-h-[30px] !px-2.5" onClick={onClose}><Icon name="close" size={14} /></button>
      </div>
      {!minimized && (
        <div className="flex flex-1 min-h-0 relative">
          <nav className="dv-rail w-[62px] shrink-0 overflow-y-auto ark-scroll" aria-label="Seções do console">
            {NAV.map((n) => (
              <button key={n.id} type="button" className={`dv-nav ${page === n.id ? "on" : ""}`} aria-current={page === n.id ? "page" : undefined} onClick={() => setPage(n.id)}>
                <Icon name={n.icon} size={20} /><span>{n.label}</span>
              </button>
            ))}
          </nav>
          <div className="flex-1 min-w-0 overflow-y-auto ark-scroll p-2.5" style={{ touchAction: "pan-y" }}>
            {page === "items" && <ItemsPage ctx={ctx} item={item} setItem={setItem} qty={qty} setQty={setQty} />}
            {page === "player" && <PlayerPage key={target} ctx={ctx} />}
            {page === "creatures" && <CreaturesPage ctx={ctx} item={item} qty={qty} />}
            {page === "world" && <WorldPage ctx={ctx} />}
            {page === "build" && <BuildPage ctx={ctx} />}
            {page === "room" && <RoomPage ctx={ctx} item={item} qty={qty} xpAll={1000} setTarget={setRecipient} />}
          </div>
          {toast && (
            <div key={toast.id} role={toast.kind === "err" ? "alert" : "status"} className="absolute left-1/2 -translate-x-1/2 bottom-3 z-20 max-w-[92%] px-3 py-1.5 rounded-full text-[12.5px] font-bold shadow-lg pointer-events-none" style={{ background: toast.kind === "err" ? "#7a1f1c" : "#0f6f88", color: "#fff", border: `1px solid ${toast.kind === "err" ? "#ff9a92" : "#7ff0ff"}` }}>
              {toast.kind === "ok" ? "✓ " : ""}{toast.text}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
