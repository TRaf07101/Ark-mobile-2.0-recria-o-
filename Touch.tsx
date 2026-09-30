import { useEffect, useRef, useState } from "react";
import type { Game, HudState } from "../game";
import { audio } from "../core/audio";
import { Icon } from "./svg";
import { useViewport } from "./ControlEditor";
import { CONTROL_BY_ID, ctlBase, ctlStyle, resolveCtl } from "./controlLayout";

const R0 = 60;

/** Mobile controls: floating joystick (left), drag-to-look (right), contextual action cluster. */
export function TouchControls({ game, hud, onInventory, onPause, onMap }: { game: Game; hud: HudState; onInventory: () => void; onPause: () => void; onMap: () => void }) {
  const vp = useViewport();
  const mb = game.settings.hotbarLayout === "mobile";
  const L = game.settings.controlLayout;
  const stickBase = ctlBase(CONTROL_BY_ID.stick, game.settings);
  const stickRes = resolveCtl("stick", L, mb, vp.W, vp.H, stickBase.scale, stickBase.opacity);
  const R = R0 * stickRes.scale;
  /** absolute, centre-anchored style of a control (position / size / opacity from the layout) */
  const cs = (id: string) => {
    const d = CONTROL_BY_ID[id];
    const b = ctlBase(d, game.settings);
    return ctlStyle(d, resolveCtl(id, L, mb, vp.W, vp.H, b.scale, b.opacity));
  };
  const rs = (id: string) => {
    const b = ctlBase(CONTROL_BY_ID[id], game.settings);
    return resolveCtl(id, L, mb, vp.W, vp.H, b.scale, b.opacity);
  };
  const [stick, setStick] = useState<{ ox: number; oy: number; kx: number; ky: number } | null>(null);
  const stickId = useRef<number | null>(null);
  const flightPointer = useRef<{ id: number; x: number; y: number; fired: boolean } | null>(null);
  const [flightGesture, setFlightGesture] = useState<"up" | "down" | null>(null);
  const rollPointer = useRef<{ id: number; x: number; y: number; fired: boolean } | null>(null);
  const [rollGesture, setRollGesture] = useState<"up" | "down" | null>(null);
  const looks = useRef(new Map<number, { x: number; y: number }>());
  const [attackDown, setAttackDown] = useState(false);
  const [jumpDown, setJumpDown] = useState(false);
  const [sprint, setSprint] = useState(false);
  const [whistleOpen, setWhistleOpen] = useState(false);

  useEffect(() => { game.input.sprint = sprint; }, [sprint, game]);
  useEffect(() => () => { game.input.mx = game.input.mz = 0; game.input.attack = false; game.input.sprint = false; game.input.jump = false; game.input.descend = false; game.input.flightClimb = false; }, [game]);
  useEffect(() => {
    if (!hud.mount?.canFly) {
      flightPointer.current = null;
      game.input.flightClimb = false;
      setFlightGesture(null);
    }
  }, [hud.mount?.canFly, game]);

  const onLookDown = (e: React.PointerEvent) => {
    audio.init();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    looks.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };
  const onLookMove = (e: React.PointerEvent) => {
    const l = looks.current.get(e.pointerId);
    if (!l) return;
    game.look((e.clientX - l.x) * 1.3, (e.clientY - l.y) * 1.3);
    l.x = e.clientX;
    l.y = e.clientY;
  };
  const onLookUp = (e: React.PointerEvent) => looks.current.delete(e.pointerId);

  const onStickDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    audio.init();
    if (stickId.current !== null) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    stickId.current = e.pointerId;
    setStick({ ox: e.clientX, oy: e.clientY, kx: 0, ky: 0 });
  };
  const onStickMove = (e: React.PointerEvent) => {
    if (e.pointerId !== stickId.current || !stick) return;
    let dx = e.clientX - stick.ox, dy = e.clientY - stick.oy;
    const d = Math.hypot(dx, dy);
    if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R; }
    setStick({ ...stick, kx: dx, ky: dy });
    const mx = dx / R, mz = -dy / R;
    game.input.mx = Math.abs(mx) < 0.12 ? 0 : mx;
    game.input.mz = Math.abs(mz) < 0.12 ? 0 : mz;
    // push the stick to the rim to auto-sprint (like the mobile original)
    if (game.settings.autoSprint && d >= R * 0.98 && mz > 0.85) game.input.sprint = true;
    else game.input.sprint = sprint;
  };
  const onStickUp = (e: React.PointerEvent) => {
    if (e.pointerId !== stickId.current) return;
    stickId.current = null;
    setStick(null);
    game.input.mx = game.input.mz = 0;
    game.input.sprint = sprint;
  };

  // Independent upper-left gesture zone. It never shares a pointer or screen
  // space with the lower-left joystick, so a swipe cannot change movement.
  const onFlightDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    audio.init();
    if (flightPointer.current) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    flightPointer.current = { id: e.pointerId, x: e.clientX, y: e.clientY, fired: false };
  };
  const onFlightMove = (e: React.PointerEvent) => {
    e.stopPropagation();
    const gesture = flightPointer.current;
    if (!gesture || gesture.id !== e.pointerId || gesture.fired) return;
    const dx = e.clientX - gesture.x;
    const dy = e.clientY - gesture.y;
    if (Math.abs(dy) < 27 || Math.abs(dy) < Math.abs(dx) * 1.2) return;
    gesture.fired = true;
    if (dy < 0) {
      game.flySwipeUp();
      setFlightGesture("up");
    } else {
      game.flySwipeDown();
      setFlightGesture("down");
    }
    if (game.settings.vibration && navigator.vibrate) navigator.vibrate(12);
  };
  const onFlightEnd = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (flightPointer.current?.id !== e.pointerId) return;
    flightPointer.current = null;
    game.input.flightClimb = false;
    setFlightGesture(null);
  };

  // Armoured-ball roll gesture (Doedicurus): a dedicated strip on the left, clear of
  // the joystick below and of the flight zone used by flyers.
  const onRollDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    audio.init();
    if (rollPointer.current) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    rollPointer.current = { id: e.pointerId, x: e.clientX, y: e.clientY, fired: false };
  };
  const onRollMove = (e: React.PointerEvent) => {
    e.stopPropagation();
    const gp = rollPointer.current;
    if (!gp || gp.id !== e.pointerId || gp.fired) return;
    const dy = e.clientY - gp.y, dx = e.clientX - gp.x;
    if (Math.hypot(dx, dy) < 27) return;
    gp.fired = true;
    game.rollSwipe();
    setRollGesture(game.riding?.rolling ? "up" : "down");
    if (game.settings.vibration && navigator.vibrate) navigator.vibrate(12);
  };
  const onRollEnd = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (rollPointer.current?.id !== e.pointerId) return;
    rollPointer.current = null;
    setRollGesture(null);
  };

  const hold = (on: () => void, off: () => void) => ({
    onPointerDown: (e: React.PointerEvent) => { e.stopPropagation(); audio.init(); (e.target as HTMLElement).setPointerCapture(e.pointerId); on(); },
    onPointerUp: () => off(),
    onPointerCancel: () => off(),
  });
  const tap = (fn: () => void) => ({ onPointerDown: (e: React.PointerEvent) => { e.stopPropagation(); audio.init(); fn(); } });

  const placing = hud.placing;
  const f = hud.focus;
  const ox = stick ? stick.ox : stickRes.cx;
  const oy = stick ? stick.oy : stickRes.cy;
  const attackLabel = placing ? "Colocar" : hud.ammo ? "Atirar" : (f?.kind === "node" && f.hitHint) || f?.kind === "corpse" ? "Coletar" : "Atacar";
  const attackIcon = placing ? "check" : hud.ammo ? "target" : f?.kind === "node" && f.hitHint ? "hammer" : "sword";
  const sys = "rounded-md ark-hud flex items-center justify-center text-white active:scale-95 z-30";

  return (
    <>
      <div className="absolute inset-0 z-10" style={{ touchAction: "none" }} onPointerDown={onLookDown} onPointerMove={onLookMove} onPointerUp={onLookUp} onPointerCancel={onLookUp} />
      <div className="absolute left-0 bottom-0 z-20" style={{ width: "40%", height: "60%", touchAction: "none" }} onPointerDown={onStickDown} onPointerMove={onStickMove} onPointerUp={onStickUp} onPointerCancel={onStickUp}>
        <div className="fixed pointer-events-none" style={{ left: ox - R - 14, top: oy - R - 14, width: (R + 14) * 2, height: (R + 14) * 2, opacity: stick ? 1 : stickRes.opacity }}>
          <div className="absolute inset-0 rounded-full" style={{ border: "2px solid rgba(120,220,240,0.45)", background: "radial-gradient(circle, rgba(10,30,36,0.35), rgba(10,30,36,0.15))" }} />
          <div className="absolute inset-[18px] rounded-full" style={{ border: "1px dashed rgba(120,220,240,0.25)" }} />
          <div className="absolute rounded-full" style={{ width: 54, height: 54, left: R + 14 - 27 + (stick?.kx ?? 0), top: R + 14 - 27 + (stick?.ky ?? 0), background: "radial-gradient(circle at 40% 35%, #bff6ff, #3ab8d4)", boxShadow: "0 0 14px rgba(94,230,255,0.6)", border: "2px solid #e6fbff" }} />
        </div>
      </div>

      {hud.mount?.canRoll && !hud.mount?.canFly && (
        <div
          aria-label="Área de rolagem: deslize uma vez para rolar sem parar, deslize de novo para parar"
          className="absolute left-0 z-20 flex items-center justify-center text-center text-white/85 select-none"
          style={{ top: 48, bottom: "62%", width: "40%", touchAction: "none", background: "linear-gradient(90deg, rgba(166,116,32,.34), rgba(166,116,32,.08))", borderTop: "1px solid rgba(255,205,120,.35)", borderBottom: "1px solid rgba(255,205,120,.35)" }}
          onPointerDown={onRollDown} onPointerMove={onRollMove} onPointerUp={onRollEnd} onPointerCancel={onRollEnd}
        >
          <div className="pointer-events-none flex items-center gap-2 text-[11px] font-bold tracking-wide" style={{ textShadow: "0 1px 3px #210" }}>
            <span className={`text-lg ${rollGesture === "up" ? "text-[var(--ark-amber)]" : ""}`}>⟳</span>
            <span>{hud.mount?.rolling ? "ROLANDO" : "ROLAR / BOLA"}<br /><span className="font-normal text-[9px] text-white/65">{hud.mount?.rolling ? "deslize para parar" : "deslize para rolar"}</span></span>
            <span className={`text-lg ${rollGesture === "down" ? "text-[var(--ark-cyan)]" : ""}`}>■</span>
          </div>
        </div>
      )}
      {hud.mount?.canFly && (
        <div
          aria-label="Área de gesto de voo: deslize para cima para voar, para baixo para pousar"
          className="absolute left-0 z-20 flex items-center justify-center text-center text-white/85 select-none"
          style={{ top: 48, bottom: "62%", width: "40%", touchAction: "none", background: "linear-gradient(90deg, rgba(28,91,113,.34), rgba(28,91,113,.08))", borderTop: "1px solid rgba(150,225,245,.3)", borderBottom: "1px solid rgba(150,225,245,.3)" }}
          onPointerDown={onFlightDown} onPointerMove={onFlightMove} onPointerUp={onFlightEnd} onPointerCancel={onFlightEnd}
        >
          <div className="pointer-events-none flex items-center gap-2 text-[11px] font-bold tracking-wide" style={{ textShadow: "0 1px 3px #001" }}>
            <span className={`text-lg ${flightGesture === "up" ? "text-[var(--ark-cyan)]" : ""}`}>↑</span>
            <span>{hud.mount.landing ? "POUSANDO" : hud.mount.flying ? "SUBIR / POUSAR" : "VOAR / DECOLAR"}<br /><span className="font-normal text-[9px] text-white/65">deslize nesta área</span></span>
            <span className={`text-lg ${flightGesture === "down" ? "text-[var(--ark-amber)]" : ""}`}>↓</span>
          </div>
        </div>
      )}

      {/* action cluster */}
      <div className={`ark-touch red z-30 ${attackDown ? "on" : ""}`} style={cs("attack")} {...hold(() => { setAttackDown(true); game.input.attack = true; }, () => { setAttackDown(false); game.input.attack = false; })}>
        <span className="pointer-events-none"><Icon name={attackIcon} size={30} /></span>
        <span className="text-[9px] uppercase pointer-events-none mt-0.5">{attackLabel}</span>
      </div>
      <div className={`ark-touch z-30 ${jumpDown ? "on" : ""}`} style={cs("jump")} {...hold(() => { setJumpDown(true); game.input.jump = true; game.jump(); }, () => { setJumpDown(false); game.input.jump = false; })}>
        <span className="pointer-events-none"><Icon name="jump" size={24} /></span>
        <span className="text-[8px] uppercase pointer-events-none">Pular</span>
      </div>
      {game.dev.flying && !hud.mount && (
        <div className="ark-touch z-30" style={cs("descend")} {...hold(() => { game.input.descend = true; }, () => { game.input.descend = false; })}>
          <span className="text-xl pointer-events-none">↓</span>
          <span className="text-[8px] uppercase pointer-events-none">Descer</span>
        </div>
      )}
      {hud.grabbed && !hud.mount && (
        <div className="ark-touch green z-30" style={cs("action")} {...tap(() => game.letGo())}>
          <span className="pointer-events-none"><Icon name="hand" size={22} /></span>
          <span className="text-[8px] uppercase pointer-events-none">Soltar-se</span>
        </div>
      )}
      {hud.mount && (
        <div className="ark-touch green z-30" style={cs("action")} {...tap(() => game.dismount())}>
          <span className="pointer-events-none"><Icon name="saddle" size={22} /></span>
          <span className="text-[8px] uppercase pointer-events-none">Desmontar</span>
        </div>
      )}
      {hud.mount?.canCarry && hud.mount.flying && (
        <>
          <div className="ark-touch z-30" style={cs("carry")} {...tap(() => game.toggleCarry())}>
            <span className="pointer-events-none"><Icon name="hand" size={20} /></span>
            <span className="text-[7px] uppercase pointer-events-none">{hud.mount.carrying ? "Soltar" : "Agarrar"}</span>
          </div>
          {hud.mount.canBarrel && (
            <div className="ark-touch z-30" style={cs("barrel")} {...tap(() => game.barrelRoll())}>
              <span className="pointer-events-none"><Icon name="rotate" size={20} /></span>
              <span className="text-[7px] uppercase pointer-events-none">Rolar</span>
            </div>
          )}
        </>
      )}
      {hud.mount?.canFly && (
        <div className="absolute z-30 pointer-events-none text-[10px] text-white/70 ark-hud px-2 py-0.5" style={{ left: rs("action").cx, top: Math.max(4, rs("action").cy - 35 * rs("action").scale - 28), transform: "translateX(-50%)", maxWidth: 230, textAlign: "center" }}>{hud.mount.landing ? "Pousando... deslize ↑ para cancelar" : "Deslize ↑ / ↓ na área esquerda para voar / pousar"}</div>
      )}
      {f?.action2 && (
        <div className="ark-touch z-30" style={cs("action2")} {...tap(() => game.interact2())}>
          <span className="pointer-events-none"><Icon name="dino" size={18} /></span>
          <span className="text-[7px] uppercase pointer-events-none">{f.action2}</span>
        </div>
      )}
      {hud.tames > 0 && (
        <>
          <div className={`ark-touch z-30 ${whistleOpen ? "on" : ""}`} style={cs("whistle")} {...tap(() => setWhistleOpen((v) => !v))}>
            <span className="pointer-events-none"><Icon name="whistle" size={20} /></span>
          </div>
          {whistleOpen && (
            <div className="absolute z-30 flex flex-col gap-1 ark-hud p-1.5" style={{ left: Math.max(8, Math.min(vp.W - 160, rs("whistle").cx + 24 * rs("whistle").scale + 10)), top: Math.max(8, Math.min(vp.H - 230, rs("whistle").cy - 90)) }} onPointerDown={(e) => e.stopPropagation()}>
              {([["follow", "Seguir"], ["stay", "Ficar"], ["attack", "Atacar alvo"], ["passive", "Passivos"], ["aggressive", "Agressivos"], ["mate", "Acasalar"]] as const).map(([k, l]) => (
                <button key={k} className="ark-btn !py-1.5 !text-[11px]" onClick={() => { game.whistle(k); setWhistleOpen(false); }}>{l}</button>
              ))}
            </div>
          )}
        </>
      )}
      {!hud.mount && f?.action && (
        <div className="ark-touch green z-30" style={cs("action")} {...tap(() => game.interact())}>
          <span className="pointer-events-none"><Icon name="hand" size={24} /></span>
          <span className="text-[8px] uppercase pointer-events-none px-1 text-center leading-tight">{f.action}</span>
        </div>
      )}
      <div className={`ark-touch z-30 ${sprint ? "on" : ""}`} style={cs("sprint")} {...tap(() => setSprint((s) => !s))}>
        <span className="pointer-events-none"><Icon name="run" size={22} /></span>
      </div>
      {hud.ammo && (
        <div className="ark-touch z-30" style={cs("ammo")} {...tap(() => game.cycleAmmo())}>
          <span className="pointer-events-none"><Icon name="ammo" size={16} /></span>
          <span className="text-[10px] pointer-events-none">{hud.ammo.count}</span>
        </div>
      )}
      {placing && (
        <>
          <div className="ark-touch z-30" style={cs("rotate")} {...tap(() => game.rotatePlacement())}>
            <span className="pointer-events-none"><Icon name="rotate" size={22} /></span>
            <span className="text-[8px] uppercase pointer-events-none">Girar</span>
          </div>
          <div className="ark-touch z-30" style={cs("cancel")} {...tap(() => game.cancelPlacement())}>
            <span className="pointer-events-none"><Icon name="close" size={22} /></span>
            <span className="text-[8px] uppercase pointer-events-none">Cancelar</span>
          </div>
        </>
      )}
      <button className={sys} style={cs("camera")} {...tap(() => game.toggleCamera())}><Icon name={hud.cameraFirst ? "eye" : "camera"} size={20} /></button>
      <button className={sys} style={cs("map")} {...tap(onMap)}><Icon name="map" size={20} /></button>
      <button className={sys} style={cs("bag")} {...tap(onInventory)}>
        <Icon name="bag" size={20} />
        {(hud.statPoints > 0 || hud.engramPoints > 0) && <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-[var(--ark-amber)] ark-pulse" />}
      </button>
      <button className={sys} style={cs("menu")} {...tap(onPause)}><Icon name="menu" size={20} /></button>
    </>
  );
}
