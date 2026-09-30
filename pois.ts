import * as THREE from "three";
import { mulberry32 } from "../core/noise";
import { stoneBlockTexture, glowTexture } from "../core/textures";
import type { Terrain } from "./terrain";
import type { Physics } from "./physics";

export interface Note {
  id: number;
  title: string;
  author: string;
  text: string;
  pos: THREE.Vector3;
  mesh: THREE.Object3D;
  collected: boolean;
  poi: string;
}

export interface Poi {
  id: string;
  kind: "obelisk" | "ruin";
  name: string;
  color: string;
  pos: THREE.Vector3;
  group: THREE.Group;
  crystal?: THREE.Object3D;
  rocks?: THREE.Group;
  beamTex?: THREE.Texture;
  core?: THREE.Object3D;
  terminal?: THREE.Vector3;
  hover?: number;
}

const NOTES: { title: string; author: string; text: string }[] = [
  { title: "Diário, Dia 1", author: "Helena Varga", text: "Acordei na areia com um cristal cravado no braço. Ele brilha quando olho para as torres no horizonte. Não sei quem me trouxe, mas sei que não estou sozinha: há pegadas do tamanho de uma carroça perto da água." },
  { title: "Sobre os Dodôs", author: "Helena Varga", text: "Aves gordas, lentas e absolutamente sem medo. Uma delas bicou minha bota por meia hora. Serão meu jantar, mas confesso que me afeiçoei a elas." },
  { title: "Relatório de Patrulha", author: "Centurião Marco", text: "Os lagartos de gola colorida cospem algo que cega. Perdemos dois homens na floresta antes de entendermos que a gola se abre antes do ataque. Recuem quando virem as cores." },
  { title: "As Torres", author: "Mei Yin", text: "Três colunas de luz flutuam sobre a ilha: vermelha ao norte, verde e azul em extremos opostos. Nenhuma lança as alcança. Elas observam. Sinto que estão contando os dias." },
  { title: "Domesticação", author: "Mei Yin", text: "A fera não se rende à força; rende-se ao sono e à fome. Faça-a dormir, alimente-a com paciência e ela acordará leal. Quanto menos a ferir, mais forte ela será ao seu lado." },
  { title: "Os Chifrudos", author: "Rockwell", text: "Os herbívoros de escudo ósseo parecem plácidos, mas atacam quando provocados. Seus chifres atravessam madeira como se fosse papel. Fascinante. Preciso de uma amostra da queratina." },
  { title: "Ruínas", author: "Rockwell", text: "Estas pedras são mais antigas que qualquer civilização que conheço. As inscrições repetem um símbolo: um círculo cercado por três pontos. Três torres. Três testes?" },
  { title: "Noite", author: "Helena Varga", text: "À noite os caçadores ficam ousados. Uma fogueira acesa e paredes de madeira são a diferença entre dormir e ser devorada. Aprendi da pior maneira." },
  { title: "O Carnotauro", author: "Centurião Marco", text: "Um touro com dentes de lobo. Corre mais que um cavalo em campo aberto. Se ouvir o rugido nas colinas, suba numa rocha e reze para que ele perca o interesse." },
  { title: "Suprimentos do Céu", author: "Mei Yin", text: "Às vezes um feixe de luz desce do céu e deixa caixas cheias de ferramentas e comida. Quem as envia? E por que parecem saber do que precisamos?" },
];

let NOTE_ID = 1;

export class PoiManager {
  pois: Poi[] = [];
  notes: Note[] = [];
  private objects: THREE.Object3D[] = [];

