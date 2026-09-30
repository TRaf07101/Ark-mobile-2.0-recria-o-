import { useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import type { Game } from "../game";
import {
  DEFAULT_SETTINGS, DEFAULT_RULES, PRESETS, GRAPHICS_KEYS, LEVEL_LABEL, SHADOW_LABEL, RULE_DEFS, VIEW_METERS,
  type Settings, type Rules, type Quality,
} from "../core/settings";
import { audio } from "../core/audio";
import { enterFullscreenLandscape, exitFullscreen, isFullscreen } from "../core/fullscreen";
import { Btn, Panel } from "./common";
import { type Appearance } from "../entities/player";
import { CharacterCreator } from "./CharacterCreator";
import { Icon } from "./svg";
import { ControlLayoutEditor } from "./ControlEditor";

const click = () => audio.play("menu_click", 0.8);
const hover = () => audio.play("menu_hover", 0.5);

// ------------------------------------------------------------------ shared pieces
export function Logo({ size = "big" }: { size?: "big" | "small" }) {
  const big = size === "big";
  return (
    <div className="select-none leading-none">
      <div className="ark-font font-bold" style={{ fontSize: big ? "clamp(38px, min(10vw, 15vh), 104px)" : 40, letterSpacing: "0.06em", background: "linear-gradient(180deg,#ffffff 0%,#d9f6ff 35%,#6fc8e0 70%,#2c7a94 100%)", WebkitBackgroundClip: "text", color: "transparent", filter: "drop-shadow(0 3px 0 rgba(0,0,0,.55)) drop-shadow(0 0 22px rgba(94,230,255,.25))" }}>
        ARK
      </div>
      <div className="ark-font font-semibold" style={{ fontSize: big ? "clamp(11px, min(2vw, 3vh), 19px)" : 11, letterSpacing: "0.52em", color: "#dff6fb", marginTop: big ? 2 : 0, textShadow: "0 2px 4px #000" }}>
        MOBILE <span style={{ color: "var(--ark-amber)" }}>2.0</span>
      </div>
    </div>
  );
}

/** Large text button in the style of the original main menu (left column). */
function MenuItem({ label, sub, onClick, accent, compact }: { label: string; sub?: string; onClick: () => void; accent?: boolean; compact?: boolean }) {
  return (
    <button onMouseEnter={hover} onClick={() => { click(); onClick(); }} className="group relative text-left pl-4 pr-6 py-[max(2px,0.6vh)] ark-menu-item shrink-0">
      <span className="absolute left-0 top-1/2 -translate-y-1/2 h-[70%] w-[3px] bg-[var(--ark-cyan)] scale-y-0 group-hover:scale-y-100 group-active:scale-y-100 transition-transform origin-center" style={{ boxShadow: "0 0 10px var(--ark-cyan)" }} />
      <span className={`ark-font block font-bold uppercase tracking-[0.12em] transition-all group-hover:translate-x-1.5 group-hover:text-[var(--ark-cyan)] ${accent ? "text-[var(--ark-amber)]" : "text-white"}`} style={{ fontSize: compact ? "clamp(15px, min(2.5vw, 4.2vh), 24px)" : "clamp(16px, min(3.2vw, 5.4vh), 30px)", textShadow: "0 2px 6px rgba(0,0,0,.9)" }}>
        {label}
      </span>
      {sub && <span className="block text-[clamp(9px,1.8vh,11px)] text-white/55 tracking-wider -mt-0.5">{sub}</span>}
    </button>
  );
}

/** One-tap fullscreen + landscape control (used in Options and in the pause menu). */
export function FullscreenRow({ settings, onChange }: { settings?: Settings; onChange?: (s: Partial<Settings>) => void }) {
  const [fs, setFs] = useState(isFullscreen());
  const [msg, setMsg] = useState("");
  useEffect(() => {
    const f = () => setFs(isFullscreen());
    document.addEventListener("fullscreenchange", f);
    document.addEventListener("webkitfullscreenchange", f);
    return () => { document.removeEventListener("fullscreenchange", f); document.removeEventListener("webkitfullscreenchange", f); };
  }, []);
  const toggle = async () => {
    click();
    if (fs) { await exitFullscreen(); setMsg(""); }
    else { const r = await enterFullscreenLandscape(); setMsg(r.message ?? ""); }
    setFs(isFullscreen());
  };
  return (
    <div className="ark-card p-2 mb-2 flex flex-wrap items-center gap-3">
      <button onClick={toggle} className={`ark-btn ${fs ? "" : "primary"} !py-2.5 !px-4`}>
        <Icon name={fs ? "close" : "rotate"} size={18} />
        {fs ? "Sair da Tela Cheia" : "Tela Cheia + Paisagem"}
      </button>
      <div className="flex-1 min-w-[160px] text-[11px] text-white/60 leading-snug">
        {fs ? "Jogo em tela cheia na horizontal." : "Um toque: esconde as barras do navegador e trava a tela na horizontal."}
        {msg && <div className="text-[var(--ark-amber)]">{msg}</div>}
      </div>
      {settings && onChange && (
        <div className="min-w-[200px]"><CheckRow label="Tela cheia ao iniciar o jogo" value={settings.autoFullscreen} onChange={(v) => onChange({ autoFullscreen: v })} /></div>
      )}
    </div>
  );
}

const fmtNum = (v: number, step = 0.01) => (step >= 1 ? String(Math.round(v)) : v.toFixed(step >= 0.1 ? 1 : 2));

function SliderRow({ label, value, min, max, step, onChange, display, hint }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; display?: string; hint?: string }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="py-1.5">
      <div className="flex justify-between items-baseline">
        <span className="text-[12px] font-semibold uppercase tracking-wider text-white/90">{label}</span>
        <span className="ark-font text-[13px] text-[var(--ark-cyan)] font-bold">{display ?? fmtNum(value, step)}</span>
      </div>
      <input type="range" className="ark-slider w-full" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ background: `linear-gradient(90deg, var(--ark-cyan) ${pct}%, rgba(120,220,240,.18) ${pct}%)` }} />
      {hint && <div className="text-[10px] text-white/40 -mt-0.5">{hint}</div>}
    </div>
  );
}

function CheckRow({ label, value, onChange, hint }: { label: string; value: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <button className="flex items-start gap-2.5 py-1.5 w-full text-left" onClick={() => { click(); onChange(!value); }}>
      <span className="mt-0.5 w-[18px] h-[18px] shrink-0 flex items-center justify-center" style={{ border: "2px solid " + (value ? "var(--ark-cyan)" : "rgba(160,220,235,.45)"), background: value ? "rgba(94,230,255,.18)" : "rgba(0,0,0,.35)", boxShadow: value ? "0 0 8px rgba(94,230,255,.4)" : "none" }}>
        {value && <Icon name="check" size={13} color="var(--ark-cyan)" />}
      </span>
      <span>
        <span className="block text-[12px] font-semibold uppercase tracking-wider text-white/90">{label}</span>
        {hint && <span className="block text-[10px] text-white/40">{hint}</span>}
      </span>
    </button>
  );
}

