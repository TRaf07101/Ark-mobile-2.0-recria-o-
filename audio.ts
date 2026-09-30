// Procedural sound effects (no external assets). All synthesized with WebAudio.
class Audio {
  ctx: AudioContext | null = null;
  master!: GainNode;
  sfx!: GainNode;
  musicBus!: GainNode;
  ambientBus!: GainNode;
  noise!: AudioBuffer;
  volume = 0.8;
  vols = { master: 0.9, music: 0.55, sfx: 0.85, ambient: 0.7 };

  init() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
      return;
    }
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.vols.master;
      this.master.connect(this.ctx.destination);
      this.sfx = this.ctx.createGain();
      this.musicBus = this.ctx.createGain();
      this.ambientBus = this.ctx.createGain();
      this.sfx.gain.value = this.vols.sfx;
      this.musicBus.gain.value = this.vols.music;
      this.ambientBus.gain.value = this.vols.ambient;
      this.sfx.connect(this.master);
      this.musicBus.connect(this.master);
      this.ambientBus.connect(this.master);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, len);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) {
      console.warn("Audio unavailable", e);
      this.ctx = null;
    }
  }

  setVolume(v: number) {
    this.setVolumes({ master: v });
  }
  setVolumes(v: Partial<{ master: number; music: number; sfx: number; ambient: number }>) {
    Object.assign(this.vols, v);
    if (!this.ctx) return;
    this.master.gain.value = this.vols.master;
    this.sfx.gain.value = this.vols.sfx;
    this.musicBus.gain.value = this.vols.music;
    this.ambientBus.gain.value = this.vols.ambient;
  }

  private env(g: GainNode, t: number, peak: number, dur: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  private burst(type: BiquadFilterType, freq: number, dur: number, vol: number, sweep = 1, delay = 0) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + delay;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweep !== 1) f.frequency.exponentialRampToValueAtTime(freq * sweep, t + dur);
    const g = c.createGain();
    this.env(g, t, vol, dur);
    s.connect(f); f.connect(g); g.connect(this.sfx);
    s.start(t, Math.random() * 0.5, dur + 0.05);
  }

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, delay = 0) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    this.env(g, t, vol, dur);
    o.connect(g); g.connect(this.sfx);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  play(name: string, vol = 1) {
    if (!this.ctx || vol < 0.02) return;
    const j = 0.9 + Math.random() * 0.2;
    switch (name) {
      case "wood": this.burst("bandpass", 500 * j, 0.15, 0.5 * vol); this.tone("triangle", 160 * j, 100, 0.12, 0.15 * vol); break;
      case "stone": this.burst("bandpass", 1500 * j, 0.12, 0.5 * vol); this.burst("lowpass", 400, 0.1, 0.3 * vol); break;
      case "flesh": this.burst("lowpass", 700 * j, 0.14, 0.5 * vol); this.tone("sine", 120, 70, 0.1, 0.2 * vol); break;
      case "swing": this.burst("bandpass", 1200, 0.12, 0.12 * vol, 2.2); break;
      case "gather": this.burst("highpass", 3000 * j, 0.1, 0.25 * vol); break;
      case "pickup": this.tone("sine", 700 * j, 1300, 0.08, 0.15 * vol); break;
      case "craft": this.tone("square", 500, 800, 0.08, 0.05 * vol); this.tone("square", 800, 1000, 0.08, 0.05 * vol, 0.08); break;
      case "eat": for (let i = 0; i < 3; i++) this.burst("bandpass", 900 + i * 200, 0.07, 0.25 * vol, 1, i * 0.1); break;
      case "drink": for (let i = 0; i < 3; i++) this.tone("sine", 400 + i * 80, 250, 0.1, 0.15 * vol, i * 0.13); break;
      case "hurt": this.tone("sawtooth", 200, 90, 0.2, 0.15 * vol); this.burst("lowpass", 500, 0.15, 0.3 * vol); break;
      case "level": [523, 659, 784, 1047].forEach((f, i) => this.tone("triangle", f, f, 0.25, 0.12 * vol, i * 0.1)); break;
      case "build": this.burst("lowpass", 300, 0.25, 0.6 * vol); this.tone("triangle", 110, 70, 0.2, 0.25 * vol); break;
      case "door": this.burst("bandpass", 350, 0.3, 0.3 * vol, 0.6); break;
      case "bow": this.tone("triangle", 180, 90, 0.15, 0.25 * vol); this.burst("highpass", 2500, 0.1, 0.15 * vol); break;
      case "splash": this.burst("lowpass", 1200, 0.4, 0.3 * vol, 0.3); break;
      case "fire": this.burst("bandpass", 2000, 0.3, 0.08 * vol); break;
      case "click": this.tone("square", 900, 700, 0.03, 0.04 * vol); break;
      case "tame": [392, 523, 659, 784, 1047].forEach((f, i) => this.tone("sine", f, f, 0.3, 0.12 * vol, i * 0.09)); break;
      case "roar": this.tone("sawtooth", 150 * j, 60, 1.1, 0.22 * vol); this.tone("sawtooth", 157 * j, 55, 1.1, 0.16 * vol); this.burst("lowpass", 500, 1.0, 0.3 * vol, 0.4); break;
      case "step_grass": this.burst("highpass", 2400 * j, 0.06, 0.06 * vol); break;
      case "step_sand": this.burst("bandpass", 1400 * j, 0.09, 0.08 * vol); break;
      case "step_stone": this.burst("bandpass", 2200 * j, 0.04, 0.08 * vol); this.tone("triangle", 300 * j, 200, 0.03, 0.03 * vol); break;
      case "step_wood": this.burst("bandpass", 600 * j, 0.07, 0.12 * vol); this.tone("triangle", 140 * j, 110, 0.06, 0.06 * vol); break;
      case "step_water": this.burst("lowpass", 900 * j, 0.12, 0.1 * vol, 0.5); break;
      // creature voices
      case "chirp": this.tone("sine", 900 * j, 1400, 0.1, 0.12 * vol); this.tone("sine", 1000 * j, 1500, 0.1, 0.1 * vol, 0.15); break;
      case "squawk": this.tone("sawtooth", 700 * j, 400, 0.2, 0.15 * vol); break;
      case "peck": this.burst("highpass", 2000, 0.05, 0.2 * vol); break;
      case "horn": this.tone("sawtooth", 180 * j, 170, 1.0, 0.1 * vol); this.tone("sine", 360 * j, 340, 1.0, 0.08 * vol); break;
      case "bellow": this.tone("sawtooth", 140 * j, 80, 0.6, 0.18 * vol); break;
      case "grunt": this.tone("sawtooth", 110 * j, 70, 0.25, 0.15 * vol); break;
      case "rumble": this.tone("sawtooth", 70 * j, 55, 0.8, 0.15 * vol); break;
      case "charge": this.burst("lowpass", 300, 0.4, 0.5 * vol); this.tone("sawtooth", 90, 60, 0.4, 0.2 * vol); break;
      case "hiss": this.burst("highpass", 3500, 0.6, 0.12 * vol); break;
      case "screech": this.tone("sawtooth", 1200 * j, 600, 0.35, 0.12 * vol); this.burst("bandpass", 2500, 0.3, 0.15 * vol); break;
      case "snap": this.burst("bandpass", 1800, 0.07, 0.4 * vol); break;
      case "chitter": for (let i = 0; i < 4; i++) this.tone("square", 800 + Math.random() * 400, 600, 0.05, 0.05 * vol, i * 0.07); break;
      case "thunder": this.burst("lowpass", 180, 2.6, 0.9 * vol, 0.4); this.burst("lowpass", 90, 3.2, 0.7 * vol, 0.6, 0.15); this.tone("sine", 50, 30, 2, 0.3 * vol); break;
      case "whistle": this.tone("sine", 1400, 1900, 0.18, 0.12 * vol); this.tone("sine", 1900, 1500, 0.2, 0.12 * vol, 0.2); break;
      case "implant": this.tone("sine", 880, 1320, 0.25, 0.05 * vol); this.tone("sine", 1320, 1760, 0.3, 0.035 * vol, 0.18); this.burst("highpass", 4000, 0.3, 0.04 * vol, 1.5, 0.1); break;
      case "hum": this.tone("sine", 55, 55, 2.4, 0.08 * vol); this.tone("sine", 110.5, 110, 2.4, 0.04 * vol); this.tone("triangle", 220, 221, 2.2, 0.015 * vol); break;
      case "menu_hover": this.tone("sine", 1200, 1400, 0.05, 0.03 * vol); break;
      case "menu_click": this.tone("triangle", 600, 900, 0.07, 0.07 * vol); this.burst("highpass", 3000, 0.05, 0.05 * vol); break;
      case "inventory": this.burst("bandpass", 700, 0.15, 0.12 * vol, 0.6); break;
      case "cricket": for (let i = 0; i < 3; i++) this.tone("sine", 4200 + Math.random() * 300, 4000, 0.04, 0.03 * vol, i * 0.07 + Math.random() * 0.3); break;
      case "shriek": this.tone("sawtooth", 1500 * j, 800, 0.3, 0.12 * vol); break;
    }
  }
}