  constructor(private scene: THREE.Scene, private terrain: Terrain, private physics: Physics, seed: number) {
    NOTE_ID = 1;
    const rng = mulberry32(seed + 999);
    const stone = new THREE.MeshStandardMaterial({ map: stoneBlockTexture(), roughness: 0.95 });
    const obelisks: [string, string, number][] = [["Obelisco Vermelho", "#ff4a3a", -Math.PI / 2], ["Obelisco Verde", "#3aff7a", Math.PI * 0.15], ["Obelisco Azul", "#3ab0ff", Math.PI * 0.85]];
    for (const [name, color, ang] of obelisks) {
      const p = this.findSpot(rng, ang, 0.3, 0.7, 4, 40);
      if (p) this.pois.push(this.makeObelisk(name, color, p, stone));
    }
    let tries = 0;
    let ruins = 0;
    while (ruins < 7 && tries++ < 400) {
      const p = this.findSpot(rng, rng() * Math.PI * 2, 0.15, 0.8, 2.5, 22);
      if (!p) continue;
      if (this.pois.some((o) => o.pos.distanceTo(p) < 70)) continue;
      this.pois.push(this.makeRuin(`Ruínas ${["do Leste", "da Clareira", "Esquecidas", "do Vale", "Antigas", "da Colina", "do Rio"][ruins]}`, p, stone, rng));
      ruins++;
    }
    // explorer notes at each POI
    this.pois.forEach((poi, i) => {
      const n = NOTES[i % NOTES.length];
      const off = poi.kind === "obelisk" ? new THREE.Vector3(12, 0, 0) : new THREE.Vector3(0, 0, 0);
      const pos = poi.pos.clone().add(off);
      pos.y = this.terrain.heightAt(pos.x, pos.z) + 1.1;
      this.notes.push(this.makeNote(n.title, n.author, n.text, pos, poi.name));
    });
  }

  private findSpot(rng: () => number, ang: number, rMin: number, rMax: number, minH: number, maxH: number): THREE.Vector3 | null {
    const t = this.terrain;
    for (let i = 0; i < 80; i++) {
      const a = ang + (rng() - 0.5) * 0.9;
      const r = t.half * (rMin + rng() * (rMax - rMin));
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const h = t.heightAt(x, z);
      if (h < minH || h > maxH) continue;
      if (t.normalAt(x, z).y < 0.9) continue;
      return new THREE.Vector3(x, h, z);
    }
    return null;
  }

  private add(o: THREE.Object3D) {
    this.scene.add(o);
    this.objects.push(o);
  }

