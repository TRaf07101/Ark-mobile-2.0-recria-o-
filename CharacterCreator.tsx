import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { buildHuman, type BodyRegion } from "../entities/models";
import { bodyOf, type Appearance } from "../entities/player";
import { audio } from "../core/audio";
import { Btn } from "./common";

const click = () => audio.play("menu_click", 0.8);

/** The 22 body regions from the original (same order / IDs as SetTargetPlayerBodyVal). */
export const REGION_GROUPS: { title: string; items: [BodyRegion, string][] }[] = [
  { title: "Cabeça e Rosto", items: [["headSize", "Tamanho da Cabeça"], ["headHeight", "Altura da Cabeça"], ["headWidth", "Largura da Cabeça"], ["headDepth", "Profundidade da Cabeça"], ["upperFace", "Rosto Superior"], ["lowerFace", "Rosto Inferior"], ["neckSize", "Espessura do Pescoço"], ["neckLength", "Comprimento do Pescoço"]] },
  { title: "Tronco", items: [["chest", "Peito"], ["shoulders", "Ombros"], ["torsoWidth", "Largura do Tronco"], ["torsoDepth", "Profundidade do Tronco"], ["torsoHeight", "Altura do Tronco"], ["hipWidth", "Largura do Quadril"]] },
  { title: "Braços", items: [["armLength", "Comprimento do Braço"], ["upperArm", "Braço Superior"], ["lowerArm", "Antebraço"], ["handSize", "Tamanho da Mão"]] },
  { title: "Pernas", items: [["legLength", "Comprimento da Perna"], ["upperLeg", "Coxa"], ["lowerLeg", "Panturrilha"], ["footSize", "Tamanho do Pé"]] },
];
const ALL_REGIONS = REGION_GROUPS.flatMap((g) => g.items.map((i) => i[0]));

/** Continuous color ramps like the original's sliders (0..1 → color). */
const SKIN_RAMP = ["#f6d7c0", "#eab996", "#d49b72", "#b87b52", "#935c3a", "#6a3f26", "#442717"];
const HAIR_RAMP = ["#0e0a07", "#2a1a0e", "#4e2f17", "#7a4a24", "#a8743e", "#d4ab6a", "#eed9a4", "#9b3a1c", "#b0b0b0"];
const EYE_RAMP = ["#c8a83a", "#8aa04a", "#4a8a6a", "#3a6a9a", "#5a7a4a", "#6b4a2a", "#3a2618", "#8a4a2a"];
function ramp(stops: string[], t: number): string {
  const x = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  return "#" + new THREE.Color(stops[i]).lerp(new THREE.Color(stops[i + 1]), x - i).getHexString();
}
function nearestT(stops: string[], hex: string): number {
  let best = 0, bd = Infinity;
  const c = new THREE.Color(hex);
  for (let k = 0; k <= 100; k++) {
    const d = new THREE.Color(ramp(stops, k / 100));
    const dist = (d.r - c.r) ** 2 + (d.g - c.g) ** 2 + (d.b - c.b) ** 2;
    if (dist < bd) { bd = dist; best = k / 100; }
  }
  return best;
}

/** Six presets per gender (the original ships six default bodies for each). */
function preset(i: number, female: boolean): Partial<Appearance> {
  const P: Partial<Record<BodyRegion, number>>[] = [
    {},
    { shoulders: 0.75, chest: 0.72, upperArm: 0.78, lowerArm: 0.7, torsoWidth: 0.68, neckSize: 0.7, upperLeg: 0.65 },
    { shoulders: 0.3, chest: 0.35, upperArm: 0.3, lowerArm: 0.32, torsoWidth: 0.32, legLength: 0.62, armLength: 0.58, neckLength: 0.6 },
    { torsoDepth: 0.78, torsoWidth: 0.7, hipWidth: 0.72, upperLeg: 0.75, lowerLeg: 0.68, neckSize: 0.7, legLength: 0.4 },
    { headSize: 0.62, lowerFace: 0.7, upperFace: 0.4, shoulders: 0.6, legLength: 0.58, torsoHeight: 0.6 },
    { headSize: 0.42, headHeight: 0.4, legLength: 0.35, armLength: 0.4, torsoHeight: 0.42, footSize: 0.4, handSize: 0.4 },
  ];
  const skins = [0.35, 0.55, 0.15, 0.7, 0.45, 0.9];
  const hairs = [0.15, 0.35, 0.72, 0.05, 0.9, 0.5];
  return { female, regions: { ...P[i] }, skin: ramp(SKIN_RAMP, skins[i]), hair: ramp(HAIR_RAMP, hairs[i]), hairStyle: female ? [2, 3, 2, 3, 1, 2][i] : [1, 1, 0, 1, 3, 1][i], beard: !female && i !== 2 };
}

