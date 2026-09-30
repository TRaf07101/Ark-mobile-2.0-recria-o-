// One-tap fullscreen + landscape lock (Fullscreen API + Screen Orientation API), with vendor fallbacks.
type FsDoc = Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => Promise<void> };
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
type Orient = { lock?: (o: string) => Promise<void>; unlock?: () => void; type?: string };

export function isFullscreen(): boolean {
  const d = document as FsDoc;
  return !!(d.fullscreenElement || d.webkitFullscreenElement);
}

export function fullscreenSupported(): boolean {
  const el = document.documentElement as FsEl;
  return !!(el.requestFullscreen || el.webkitRequestFullscreen);
}

export function isLandscape(): boolean {
  return window.innerWidth >= window.innerHeight;
}

/** Enter fullscreen and lock the screen to landscape. Must be called from a user gesture. */
export async function enterFullscreenLandscape(): Promise<{ fullscreen: boolean; landscape: boolean; message?: string }> {
  const el = document.documentElement as FsEl;
  let fs = isFullscreen();
  if (!fs) {
    try {
      if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: "hide" } as FullscreenOptions);
      else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
      fs = isFullscreen();
    } catch { fs = false; }
  }
  let land = isLandscape();
  const o = screen.orientation as unknown as Orient | undefined;
  if (o?.lock) {
    try { await o.lock("landscape"); land = true; } catch { /* not allowed on this device/browser */ }
  }
  let message: string | undefined;
  if (!fs && !fullscreenSupported()) message = "Este navegador não permite tela cheia (no iPhone: Compartilhar → Adicionar à Tela de Início).";
  else if (!fs) message = "O navegador recusou a tela cheia. Toque novamente.";
  else if (!land) message = "Gire o aparelho para a horizontal (o navegador não permitiu travar a orientação).";
  return { fullscreen: fs, landscape: land, message };
}

export async function exitFullscreen() {
  const d = document as FsDoc;
  try { (screen.orientation as unknown as Orient | undefined)?.unlock?.(); } catch { /* ignore */ }
  try {
    if (d.exitFullscreen && d.fullscreenElement) await d.exitFullscreen();
    else if (d.webkitExitFullscreen && d.webkitFullscreenElement) await d.webkitExitFullscreen();
  } catch { /* ignore */ }
}