/** Looping ambience: wind + surf + birds (day) / crickets (night). */
export class Ambience {
  private wind: GainNode | null = null;
  private surf: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private chirpT = 0;
  private rainG: GainNode | null = null;
  start() {
    const c = audio.ctx;
    if (!c || this.wind) return;
    const mk = (type: BiquadFilterType, freq: number) => {
      const src = c.createBufferSource();
      src.buffer = audio.noise;
      src.loop = true;
      const f = c.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      const g = c.createGain();
      g.gain.value = 0;
      src.connect(f); f.connect(g); g.connect(audio.ambientBus);
      src.start();
      return { g, f };
    };
    const w = mk("lowpass", 400);
    this.wind = w.g; this.windFilter = w.f;
    this.surf = mk("bandpass", 700).g;
    this.rainG = mk("highpass", 1800).g;
  }
  update(dt: number, wind: number, nearSea: number, day: number, indoors: boolean, rain = 0) {
    const c = audio.ctx;
    if (!c) return;
    if (!this.wind) this.start();
    const t = c.currentTime;
    this.wind?.gain.setTargetAtTime((indoors ? 0.02 : 0.05) * wind, t, 0.5);
    this.windFilter?.frequency.setTargetAtTime(300 + wind * 300 + Math.sin(t * 0.3) * 120, t, 0.8);
    this.surf?.gain.setTargetAtTime(nearSea * (0.06 + Math.sin(t * 0.7) * 0.03), t, 0.4);
    this.rainG?.gain.setTargetAtTime(rain * (indoors ? 0.05 : 0.14), t, 0.8);
    this.chirpT -= dt;
    if (this.chirpT <= 0) {
      this.chirpT = 1.5 + Math.random() * 5;
      if (rain > 0.4) { /* animals hide in the rain */ }
      else if (day > 0.5) audio.play("chirp", 0.25 * Math.random());
      else for (let i = 0; i < 3; i++) audio.play("cricket", 0.15);
    }
  }
}