function SegRow({ label, options, value, onChange }: { label: string; options: string[]; value: number; onChange: (i: number) => void }) {
  return (
    <div className="py-1.5">
      <div className="text-[12px] font-semibold uppercase tracking-wider text-white/90 mb-1">{label}</div>
      <div className="flex flex-wrap gap-1">
        {options.map((o, i) => (
          <button key={o} onClick={() => { click(); onChange(i); }} className={`ark-font px-2.5 py-1 text-[12px] font-bold uppercase tracking-wider border ${value === i ? "border-[var(--ark-cyan)] text-[var(--ark-cyan)] bg-[var(--ark-cyan)]/12" : "border-white/15 text-white/60 bg-black/30"}`}>{o}</button>
        ))}
      </div>
    </div>
  );
}

/** Full-screen frame used by Options / Host screens (dark translucent panel, header tabs, bottom bar). */
function Frame({ title, tabs, tab, setTab, children, footer }: { title: string; tabs: [string, string][]; tab: string; setTab: (t: string) => void; children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-[60] flex flex-col" style={{ background: "linear-gradient(180deg, rgba(2,10,14,.82), rgba(2,10,14,.93))" }} onPointerDown={(e) => e.stopPropagation()}>
      <div className="flex items-end gap-4 px-[3vw] pt-3 border-b border-[var(--ark-line)]">
        <div className="ark-font text-[22px] font-bold tracking-[0.2em] text-white pb-2 mr-4">{title}</div>
        <div className="flex gap-0 overflow-x-auto">
          {tabs.map(([k, l]) => (
            <button key={k} onClick={() => { click(); setTab(k); }} className={`ark-font px-4 pb-2 pt-1 text-[14px] font-bold uppercase tracking-[0.14em] border-b-2 whitespace-nowrap ${tab === k ? "text-[var(--ark-cyan)] border-[var(--ark-cyan)]" : "text-white/55 border-transparent"}`} style={tab === k ? { textShadow: "0 0 10px rgba(94,230,255,.6)" } : undefined}>{l}</button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto ark-scroll px-[3vw] py-3" style={{ touchAction: "pan-y" }}>{children}</div>
      <div className="flex items-center justify-end gap-2 px-[3vw] py-2.5 border-t border-[var(--ark-line)] bg-black/40">{footer}</div>
    </div>
  );
}

// ------------------------------------------------------------------ main menu
const NEWS = [
  { t: "Atualização 4.0 — Uma nova geração", d: "Modelos de dinossauros reconstruídos com pele contínua e esqueleto, sobrevivente redesenhado, novos obeliscos e menus completos." },
  { t: "Opções avançadas", d: "Predefinições gráficas, bloom, anti-aliasing, distância de visão, sombras, sensibilidade por eixo, nomes flutuantes e muito mais." },
  { t: "Host / Local", d: "Configure sua ilha: dificuldade, multiplicadores de XP, domesticação, coleta, ciclo dia/noite, reprodução e resistência." },
];

export function MainMenu({ game, onContinue, onHost, onSettings, onHelp, onCredits, onMultiplayer }: { game: Game; onContinue: () => void; onHost: () => void; onSettings: () => void; onHelp: () => void; onCredits: () => void; onMultiplayer: () => void }) {
  const info = game.saveInfo();
  return (
    <div className="absolute inset-0 z-40 text-white ark-fade-in" style={{ background: "linear-gradient(90deg, rgba(0,6,10,.9) 0%, rgba(0,6,10,.55) 38%, rgba(0,6,10,0) 64%), linear-gradient(0deg, rgba(0,0,0,.6) 0%, rgba(0,0,0,0) 30%)" }}>
      <div className="absolute left-[5vw] top-[4vh] bottom-[5vh] flex flex-col justify-between gap-[2vh] max-w-[60vw]">
      <div className="shrink-0"><Logo /></div>
      <div className="flex flex-col gap-0.5 min-h-0 overflow-y-auto ark-scroll" style={{ touchAction: "pan-y" }}>
        {info && <MenuItem label="Continuar" sub={`A Ilha · Nível ${info.level} · Dia ${info.day}`} onClick={onContinue} accent />}
        <MenuItem label="Host / Local" sub="Criar uma ilha single player" onClick={onHost} />
        <MenuItem label="Multijogador" sub="Entrar na ilha de um amigo com código" onClick={onMultiplayer} />
        <MenuItem label="Opções" onClick={onSettings} />
        <MenuItem label="Manual do Sobrevivente" onClick={onHelp} />
        <MenuItem label="Créditos" onClick={onCredits} />
      </div>
      </div>
      <div className="absolute right-[3vw] top-[6vh] w-[min(300px,34vw)] hidden sm:block">
        <div className="ark-panel p-3">
          <div className="ark-font text-[13px] font-bold tracking-[0.2em] text-[var(--ark-cyan)] mb-2">NOTÍCIAS DA ARK</div>
          {NEWS.map((n) => (
            <div key={n.t} className="mb-2 last:mb-0">
              <div className="text-[12px] font-bold">{n.t}</div>
              <div className="text-[11px] text-white/60 leading-snug">{n.d}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="absolute right-3 bottom-2 text-[10px] text-white/40 text-right">v4.0 · Projeto de fã inspirado em ARK: Survival Evolved · Não afiliado à Studio Wildcard</div>
    </div>
  );
}

export function CreditsScreen({ onClose }: { onClose: () => void }) {
  return (
    <Panel title="Créditos" icon="note" onClose={onClose}>
      <div className="text-center flex flex-col gap-2 py-2 text-sm">
        <Logo size="small" />
        <div className="text-white/70 mt-2">Um projeto de fã, construído do zero em WebGL (three.js) com modelos, texturas, sons e música 100% procedurais.</div>
        <div className="ark-label mt-2">Tecnologia</div><div>React · TypeScript · three.js · Web Audio</div>
        <div className="ark-label mt-2">Inspiração</div><div>ARK: Survival Evolved / ARK: Ultimate Mobile Edition — Studio Wildcard. Todas as marcas pertencem aos seus donos; nenhum asset original foi utilizado.</div>
      </div>
    </Panel>
  );
}

// ------------------------------------------------------------------ Host / Local
export function HostScreen({ game, hasSave, onPlay, onBack }: { game: Game; hasSave: boolean; onPlay: (seed: number, rules: Rules) => void; onBack: () => void }) {
  const [tab, setTab] = useState("general");
  const [rules, setRules] = useState<Rules>(() => {
    try { const r = localStorage.getItem("ark_mobile_2_rules"); return r ? { ...DEFAULT_RULES, ...JSON.parse(r) } : { ...DEFAULT_RULES }; } catch { return { ...DEFAULT_RULES }; }
  });
  const [seedText, setSeedText] = useState("");
  const [confirm, setConfirm] = useState(false);
  const preview = useMemo(() => game.mapCanvas?.toDataURL() ?? "", [game.mapCanvas]);
  const set = (k: keyof Rules, v: number | boolean) => setRules((r) => ({ ...r, [k]: v }));
  const play = () => {
    try { localStorage.setItem("ark_mobile_2_rules", JSON.stringify(rules)); } catch { /* ignore */ }
    let seed = Math.floor(Math.random() * 1e9);
    if (seedText.trim()) { const n = Number(seedText); seed = Number.isFinite(n) ? Math.floor(Math.abs(n)) : [...seedText].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7); }
    onPlay(seed, rules);
  };
  const defs = RULE_DEFS.filter((d) => d.tab === tab);
  return (
    <Frame title="HOST / LOCAL" tabs={[["general", "Geral"], ["advanced", "Avançado"]]} tab={tab} setTab={setTab} footer={
      <>
        <Btn variant="ghost" onClick={() => { click(); setRules({ ...DEFAULT_RULES }); }}>Restaurar Padrões</Btn>
        <div className="flex-1" />
        <Btn onClick={() => { click(); onBack(); }}>Voltar</Btn>
        {confirm ? (
          <><span className="text-[11px] text-[var(--ark-red)]">Isso substituirá o jogo salvo.</span><Btn variant="danger" onClick={play}>Confirmar</Btn></>
        ) : (
          <Btn variant="primary" icon="dino" onClick={() => { click(); if (hasSave) setConfirm(true); else play(); }}>Jogar Single Player</Btn>
        )}
      </>
    }>
      <div className="flex flex-wrap gap-6">
        <div className="flex-1 min-w-[280px] grid grid-cols-1 lg:grid-cols-2 gap-x-6">
          {defs.map((d) =>
            typeof DEFAULT_RULES[d.key] === "boolean" ? (
              <CheckRow key={d.key} label={d.label} hint={d.hint} value={rules[d.key] as boolean} onChange={(v) => set(d.key, v)} />
            ) : (
              <SliderRow key={d.key} label={d.label} hint={d.hint} value={rules[d.key] as number} min={d.min!} max={d.max!} step={d.step!} onChange={(v) => set(d.key, v)} display={d.key === "difficulty" ? `${(rules.difficulty as number).toFixed(1)} (Nv máx ${Math.round(30 * rules.difficulty)})` : d.key === "maxWildCreatures" ? String(rules[d.key]) : `${(rules[d.key] as number).toFixed(2)}×`} />
            ),
          )}
        </div>
        <div className="w-[min(320px,100%)] flex flex-col gap-2">
          <div className="ark-label">Mapa</div>
          <div className="ark-panel p-2">
            <div className="relative overflow-hidden" style={{ aspectRatio: "16/10" }}>
              {preview && <img src={preview} alt="" className="absolute inset-0 w-full h-full object-cover" style={{ filter: "saturate(1.1) contrast(1.05)" }} />}
              <div className="absolute inset-0" style={{ background: "linear-gradient(0deg, rgba(0,0,0,.75), rgba(0,0,0,0) 55%)" }} />
              <div className="absolute left-2 bottom-1.5">
                <div className="ark-font text-[22px] font-bold tracking-wider">A ILHA</div>
                <div className="text-[10px] text-white/70">640 m · 5 biomas · 3 obeliscos · ruínas · oceano</div>
              </div>
            </div>
          </div>
          <label className="ark-label mt-1">Semente do mundo (opcional)</label>
          <input value={seedText} onChange={(e) => setSeedText(e.target.value)} placeholder="Aleatória" maxLength={24} className="bg-black/50 border border-[var(--ark-line)] px-2 py-1.5 text-sm outline-none focus:border-[var(--ark-cyan)]" />
          <div className="text-[10px] text-white/40">A prévia mostra o mapa do menu; mundos com sementes diferentes geram ilhas diferentes.</div>
        </div>
      </div>
    </Frame>
  );
}

// ------------------------------------------------------------------ Options
export function SettingsScreen({ settings, onChange, onClose, onDeleteSave, inGame, onResetTutorial }: { settings: Settings; onChange: (s: Partial<Settings>) => void; onClose: () => void; onDeleteSave?: () => void; inGame?: boolean; onResetTutorial?: () => void }) {
  const [tab, setTab] = useState("graphics");
  const [confirmDel, setConfirmDel] = useState(false);
  const [editingCtl, setEditingCtl] = useState(false);
  const S = settings;
  // any manual graphics change switches the preset to "custom" (as in the original)
  const g = (p: Partial<Settings>) => onChange({ ...p, quality: "custom" });
  const preset = (q: Quality) => onChange(q === "custom" ? { quality: q } : { ...PRESETS[q], quality: q });
  const qualities: [Quality, string][] = [["low", "Baixo"], ["medium", "Médio"], ["high", "Alto"], ["epic", "Épico"], ["custom", "Personalizado"]];
  const resetTab = () => {
    const keys: Record<string, (keyof Settings)[]> = {
      graphics: [...GRAPHICS_KEYS, "quality", "colorGrading", "filmGrain", "dynamicRes", "animationStaggering", "gamma", "showFps"],
      audio: ["masterVolume", "musicVolume", "sfxVolume", "ambientVolume", "disableMenuMusic", "inventorySounds", "craftingSounds"],
      camera: ["fov", "cameraShake", "sensX", "sensY", "invertY", "thirdPersonOffset", "disableCameraInterpolation", "viewBob", "firstPersonRiding", "cameraDistance"],
      hud: ["uiScale", "hotbarScale", "hotbarLayout", "floatingNames", "statusNotifications", "fahrenheit", "crosshair", "hitMarkers", "floatingDamage", "bloodOverlay", "torpidityEffect", "menuTransitions", "tutorial", "minimap", "compass"],
      controls: ["buttonScale", "buttonOpacity", "joystickSize", "controlLayout", "autoSprint", "pauseInMenus", "vibration", "autoFullscreen"],
    };
    const p: Partial<Settings> = {};
    for (const k of keys[tab]) (p as Record<string, unknown>)[k] = DEFAULT_SETTINGS[k];
    onChange(p);
  };
  const cols = "grid grid-cols-1 md:grid-cols-2 gap-x-10";
  return (
    <Frame title="OPÇÕES" tab={tab} setTab={setTab} tabs={[["graphics", "Gráficos"], ["audio", "Áudio"], ["camera", "Câmera"], ["hud", "Interface"], ["controls", "Controles"]]} footer={
      <>
        {onDeleteSave && !inGame && (confirmDel ? (
          <><span className="text-[11px] text-[var(--ark-red)]">Apagar o save permanentemente?</span><Btn variant="danger" onClick={() => { onDeleteSave(); setConfirmDel(false); }}>Apagar</Btn><Btn onClick={() => setConfirmDel(false)}>Não</Btn></>
        ) : <Btn variant="danger" onClick={() => setConfirmDel(true)}>Apagar Jogo Salvo</Btn>)}
        <div className="flex-1" />
        <Btn variant="ghost" onClick={() => { click(); resetTab(); }}>Restaurar Aba</Btn>
        <Btn variant="primary" onClick={() => { click(); onClose(); }}>Aplicar e Voltar</Btn>
      </>
    }>
      {tab === "graphics" && (
        <>
          <FullscreenRow settings={S} onChange={onChange} />
          <SegRow label="Qualidade Gráfica" options={qualities.map((q) => q[1])} value={qualities.findIndex((q) => q[0] === S.quality)} onChange={(i) => preset(qualities[i][0])} />
          <div className={cols}>
            <div>
              <SliderRow label="Escala de Resolução" value={S.resolutionScale} min={0.5} max={2} step={0.05} display={`${Math.round(S.resolutionScale * 100)}%`} hint="Acima de 100% renderiza em supersampling (mais nítido, mais pesado)" onChange={(v) => g({ resolutionScale: v })} />
              <SegRow label="Distância de Visão" options={LEVEL_LABEL.map((l, i) => `${l} (${VIEW_METERS[i]}m)`)} value={S.viewDistance} onChange={(i) => g({ viewDistance: i as 0 | 1 | 2 | 3 })} />
              <SegRow label="Sombras Gerais" options={SHADOW_LABEL} value={S.shadows} onChange={(i) => g({ shadows: i as 0 | 1 | 2 | 3 | 4 })} />
              <SliderRow label="Qualidade do Céu" value={S.skyQuality} min={0} max={1} step={0.05} display={`${Math.round(S.skyQuality * 100)}%`} hint="Abaixo de 25% desliga as nuvens" onChange={(v) => g({ skyQuality: v })} />
              <SliderRow label="Densidade da Vegetação Rasteira" value={S.groundClutterDensity} min={0} max={1} step={0.05} display={`${Math.round(S.groundClutterDensity * 100)}%`} onChange={(v) => g({ groundClutterDensity: v })} />
              <SliderRow label="Distância da Vegetação Rasteira" value={S.groundClutterDistance} min={0} max={1} step={0.05} display={`${Math.round(S.groundClutterDistance * 100)}%`} onChange={(v) => g({ groundClutterDistance: v })} />
              <SliderRow label="Nível de Detalhe dos Modelos" value={S.meshLod} min={0} max={1} step={0.05} display={`${Math.round(S.meshLod * 100)}%`} hint="Distância de criaturas, decoração e partículas" onChange={(v) => g({ meshLod: v })} />
              <SliderRow label="Brilho (Gama)" value={S.gamma} min={0.6} max={1.6} step={0.05} onChange={(v) => onChange({ gamma: v })} />
            </div>
            <div>
              <CheckRow label="Anti-Aliasing (SMAA)" value={S.antiAliasing} onChange={(v) => g({ antiAliasing: v })} hint="Suaviza bordas (custo de desempenho)" />
              <CheckRow label="Brilho de Luz (Bloom)" value={S.lightBloom} onChange={(v) => g({ lightBloom: v })} hint="Halo em fogueiras, obeliscos e sol" />
              <CheckRow label="Filtro Anisotrópico de Alta Qualidade" value={S.anisotropic} onChange={(v) => g({ anisotropic: v })} />
              <CheckRow label="Correção de Cor" value={S.colorGrading} onChange={(v) => onChange({ colorGrading: v })} />
              <CheckRow label="Granulação de Filme" value={S.filmGrain} onChange={(v) => onChange({ filmGrain: v })} />
              <CheckRow label="Resolução Dinâmica" value={S.dynamicRes} onChange={(v) => onChange({ dynamicRes: v })} hint="Reduz a resolução se o FPS cair" />
              <CheckRow label="Escalonamento de Animação" value={S.animationStaggering} onChange={(v) => onChange({ animationStaggering: v })} hint="Criaturas distantes animam com menos quadros" />
              <CheckRow label="Mostrar FPS" value={S.showFps} onChange={(v) => onChange({ showFps: v })} />
            </div>
          </div>
        </>
      )}
      {tab === "audio" && (
        <div className={cols}>
          <div>
            <SliderRow label="Volume Geral" value={S.masterVolume} min={0} max={1} step={0.05} display={`${Math.round(S.masterVolume * 100)}%`} onChange={(v) => onChange({ masterVolume: v })} />
            <SliderRow label="Volume da Música" value={S.musicVolume} min={0} max={1} step={0.05} display={`${Math.round(S.musicVolume * 100)}%`} onChange={(v) => onChange({ musicVolume: v })} />
            <SliderRow label="Volume de Efeitos" value={S.sfxVolume} min={0} max={1} step={0.05} display={`${Math.round(S.sfxVolume * 100)}%`} onChange={(v) => onChange({ sfxVolume: v })} />
            <SliderRow label="Volume do Ambiente" value={S.ambientVolume} min={0} max={1} step={0.05} display={`${Math.round(S.ambientVolume * 100)}%`} onChange={(v) => onChange({ ambientVolume: v })} />
          </div>
          <div>
            <CheckRow label="Desativar Música do Menu" value={S.disableMenuMusic} onChange={(v) => onChange({ disableMenuMusic: v })} />
            <CheckRow label="Som ao Abrir Inventário" value={S.inventorySounds} onChange={(v) => onChange({ inventorySounds: v })} />
            <CheckRow label="Sons de Criação" value={S.craftingSounds} onChange={(v) => onChange({ craftingSounds: v })} />
          </div>
        </div>
      )}
      {tab === "camera" && (
        <div className={cols}>
          <div>
            <SliderRow label="Campo de Visão (FOV)" value={S.fov} min={50} max={100} step={1} display={`${S.fov}°`} onChange={(v) => onChange({ fov: v })} />
            <SliderRow label="Escala do Tremor da Câmera" value={S.cameraShake} min={0} max={1.5} step={0.05} display={`${Math.round(S.cameraShake * 100)}%`} onChange={(v) => onChange({ cameraShake: v })} />
            <SliderRow label="Sensibilidade Esquerda/Direita" value={S.sensX} min={0.2} max={3} step={0.05} onChange={(v) => onChange({ sensX: v })} />
            <SliderRow label="Sensibilidade Cima/Baixo" value={S.sensY} min={0.2} max={3} step={0.05} onChange={(v) => onChange({ sensY: v })} />
            <SliderRow label="Distância da Câmera em 3ª Pessoa" value={S.cameraDistance} min={2} max={9} step={0.25} display={`${S.cameraDistance.toFixed(1)} m`} onChange={(v) => onChange({ cameraDistance: v })} />
          </div>
          <div>
            <CheckRow label="Inverter Eixo Y" value={S.invertY} onChange={(v) => onChange({ invertY: v })} />
            <CheckRow label="Deslocamento da Câmera em 3ª Pessoa" value={S.thirdPersonOffset} onChange={(v) => onChange({ thirdPersonOffset: v })} hint="Câmera sobre o ombro mesmo sem arma" />
            <CheckRow label="Desativar Interpolação da Câmera" value={S.disableCameraInterpolation} onChange={(v) => onChange({ disableCameraInterpolation: v })} hint="Movimento mais direto; reduz enjoo" />
            <CheckRow label="Balanço da Visão (1ª Pessoa)" value={S.viewBob} onChange={(v) => onChange({ viewBob: v })} />
            <CheckRow label="Montaria em 1ª Pessoa" value={S.firstPersonRiding} onChange={(v) => onChange({ firstPersonRiding: v })} />
          </div>
        </div>
      )}
      {tab === "hud" && (
        <div className={cols}>
          <div>
            <SliderRow label="Escala Geral da Interface" value={S.uiScale} min={0.7} max={1} step={0.05} display={`${Math.round(S.uiScale * 100)}%`} onChange={(v) => onChange({ uiScale: v })} />
            <SegRow label="Layout da Barra Rápida" options={["Clássica (10 em linha)", "Mobile (5 + 5, canto inferior direito)"]} value={S.hotbarLayout === "mobile" ? 1 : 0} onChange={(i) => onChange({ hotbarLayout: i === 1 ? "mobile" : "classic" })} />
            <SliderRow label="Escala da Barra de Itens" value={S.hotbarScale} min={0.7} max={1.3} step={0.05} display={`${Math.round(S.hotbarScale * 100)}%`} onChange={(v) => onChange({ hotbarScale: v })} />
            <CheckRow label="Nomes Flutuantes" value={S.floatingNames} onChange={(v) => onChange({ floatingNames: v })} hint="Nome e nível sobre criaturas domesticadas" />
            <CheckRow label="Notificações de Status" value={S.statusNotifications} onChange={(v) => onChange({ statusNotifications: v })} />
            <CheckRow label="Temperatura em Fahrenheit" value={S.fahrenheit} onChange={(v) => onChange({ fahrenheit: v })} />
            <CheckRow label="Missões do Tutorial" value={S.tutorial} onChange={(v) => onChange({ tutorial: v })} />
            {onResetTutorial && <Btn variant="ghost" className="mt-1" onClick={() => { click(); onResetTutorial(); }}>Reiniciar Tutoriais</Btn>}
          </div>
          <div>
            <CheckRow label="Permitir Mira (Crosshair)" value={S.crosshair} onChange={(v) => onChange({ crosshair: v })} />
            <CheckRow label="Permitir Marcadores de Acerto" value={S.hitMarkers} onChange={(v) => onChange({ hitMarkers: v })} />
            <CheckRow label="Texto de Dano Flutuante" value={S.floatingDamage} onChange={(v) => onChange({ floatingDamage: v })} />
            <CheckRow label="Sobreposição de Dano (Sangue)" value={S.bloodOverlay} onChange={(v) => onChange({ bloodOverlay: v })} />
            <CheckRow label="Efeito de Torpor" value={S.torpidityEffect} onChange={(v) => onChange({ torpidityEffect: v })} />
            <CheckRow label="Minimapa" value={S.minimap} onChange={(v) => onChange({ minimap: v })} />
            <CheckRow label="Bússola" value={S.compass} onChange={(v) => onChange({ compass: v })} />
            <CheckRow label="Transições de Menu" value={S.menuTransitions} onChange={(v) => onChange({ menuTransitions: v })} />
          </div>
        </div>
      )}
      {tab === "controls" && (
        <>
        <FullscreenRow settings={S} onChange={onChange} />
        <div className="ark-card p-2 mb-2 flex flex-wrap items-center gap-3">
          <button onClick={() => { click(); setEditingCtl(true); }} className="ark-btn primary !py-2.5 !px-4">
            <Icon name="settings" size={18} />
            Editar Layout dos Controles
          </button>
          <div className="flex-1 min-w-[180px] text-[11px] text-white/60 leading-snug">
            Arraste cada botão para onde quiser e ajuste o tamanho e a opacidade de cada um. Os controles abaixo valem como padrão para todos.
            {Object.keys(S.controlLayout ?? {}).length > 0 && <div className="text-[var(--ark-amber)]">Layout personalizado ativo ({Object.keys(S.controlLayout).length} botão(ões) alterado(s)).</div>}
          </div>
          {Object.keys(S.controlLayout ?? {}).length > 0 && <Btn variant="ghost" onClick={() => { click(); onChange({ controlLayout: {} }); }}>Restaurar posições</Btn>}
        </div>
        {editingCtl && <ControlLayoutEditor settings={S} onChange={onChange} onClose={() => setEditingCtl(false)} />}
        <div className={cols}>
          <div>
            <SliderRow label="Tamanho dos Botões" value={S.buttonScale} min={0.7} max={1.35} step={0.05} display={`${Math.round(S.buttonScale * 100)}%`} onChange={(v) => onChange({ buttonScale: v })} />
            <SliderRow label="Opacidade dos Botões" value={S.buttonOpacity} min={0.3} max={1} step={0.05} display={`${Math.round(S.buttonOpacity * 100)}%`} onChange={(v) => onChange({ buttonOpacity: v })} />
            <SliderRow label="Tamanho do Joystick" value={S.joystickSize} min={0.7} max={1.4} step={0.05} display={`${Math.round(S.joystickSize * 100)}%`} onChange={(v) => onChange({ joystickSize: v })} />
          </div>
          <div>
            <CheckRow label="Correr ao Empurrar o Joystick" value={S.autoSprint} onChange={(v) => onChange({ autoSprint: v })} hint="Empurrar até a borda ativa a corrida" />
            <CheckRow label="Pausar com Menus Abertos" value={S.pauseInMenus} onChange={(v) => onChange({ pauseInMenus: v })} />
            <CheckRow label="Vibração" value={S.vibration} onChange={(v) => onChange({ vibration: v })} hint="Ao receber dano (dispositivos compatíveis)" />
            <div className="text-[11px] text-white/45 mt-3 leading-relaxed">Teclado: WASD mover · Mouse olhar · Clique atacar · E interagir · G gerenciar · Espaço pular · Shift correr · 1–0 barra · I inventário · M mapa · V câmera · T munição · R/Q construção · Z/X/C apitos · F desmontar · Esc menu</div>
          </div>
        </div>
        </>
      )}
    </Frame>
  );
}

// ------------------------------------------------------------------ Pause (in-game menu)
export function PauseMenu({ game, settings, onChange, onResume, onSettings, onSave, onQuit, onHelp, onUnstuck, onSuicide, onMultiplayer, onDeveloper }: { game: Game; settings: Settings; onChange: (s: Partial<Settings>) => void; onResume: () => void; onSettings: () => void; onSave: () => void; onQuit: () => void; onHelp: () => void; onUnstuck: () => void; onSuicide: () => void; onMultiplayer: () => void; onDeveloper: () => void }) {
  const [confirm, setConfirm] = useState<"" | "suicide" | "quit">("");
  const developerHold = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logoTaps = useRef({ count: 0, last: 0 });
  useEffect(() => () => { if (developerHold.current) clearTimeout(developerHold.current); }, []);
  const stopHold = () => { if (developerHold.current) clearTimeout(developerHold.current); developerHold.current = null; };
  const [side, setSide] = useState<"info" | "settings">("settings");
  const h = game.hud();
  const hh = Math.floor(h.hour), mm = Math.floor((h.hour - hh) * 60);
  const S = settings;
  const qualities: [Quality, string][] = [["low", "Baixo"], ["medium", "Médio"], ["high", "Alto"], ["epic", "Épico"]];
  return (
    <div className="absolute inset-0 z-50 text-white ark-fade-in flex" style={{ background: "linear-gradient(90deg, rgba(0,6,10,.985) 0%, rgba(0,6,10,.9) 45%, rgba(0,6,10,.72) 100%)" }} onPointerDown={(e) => e.stopPropagation()}>
      {/* left: logo + menu list (own scroll area, never overlapped) */}
      <div className="flex flex-col min-w-0 shrink-0 pl-[4vw] pr-4 py-3" style={{ width: "min(46%, 420px)" }}>
        <button aria-label="Logo ARK" className="shrink-0 mb-2 self-start text-left" onPointerDown={() => { stopHold(); developerHold.current = setTimeout(onDeveloper, 1500); }} onPointerUp={stopHold} onPointerCancel={stopHold} onPointerLeave={stopHold} onClick={() => { const now = Date.now(); logoTaps.current.count = now - logoTaps.current.last < 700 ? logoTaps.current.count + 1 : 1; logoTaps.current.last = now; if (logoTaps.current.count >= 7) { logoTaps.current.count = 0; onDeveloper(); } }}><Logo size="small" /></button>
        <div className="flex-1 min-h-0 overflow-y-auto ark-scroll" style={{ touchAction: "pan-y" }}>
          {/* min-h-full + justify-center keeps the list centered when it fits, and scrollable from the top when it doesn't */}
          <div className="min-h-full flex flex-col justify-center py-1">
          <MenuItem compact label="Retomar" onClick={onResume} accent />
          <MenuItem compact label="Configurações" sub="Gráficos, áudio, câmera, interface e controles" onClick={onSettings} />
          <MenuItem compact label="Multijogador" sub={game.net.active ? `Sala ${game.net.code} · ${game.net.playerCount()} jogador(es)` : "Abrir esta ilha para amigos"} onClick={onMultiplayer} />
          {!game.isGuest && <MenuItem compact label="Salvar Jogo" onClick={onSave} />}
          <MenuItem compact label="Manual do Sobrevivente" onClick={onHelp} />
          <MenuItem compact label="Destravar" sub="Move você para um local seguro" onClick={onUnstuck} />
          <MenuItem compact label="Suicídio" sub="Morre e larga seus itens" onClick={() => setConfirm("suicide")} />
          <MenuItem compact label="Sair para o Menu Principal" onClick={() => setConfirm("quit")} />
          </div>
        </div>
      </div>
      {/* right: quick settings / world info (separate column) */}
      <div className="flex-1 min-w-0 flex flex-col py-3 pr-[3vw]">
        <div className="flex gap-0 border-b border-[var(--ark-line)] shrink-0">
          {([["settings", "Configurações Rápidas"], ["info", "Informações do Mundo"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => { click(); setSide(k); }} className={`ark-font px-3 pb-1.5 text-[13px] font-bold uppercase tracking-[0.12em] border-b-2 ${side === k ? "text-[var(--ark-cyan)] border-[var(--ark-cyan)]" : "text-white/55 border-transparent"}`}>{l}</button>
          ))}
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto ark-scroll ark-panel mt-2 p-3" style={{ touchAction: "pan-y" }}>
          {side === "settings" ? (
            <>
              <FullscreenRow />
              <SegRow label="Qualidade Gráfica" options={qualities.map((q) => q[1])} value={qualities.findIndex((q) => q[0] === S.quality)} onChange={(i) => onChange({ ...PRESETS[qualities[i][0] as Exclude<Quality, "custom">], quality: qualities[i][0] })} />
              <SliderRow label="Escala de Resolução" value={S.resolutionScale} min={0.5} max={2} step={0.05} display={`${Math.round(S.resolutionScale * 100)}%`} onChange={(v) => onChange({ resolutionScale: v, quality: "custom" })} />
              <SegRow label="Distância de Visão" options={LEVEL_LABEL} value={S.viewDistance} onChange={(i) => onChange({ viewDistance: i as 0 | 1 | 2 | 3, quality: "custom" })} />
              <SliderRow label="Campo de Visão (FOV)" value={S.fov} min={50} max={100} step={1} display={`${S.fov}°`} onChange={(v) => onChange({ fov: v })} />
              <SliderRow label="Sensibilidade" value={S.sensX} min={0.2} max={3} step={0.05} onChange={(v) => onChange({ sensX: v, sensY: v })} />
              <SliderRow label="Volume Geral" value={S.masterVolume} min={0} max={1} step={0.05} display={`${Math.round(S.masterVolume * 100)}%`} onChange={(v) => onChange({ masterVolume: v })} />
              <SliderRow label="Volume da Música" value={S.musicVolume} min={0} max={1} step={0.05} display={`${Math.round(S.musicVolume * 100)}%`} onChange={(v) => onChange({ musicVolume: v })} />
              <SliderRow label="Brilho (Gama)" value={S.gamma} min={0.6} max={1.6} step={0.05} onChange={(v) => onChange({ gamma: v })} />
              <CheckRow label="Mostrar FPS" value={S.showFps} onChange={(v) => onChange({ showFps: v })} />
              <Btn variant="primary" className="mt-2" icon="settings" onClick={() => { click(); onSettings(); }}>Todas as Configurações</Btn>
            </>
          ) : (
            <div className="grid grid-cols-2 gap-y-1 text-[12px]">
              <span className="text-white/55">Mapa</span><b className="text-right">A Ilha · Single Player</b>
              <span className="text-white/55">Sobrevivente</span><b className="text-right">{game.player.appearance.name}</b>
              <span className="text-white/55">Dia</span><b className="text-right">{h.day}</b>
              <span className="text-white/55">Hora</span><b className="text-right">{String(hh).padStart(2, "0")}:{String(mm).padStart(2, "0")}</b>
              <span className="text-white/55">Clima</span><b className="text-right">{h.weather}</b>
              <span className="text-white/55">Nível</span><b className="text-right">{h.level}</b>
              <span className="text-white/55">Posição</span><b className="text-right">{Math.round(h.pos[0])}, {Math.round(h.pos[2])}</b>
              <span className="text-white/55">Domesticados</span><b className="text-right">{h.tames}</b>
              <span className="text-white/55">Mortes</span><b className="text-right">{game.player.deaths}</b>
              <span className="text-white/55">Dificuldade</span><b className="text-right">{game.rules.difficulty.toFixed(1)} (Nv máx {Math.round(30 * game.rules.difficulty)})</b>
              <span className="text-white/55">XP / Domesticação</span><b className="text-right">{game.fx2.xp.toFixed(1)}× / {game.fx2.taming.toFixed(1)}×</b>
            </div>
          )}
        </div>
      </div>
      {confirm && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-10">
          <div className="ark-panel ark-pop p-4 w-[min(360px,90vw)] text-center">
            <div className="ark-font text-lg font-bold tracking-widest mb-2">{confirm === "suicide" ? "COMETER SUICÍDIO?" : "SAIR PARA O MENU?"}</div>
            <div className="text-[12px] text-white/60 mb-3">{confirm === "suicide" ? "Você morrerá e seus itens ficarão numa bolsa no local." : "O jogo será salvo antes de sair."}</div>
            <div className="flex gap-2 justify-center">
              <Btn onClick={() => setConfirm("")}>Cancelar</Btn>
              <Btn variant="danger" onClick={() => { click(); if (confirm === "suicide") onSuicide(); else onQuit(); setConfirm(""); }}>Confirmar</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ loading / death / help
const TIPS = [
  "Socar árvores dá mais palha; um machado dá mais madeira.",
  "Criaturas desmaiadas comem a comida preferida — ração é a mais rápida.",
  "Narcoberries mantêm criaturas desmaiadas por mais tempo.",
  "Feixes de luz no céu indicam pacotes de suprimentos.",
  "Os obeliscos têm terminais de tributo: guarde itens nos Dados da ARK.",
  "Ovos só incubam na temperatura certa: fogueiras e tochas de pé aquecem.",
  "Anquilossauros montados coletam muito metal nas colinas.",
  "Paredes de pedra resistem a quase todos os predadores.",
  "Tempestades esfriam tudo: vista roupas e fique sob um teto.",
  "Nas Opções, a aba Gráficos tem predefinições de Baixo a Épico.",
];

export function LoadingScreen({ progress }: { progress: number }) {
  const [tip, setTip] = useState(() => Math.floor(Math.random() * TIPS.length));
  useEffect(() => {
    const iv = setInterval(() => setTip((t) => (t + 1) % TIPS.length), 4000);
    return () => clearInterval(iv);
  }, []);
  const stage = progress < 0.38 ? "Preparando modelos e ícones" : progress < 0.85 ? "Gerando A Ilha" : "Despertando criaturas";
  return (
    <div className="absolute inset-0 z-[70] text-white" style={{ background: "radial-gradient(ellipse at 70% 30%, #1d4a58 0%, #07141a 55%, #020608 100%)" }}>
      <div className="absolute inset-0 opacity-30" style={{ background: "repeating-linear-gradient(90deg, rgba(94,230,255,.05) 0 1px, transparent 1px 60px), repeating-linear-gradient(0deg, rgba(94,230,255,.05) 0 1px, transparent 1px 60px)" }} />
      <div className="absolute left-[5vw] top-[7vh]"><Logo /></div>
      <div className="absolute left-[5vw] right-[5vw] bottom-[6vh]">
        <div className="text-[12px] text-white/70 mb-2 max-w-[700px]"><span className="text-[var(--ark-amber)] font-bold">DICA: </span>{TIPS[tip]}</div>
        <div className="flex justify-between ark-font text-[12px] font-bold tracking-[0.2em] mb-1"><span className="text-[var(--ark-cyan)]">{stage.toUpperCase()}</span><span>{Math.round(progress * 100)}%</span></div>
        <div className="h-[4px] bg-white/10"><div className="h-full" style={{ width: `${progress * 100}%`, background: "linear-gradient(90deg,#2aa6c0,#9ff3ff)", boxShadow: "0 0 12px #5ee6ff", transition: "width .25s" }} /></div>
      </div>
    </div>
  );
}

const DIFF_COL: Record<string, string> = { easy: "#5eea8a", medium: "#ffc24a", hard: "#ff5a52" };
const DIFF_LABEL: Record<string, string> = { easy: "Fácil", medium: "Médio", hard: "Difícil" };

/** Spawn / respawn screen modeled on the original: island map with spawn zones, beds and death marker. */
export function SpawnScreen({ game, first, onRespawn }: { game: Game; first: boolean; onRespawn: (id: string, look?: Partial<Appearance>) => void }) {
  const opts = game.respawnOptions();
  const beds = opts.filter((o) => o.kind === "bed");
  const zones = opts.filter((o) => o.kind === "zone");
  const [sel, setSel] = useState<string>(() => (beds[0]?.id ?? zones.find((z) => z.diff === "easy")?.id ?? zones[0]?.id ?? "random"));
  const [look, setLook] = useState<Appearance>({ ...game.player.appearance });
  const [tab, setTab] = useState<"region" | "survivor">(first ? "survivor" : "region");
  const map = useMemo(() => game.mapCanvas?.toDataURL() ?? "", [game.mapCanvas]);
  const world = game.terrain.size;
  const p = game.player;
  const selected = opts.find((o) => o.id === sel);
  const mapSize = Math.min(window.innerHeight - 70, window.innerWidth * 0.46, 560);
  const toMap = (x: number, z: number) => ({ left: ((x + world / 2) / world) * mapSize, top: ((z + world / 2) / world) * mapSize });
  const short = (label: string) => { const m = /Zona (\w+) (\d)/.exec(label); return m ? m[1][0] + m[2] : "?"; };

  return (
    <div className="absolute inset-0 z-[58] text-white ark-fade-in flex flex-col" style={{ background: first ? "linear-gradient(180deg, rgb(2,12,16), rgb(2,10,14))" : "linear-gradient(180deg, rgb(30,4,4), rgb(8,2,2))" }} onPointerDown={(e) => e.stopPropagation()}>
      {/* header */}
      <div className="flex items-center gap-4 px-[3vw] py-2 border-b border-[var(--ark-line)] shrink-0">
        {first ? (
          <div className="ark-font text-[22px] font-bold tracking-[0.2em]">DESPERTAR NA ARK</div>
        ) : (
          <div>
            <div className="ark-font text-[24px] font-bold tracking-[0.2em] text-[var(--ark-red)] leading-none" style={{ textShadow: "0 0 16px rgba(255,60,50,.45)" }}>VOCÊ MORREU</div>
            <div className="text-[11px] text-white/60">Morto por: <b className="text-white/90">{p.deathCause || "desconhecido"}</b> · Dia {game.day} · Nível {p.level} · Seus itens ficaram no local marcado com a caveira</div>
          </div>
        )}
        <div className="flex-1" />
        <div className="flex gap-0">
          {first && <button onClick={() => { click(); setTab("survivor"); }} className={`ark-font px-3 pb-1 text-[13px] font-bold uppercase tracking-[0.12em] border-b-2 ${tab === "survivor" ? "text-[var(--ark-cyan)] border-[var(--ark-cyan)]" : "text-white/55 border-transparent"}`}>1. Sobrevivente</button>}
          <button onClick={() => { click(); setTab("region"); }} className={`ark-font px-3 pb-1 text-[13px] font-bold uppercase tracking-[0.12em] border-b-2 ${tab === "region" ? "text-[var(--ark-cyan)] border-[var(--ark-cyan)]" : "text-white/55 border-transparent"}`}>{first ? "2. " : ""}Região de Nascimento</button>
        </div>
      </div>
      {tab === "survivor" && first ? (
        <div className="flex-1 min-h-0 px-[2vw] py-2">
          <CharacterCreator look={look} setLook={setLook} onNext={() => setTab("region")} />
        </div>
      ) : (
      <div className="flex-1 min-h-0 flex gap-4 px-[3vw] py-2">
        {/* map */}
        <div className="shrink-0 relative ark-panel p-1" style={{ width: mapSize + 8, height: mapSize + 8 }}>
          <div className="relative overflow-hidden" style={{ width: mapSize, height: mapSize }}>
            <img src={map} alt="" className="absolute inset-0 w-full h-full" />
            <div className="absolute inset-0" style={{ background: "radial-gradient(circle, transparent 55%, rgba(0,0,0,.35) 100%)" }} />
            {["N", "L", "S", "O"].map((d, i) => <div key={d} className="absolute ark-font text-[11px] font-bold text-white/70" style={[{ left: "50%", top: 2 }, { right: 3, top: "48%" }, { left: "50%", bottom: 2 }, { left: 3, top: "48%" }][i]}>{d}</div>)}
            {zones.map((z) => {
              const pos = toMap(z.x, z.z);
              const on = sel === z.id;
              return (
                <button key={z.id} onClick={() => { click(); setSel(z.id); }} className="absolute flex items-center justify-center" style={{ left: pos.left - 17, top: pos.top - 17, width: 34, height: 34 }}>
                  <span className="absolute inset-0 rounded-full" style={{ background: `${DIFF_COL[z.diff!]}${on ? "66" : "33"}`, border: `2px solid ${DIFF_COL[z.diff!]}`, boxShadow: on ? `0 0 14px ${DIFF_COL[z.diff!]}` : "none", transform: on ? "scale(1.15)" : "none" }} />
                  <span className="relative ark-font text-[11px] font-bold" style={{ textShadow: "0 1px 2px #000" }}>{short(z.label)}</span>
                </button>
              );
            })}
            {beds.map((b) => {
              const pos = toMap(b.x, b.z);
              return (
                <button key={b.id} onClick={() => { click(); setSel(b.id); }} className="absolute" style={{ left: pos.left - 11, top: pos.top - 11 }}>
                  <span className="w-[22px] h-[22px] flex items-center justify-center rounded-sm" style={{ background: sel === b.id ? "var(--ark-cyan)" : "#1a3a48", border: "2px solid #bff6ff" }}><Icon name="person" size={13} color={sel === b.id ? "#022" : "#bff6ff"} /></span>
                </button>
              );
            })}
            {!first && p.deathPos && (() => { const pos = toMap(p.deathPos[0], p.deathPos[1]); return <div className="absolute pointer-events-none ark-pulse" style={{ left: pos.left - 10, top: pos.top - 10 }}><Icon name="skull" size={20} color="#ffc24a" /></div>; })()}
            {(game.pois?.pois ?? []).filter((o) => o.kind === "obelisk").map((o) => { const pos = toMap(o.pos.x, o.pos.z); return <div key={o.id} className="absolute pointer-events-none" style={{ left: pos.left - 6, top: pos.top - 6 }}><Icon name="engram" size={12} color={o.color} /></div>; })}
          </div>
        </div>
        {/* right column */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex-1 min-h-0 overflow-y-auto ark-scroll pr-1" style={{ touchAction: "pan-y" }}>
            {tab === "survivor" && first ? (
              <div />            ) : (
              <div className="flex flex-col gap-1">
                {beds.length > 0 && (
                  <>
                    <div className="ark-font text-[13px] font-bold tracking-[0.2em] text-[var(--ark-cyan)]">CAMAS E SACOS DE DORMIR</div>
                    {beds.map((b) => (
                      <button key={b.id} onClick={() => { click(); setSel(b.id); }} className={`flex items-center gap-2 px-2 py-1.5 text-left border ${sel === b.id ? "border-[var(--ark-cyan)] bg-[var(--ark-cyan)]/12" : "border-white/10 bg-black/30"}`}>
                        <Icon name="person" size={16} color="#bff6ff" /><span className="text-[13px] font-semibold flex-1">{b.label}</span><span className="text-[11px] text-white/50">{Math.round(b.x)}, {Math.round(b.z)} · uso único</span>
                      </button>
                    ))}
                  </>
                )}
                <div className="ark-font text-[13px] font-bold tracking-[0.2em] text-[var(--ark-cyan)] mt-1">A ILHA · REGIÕES</div>
                {(["easy", "medium", "hard"] as const).map((d) => (
                  <div key={d}>
                    {zones.filter((z) => z.diff === d).map((z) => (
                      <button key={z.id} onClick={() => { click(); setSel(z.id); }} className={`w-full flex items-center gap-2 px-2 py-1.5 text-left border mb-0.5 ${sel === z.id ? "border-[var(--ark-cyan)] bg-[var(--ark-cyan)]/12" : "border-white/10 bg-black/30"}`}>
                        <span className="w-2.5 h-2.5 rounded-full" style={{ background: DIFF_COL[d], boxShadow: `0 0 6px ${DIFF_COL[d]}` }} />
                        <span className="text-[13px] font-semibold flex-1">{z.label}</span>
                        <span className="text-[10px] font-bold uppercase" style={{ color: DIFF_COL[d] }}>{DIFF_LABEL[d]}</span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* action bar */}
          <div className="shrink-0 flex items-center gap-2 pt-2 border-t border-[var(--ark-line)] mt-1">
            <div className="flex-1 min-w-0 text-[11px] text-white/60 truncate">{selected ? <>Selecionado: <b className="text-white">{selected.label}</b>{selected.diff ? ` · ${selected.diff === "easy" ? "clima ameno e herbívoros" : selected.diff === "medium" ? "mais predadores" : "frio e predadores perigosos"}` : ""}</> : "Escolha uma região no mapa"}</div>
            <Btn variant="ghost" onClick={() => { click(); onRespawn("random", first ? look : undefined); }}>Local Aleatório</Btn>
            <Btn variant={first ? "primary" : "danger"} icon="check" onClick={() => { click(); onRespawn(sel, first ? { ...look, name: look.name.trim() || "Sobrevivente" } : undefined); }}>{first ? "Despertar" : "Renascer"}</Btn>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}

export function HelpScreen({ onClose }: { onClose: () => void }) {
  const Sx = ({ i, t, children }: { i: string; t: string; children: React.ReactNode }) => (
    <div className="ark-card p-2 flex gap-2"><span className="text-[var(--ark-cyan)] pt-0.5"><Icon name={i} size={18} /></span><div><div className="font-bold text-[12px] uppercase tracking-wider">{t}</div><div className="text-[12px] text-white/80">{children}</div></div></div>
  );
  return (
    <Panel title="Manual do Sobrevivente" icon="note" onClose={onClose} wide>
      <div className="grid md:grid-cols-2 gap-2">
        <Sx i="hand" t="Controles de toque">Joystick à esquerda move (na borda corre). Arraste à direita para olhar. Vermelho ataca/coleta. Verde interage. Apito, pular, câmera, mapa e inventário nos botões.</Sx>
        <Sx i="food" t="Sobrevivência">Mantenha comida e água; beba na água ou use o cantil. Cozinhe carne na fogueira. Frio gasta comida, calor gasta água.</Sx>
        <Sx i="hammer" t="Coleta">Mãos: palha. Picareta: pederneira e carne. Machado: madeira, pedra e couro. Metal nas colinas; derreta na Forja.</Sx>
        <Sx i="engram" t="Progressão">XP por coletar, criar, construir, caçar, explorar e domesticar. Níveis dão pontos de atributo e de engrama.</Sx>
        <Sx i="dino" t="Domesticação">Desmaie a criatura com torpor e alimente-a com a comida preferida; mantenha o torpor com narcóticos. Menos dano = mais eficiência.</Sx>
        <Sx i="saddle" t="Doedicurus">Monte e deslize o dedo na faixa lateral: ele vira uma bola blindada e rola sem parar, sozinho, até você deslizar de novo. Use o joystick para guiar. Rola depressa, quebra árvores e rochas com bônus e esmaga criaturas no caminho.</Sx>
        <Sx i="saddle" t="Argentavis">Ave de rapina territorial das montanhas: ataca quem se aproxima, persegue até no ar e come carcaças para se curar. Depois de domada e com sela, voa mais devagar que o Pteranodonte, mas aguenta muito mais tempo no ar. Montado, agarre criaturas médias com as garras.</Sx>
        <Sx i="saddle" t="Montaria">Crie a sela da espécie, coloque no inventário da criatura e monte. Pteranodonte no celular: deslize para cima na faixa superior esquerda para decolar ou subir; deslize para baixo para pousar. O joystick continua separado, na parte inferior esquerda.</Sx>
        <Sx i="heart" t="Reprodução">Acasalamento ON em macho e fêmea próximos. Ovo na temperatura certa; filhotes pedem carinho e ração (impressão).</Sx>
        <Sx i="engram" t="Obeliscos">Três torres flutuantes (vermelha, verde, azul) marcam a ilha. O Terminal de Tributo guarda itens nos Dados da ARK, acessíveis de qualquer obelisco.</Sx>
      </div>
    </Panel>
  );
}