/** Live rotating 3D preview of the survivor. */
function Preview({ look, focus }: { look: Appearance; focus: "body" | "head" }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const st = useRef<{ r: THREE.WebGLRenderer; scene: THREE.Scene; cam: THREE.PerspectiveCamera; model: THREE.Object3D | null; yaw: number; drag: number | null; raf: number } | null>(null);
  useEffect(() => {
    const c = ref.current!;
    const r = new THREE.WebGLRenderer({ canvas: c, antialias: true, alpha: true });
    r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight("#e8f6ff", "#3a3228", 1.3));
    const key = new THREE.DirectionalLight("#fff0dc", 2.4);
    key.position.set(1.5, 2.5, 2);
    scene.add(key);
    const rim = new THREE.DirectionalLight("#7fd8ff", 1.6);
    rim.position.set(-2, 1.5, -2);
    scene.add(rim);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(0.9, 40), new THREE.MeshBasicMaterial({ color: "#5ee6ff", transparent: true, opacity: 0.12 }));
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.88, 0.9, 64), new THREE.MeshBasicMaterial({ color: "#5ee6ff", transparent: true, opacity: 0.6 }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.002;
    scene.add(ring);
    const cam = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
    const s = { r, scene, cam, model: null as THREE.Object3D | null, yaw: 0.35, drag: null as number | null, raf: 0 };
    st.current = s;
    const loop = () => {
      s.raf = requestAnimationFrame(loop);
      const w = c.clientWidth, h = c.clientHeight;
      if (c.width !== Math.floor(w * r.getPixelRatio())) { r.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }
      if (s.drag === null) s.yaw += 0.004;
      if (s.model) s.model.rotation.y = s.yaw;
      r.render(scene, cam);
    };
    loop();
    return () => { cancelAnimationFrame(s.raf); r.dispose(); };
  }, []);
  // rebuild model on appearance change
  useEffect(() => {
    const s = st.current;
    if (!s) return;
    if (s.model) s.scene.remove(s.model);
    const rig = buildHuman(bodyOf(look));
    rig.skinMat?.color.set(look.skin);
    rig.hairMat?.color.set(look.hair);
    rig.beardMat?.color.set(look.hair);
    rig.irisMats?.forEach((m) => m.color.set(look.eyes));
    rig.root.scale.setScalar(look.height);
    // natural idle pose
    rig.armL.rotation.z = 0.12; rig.armR.rotation.z = -0.12;
    rig.elbowL.rotation.x = -0.15; rig.elbowR.rotation.x = -0.15;
    s.scene.add(rig.root);
    s.model = rig.root;
  }, [look]);
  useEffect(() => {
    const s = st.current;
    if (!s) return;
    const h = 1.8 * look.height;
    if (focus === "head") { s.cam.position.set(0, h * 0.93, 1.05); s.cam.lookAt(0, h * 0.9, 0); }
    else { s.cam.position.set(0, h * 0.55, 5.4); s.cam.lookAt(0, h * 0.47, 0); }
  }, [focus, look.height]);
  return (
    <canvas ref={ref} className="w-full h-full block" style={{ touchAction: "none" }}
      onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); if (st.current) st.current.drag = e.clientX; }}
      onPointerMove={(e) => { const s = st.current; if (s && s.drag !== null) { s.yaw += (e.clientX - s.drag) * 0.01; s.drag = e.clientX; } }}
      onPointerUp={() => { if (st.current) st.current.drag = null; }} />
  );
}