export const audio = new Audio();

/**
 * Procedural orchestral score: slow minor-key chord progression with string pads,
 * low brass swells, taiko-like drums (menu) and a sparse ambient mode in-game.
 */
export class Music {
  private timer = 0;
  private chord = 0;
  mode: "off" | "menu" | "ambient" = "off";
  private ambientNext = 40;
  private readonly prog = [
    [57, 60, 64], // Am
    [53, 57, 60], // F
    [48, 52, 55], // C
    [55, 59, 62], // G
    [57, 60, 64],
    [50, 53, 57], // Dm
    [52, 55, 59], // Em
    [57, 60, 64],
  ];
  private hz(m: number) { return 440 * Math.pow(2, (m - 69) / 12); }

  private pad(notes: number[], dur: number, vol: number, bright = 900) {
    const c = audio.ctx;
    if (!c) return;
    const t = c.currentTime;
    const f = c.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(bright * 0.5, t);
    f.frequency.linearRampToValueAtTime(bright, t + dur * 0.5);
    f.frequency.linearRampToValueAtTime(bright * 0.4, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + dur * 0.35);
    g.gain.linearRampToValueAtTime(vol * 0.8, t + dur * 0.8);
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 1.5);
    f.connect(g);
    g.connect(audio.musicBus);
    for (const n of notes) for (const det of [-7, 0, 7]) {
      const o = c.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = this.hz(n);
      o.detune.value = det + (Math.random() - 0.5) * 4;
      o.connect(f);
      o.start(t);
      o.stop(t + dur + 1.6);
    }
  }

  private bass(note: number, dur: number, vol: number) {
    const c = audio.ctx;
    if (!c) return;
    const t = c.currentTime;
    const o = c.createOscillator();
    o.type = "triangle";
    o.frequency.value = this.hz(note - 24);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 1.2);
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 1);
    o.connect(g);
    g.connect(audio.musicBus);
    o.start(t);
    o.stop(t + dur + 1.1);
  }

  private drum(delay: number, vol: number) {
    const c = audio.ctx;
    if (!c) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(95, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.5);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    o.connect(g);
    g.connect(audio.musicBus);
    o.start(t);
    o.stop(t + 1);
    const s = c.createBufferSource();
    s.buffer = audio.noise;
    const f = c.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 400;
    const g2 = c.createGain();
    g2.gain.setValueAtTime(vol * 0.5, t);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    s.connect(f); f.connect(g2); g2.connect(audio.musicBus);
    s.start(t, Math.random(), 0.3);
  }

  private bell(note: number, delay: number, vol: number) {
    const c = audio.ctx;
    if (!c) return;
    const t = c.currentTime + delay;
    for (const [mul, v] of [[1, 1], [2.01, 0.4], [3.02, 0.15]]) {
      const o = c.createOscillator();
      o.type = "sine";
      o.frequency.value = this.hz(note) * mul;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol * v, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 3.5);
      o.connect(g);
      g.connect(audio.musicBus);
      o.start(t);
      o.stop(t + 3.6);
    }
  }

  update(dt: number) {
    if (!audio.ctx || this.mode === "off") return;
    this.timer -= dt;
    if (this.mode === "menu") {
      if (this.timer > 0) return;
      const dur = 6;
      this.timer = dur;
      const ch = this.prog[this.chord % this.prog.length];
      this.pad(ch.map((n) => n - 12), dur, 0.05, 1100);
      this.bass(ch[0], dur, 0.14);
      if (this.chord % 2 === 0) for (let i = 0; i < 4; i++) this.drum(i * 1.5, i === 0 ? 0.5 : 0.25);
      if (this.chord % 4 === 3) [0, 0.75, 1.5].forEach((d, i) => this.bell(ch[i % 3] + 12, d, 0.05));
      this.chord++;
    } else {
      this.ambientNext -= dt;
      if (this.ambientNext > 0 || this.timer > 0) return;
      // sparse ambient cue: two or three soft chords, then silence for a while
      const ch = this.prog[Math.floor(Math.random() * this.prog.length)];
      this.pad(ch.map((n) => n - 12), 9, 0.025, 700);
      this.bell(ch[2] + 12, 2, 0.03);
      this.timer = 10;
      this.ambientNext = 70 + Math.random() * 90;
    }
  }

  setMode(m: "off" | "menu" | "ambient") {
    if (m === this.mode) return;
    this.mode = m;
    this.timer = 0;
    this.chord = 0;
    this.ambientNext = 25;
  }
}
export const music = new Music();
