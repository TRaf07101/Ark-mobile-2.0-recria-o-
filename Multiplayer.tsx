import { useEffect, useState } from "react";
import type { Game } from "../game";
import { audio } from "../core/audio";
import { Btn, Panel } from "./common";
import { Icon } from "./svg";
import { enterFullscreenLandscape } from "../core/fullscreen";

const click = () => audio.play("menu_click", 0.8);
const NAME_KEY = "ark_mobile_2_mpname";

function useNetTick(game: Game) {
  const [, t] = useState(0);
  useEffect(() => {
    game.net.onChange = () => t((x) => x + 1);
    const iv = setInterval(() => t((x) => x + 1), 1000);
    return () => { game.net.onChange = null; clearInterval(iv); };
  }, [game]);
}

/** Main menu → Multiplayer: join a friend's island with a room code. */
export function JoinScreen({ game, onClose }: { game: Game; onClose: () => void }) {
  useNetTick(game);
  const [code, setCode] = useState("");
  const [name, setName] = useState(() => localStorage.getItem(NAME_KEY) || "Sobrevivente");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const join = async () => {
    click();
    audio.init();
    if (code.trim().length < 4) { setErr("Digite o código da sala."); return; }
    setBusy(true);
    setErr("");
    try { localStorage.setItem(NAME_KEY, name.trim() || "Sobrevivente"); } catch { /* ignore */ }
    try {
      if (game.settings.autoFullscreen && ("ontouchstart" in window || navigator.maxTouchPoints > 0)) await enterFullscreenLandscape();
      await game.joinMultiplayer(code, name.trim() || "Sobrevivente");
      onClose();
    } catch (e) {
      setErr((e as Error).message || "Falha ao conectar.");
      setBusy(false);
    }
  };
  return (
    <Panel title="Multijogador" icon="person" onClose={() => { game.net.close(); onClose(); }}>
      <div className="flex flex-col gap-3">
        <div className="ark-card p-3 flex flex-col gap-2">
          <div className="ark-font text-[14px] font-bold tracking-[0.18em] text-[var(--ark-cyan)]">ENTRAR NA ILHA DE UM AMIGO</div>
          <label className="ark-label">Seu nome</label>
          <input value={name} maxLength={20} onChange={(e) => setName(e.target.value)} className="bg-black/50 border border-[var(--ark-line)] px-2 py-1.5 text-sm outline-none focus:border-[var(--ark-cyan)]" />
          <label className="ark-label">Código da sala</label>
          <input value={code} maxLength={8} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} placeholder="EX: K7QM2P"
            className="bg-black/50 border border-[var(--ark-line)] px-2 py-2 outline-none focus:border-[var(--ark-cyan)] ark-font text-[26px] font-bold tracking-[0.4em] text-center uppercase" />
          <Btn variant="primary" icon="check" disabled={busy} onClick={join}>{busy ? "Conectando..." : "Entrar"}</Btn>
          {(busy || game.net.status) && <div className="text-[12px] text-[var(--ark-cyan)]">{game.net.status}</div>}
          {err && <div className="text-[12px] text-[var(--ark-red)]">{err}</div>}
        </div>
        <div className="ark-card p-3 text-[12px] text-white/75 leading-relaxed">
          <div className="ark-font text-[13px] font-bold tracking-[0.18em] text-[var(--ark-amber)] mb-1">COMO HOSPEDAR</div>
          1. No outro aparelho, entre num jogo (Continuar ou Host / Local).<br />
          2. Abra o Menu (☰) → <b>Multijogador</b> → <b>Abrir Sala</b>.<br />
          3. Digite aqui o código de 6 letras que aparecer.<br />
          <span className="text-white/45">Funciona entre redes diferentes (Wi-Fi e 4G/5G). A ilha, criaturas, construções e tempo são do anfitrião; cada um tem seu próprio inventário.</span>
        </div>
      </div>
    </Panel>
  );
}

/** In-game room panel: open the world to others, see who's connected, chat. */
export function RoomPanel({ game, onClose }: { game: Game; onClose: () => void }) {
  useNetTick(game);
  const net = game.net;
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [copied, setCopied] = useState(false);
  const open = async () => {
    click();
    setBusy(true);
    try { await net.host(); } catch { /* status shown */ }
    setBusy(false);
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(net.code); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
  };
  return (
    <Panel title="Multijogador" icon="person" onClose={onClose}>
      {net.role === "off" ? (
        <div className="flex flex-col gap-3 items-start">
          <div className="text-[13px] text-white/80">Abra esta ilha para que outros aparelhos entrem e joguem com você em tempo real — todos veem uns aos outros andando, pulando, coletando, construindo, montando e lutando.</div>
          <Btn variant="primary" icon="person" disabled={busy} onClick={open}>{busy ? "Abrindo..." : "Abrir Sala"}</Btn>
          {net.status && <div className="text-[12px] text-[var(--ark-cyan)]">{net.status}</div>}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="ark-card p-3 flex items-center gap-3 flex-wrap">
            <div>
              <div className="ark-label">{net.role === "host" ? "Código da sala — compartilhe" : "Conectado à sala"}</div>
              <div className="ark-font text-[40px] font-bold tracking-[0.35em] text-[var(--ark-cyan)] leading-none" style={{ textShadow: "0 0 16px rgba(94,230,255,.4)" }}>{net.code}</div>
            </div>
            {net.role === "host" && <Btn variant="ghost" onClick={copy}>{copied ? "Copiado!" : "Copiar"}</Btn>}
            <div className="flex-1" />
            <Btn variant="danger" onClick={() => { click(); if (net.role === "guest") { onClose(); game.leaveMultiplayer(); } else net.close(); }}>{net.role === "host" ? "Fechar Sala" : "Sair da Sala"}</Btn>
          </div>
          <div>
            <div className="ark-label mb-1">Jogadores ({net.playerCount()})</div>
            {net.players().map((p) => (
              <div key={p.id} className="flex items-center gap-2 ark-card px-2 py-1 mb-1 text-[13px]">
                <Icon name="person" size={14} color={p.host ? "var(--ark-amber)" : "var(--ark-cyan)"} />
                <span className="flex-1">{p.name}</span>
                {p.host && <span className="text-[10px] font-bold text-[var(--ark-amber)]">ANFITRIÃO</span>}
              </div>
            ))}
          </div>
          <div>
            <div className="ark-label mb-1">Bate-papo</div>
            <div className="ark-card p-2 max-h-32 overflow-y-auto ark-scroll text-[12px] flex flex-col gap-0.5">
              {net.chat.length === 0 && <span className="text-white/40">Nenhuma mensagem.</span>}
              {net.chat.map((c, i) => <div key={i}><b className="text-[var(--ark-cyan)]">{c.from}:</b> {c.text}</div>)}
            </div>
            <div className="flex gap-1 mt-1">
              <input value={msg} maxLength={140} onChange={(e) => setMsg(e.target.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") { net.sendChat(msg); setMsg(""); } }} placeholder="Mensagem..." className="flex-1 bg-black/50 border border-[var(--ark-line)] px-2 py-1 text-sm outline-none focus:border-[var(--ark-cyan)]" />
              <Btn onClick={() => { net.sendChat(msg); setMsg(""); }}>Enviar</Btn>
            </div>
          </div>
          {net.role === "guest" && <div className="text-[11px] text-white/45">Como convidado: seu inventário e progresso não são salvos no seu aparelho; baús e estações são acessados pelo anfitrião.</div>}
        </div>
      )}
    </Panel>
  );
}