  private makeObelisk(name: string, color: string, p0: THREE.Vector3, stone: THREE.Material): Poi {
    // seat the platform on the highest terrain point of its footprint so the ground never pokes
    // through the tiers (that was the z-fighting), and extend the base down to the lowest point
    let hMin = Infinity, hMax = -Infinity;
    for (let r = 0; r <= 10.5; r += 1.5) for (let a = 0; a < Math.PI * 2; a += Math.PI / 12) {
      const h = this.terrain.heightAt(p0.x + Math.cos(a) * r, p0.z + Math.sin(a) * r);
      hMin = Math.min(hMin, h); hMax = Math.max(hMax, h);
    }
    const p = new THREE.Vector3(p0.x, hMax + 0.02, p0.z);
    const baseDepth = p.y - hMin + 1.5;
    const g = new THREE.Group();
    g.position.copy(p);
    const col = new THREE.Color(color);
    const glow = new THREE.MeshBasicMaterial({ color, fog: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const metal = new THREE.MeshStandardMaterial({ color: "#3a3f47", metalness: 0.85, roughness: 0.32 });
    const dark = new THREE.MeshStandardMaterial({ color: "#1d2127", metalness: 0.9, roughness: 0.28, emissive: col, emissiveIntensity: 0.06 });
    const oct = (r0: number, r1: number, h: number, m: THREE.Material, y: number) => {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, h, 8), m);
      c.rotation.y = Math.PI / 8;
      c.position.y = y;
      c.castShadow = c.receiveShadow = true;
      g.add(c);
      return c;
    };
    // ---- stepped octagonal platform with glowing inlays
    const tiers: [number, number][] = [[9.5, 0.45], [7.8, 0.9], [6.0, 1.35]];
    for (const [r, top] of tiers) {
      oct(r, r * 0.98, top + baseDepth, stone, top - (top + baseDepth) / 2 - 0.004);
      // metal edge band sits slightly below/outside the stone top so no faces are coplanar
      const trim = oct(r * 1.015, r * 1.015, 0.14, metal, top - 0.09);
      trim.castShadow = false;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 0.93, 0.06, 4, 8), glow);
      ring.rotation.set(Math.PI / 2, 0, Math.PI / 8);
      ring.position.y = top + 0.035;
      g.add(ring);
    }
    // radial light channels on the top tier
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const line = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 3.4), glow);
      line.position.set(Math.sin(a) * 3.6, 1.35 + 0.03, Math.cos(a) * 3.6);
      line.rotation.y = a;
      g.add(line);
      // perimeter pylons with glowing caps
      const py = new THREE.Mesh(new THREE.BoxGeometry(0.45, 2.2, 0.45), metal);
      py.position.set(Math.sin(a + Math.PI / 8) * 8.6, 1.55, Math.cos(a + Math.PI / 8) * 8.6);
      py.castShadow = true;
      g.add(py);
      const tip = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), glow);
      tip.position.copy(py.position).setY(2.9);
      g.add(tip);
    }
    // ---- tribute terminal: octagonal pedestal, metal claws, faceted crystal core, console
    oct(1.6, 1.3, 0.6, metal, 1.35 + 0.3 + 0.006);
    oct(1.1, 0.9, 0.5, dark, 1.35 + 0.85 + 0.012);
    const crystal = new THREE.Group();
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.55, 2.2, 6), new THREE.MeshStandardMaterial({ color, emissive: col, emissiveIntensity: 1.3, roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.9 }));
    crystal.add(core);
    for (const sgn of [-1, 1]) {
      const tp = new THREE.Mesh(new THREE.ConeGeometry(sgn > 0 ? 0.42 : 0.55, sgn > 0 ? 1.1 : 0.6, 6), core.material);
      tp.position.y = sgn * (1.1 + (sgn > 0 ? 0.55 : 0.3));
      if (sgn < 0) tp.rotation.x = Math.PI;
      crystal.add(tp);
    }
    for (let i = 0; i < 5; i++) {
      const shard = new THREE.Mesh(new THREE.CylinderGeometry(0.0, 0.16, 0.9, 5), core.material);
      const a = (i / 5) * Math.PI * 2;
      shard.position.set(Math.cos(a) * 0.55, -0.6, Math.sin(a) * 0.55);
      shard.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
      crystal.add(shard);
    }
    crystal.position.y = 1.35 + 1.1 + 1.3;
    g.add(crystal);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const claw = new THREE.Group();
      const c1 = new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.6, 0.35), metal);
      c1.position.y = 1.3;
      c1.rotation.z = -0.28;
      const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.2, 0.3), metal);
      c2.position.set(-0.55, 2.9, 0);
      c2.rotation.z = 0.35;
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 2.2, 0.06), glow);
      strip.position.set(0.12, 1.3, 0);
      strip.rotation.z = -0.28;
      claw.add(c1, c2, strip);
      claw.children.forEach((o) => ((o as THREE.Mesh).castShadow = true));
      claw.position.set(Math.cos(a) * 1.2, 1.35, Math.sin(a) * 1.2);
      claw.rotation.y = -a;
      g.add(claw);
    }
    // console facing outward (south) with a glowing screen
    const consoleG = new THREE.Group();
    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.1, 0.5), metal);
    stand.position.y = 0.55;
    const screen = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.08), dark);
    screen.position.set(0, 1.25, 0.1);
    screen.rotation.x = -0.5;
    const disp = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 0.48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, fog: false, toneMapped: false }));
    disp.position.set(0, 1.27, 0.15);
    disp.rotation.x = -0.5;
    consoleG.add(stand, screen, disp);
    consoleG.position.set(0, 1.35, 3.6);
    stand.castShadow = screen.castShadow = true;
    g.add(consoleG);

    // ---- floating spire (hexagonal segmented obelisk with glowing seams)
    const spire = new THREE.Group();
    const segs = [[4.6, 5.2, 16], [5.2, 5.0, 18], [5.0, 4.3, 16], [4.3, 3.4, 12]];
    let y = 0;
    const bodyMat = new THREE.MeshStandardMaterial({ color: "#2a2f37", metalness: 0.8, roughness: 0.38, emissive: col, emissiveIntensity: 0.05, fog: false });
    const seamMat = new THREE.MeshBasicMaterial({ color, fog: false, toneMapped: false });
    const botCone = new THREE.Mesh(new THREE.ConeGeometry(4.6, 18, 6), bodyMat);
    botCone.rotation.x = Math.PI;
    botCone.position.y = -9;
    spire.add(botCone);
    for (const [r0, r1, h] of segs) {
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, h, 6), bodyMat);
      seg.position.y = y + h / 2;
      spire.add(seg);
      // glowing seam band between segments
      const band = new THREE.Mesh(new THREE.CylinderGeometry(r0 * 1.03, r0 * 1.03, 0.5, 6), seamMat);
      band.position.y = y;
      spire.add(band);
      // vertical light strips on alternate faces
      for (let f = 0; f < 6; f += 2) {
        const a = (f / 6) * Math.PI * 2 + Math.PI / 6;
        const rr = ((r0 + r1) / 2) * Math.cos(Math.PI / 6) + 0.05;
        const strip = new THREE.Mesh(new THREE.BoxGeometry(0.35, h * 0.8, 0.12), seamMat);
        strip.position.set(Math.sin(a) * rr, y + h / 2, Math.cos(a) * rr);
        strip.rotation.y = a;
        strip.rotation.x = Math.atan2(r0 - r1, h) * (Math.cos(a) > 0 ? 1 : 1);
        spire.add(strip);
      }
      y += h;
    }
    const topCone = new THREE.Mesh(new THREE.ConeGeometry(3.4, 16, 6), bodyMat);
    topCone.position.y = y + 8;
    spire.add(topCone);
    // angular side blades
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.8, 40, 3.2), bodyMat);
      blade.position.set(Math.sin(a) * 5.4, 30, Math.cos(a) * 5.4);
      blade.rotation.y = a;
      spire.add(blade);
      const bl = new THREE.Mesh(new THREE.BoxGeometry(0.2, 34, 0.25), seamMat);
      bl.position.set(Math.sin(a) * 6.7, 30, Math.cos(a) * 6.7);
      bl.rotation.y = a;
      spire.add(bl);
    }
    const hover = 95;
    spire.position.y = hover;
    g.add(spire);
    // ---- orbiting ring of floating boulders around the lower spire
    const rocks = new THREE.Group();
    const rockMat = new THREE.MeshStandardMaterial({ color: "#6f6860", roughness: 0.95, fog: false });
    for (let i = 0; i < 16; i++) {
      const geo = new THREE.IcosahedronGeometry(1.4 + (i % 4) * 0.7, 1);
      const pa = geo.attributes.position as THREE.BufferAttribute;
      for (let v = 0; v < pa.count; v++) {
        const k = 1 + Math.sin(pa.getX(v) * 3 + i) * Math.cos(pa.getY(v) * 2.3 + i) * 0.25;
        pa.setXYZ(v, pa.getX(v) * k, pa.getY(v) * k * 0.8, pa.getZ(v) * k);
      }
      geo.computeVertexNormals();
      const rk = new THREE.Mesh(geo, rockMat);
      const a = (i / 16) * Math.PI * 2;
      const rad = 20 + (i % 3) * 3;
      rk.position.set(Math.cos(a) * rad, Math.sin(i * 1.7) * 3, Math.sin(a) * rad);
      rk.rotation.set(i, i * 2, 0);
      rk.userData.spin = 0.2 + (i % 5) * 0.08;
      rocks.add(rk);
    }
    rocks.position.y = hover - 4;
    g.add(rocks);
    // ---- energy beam from spire tip down to the terminal crystal (animated scrolling bands)
    const beamTex = (() => {
      const c = document.createElement("canvas");
      c.width = 8; c.height = 128;
      const ctx = c.getContext("2d")!;
      for (let yy = 0; yy < 128; yy++) {
        const v = 0.55 + 0.45 * Math.pow(Math.sin((yy / 128) * Math.PI * 6), 2);
        ctx.fillStyle = `rgba(255,255,255,${v})`;
        ctx.fillRect(0, yy, 8, 1);
      }
      const t = new THREE.CanvasTexture(c);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(1, 6);
      return t;
    })();
    const beamLen = hover - 18 - (1.35 + 3.6);
    const beamMat = new THREE.MeshBasicMaterial({ color, map: beamTex, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false, toneMapped: false });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.9, beamLen, 12, 1, true), beamMat);
    beam.position.y = 1.35 + 3.6 + beamLen / 2;
    g.add(beam);
    const core2 = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, beamLen, 8, 1, true), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    core2.position.copy(beam.position);
    g.add(core2);
    // glow sprites at the terminal and at the spire tip
    const spriteMat = new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    for (const [yy, sc] of [[crystal.position.y, 7], [hover - 18, 16], [hover + 30, 40]] as [number, number][]) {
      const sp = new THREE.Sprite(spriteMat);
      sp.position.y = yy;
      sp.scale.setScalar(sc);
      g.add(sp);
    }
    // skirt of rubble around the base so the edge meets the terrain naturally
    const rubbleMat = stone;
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2 + Math.random() * 0.2;
      const rx = p.x + Math.cos(a) * 10.2, rz = p.z + Math.sin(a) * 10.2;
      const rk = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5 + Math.random() * 0.6, 0), rubbleMat);
      rk.position.set(Math.cos(a) * 10.2, this.terrain.heightAt(rx, rz) - p.y + 0.1, Math.sin(a) * 10.2);
      rk.rotation.set(Math.random() * 3, Math.random() * 3, 0);
      rk.castShadow = rk.receiveShadow = true;
      g.add(rk);
    }
    this.add(g);
    // colliders: walkable steps + terminal core + console
    for (const [r, top] of tiers) {
      const h2 = r * 0.9;
      this.physics.add({ kind: "box", minX: p.x - h2, maxX: p.x + h2, minZ: p.z - h2, maxZ: p.z + h2, minY: p.y - baseDepth, maxY: p.y + top, enabled: true });
    }
    this.physics.add({ kind: "circle", x: p.x, z: p.z, r: 1.7, minY: p.y, maxY: p.y + 7, enabled: true });
    this.physics.add({ kind: "box", minX: p.x - 0.45, maxX: p.x + 0.45, minZ: p.z + 3.3, maxZ: p.z + 3.9, minY: p.y, maxY: p.y + 1.35 + 1.2, enabled: true });
    return { id: name, kind: "obelisk", name, color, pos: p.clone(), group: g, crystal: spire, rocks, beamTex, core: crystal, terminal: new THREE.Vector3(p.x, p.y + 1.35 + 1.2, p.z + 3.6), hover };
  }

  private makeRuin(name: string, p: THREE.Vector3, stone: THREE.Material, rng: () => number): Poi {
    const g = new THREE.Group();
    g.position.copy(p);
    const n = 6 + Math.floor(rng() * 4);
    const R = 5 + rng() * 3;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const x = Math.cos(a) * R, z = Math.sin(a) * R;
      const gy = this.terrain.heightAt(p.x + x, p.z + z) - p.y;
      const broken = rng() < 0.45;
      const h = broken ? 1 + rng() * 2 : 4 + rng() * 1.5;
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, h, 10), stone);
      col.position.set(x, gy + h / 2, z);
      col.rotation.z = broken ? (rng() - 0.5) * 0.2 : 0;
      col.castShadow = col.receiveShadow = true;
      g.add(col);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.35, 1.3), stone);
      cap.position.set(x, gy + (broken ? 0.18 : h + 0.17), z);
      cap.castShadow = true;
      g.add(cap);
      this.physics.add({ kind: "circle", x: p.x + x, z: p.z + z, r: 0.6, minY: p.y + gy - 1, maxY: p.y + gy + h, enabled: true });
      if (broken && rng() < 0.6) {
        const f = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 2.5, 10), stone);
        f.rotation.z = Math.PI / 2;
        f.rotation.y = rng() * Math.PI;
        f.position.set(x + Math.cos(a + 1) * 1.8, gy + 0.4, z + Math.sin(a + 1) * 1.8);
        f.castShadow = f.receiveShadow = true;
        g.add(f);
      }
    }
    // central altar
    const altar = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.8, 1.4), stone);
    altar.position.y = 0.4;
    altar.castShadow = altar.receiveShadow = true;
    g.add(altar);
    this.physics.add({ kind: "box", minX: p.x - 1.1, maxX: p.x + 1.1, minZ: p.z - 0.7, maxZ: p.z + 0.7, minY: p.y - 1, maxY: p.y + 0.8, enabled: true });
    // arch
    const ay = 0;
    for (const s of [-1, 1]) {
      const pil = new THREE.Mesh(new THREE.BoxGeometry(0.8, 4.5, 0.8), stone);
      pil.position.set(s * 1.8, ay + 2.25, -R - 1.5);
      pil.castShadow = true;
      g.add(pil);
      this.physics.add({ kind: "box", minX: p.x + s * 1.8 - 0.4, maxX: p.x + s * 1.8 + 0.4, minZ: p.z - R - 1.9, maxZ: p.z - R - 1.1, minY: p.y - 1, maxY: p.y + 4.5, enabled: true });
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.7, 0.9), stone);
    lintel.position.set(0, ay + 4.8, -R - 1.5);
    lintel.castShadow = true;
    g.add(lintel);
    this.add(g);
    return { id: name, kind: "ruin", name, color: "#d8c38a", pos: p.clone().add(new THREE.Vector3(0, 0.8, 0)), group: g };
  }

  private makeNote(title: string, author: string, text: string, pos: THREE.Vector3, poi: string): Note {
    const g = new THREE.Group();
    const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.6), new THREE.MeshBasicMaterial({ color: "#f2e6c4", side: THREE.DoubleSide }));
    g.add(paper);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8), new THREE.MeshBasicMaterial({ color: "#ffe79a", transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending }));
    g.add(glow);
    g.position.copy(pos);
    this.add(g);
    return { id: NOTE_ID++, title, author, text, pos: pos.clone(), mesh: g, collected: false, poi };
  }

  update(t: number) {
    for (const p of this.pois) if (p.crystal && p.hover) {
      p.crystal.rotation.y = t * 0.04;
      p.crystal.position.y = p.hover + Math.sin(t * 0.25) * 1.5;
      if (p.rocks) {
        p.rocks.rotation.y = -t * 0.03;
        for (const r of p.rocks.children) { r.rotation.x += r.userData.spin * 0.004; r.rotation.y += r.userData.spin * 0.006; }
      }
      if (p.beamTex) p.beamTex.offset.y = -t * 0.6;
      if (p.core) { p.core.rotation.y = t * 0.5; p.core.position.y = 3.75 + Math.sin(t * 1.3) * 0.12; }
    }
    for (const n of this.notes) {
      n.mesh.visible = !n.collected;
      if (!n.collected) {
        n.mesh.rotation.y = t * 1.2;
        n.mesh.position.y = n.pos.y + Math.sin(t * 2 + n.id) * 0.1;
      }
    }
  }

  setCollected(ids: number[]) {
    for (const n of this.notes) n.collected = ids.includes(n.id);
  }

  dispose() {
    for (const o of this.objects) this.scene.remove(o);
    this.objects = [];
  }
}