function Slider({ label, value, onChange, grad }: { label: string; value: number; onChange: (v: number) => void; grad?: string }) {
  return (
    <div className="py-[3px]">
      <div className="flex justify-between text-[11px] font-semibold uppercase tracking-wider text-white/85"><span>{label}</span><span className="ark-font text-[var(--ark-cyan)]">{Math.round(value * 100)}</span></div>
      <input type="range" min={0} max={1} step={0.01} value={value} onChange={(e) => onChange(Number(e.target.value))} className="ark-slider w-full"
        style={{ background: grad ?? `linear-gradient(90deg, var(--ark-cyan) ${value * 100}%, rgba(120,220,240,.18) ${value * 100}%)` }} />
    </div>
  );
}

export function CharacterCreator({ look, setLook, onNext }: { look: Appearance; setLook: (a: Appearance) => void; onNext: () => void }) {
  const [group, setGroup] = useState(0);
  const [focus, setFocus] = useState<"body" | "head">("body");
  const regions = look.regions ?? {};
  const upd = (p: Partial<Appearance>) => setLook({ ...look, ...p });
  const setRegion = (k: BodyRegion, v: number) => upd({ regions: { ...regions, [k]: v } });
  const randomize = () => {
    click();
    const r: Partial<Record<BodyRegion, number>> = {};
    for (const k of ALL_REGIONS) r[k] = Math.max(0.1, Math.min(0.9, 0.5 + (Math.random() - 0.5) * 0.7));
    const female = Math.random() < 0.5;
    upd({ female, regions: r, skin: ramp(SKIN_RAMP, Math.random()), hair: ramp(HAIR_RAMP, Math.random()), eyes: ramp(EYE_RAMP, Math.random()), hairStyle: Math.floor(Math.random() * 4), beard: !female && Math.random() < 0.6, height: 0.92 + Math.random() * 0.16 });
  };
  const female = !!look.female;
  const hairStyles = ["Careca", "Curto", "Longo", "Rabo de Cavalo"];
  return (
    <div className="flex h-full gap-3 min-h-0">
      {/* left column: identity, presets, colors, hair */}
      <div className="w-[min(250px,30%)] shrink-0 flex flex-col min-h-0">
        <div className="flex-1 min-h-0 overflow-y-auto ark-scroll pr-1" style={{ touchAction: "pan-y" }}>
          <div className="ark-label mb-0.5">Nome do Sobrevivente</div>
          <input value={look.name} maxLength={20} onChange={(e) => upd({ name: e.target.value })} className="w-full bg-black/50 border border-[var(--ark-line)] px-2 py-1 text-sm outline-none focus:border-[var(--ark-cyan)]" />
          <div className="ark-label mt-2 mb-0.5">Gênero</div>
          <div className="flex gap-1">
            {[["Masculino", false], ["Feminino", true]].map(([l, v]) => (
              <button key={l as string} onClick={() => { click(); upd({ female: v as boolean, hairStyle: v ? 2 : 1, beard: !v }); }} className={`flex-1 ark-font py-1 text-[13px] font-bold uppercase border ${female === v ? "border-[var(--ark-cyan)] text-[var(--ark-cyan)] bg-[var(--ark-cyan)]/12" : "border-white/15 text-white/60"}`}>{l as string}</button>
            ))}
          </div>
          <div className="ark-label mt-2 mb-0.5">Predefinições</div>
          <div className="grid grid-cols-6 gap-1">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <button key={i} onClick={() => { click(); upd(preset(i, female)); }} className="ark-font py-1 text-[13px] font-bold border border-white/15 bg-black/30 hover:border-[var(--ark-cyan)]">{i + 1}</button>
            ))}
          </div>
          <Slider label="Cor da Pele" value={nearestT(SKIN_RAMP, look.skin)} onChange={(t) => upd({ skin: ramp(SKIN_RAMP, t) })} grad={`linear-gradient(90deg, ${SKIN_RAMP.join(",")})`} />
          <Slider label="Cor do Cabelo" value={nearestT(HAIR_RAMP, look.hair)} onChange={(t) => upd({ hair: ramp(HAIR_RAMP, t) })} grad={`linear-gradient(90deg, ${HAIR_RAMP.join(",")})`} />
          <Slider label="Cor dos Olhos" value={nearestT(EYE_RAMP, look.eyes)} onChange={(t) => upd({ eyes: ramp(EYE_RAMP, t) })} grad={`linear-gradient(90deg, ${EYE_RAMP.join(",")})`} />
          <div className="ark-label mt-1 mb-0.5">Estilo de Cabelo</div>
          <div className="grid grid-cols-2 gap-1">
            {hairStyles.map((h, i) => <button key={h} onClick={() => { click(); upd({ hairStyle: i }); }} className={`ark-font py-1 text-[12px] font-bold uppercase border ${(look.hairStyle ?? (female ? 2 : 1)) === i ? "border-[var(--ark-cyan)] text-[var(--ark-cyan)]" : "border-white/15 text-white/60"}`}>{h}</button>)}
          </div>
          {!female && (
            <button onClick={() => { click(); upd({ beard: !(look.beard ?? true) }); }} className="mt-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider">
              <span className="w-4 h-4 border-2 flex items-center justify-center" style={{ borderColor: "var(--ark-cyan)" }}>{(look.beard ?? true) && <span className="w-2 h-2 bg-[var(--ark-cyan)]" />}</span>Barba por fazer
            </button>
          )}
          <Slider label="Altura Geral" value={(look.height - 0.9) / 0.2} onChange={(t) => upd({ height: 0.9 + t * 0.2 })} />
        </div>
      </div>
      {/* center: live preview */}
      <div className="flex-1 min-w-0 relative ark-panel overflow-hidden" style={{ background: "radial-gradient(ellipse at 50% 40%, rgba(40,90,110,.45), rgba(2,10,14,.9))" }}>
        <Preview look={look} focus={focus} />
        <div className="absolute top-1.5 left-1.5 flex gap-1">
          {([["body", "Corpo"], ["head", "Rosto"]] as const).map(([k, l]) => <button key={k} onClick={() => { click(); setFocus(k); }} className={`ark-font px-2.5 py-0.5 text-[11px] font-bold uppercase border ${focus === k ? "border-[var(--ark-cyan)] text-[var(--ark-cyan)] bg-black/50" : "border-white/20 text-white/60 bg-black/40"}`}>{l}</button>)}
        </div>
        <div className="absolute bottom-1 left-0 right-0 text-center text-[10px] text-white/45">Arraste para girar</div>
        <div className="absolute top-1.5 right-1.5 flex flex-col gap-1">
          <Btn variant="ghost" onClick={randomize}>Aleatório</Btn>
          <Btn variant="ghost" onClick={() => { click(); upd({ regions: {}, height: 1 }); }}>Restaurar</Btn>
        </div>
      </div>
      {/* right: body region sliders grouped (22 regions) */}
      <div className="w-[min(260px,32%)] shrink-0 flex flex-col min-h-0">
        <div className="flex flex-wrap gap-0 border-b border-[var(--ark-line)] mb-1">
          {REGION_GROUPS.map((g, i) => (
            <button key={g.title} onClick={() => { click(); setGroup(i); setFocus(i === 0 ? "head" : "body"); }} className={`ark-font px-1.5 pb-1 text-[11px] font-bold uppercase tracking-wider border-b-2 ${group === i ? "text-[var(--ark-cyan)] border-[var(--ark-cyan)]" : "text-white/55 border-transparent"}`}>{g.title}</button>
          ))}
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto ark-scroll pr-1" style={{ touchAction: "pan-y" }}>
          {REGION_GROUPS[group].items.map(([k, l]) => <Slider key={k} label={l} value={regions[k] ?? 0.5} onChange={(v) => setRegion(k, v)} />)}
        </div>
        <Btn variant="primary" className="mt-1.5" onClick={() => { click(); onNext(); }}>Próximo: Região</Btn>
      </div>
    </div>
  );
}
