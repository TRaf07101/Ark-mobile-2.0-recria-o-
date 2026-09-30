import { useCallback, useEffect, useRef, useState } from "react";
import { Game, type HudState, type Settings, type GameState } from "./ark/game";
import { CONFIG } from "./ark/core/config";
import { audio, music } from "./ark/core/audio";
import { migrateSettings, type Rules } from "./ark/core/settings";
import { enterFullscreenLandscape } from "./ark/core/fullscreen";
import type { PanelRequest } from "./ark/core/events";
import { Hud } from "./ark/ui/Hud";
import { Guard } from "./ark/ui/Guard";
import { TouchControls } from "./ark/ui/Touch";
import { InventoryScreen, type InvTab } from "./ark/ui/Inventory";
import { ContextPanel } from "./ark/ui/Panels";
import { JoinScreen, RoomPanel } from "./ark/ui/Multiplayer";
import { DeveloperPanel, DEV_UNLOCK_KEY } from "./ark/ui/DeveloperPanel";
import { MainMenu, HelpScreen, SettingsScreen, PauseMenu, SpawnScreen, LoadingScreen, HostScreen, CreditsScreen } from "./ark/ui/Menus";

const isTouch = typeof window !== "undefined" && ("ontouchstart" in window || navigator.maxTouchPoints > 0);

function loadSettings(): Settings {
  try {
    const s = localStorage.getItem(CONFIG.save.settingsKey);
    return migrateSettings(s ? JSON.parse(s) : null, isTouch);
  } catch {
    return migrateSettings(null, isTouch);
  }
}

type Overlay = "none" | "inventory" | "pause" | "settings" | "help" | "host" | "credits" | "mp" | "dev";

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [game, setGame] = useState<Game | null>(null);
  const [state, setState] = useState<GameState>("menu");
  const [hud, setHud] = useState<HudState | null>(null);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [overlay, setOverlay] = useState<Overlay>("none");
  const [back, setBack] = useState<Overlay>("none");
  const [panel, setPanel] = useState<PanelRequest | null>(null);
  const [, setTick] = useState(0);
  const [menuKey, setMenuKey] = useState(0);
  const [loading, setLoading] = useState(0);
  const [invTab, setInvTab] = useState<InvTab>("inv");
  const [devUnlocked, setDevUnlocked] = useState(() => {
    try { return localStorage.getItem(DEV_UNLOCK_KEY) === "1"; } catch { return false; }
  });

  useEffect(() => {
    if (!canvasRef.current) return;
    const g = new Game(canvasRef.current);
    g.setSettings(settings);
    g.devUnlocked = devUnlocked;
    g.net.setDeveloperUnlocked(devUnlocked);
    g.onHud = setHud;
    const offs = [
      g.events.on("state", (s) => setState(s as GameState)),
      g.events.on("panel", (p) => { setPanel(p); if (p) document.exitPointerLock?.(); }),
      g.events.on("inventory", () => setTick((t) => t + 1)),
      g.events.on("loading", (p) => setLoading(p)),
      g.events.on("hurt", () => { if (g.settings.vibration && navigator.vibrate) navigator.vibrate(40); }),
    ];
    g.startMenu();
    setGame(g);
    (window as unknown as { __game: Game }).__game = g;
    const onVis = () => { if (document.hidden) g.save(); };
    const unlockAudio = () => { audio.init(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", () => g.save());
    window.addEventListener("pointerdown", unlockAudio);
    return () => { offs.forEach((o) => o()); document.removeEventListener("visibilitychange", onVis); window.removeEventListener("pointerdown", unlockAudio); g.dispose(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!game) return;
    const menuOpen = overlay !== "none" || panel !== null;
    game.paused = state === "playing" && (overlay === "pause" || overlay === "settings" || overlay === "help" || (overlay === "dev" && !devUnlocked) || ((menuOpen && overlay !== "dev") && settings.pauseInMenus));
    // inventory / station panels only "soft" pause: crafting & cooking keep running like in ARK
    game.softPaused = game.paused && !(overlay === "pause" || overlay === "settings" || overlay === "help");
    if (menuOpen) { game.input.attack = false; game.input.mx = game.input.mz = 0; }
  }, [overlay, panel, game, settings.pauseInMenus, state, devUnlocked]);
  useEffect(() => { if (game && overlay === "none") game.cancelImplant(); }, [overlay, game]);

  const open = useCallback((o: Overlay, tab?: InvTab) => {
    const show = () => {
      if (o === "inventory" && settings.inventorySounds) audio.play("inventory");
      if (tab) setInvTab(tab);
      setPanel(null);
      setOverlay(o);
      document.exitPointerLock?.();
    };
    // ARK: opening the inventory plays the implant check (look at the wrist crystal) first
    if (o === "inventory" && tab !== "map" && game && state === "playing" && overlay === "none" && !panel) game.openImplant(show);
    else show();
  }, [settings.inventorySounds, game, state, overlay, panel]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (state !== "playing") return;
      if (e.ctrlKey && e.shiftKey && e.code === "KeyD") {
        e.preventDefault();
        setOverlay((o) => o === "dev" ? (devUnlocked ? "none" : "pause") : "dev");
        document.exitPointerLock?.();
        return;
      }
      if (e.code === "KeyM") open(overlay === "inventory" ? "none" : "inventory", "map");
      if (e.code === "KeyI" || e.code === "Tab") { e.preventDefault(); open(overlay === "inventory" ? "none" : "inventory", "inv"); }
      if (e.code === "Escape") {
        if (panel) setPanel(null);
        else if (overlay === "dev") setOverlay("none");
        else if (overlay === "settings" || overlay === "help") setOverlay("pause");
        else setOverlay((o) => (o === "none" ? "pause" : "none"));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, panel, overlay, open, devUnlocked]);

  const updateSettings = useCallback((s: Partial<Settings>) => {
    setSettings((prev) => {
      const n = { ...prev, ...s };
      try { localStorage.setItem(CONFIG.save.settingsKey, JSON.stringify(n)); } catch { /* ignore */ }
      game?.setSettings(n);
      return n;
    });
  }, [game]);

  const enterFullscreen = async () => {
    if (!isTouch || !settings.autoFullscreen) return;
    await enterFullscreenLandscape();
  };

  const continueGame = async () => {
    if (!game) return;
    audio.init();
    await enterFullscreen();
    setOverlay("none");
    setPanel(null);
    music.setMode("off");
    const ok = await game.loadGame();
    if (!ok) await game.newGame();
  };
  const hostGame = async (seed: number, rules: Rules) => {
    if (!game) return;
    audio.init();
    await enterFullscreen();
    setOverlay("none");
    setPanel(null);
    music.setMode("off");
    game.deleteSave();
    await game.newGame(seed, rules);
  };
  const closeAll = () => { setOverlay("none"); setPanel(null); };
  const openSettings = (from: Overlay) => { setBack(from); setOverlay("settings"); };
  const unlockDeveloper = () => {
    try { localStorage.setItem(DEV_UNLOCK_KEY, "1"); } catch { /* stays unlocked for this session */ }
    if (game) {
      game.devUnlocked = true;
      game.net.setDeveloperUnlocked(true);
    }
    setDevUnlocked(true);
  };
  const ui = settings.uiScale;

  return (
    <div className={`absolute inset-0 overflow-hidden bg-black select-none ${settings.menuTransitions ? "" : "ark-no-anim"}`}>
      <canvas ref={canvasRef} className="absolute inset-0 block" />
      {settings.filmGrain && <div className="absolute inset-0 pointer-events-none z-[4] ark-grain" />}

      {game && state === "menu" && overlay === "none" && (
        <MainMenu key={menuKey} game={game} onContinue={continueGame} onHost={() => setOverlay("host")} onSettings={() => openSettings("none")} onHelp={() => setOverlay("help")} onCredits={() => setOverlay("credits")} onMultiplayer={() => setOverlay("mp")} />
      )}
      {game && state === "menu" && overlay === "host" && <HostScreen game={game} hasSave={game.hasSave()} onPlay={hostGame} onBack={() => setOverlay("none")} />}
      {state === "menu" && overlay === "credits" && <CreditsScreen onClose={() => setOverlay("none")} />}
      {game && state === "menu" && overlay === "mp" && <JoinScreen game={game} onClose={() => setOverlay("none")} />}
      {state === "loading" && <LoadingScreen progress={loading} />}

      {game && state === "playing" && hud && (
        <>
          <div className="absolute inset-0" hidden={overlay === "pause" || overlay === "settings"} style={ui < 1 ? { transform: `scale(${ui})`, transformOrigin: "center", width: `${100 / ui}%`, height: `${100 / ui}%`, left: `${(100 - 100 / ui) / 2}%`, top: `${(100 - 100 / ui) / 2}%` } : undefined}>
            <Guard name="hud"><Hud game={game} hud={hud} isTouch={isTouch} onInventory={() => open("inventory", "inv")} /></Guard>
          </div>
          {isTouch && (overlay === "none" || (overlay === "dev" && devUnlocked)) && !panel && !hud.dead && (
            <Guard name="touch"><TouchControls game={game} hud={hud} onInventory={() => open("inventory", "inv")} onPause={() => open("pause")} onMap={() => open("inventory", "map")} /></Guard>
          )}
          {!isTouch && (overlay === "none" || (overlay === "dev" && devUnlocked)) && !panel && !hud.dead && (
            <div className="absolute top-2 right-2 z-30 flex gap-2">
              <button className="ark-btn" onClick={() => open("inventory", "map")}>Mapa [M]</button>
              <button className="ark-btn" onClick={() => open("inventory", "inv")}>Inventário [I]</button>
              <button className="ark-btn" onClick={() => open("pause")}>Menu [Esc]</button>
            </div>
          )}
          {devUnlocked && game.dev.allowed && (overlay === "none" || overlay === "dev") && !hud.dead && (
            <button aria-label="Abrir painel DEV" onClick={() => setOverlay((o) => o === "dev" ? "none" : "dev")} className="absolute z-[45] ark-btn !px-2 !py-1 text-[10px] text-[var(--ark-cyan)] border-[var(--ark-cyan)]/60 bg-black/70" style={{ left: isTouch ? 193 : 12, top: isTouch ? 9 : 50 }}>DEV</button>
          )}
          {overlay === "inventory" && <Guard name="inventory" onError={() => { game.notify("Erro ao atualizar o inventário. Fechando.", "warn"); setOverlay("none"); }}><InventoryScreen game={game} onClose={closeAll} initialTab={invTab} /></Guard>}
          {panel && overlay === "none" && <Guard name="panel" onError={() => setPanel(null)}><ContextPanel game={game} req={panel} onClose={() => setPanel(null)} /></Guard>}
          {overlay === "pause" && !hud.dead && (
            <PauseMenu
              game={game}
              settings={settings}
              onChange={updateSettings}
              onResume={closeAll}
              onSettings={() => openSettings("pause")}
              onHelp={() => { setBack("pause"); setOverlay("help"); }}
              onSave={() => { game.save(); game.notify("Jogo salvo.", "good"); closeAll(); }}
              onUnstuck={() => { game.unstuck(); closeAll(); }}
              onMultiplayer={() => setOverlay("mp")}
              onDeveloper={() => setOverlay("dev")}
              onSuicide={() => { game.suicide(); closeAll(); }}
              onQuit={() => { closeAll(); game.quitToMenu(); setMenuKey((k) => k + 1); }}
            />
          )}
          {overlay === "mp" && <RoomPanel game={game} onClose={() => setOverlay("pause")} />}
          {overlay === "dev" && <Guard name="dev" onError={() => { game.notify("O console do desenvolvedor encontrou um erro e foi fechado.", "warn"); setOverlay("none"); }}><DeveloperPanel game={game} unlocked={devUnlocked} onUnlock={unlockDeveloper} onClose={() => setOverlay(devUnlocked ? "none" : "pause")} /></Guard>}
          {hud.dead && overlay !== "settings" && overlay !== "mp" && overlay !== "dev" && <SpawnScreen key={hud.firstSpawn ? "first" : "death"} game={game} first={hud.firstSpawn} onRespawn={(id, look) => game.respawn(id, look)} />}
        </>
      )}
      {overlay === "settings" && (
        <SettingsScreen
          settings={settings}
          onChange={updateSettings}
          inGame={state === "playing"}
          onClose={() => setOverlay(state === "playing" ? back : "none")}
          onResetTutorial={game ? () => { game.tutorial.load(undefined); game.tutorial.enabled = settings.tutorial; game.notify("Tutoriais reiniciados.", "good"); } : undefined}
          onDeleteSave={state === "menu" && game ? () => { game.deleteSave(); setMenuKey((k) => k + 1); } : undefined}
        />
      )}
      {overlay === "help" && <HelpScreen onClose={() => setOverlay(state === "playing" ? "pause" : "none")} />}
    </div>
  );
}
