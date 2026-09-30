import * as THREE from "three";
import { CONFIG } from "./core/config";
import { Emitter, type GameEvents, type Notice } from "./core/events";
import { audio, Ambience, music } from "./core/audio";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { SMAAPass } from "three/examples/jsm/postprocessing/SMAAPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { terrainTextures } from "./core/textures";
import { Container as ArkContainer } from "./systems/container";
import { Net } from "./net/net";
import { Terrain } from "./world/terrain";
import { Physics, raySphere } from "./world/physics";
import { ResourceManager, NODE_TYPES, type ResourceNode } from "./world/resources";
import { CreatureManager, type Creature, type SavedCreature, type Command, type Stance } from "./entities/creatures";
import { Player, type SavedPlayer, type StatKey } from "./entities/player";
import { BuildingSystem, type Structure, type SavedStructure } from "./systems/building";
import { Container, transfer, type ItemStack } from "./systems/container";
import { CraftQueue } from "./systems/crafting";
import { ITEMS, type ToolStats, type ItemDef } from "./data/items";
import { ENGRAM_BY_ID } from "./data/engrams";
import { STRUCTURES } from "./data/structures";
import { Sky } from "./world/sky";
import { Water } from "./world/water";
import { GrassField, WIND } from "./world/grass";
import { Fx, type FxKind } from "./world/fx";
import { PoiManager, type Note } from "./world/pois";
import { generateIcons } from "./ui/icons";
import { itemModel } from "./entities/itemModels";
import { ViewModel } from "./entities/viewmodel";
import { DeveloperTools, type RecoveryRecord } from "./systems/developer";
import { Weather, WEATHER_LABEL, type WeatherKind } from "./systems/weather";
import { Breeding, type Egg, type SavedEgg } from "./systems/breeding";
import { Tutorial, MISSIONS } from "./systems/tutorial";
import type { ArmorSlot } from "./data/items";
import { SPECIES } from "./data/species";
import type { Appearance } from "./entities/player";

export type GameState = "menu" | "loading" | "playing";

export type { Settings } from "./core/settings";
export { DEFAULT_SETTINGS } from "./core/settings";
import { DEFAULT_SETTINGS, DEFAULT_RULES, VIEW_METERS, effective, type Settings, type Rules } from "./core/settings";

export type FocusKind = "creature" | "corpse" | "node" | "structure" | "bag" | "water" | "note" | "obelisk" | "egg";
export interface Focus {
  kind: FocusKind;
  id: number;
  label: string;
  sub?: string;
  action?: string; // interact button label
  hitHint?: string; // attack hint
  hp?: number; maxHp?: number;
  torpor?: number; maxTorpor?: number;
  taming?: number; // 0..1
  tamed?: boolean;
  hostile?: boolean;
  action2?: string; // secondary interaction (e.g. manage while "Montar" is primary)
  dist: number;
}

export interface HudState {
  health: number; maxHealth: number;
  stamina: number; maxStamina: number;
  food: number; maxFood: number;
  water: number; maxWater: number;
  weight: number; maxWeight: number;
  torpor: number; maxTorpor: number;
  level: number; xpIn: number; xpNext: number;
  statPoints: number; engramPoints: number;
  bar: (ItemStack | null)[];
  selected: number;
  focus: Focus | null;
  hour: number;
  day: number;
  fps: number;
  swimming: boolean;
  encumbered: number;
  dead: boolean;
  placing: { name: string; valid: boolean; reason?: string } | null;
  craft: { id: string; count: number; progress: number } | null;
  ammo: { id: string; count: number } | null;
  hurt: number;
  starving: boolean;
  dehydrated: boolean;
  exhausted: boolean;
  cameraFirst: boolean;
  firstSpawn: boolean;
  net: { role: string; code: string; count: number } | null;
  heading: number;
  pos: [number, number, number];
  hitMarker: number;
  temp: number;
  ambient: number;
  weather: string;
  weatherKind: WeatherKind;
  flash: number;
  mount: { name: string; level: number; hp: number; maxHp: number; stamina: number; maxStamina: number; flying: boolean; landing: boolean; canFly: boolean; canCarry: boolean; carrying: string | null; canRoll: boolean; canBarrel: boolean; rolling: boolean } | null;
  grabbed: string | null; // name of the flyer whose talons are holding me
  mission: { title: string; hint: string; index: number; total: number } | null;
  armor: number;
  tames: number;
}

export interface Bag {
  id: number;
  pos: THREE.Vector3;
  inv: Container;
  mesh: THREE.Object3D;
  expires: number;
  label: string;
  kind: "death" | "drop" | "supply";
  tier?: number;
  falling?: number; // supply crate descent height
}

interface Projectile {
  mesh: THREE.Object3D;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  damage: number;
  torpor: number;
  life: number;
  ammo: string;
}

interface SaveData {
  version: number;
  seed: number;
  time: number;
  day: number;
  player: SavedPlayer;
  structures: SavedStructure[];
  tamed: SavedCreature[];
  nodes: [number, number][];
  bags: { pos: [number, number, number]; inv: (ItemStack | null)[]; expires: number; label: string }[];
  spawnBag: number | null;
  savedAt: number;
  weather?: { kind: WeatherKind; timer: number };
  eggs?: SavedEgg[];
  rules?: Rules;
  clock?: number;
  firstSpawn?: boolean;
  arkData?: (ItemStack | null)[];
  arkCreatures?: SavedCreature[];
  tutorial?: { done: string[]; enabled: boolean };
  stats?: GameStats;
  recoveries?: RecoveryRecord[];
}

export interface SpawnZone { id: string; name: string; diff: "easy" | "medium" | "hard"; pos: THREE.Vector3; angle: number }
export interface SpawnOption { id: string; label: string; kind: "zone" | "bed" | "random"; diff?: SpawnZone["diff"]; x: number; z: number; available: boolean; cooldown?: number }

export interface GameStats { kills: number; crafted: Record<string, number>; drinks: number; cooked: number; rides: number; tamed: number; hatched: number }
function freshStats(): GameStats {
  return { kills: 0, crafted: {}, drinks: 0, cooked: 0, rides: 0, tamed: 0, hatched: 0 };
}

const HAND: ToolStats = { kind: "hand", damage: 8, torpor: 5, range: 2.6, cooldown: 0.55, durability: 0, harvestPower: 1 };
let NOTICE_ID = 1;
let BAG_ID = 1;

export class Game {
  events = new Emitter<GameEvents>();
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  lights: THREE.PointLight[] = [];
  settings: Settings = { ...DEFAULT_SETTINGS };

  state: GameState = "menu";
  paused = false;
  seed = 1;
  time = 0; // seconds since world start (game time)
  day = 1;

  terrain!: Terrain;
  physics!: Physics;
  resources!: ResourceManager;
  creatures!: CreatureManager;
  building!: BuildingSystem;
  player = new Player();
  bags: Bag[] = [];
  projectiles: Projectile[] = [];
  respawnPoints: THREE.Vector3[] = [];
  zones: SpawnZone[] = [];
  firstSpawn = false;

  // camera
  camYaw = Math.PI;
  camPitch = -0.25;
  camDist: number = CONFIG.camera.distance;
  firstPerson = false;
  private camTarget = new THREE.Vector3();

  input = { mx: 0, mz: 0, attack: false, sprint: false, jump: false, descend: false, flightClimb: false };
  flightLanding = false;
  private keys = new Set<string>();
  private jumpQueued = false;

  focus: Focus | null = null;
  private focusRef: Creature | ResourceNode | Structure | Bag | null = null;
  private aimPoint = new THREE.Vector3();
  ammoPref = 0;

  onHud: ((h: HudState) => void) | null = null;
  private hudTimer = 0;
  private autosave = 0;
  private fps = 60;
  private frames = 0;
  private fpsT = 0;
  private lastT = performance.now();
  private hurtFx = 0;
  private running = true;
  private errorCount = 0;
  private skyColor = new THREE.Color();
  sky!: Sky;
  water: Water | null = null;
  grass: GrassField | null = null;
  pois: PoiManager | null = null;
  fx!: Fx;
  ambient: THREE.AmbientLight;
  private shake = 0;
  private hitMarker = 0;
  private supplyTimer = 150;
  private emberTimer = 0;
  private stepDist = 0;
  private resScale = 1;
  private lowFpsT = 0;
  private highFpsT = 0;
  private menuT = 0;
  mapCanvas: HTMLCanvasElement | null = null;
  loadProgress = 0;
  private sunDir = new THREE.Vector3();
  viewDist = 280;
  cloudCover = 0.55;
  private ambience = new Ambience();
  weather!: Weather;
  breeding!: Breeding;
  tutorial = new Tutorial();
  stats: GameStats = freshStats();
  riding: Creature | null = null;
  private tempTimer = 0;
  private rockHintT = -99;
  net = new Net(this);
  dev = new DeveloperTools(this);
  get isGuest() { return this.net.role === "guest"; }
  devUnlocked = false; // local gate; network authority is checked separately by the host
  softPaused = false; // paused only because a menu is open → crafting keeps running (as in ARK)
  private implantCb: (() => void) | null = null;
  private implantFired = false;
  viewModel = new ViewModel();
  rules: Rules = { ...DEFAULT_RULES };
  clock = 0; // world clock (advances with Day Cycle Speed)
  arkData = new ArkContainer(60); // ARK upload storage shared by all obelisk terminals
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private nameplates = new Map<Creature, THREE.Sprite>();
  private humTimer = 0;
  private viewBobT = 0;
  get fx2() { return effective(this.rules); }

  constructor(public canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
    canvas.addEventListener("webglcontextlost", this.onContextLost, false);
    canvas.addEventListener("webglcontextrestored", this.onContextRestored, false);
    this.renderer.setClearColor("#8ec9ef");
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, 1, 0.1, 420);
    this.camera.rotation.order = "YXZ";
    this.hemi = new THREE.HemisphereLight("#cfe8ff", "#5a4a32", 0.6);
    this.sun = new THREE.DirectionalLight("#fff4e0", 2.2);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    sc.left = -38; sc.right = 38; sc.top = 38; sc.bottom = -38; sc.near = 1; sc.far = 260;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.04;
    this.ambient = new THREE.AmbientLight("#8090b0", 0.15);
    this.scene.add(this.hemi, this.sun, this.sun.target, this.ambient);
    this.sky = new Sky(this.scene);
    this.fx = new Fx(this.scene);
    this.weather = new Weather(this.scene);
    this.weather.onThunder = (d) => { setTimeout(() => audio.play("thunder", Math.max(0.2, 1 - d / 900)), d * 2.5); };
    this.breeding = new Breeding(this.scene);
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight("#ffa040", 0, 22, 1.4);
      this.lights.push(l);
      this.scene.add(l);
    }
    this.scene.fog = new THREE.Fog("#8ec9ef", 120, 380);
    this.scene.add(this.player.rig.root);
    this.applyQuality();
    window.addEventListener("resize", this.resize);
    this.resize();
    this.bindKeyboard();
    requestAnimationFrame(this.loop);
  }

  // ---- GPU context loss (low/mid-range phones drop the WebGL context under memory pressure → black screen)
  private contextLostAt = 0;
  private contextLost = false;
  private onContextLost = (e: Event) => {
    e.preventDefault(); // lets the browser restore the context later
    this.contextLost = true;
    this.contextLostAt = performance.now();
    if (this.state === "playing" && !this.isGuest) { try { this.save(); } catch { /* ignore */ } }
    this.notify("A GPU perdeu o contexto gráfico. Tentando recuperar...", "warn");
    // if the browser never gives the context back, reload (the world is saved) instead of leaving a black screen
    setTimeout(() => { if (this.contextLost && performance.now() - this.contextLostAt >= 5000) window.location.reload(); }, 5200);
  };
  private onContextRestored = () => {
    this.contextLost = false;
    try {
      this.renderer.resetState();
      this.rebuildComposer();
      this.applyQuality();
      this.resize();
      this.scene.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(m)) m.forEach((x) => { x.needsUpdate = true; }); else if (m) m.needsUpdate = true;
      });
      this.notify("Gráficos recuperados.", "good");
    } catch (err) { console.error("context restore failed", err); window.location.reload(); }
  };

  dispose() {
    this.running = false;
    this.canvas.removeEventListener("webglcontextlost", this.onContextLost);
    this.canvas.removeEventListener("webglcontextrestored", this.onContextRestored);
    window.removeEventListener("resize", this.resize);
    this.renderer.dispose();
  }

  // ================================================================ notifications
  notify(text: string, kind: Notice["kind"] = "info", icon?: string) {
    if (!this.settings.statusNotifications && kind === "info") return;
    this.events.emit("notice", { id: NOTICE_ID++, text, kind, icon });
  }

  // ================================================================ settings
  setSettings(s: Partial<Settings>) {
    Object.assign(this.settings, s);
    const st = this.settings;
    audio.setVolumes({ master: st.masterVolume, music: st.musicVolume, sfx: st.sfxVolume, ambient: st.ambientVolume });
    this.camDist = st.cameraDistance;
    this.camera.fov = st.fov;
    this.camera.updateProjectionMatrix();
    this.fx.textEnabled = st.floatingDamage;
    this.renderer.domElement.style.filter = st.colorGrading ? "contrast(1.06) saturate(1.14) brightness(1.02)" : "";
    this.tutorial.enabled = this.settings.tutorial;
    this.applyQuality();
  }

  private basePixelRatio() {
    const dpr = window.devicePixelRatio || 1;
    return Math.min(3, Math.min(dpr, 2) * this.settings.resolutionScale);
  }

  /** Post-processing chain (bloom / anti-aliasing) built only when those options are on. */
  private rebuildComposer() {
    const st = this.settings;
    this.composer?.dispose();
    this.composer = null;
    this.bloomPass = null;
    if (!st.lightBloom && !st.antiAliasing) return;
    const c = new EffectComposer(this.renderer);
    c.addPass(new RenderPass(this.scene, this.camera));
    if (st.lightBloom) {
      this.bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.35, 0.5, 0.9);
      c.addPass(this.bloomPass);
    }
    c.addPass(new OutputPass());
    if (st.antiAliasing) c.addPass(new SMAAPass());
    c.setPixelRatio(this.renderer.getPixelRatio());
    c.setSize(window.innerWidth, window.innerHeight);
    this.composer = c;
  }

  private renderFrame() {
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
    // first-person arms on top of the world (separate depth), like ARK's view model
    if (this.state === "playing" && this.firstPerson && !this.riding && !this.player.dead) {
      const ac = this.renderer.autoClear;
      this.renderer.autoClear = false;
      this.renderer.clearDepth();
      this.renderer.render(this.viewModel.scene, this.viewModel.camera);
      this.renderer.autoClear = ac;
    }
  }

  private applyQuality() {
    const st = this.settings;
    this.renderer.setPixelRatio(this.basePixelRatio() * this.resScale);
    const shadows = st.shadows > 0;
    this.renderer.shadowMap.enabled = shadows;
    this.sun.castShadow = shadows;
    const ms = [512, 512, 1024, 2048, 4096][st.shadows];
    const ext = [20, 24, 34, 42, 56][st.shadows];
    const sc = this.sun.shadow.camera;
    sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext;
    sc.updateProjectionMatrix();
    if (this.sun.shadow.mapSize.x !== ms) {
      this.sun.shadow.mapSize.set(ms, ms);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.sky.uniforms.uClouds.value = st.skyQuality > 0.25 ? 1 : 0;
    this.fx.budget = 0.4 + st.meshLod * 0.6;
    const tt = terrainTextures();
    for (const t of Object.values(tt)) { t.anisotropy = st.anisotropic ? 8 : 1; t.needsUpdate = true; }
    this.rebuildGrass();
    if (!this.isGuest) this.placeArtifacts();
    this.rebuildComposer();
    const far = VIEW_METERS[st.viewDistance];
    this.viewDist = far;
    this.camera.far = far;
    this.camera.updateProjectionMatrix();
    const fog = this.scene.fog as THREE.Fog;
    fog.near = far * 0.3;
    fog.far = far * 0.97;
    this.scene.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m) m.needsUpdate = true; });
  }

  private rebuildGrass() {
    if (!this.terrain) return;
    this.grass?.dispose(this.scene);
    const st = this.settings;
    const radius = 14 + st.groundClutterDistance * 22;
    const count = Math.round(radius * radius * 5.5 * st.groundClutterDensity); // each instance is a 14-blade clump
    this.grass = new GrassField(this.scene, this.terrain, count, radius);
    // no grass on obelisk platforms, ruins or under structures
    this.grass.blocked = (x, z) => {
      for (const poi of this.pois?.pois ?? []) if (Math.hypot(poi.pos.x - x, poi.pos.z - z) < (poi.kind === "obelisk" ? 11 : 8)) return true;
      for (const s of this.building?.list ?? []) if (Math.abs(s.x - x) < s.def.size[0] * 0.55 + 0.3 && Math.abs(s.z - z) < s.def.size[2] * 0.55 + 0.3 && (s.def.snap === "foundation" || s.def.snap === "free")) return true;
      return false;
    };
  }

  resize = () => {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = w + "px";
    this.canvas.style.height = h + "px";
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.composer?.setSize(w, h);
  };

  // ================================================================ world lifecycle
  private buildWorld(seed: number) {
    this.teardownWorld();
    this.seed = seed;
    this.terrain = new Terrain(seed);
    this.terrain.buildMeshes(this.scene);
    this.water = new Water(this.scene, this.terrain, this.settings.meshLod < 0.4 ? 64 : 128);
    this.mapCanvas = this.terrain.renderMap(512);
    this.physics = new Physics(this.terrain);
    this.resources = new ResourceManager(this.terrain, this.physics, seed);
    this.resources.buildMeshes(this.scene);
    this.pois = new PoiManager(this.scene, this.terrain, this.physics, seed);
    this.rebuildGrass();
    this.building = new BuildingSystem(this.scene, {
      terrain: this.terrain,
      physics: this.physics,
      notify: (t, k) => this.notify(t, k ?? "info"),
    });
    this.building.onCooked = () => { this.stats.cooked++; };
    this.building.nodeBlocker = (x, z, half) =>
      this.resources.near(x, z, half + 0.5).some((n) => NODE_TYPES[n.type].gather === "hit" && Math.abs(n.x - x) < half + 0.3 && Math.abs(n.z - z) < half + 0.3);
    this.creatures = new CreatureManager(this.scene, {
      terrain: this.terrain,
      physics: this.physics,
      playerPos: () => this.player.pos,
      playerAlive: () => !this.player.dead,
      playerBox: () => {
        // while riding, wild creatures hit the mount, so its whole body counts (not just the rider on top)
        const r = this.riding, y = this.player.pos.y;
        if (!r) return [y, y + 1.8];
        return [Math.min(r.pos.y, y), Math.max(r.pos.y + r.sp.height * r.growth, y + 1.8)];
      },
      damagePlayer: (a, from, src, pid) => (pid ? this.net.hurtRemote(pid, a * this.rules.dinoDamage, from, src) : this.damagePlayer(a * this.rules.dinoDamage, from, src)),
      players: () => (this.net.role === "host" ? this.net.remotePlayers() : []),
      rules: () => this.rules,
      notify: (t, k) => this.notify(t, k ?? "info"),
      onTamed: (c) => {
        this.stats.tamed++;
        audio.play("tame");
        this.fx.burst("tame", new THREE.Vector3(c.pos.x, c.pos.y + c.sp.height, c.pos.z), 30);
        this.giveXp(c.sp.xp * 3 + c.level * 4, "Domesticação");
      },
      onKilled: (c, byPlayer) => {
        this.dev.record(c);
        if (c.sp.id === "guardian") this.onGuardianKilled(c);
        if (byPlayer) this.stats.kills++;
        if (this.riding === c) this.dismount();
        this.fx.burst("blood", new THREE.Vector3(c.pos.x, c.pos.y + c.sp.height * 0.5, c.pos.z), 16);
        if (byPlayer) this.giveXp(c.sp.xp * (1 + c.level * 0.25), `Abateu ${c.name}`);
        if (c.tamed) this.notify(`Seu ${c.name} morreu!`, "warn");
        // drop tamed inventory
        if (!c.inventory.isEmpty()) this.dropBag(c.pos, c.inventory.serialize(), `Itens de ${c.name}`, 600);
      },
      sound: (name, pos, vol = 1) => {
        const d = pos.distanceTo(this.player.pos);
        audio.play(name, vol * Math.max(0, 1 - d / 45));
      },
      structureBlocked: (x, z) => this.building.nearSettlement(x, z),
      easySpawnDistance: (x, z) => {
        const easy = this.zones.filter((zone) => zone.diff === "easy");
        // The spawn point exists before zones are computed during world setup.
        const points = easy.length ? easy.map((zone) => zone.pos) : [this.terrain.spawnPoint];
        return Math.min(...points.map((point) => Math.hypot(x - point.x, z - point.z)));
      },
      attackStructure: (c, dmg) => {
        const s = this.building.nearestTo(c.pos, c.sp.radius + c.sp.attackRange + 0.6);
        if (!s) return false;
        const destroyed = this.building.damage(s, dmg);
        if (destroyed.length && this.net.role === "host") this.net.broadcast({ t: "sr", ids: destroyed.map((d) => d.id) });
        this.fx.burst(s.def.tier === "stone" ? "stone" : "wood", new THREE.Vector3(c.pos.x + Math.sin(c.yaw) * c.sp.radius * 1.5, c.pos.y + 1, c.pos.z + Math.cos(c.yaw) * c.sp.radius * 1.5), 8);
        if (destroyed.length) { this.notify(`${c.name} destruiu ${destroyed[0].def.name}!`, "warn"); audio.play("build", 0.8); }
        return true;
      },
      layEgg: (m, f) => {
        const lvl = Math.max(m.level, f.level) + (Math.random() < 0.1 ? 2 : 0);
        const st: Record<string, number> = {};
        for (const k of Object.keys(m.statLv)) st[k] = Math.max(m.statLv[k as keyof typeof m.statLv], f.statLv[k as keyof typeof f.statLv]) + (Math.random() < 0.08 ? 1 : 0);
        const pos = m.pos.clone().add(new THREE.Vector3(Math.sin(m.yaw + 2) * (m.sp.radius + 0.8), 0, Math.cos(m.yaw + 2) * (m.sp.radius + 0.8)));
        pos.y = this.physics.groundAt(pos.x, pos.z, 0.3, pos.y + 2);
        this.breeding.lay(m.sp.id, lvl, st, pos);
        this.notify(`${m.name} botou um ovo fertilizado! Mantenha-o na temperatura certa.`, "good");
        audio.play("tame", 0.5);
      },
      playerInWater: () => this.player.inWater || this.player.swimming,
      torporPlayer: (a, pid) => { if (pid) { this.net.torporRemote(pid, a); return; } this.player.torpor = Math.min(this.player.max("torpor"), this.player.torpor + a); },
      now: () => this.time,
      isNight: () => this.dayFactor() < 0.3,
    });
    // spawn regions along beaches (12 zones: North/East/South/West 1-3, like the original)
    this.zones = [];
    const dirs: [string, number, SpawnZone["diff"]][] = [["Sul", Math.PI / 2, "easy"], ["Leste", 0, "medium"], ["Oeste", Math.PI, "medium"], ["Norte", -Math.PI / 2, "hard"]];
    for (const [dname, base, diff] of dirs) {
      [-0.42, 0, 0.42].forEach((off, k) => {
        for (const jitter of [0, 0.12, -0.12, 0.24, -0.24, 0.36, -0.36]) {
          const ang = base + off + jitter;
          let found: THREE.Vector3 | null = null;
          for (let r = this.terrain.half * 0.97; r > 30; r -= 2) {
            const x = Math.cos(ang) * r, z = Math.sin(ang) * r;
            const h = this.terrain.heightAt(x, z);
            if (h > 0.5 && h < 3 && this.terrain.normalAt(x, z).y > 0.85) { found = new THREE.Vector3(x, h, z); break; }
            if (h > 3) break;
          }
          if (found) {
            const label = diff === "easy" ? "Fácil" : diff === "medium" ? "Médio" : "Difícil";
            this.zones.push({ id: `zone:${dname}${k + 1}`, name: `Zona ${dname} ${k + 1} (${label})`, diff, pos: found, angle: ang });
            break;
          }
        }
      });
    }
    if (!this.zones.length) this.zones.push({ id: "zone:Sul1", name: "Zona Sul 1 (Fácil)", diff: "easy", pos: this.terrain.spawnPoint.clone(), angle: Math.PI / 2 });
    this.respawnPoints = this.zones.map((z) => z.pos);
  }

  private teardownWorld() {
    if (!this.terrain) return;
    this.creatures.clear();
    this.building.clear();
    this.building.cancelPlacement();
    for (const b of this.bags) this.scene.remove(b.mesh);
    for (const p of this.projectiles) this.scene.remove(p.mesh);
    this.bags = [];
    this.projectiles = [];
    this.scene.remove(this.terrain.mesh);
    this.terrain.mesh.geometry.dispose();
    this.water?.dispose(this.scene);
    this.grass?.dispose(this.scene);
    this.pois?.dispose();
    this.water = null; this.grass = null; this.pois = null;
    this.breeding.clear();
    this.riding = null;
    this.resources.removeFrom(this.scene);
  }

  hasSave(): boolean {
    try { return !!localStorage.getItem(CONFIG.save.key); } catch { return false; }
  }

  saveInfo(): { level: number; day: number; savedAt: number } | null {
    try {
      const raw = localStorage.getItem(CONFIG.save.key);
      if (!raw) return null;
      const d = JSON.parse(raw) as SaveData;
      return { level: d.player.level, day: d.day, savedAt: d.savedAt };
    } catch { return null; }
  }

  /** Builds a scenic world rendered behind the main menu. */
  async startMenu(seed = 20260) {
    try {
      this.buildWorld(seed);
      this.time = CONFIG.time.daySeconds * 0.3;
      const sp = this.terrain.spawnPoint;
      this.player.pos.set(sp.x, sp.y, sp.z);
      this.creatures.populate(new THREE.Vector3(sp.x * 0.6, 0, sp.z * 0.6));
    } catch (e) { console.error("menu world failed", e); }
  }

  private async loadingSteps(seed: number) {
    const step = async (p: number) => { this.loadProgress = p; this.events.emit("loading", p); await nextFrame(); };
    await step(0.02);
    await generateIcons((p) => { this.loadProgress = 0.02 + p * 0.35; this.events.emit("loading", this.loadProgress); });
    await step(0.4);
    this.buildWorld(seed);
    await step(0.85);
  }

  /** Join another device's world by room code. */
  async joinMultiplayer(code: string, name: string): Promise<void> {
    const look = { ...this.player.appearance, name: name || this.player.appearance.name };
    const init = await this.net.join(code, look.name, look);
    this.state = "loading";
    this.events.emit("state", this.state);
    await nextFrame();
    await this.loadingSteps(init.seed);
    this.player = this.resetPlayer();
    this.dev.resetForWorld();
    this.player.appearance.name = look.name;
    this.rules = { ...DEFAULT_RULES, ...init.rules, supplyDrops: false };
    this.time = init.time;
    this.clock = init.clock;
    this.day = init.day;
    this.resources.netDriven = true;
    this.resources.load(init.nodes);
    this.building.load(init.structures, true);
    this.weather.load(init.weather);
    this.creatures.clear();
    this.creatures.puppet = true;
    this.creatures.netHook = {
      hit: (id, dmg, tor) => this.net.toHost({ t: "hit", id, dmg, tor }),
      corpse: (id, tool, pw, dmg) => this.net.toHost({ t: "corpse", id, tool, pw, dmg }),
    };
    this.tutorial.load(undefined);
    this.tutorial.enabled = false;
    this.stats = freshStats();
    this.arkData.load([]);
    this.arkCreatures = [];
    this.firstSpawn = true;
    this.player.dead = true;
    this.state = "playing";
    this.events.emit("state", this.state);
    this.notify(`Conectado à sala ${this.net.code}. Anfitrião: ${init.hostName}.`, "good");
  }

  leaveMultiplayer() {
    if (this.isGuest) { this.quitToMenu(); return; }
    this.net.close();
  }

  async newGame(seed = Math.floor(Math.random() * 1e9), rules?: Rules) {
    this.rules = { ...DEFAULT_RULES, ...(rules ?? {}) };
    this.state = "loading";
    this.events.emit("state", this.state);
    await nextFrame();
    await this.loadingSteps(seed);
    this.player = this.resetPlayer();
    this.dev.resetForWorld();
    const sp = this.terrain.spawnPoint;
    this.player.pos.set(sp.x, sp.y + 0.1, sp.z);
    this.camYaw = Math.atan2(sp.x, sp.z); // look inland
    this.player.yaw = this.camYaw + Math.PI;
    this.time = ((CONFIG.time.startHour - 6) / 24) * CONFIG.time.daySeconds + CONFIG.time.daySeconds * 0.25;
    this.clock = this.time;
    this.arkData.load([]);
    this.arkCreatures = [];
    this.day = 1;
    this.firstSpawn = true;
    this.player.dead = true; // show the spawn-region screen first (like the original)
    this.supplyTimer = 120;
    this.tutorial.load(undefined);
    this.stats = freshStats();
    this.weather.set("clear", 300);
    this.player.inv.add("waterskin", 1);
    this.state = "playing";
    this.events.emit("state", this.state);
    this.notify("Você acordou numa praia desconhecida. Soque árvores para obter palha e madeira.", "info");
    this.notify("Pegue pedras no chão e crie uma Picareta de Pedra (menu ▣ Inventário → Criar).", "info");
    this.save();
  }

  async loadGame(): Promise<boolean> {
    let data: SaveData;
    try {
      const raw = localStorage.getItem(CONFIG.save.key);
      if (!raw) return false;
      data = JSON.parse(raw);
      if (!data || data.version !== CONFIG.save.version) throw new Error("Versão de save incompatível");
    } catch (e) {
      console.error(e);
      this.notify("Não foi possível carregar o save.", "warn");
      return false;
    }
    this.state = "loading";
    this.events.emit("state", this.state);
    await nextFrame();
    try {
      await this.loadingSteps(data.seed);
      this.player = this.resetPlayer();
      this.player.load(data.player);
      this.dev.resetForWorld();
      this.dev.load(data.recoveries);
      this.pois?.setCollected(this.player.notes);
      this.weather.load(data.weather);
      this.breeding.load(data.eggs);
      this.tutorial.load(data.tutorial);
      this.tutorial.enabled = this.settings.tutorial && this.tutorial.enabled;
      this.stats = { ...freshStats(), ...(data.stats ?? {}) };
      this.player.riding = null;
      this.time = data.time;
      this.clock = data.clock ?? data.time;
      this.rules = { ...DEFAULT_RULES, ...(data.rules ?? {}) };
      this.firstSpawn = !!data.firstSpawn;
      this.arkData.load(data.arkData);
      this.arkCreatures = data.arkCreatures ?? [];
      this.day = data.day;
      this.resources.load(data.nodes);
      this.building.load(data.structures);
      this.creatures.loadTamed(data.tamed);
      for (const b of data.bags ?? []) this.dropBag(new THREE.Vector3(...b.pos), b.inv, b.label, b.expires - this.time, true);
      this.camYaw = this.player.yaw - Math.PI;
      this.creatures.populate(this.player.pos);
      if (this.player.dead) this.player.dead = true;
    } catch (e) {
      console.error("Load failed", e);
      this.notify("Save corrompido. Iniciando novo jogo.", "warn");
      await this.newGame();
      return true;
    }
    this.state = "playing";
    this.events.emit("state", this.state);
    this.notify("Jogo carregado.", "good");
    return true;
  }

  save() {
    if (this.state !== "playing" || this.isGuest) return; // guests never overwrite their own world
    const data: SaveData = {
      version: CONFIG.save.version,
      seed: this.seed,
      time: this.time,
      clock: this.clock,
      rules: this.rules,
      firstSpawn: this.firstSpawn,
      arkData: this.arkData.serialize(),
      arkCreatures: this.arkCreatures,
      day: this.day,
      player: this.riding ? { ...this.player.serialize(), pos: [this.riding.pos.x + 2, this.physics.groundAt(this.riding.pos.x + 2, this.riding.pos.z, 0.3, this.riding.pos.y + 3), this.riding.pos.z] } : this.player.serialize(),
      structures: this.building.serialize(),
      tamed: this.creatures.serializeTamed(),
      nodes: this.resources.serialize(),
      weather: this.weather.serialize(),
      eggs: this.breeding.serialize(),
      tutorial: this.tutorial.serialize(),
      stats: this.stats,
      recoveries: this.dev.recent,
      bags: this.bags.filter((b) => b.kind !== "supply").map((b) => ({ pos: [b.pos.x, b.pos.y, b.pos.z], inv: b.inv.serialize(), expires: b.expires, label: b.label })),
      spawnBag: this.player.spawnBag,
      savedAt: Date.now(),
    };
    try {
      localStorage.setItem(CONFIG.save.key, JSON.stringify(data));
      this.events.emit("saved", undefined);
    } catch (e) {
      console.error("Save failed", e);
      this.notify("Falha ao salvar (armazenamento cheio?)", "warn");
    }
  }

  deleteSave() {
    try { localStorage.removeItem(CONFIG.save.key); } catch { /* ignore */ }
  }

  quitToMenu() {
    this.save();
    if (this.riding && this.isGuest) this.dismount();
    this.net.close();
    this.creatures.puppet = false;
    this.teardownWorld();
    this.dev.resetForWorld();
    this.state = "menu";
    this.events.emit("state", this.state);
    this.startMenu();
  }

  private resetPlayer(): Player {
    this.scene.remove(this.player.rig.root);
    const p = new Player();
    this.scene.add(p.rig.root);
    return p;
  }

  // ================================================================ time
  hour(): number {
    return (((this.clock / CONFIG.time.daySeconds) * 24 + 6) % 24 + 24) % 24;
  }
  dayFactor(): number {
    const elev = Math.sin(((this.hour() - 6) / 24) * Math.PI * 2);
    return THREE.MathUtils.smoothstep(elev, -0.15, 0.25);
  }

  // ================================================================ main loop
  private loop = (t: number) => {
    if (!this.running) return;
    requestAnimationFrame(this.loop);
    const rawDt = Math.max(0.0001, (t - this.lastT) / 1000);
    this.lastT = t;
    const dt = Math.min(rawDt, 0.066);
    this.frames++;
    this.fpsT += Math.min(rawDt, 2); // real elapsed time (not clamped) so FPS & dynamic resolution are accurate
    if (this.fpsT > 0.5) { this.fps = Math.round(this.frames / this.fpsT); this.frames = 0; this.fpsT = 0; }
    if (this.state !== "playing") {
      if (this.state === "menu" && this.terrain) {
        try { this.menuFrame(dt); } catch (e) { if (this.errorCount++ < 5) console.error(e); }
      } else {
        this.renderer.setClearColor("#0d1a14");
        this.renderer.clear();
      }
      return;
    }
    try {
      if (!this.paused || this.net.active) this.update(dt); // online worlds never pause
      else if (this.softPaused) { this.updateCrafting(dt); this.building.update(dt); }
      this.net.update(dt);
      this.updateCamera(dt);
      this.updateEnvironment(dt);
      this.fx.update(this.paused ? 0 : dt, this.renderer.domElement.height, this.camera.fov);
      // with the inventory/panels open the world is only a backdrop: render it at half rate and never resize GPU buffers
      const backdropOnly = this.paused;
      if (!this.contextLost && !(backdropOnly && (this.frames & 1))) this.renderFrame();
      if (!backdropOnly) this.adaptResolution(dt);
    } catch (e) {
      if (this.errorCount++ < 5) console.error("Frame error", e);
    }
    this.hudTimer += dt;
    if (this.hudTimer > 0.1 && this.onHud) {
      this.hudTimer = 0;
      try { this.onHud(this.hud()); } catch (e) { if (this.errorCount++ < 5) console.error("HUD error", e); }
    }
  };

  private update(dt: number) {
    const prevHour = this.hour();
    this.time += dt;
    this.clock += dt * this.rules.dayCycleSpeed;
    if (this.hour() < prevHour) { this.day++; this.notify(`Dia ${this.day}`, "info"); }
    this.updatePlayer(dt);
    this.dev.tick(dt);
    this.updateFocus();
    this.updateCombat(dt);
    if (this.building.ghostDef) this.updatePlacement();
    this.creatures.update(dt);
    this.building.update(dt);
    this.resources.update(dt, this.time, this.player.pos);
    this.updateProjectiles(dt);
    this.updateBags(dt);
    this.updateCrafting(dt);
    this.updateLights();
    this.updateAmbientFx(dt);
    this.updateSupply(dt);
    this.updateWorldSystems(dt);
    music.setMode("ambient");
    music.update(dt);
    {
      const p = this.player.pos;
      let sea = 0;
      for (const [dx, dz] of [[20, 0], [-20, 0], [0, 20], [0, -20]]) if (this.terrain.heightAt(p.x + dx, p.z + dz) < 0) sea += 0.25;
      this.ambience.update(dt, WIND.strength.value, sea, this.dayFactor(), this.building.covered(p), this.weather.rain);
    }
    this.updateExploration();
    this.player.animate(dt, this.time, this.firstPerson ? 0 : this.camPitch + 0.25);
    if (this.viewModel.implant > 0) {
      this.viewModel.implant = Math.min(1, this.viewModel.implant + dt / 0.75);
      this.player.implantT = this.viewModel.implant;
      if (!this.implantFired && this.viewModel.implant >= 0.62) { this.implantFired = true; const cb = this.implantCb; this.implantCb = null; cb?.(); }
      if (this.viewModel.implant >= 1) { this.viewModel.implant = 0; this.player.implantT = 0; }
    }
    if (this.firstPerson) {
      const p = this.player;
      this.viewModel.setHeld(p.heldId);
      this.viewModel.setLook(p.appearance.skin);
      this.viewModel.resize(this.camera.aspect, this.camera.fov);
      this.viewModel.update(dt, p.swing, Math.hypot(p.vel.x, p.vel.z), p.onGround, this.camYaw, this.camPitch, this.dayFactor(), this.time);
    }
    this.autosave += dt;
    if (this.autosave > CONFIG.save.autosaveSeconds) { this.autosave = 0; this.save(); }
    this.hurtFx = Math.max(0, this.hurtFx - dt * 1.5);
    this.hitMarker = Math.max(0, this.hitMarker - dt * 4);
  }

  // ================================================================ player
  private updatePlayer(dt: number) {
    const p = this.player;
    const C = CONFIG.player;
    if (p.dead) return;
    p.attackCd = Math.max(0, p.attackCd - dt);
    p.swing = Math.max(0, p.swing - dt * 3);
    p.updateHeld();

    // ---- input
    let mx = this.input.mx, mz = this.input.mz;
    if (this.keys.has("KeyW")) mz += 1;
    if (this.keys.has("KeyS")) mz -= 1;
    if (this.keys.has("KeyA")) mx -= 1;
    if (this.keys.has("KeyD")) mx += 1;
    const len = Math.hypot(mx, mz);
    if (len > 1) { mx /= len; mz /= len; }
    const moving = len > 0.05 && !p.unconscious;
    const enc = p.encumbrance();
    const wantSprint = (this.input.sprint || this.keys.has(this.dev.flying ? "ControlLeft" : "ShiftLeft")) && mz > 0.3 && !p.exhausted && enc === 0;

    if (this.riding) {
      this.updateRiding(dt, mx, mz, (this.input.sprint || this.keys.has("ShiftLeft")) && len > 0.05);
    } else if (this.grabbedBy) {
      this.updateGrabbed();
    } else {
      // ---- water state
      const ground = this.terrain.heightAt(p.pos.x, p.pos.z);
      const depth = CONFIG.world.seaLevel - ground;
      p.inWater = depth > 0.3 && p.pos.y < 0.2;
      const wasSwimming = p.swimming;
      p.swimming = depth > 1.35 && p.pos.y <= -1.2 + 0.2;
      if (p.swimming && !wasSwimming) { audio.play("splash", 0.6); this.fx.burst("splash", p.pos.clone().setY(0.1), 14); }

      // ---- speed
      let speed = C.walkSpeed * p.speedMult;
      p.sprinting = wantSprint && moving && p.stamina > 0 && !p.swimming;
      if (p.sprinting) speed *= C.sprintMult;
      if (p.swimming) speed = C.swimSpeed * p.speedMult;
      if (enc === 1) speed *= 0.35;
      if (enc === 2) speed = 0;
      if (p.exhausted) speed *= 0.7;
      if (p.unconscious) speed = 0;
      if (this.dev.flying) speed = p.sprinting ? 18 : 11;

      const sy = Math.sin(this.camYaw), cy = Math.cos(this.camYaw);
      const wx = (-sy * mz + cy * mx) * speed;
      const wz = (-cy * mz - sy * mx) * speed;
      const acc = Math.min(1, dt * (p.onGround || p.swimming ? 12 : 3));
      p.vel.x += (wx - p.vel.x) * acc;
      p.vel.z += (wz - p.vel.z) * acc;

      // face camera direction when moving/attacking (ARK-like)
      if (moving || this.input.attack || p.swing > 0 || this.building.ghostDef) {
        const target = this.camYaw + Math.PI;
        let d = target - p.yaw;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        p.yaw += d * Math.min(1, dt * 12);
      }

      // ---- vertical
      const jump = this.jumpQueued || this.input.jump || this.keys.has("Space");
      this.jumpQueued = false;
      if (this.dev.flying) {
        const vy = (jump ? 1 : 0) - (this.input.descend || this.keys.has("ShiftLeft") ? 1 : 0);
        p.vel.y += (vy * speed - p.vel.y) * Math.min(1, dt * 9);
        p.pos.addScaledVector(p.vel, dt);
        p.pos.y = THREE.MathUtils.clamp(p.pos.y, -8, 120);
        p.onGround = false;
        p.swimming = false;
        p.inWater = false;
      } else if (p.swimming) {
        p.vel.y += (-1.2 - p.pos.y) * dt * 8 - p.vel.y * dt * 4;
        if (jump) p.vel.y = 2.5;
      } else {
        p.vel.y -= C.gravity * dt;
        if (jump && p.onGround && p.stamina > C.jumpStamina && enc < 2 && !p.unconscious) {
          p.vel.y = C.jumpVel;
          p.stamina -= C.jumpStamina;
          p.staminaDelay = 1;
        }
      }
      const vyBefore = p.vel.y;
      const res = this.dev.flying ? { onGround: false } : this.physics.moveBody(p.pos, p.vel, dt, C.radius, C.height);
      if (p.swimming && p.pos.y < -1.2 - 0.3) p.pos.y = -1.5;
      // keep inside island bounds
      const lim = this.terrain.half - 3;
      p.pos.x = THREE.MathUtils.clamp(p.pos.x, -lim, lim);
      p.pos.z = THREE.MathUtils.clamp(p.pos.z, -lim, lim);
      if (!this.dev.flying && !p.onGround && res.onGround && !p.swimming && -vyBefore > C.fallDamageMinVel) {
        const dmg = (-vyBefore - C.fallDamageMinVel) * C.fallDamagePerVel;
        this.damagePlayer(dmg, null, "Queda");
      }
      p.onGround = !this.dev.flying && (res.onGround || p.swimming);
    }

    // ---- survival
    // temperature: cold burns food, heat burns water; extremes hurt
    const T = p.bodyTemp;
    const coldK = T < 12 ? (12 - T) / 12 : 0, hotK = T > 34 ? (T - 34) / 10 : 0;
    const foodDrain = C.foodDrainPerSec * (p.sprinting ? C.sprintHungerMult : 1) * (1 + coldK * 2) * this.rules.foodDrain;
    p.water = Math.max(0, p.water - C.waterDrainPerSec * hotK * 2 * dt * this.rules.waterDrain);
    if (T < 0) this.damagePlayer(((0 - T) * 0.08 + 0.2) * dt, null, "Hipotermia", true);
    if (T > 44) this.damagePlayer(((T - 44) * 0.08 + 0.2) * dt, null, "Insolação", true);
    p.food = Math.max(0, p.food - foodDrain * dt);
    p.water = Math.max(0, p.water - C.waterDrainPerSec * (p.sprinting ? 1.5 : 1) * dt * this.rules.waterDrain);
    if (p.inWater && p.water < p.max("water") && this.keys.has("KeyE")) p.water = Math.min(p.max("water"), p.water + 25 * dt);
    p.regenBlock = Math.max(0, p.regenBlock - dt);
    if (!this.dev.invincible && !this.dev.infiniteNeeds && (p.food <= 0 || p.water <= 0)) {
      p.health -= C.starveDamagePerSec * dt * ((p.food <= 0 ? 1 : 0) + (p.water <= 0 ? 1 : 0));
      if (p.health <= 0) this.killPlayer(p.food <= 0 ? "Fome" : "Sede");
    } else if (p.health < p.max("health") && p.regenBlock <= 0) {
      const well = p.food > p.max("food") * 0.2 && p.water > p.max("water") * 0.2 ? 1 : 0.3;
      p.health = Math.min(p.max("health"), p.health + C.regenPerSec * well * dt);
      p.food = Math.max(0, p.food - 0.05 * dt);
    }
    // stamina
    if (p.sprinting) { p.stamina -= C.sprintStaminaPerSec * dt; p.staminaDelay = 1; }
    if (p.swimming && moving) { p.stamina -= (3 / 1.8) * dt; p.staminaDelay = 0.5; }
    p.staminaDelay = Math.max(0, p.staminaDelay - dt);
    if (p.staminaDelay <= 0 && p.water > 0) p.stamina = Math.min(p.max("stamina"), p.stamina + C.staminaRegen * dt);
    if (p.stamina <= 0) { p.stamina = 0; p.exhausted = true; }
    if (p.exhausted && p.stamina > p.max("stamina") * 0.25) p.exhausted = false;
    if (p.swimming && p.stamina <= 0) this.damagePlayer(4 * dt, null, "Afogamento", true);
    // torpor
    if (p.torpor > 0) p.torpor = Math.max(0, p.torpor - (p.unconscious ? 4 : 2.5) * dt);
    if (!p.unconscious && p.torpor >= p.max("torpor")) { p.unconscious = true; this.notify("Você desmaiou!", "warn"); }
    if (p.unconscious && p.torpor < p.max("torpor") * 0.4) { p.unconscious = false; this.notify("Você acordou.", "info"); }
    // spoil
    const a = p.inv.tickSpoil(dt), b = p.bar.tickSpoil(dt);
    if (a || b) this.events.emit("inventory", undefined);
  }

  damagePlayer(amount: number, from: THREE.Vector3 | null, source: string, silent = false) {
    const p = this.player;
    if (p.dead || amount <= 0 || this.dev.invincible) return;
    if (this.riding && from) {
      // most hits land on the mount; the saddle protects it
      const c = this.riding;
      const toMount = amount * 0.75 * (100 / (100 + c.saddleArmor() * 4)) * (1 - c.imprint * 0.3);
      this.creatures.damage(c, toMount, 0, null, from);
      amount *= 0.25;
    }
    amount /= this.rules.playerResistance;
    const armor = p.armorValue();
    if (armor > 0 && from) {
      amount *= 100 / (100 + armor * 3.5);
      const broke = p.wearArmor(amount);
      for (const b of broke) this.notify(`${b} quebrou!`, "warn");
    }
    p.health -= amount;
    p.regenBlock = 5;
    if (!silent) {
      audio.play("hurt");
      this.hurtFx = Math.min(1, this.hurtFx + 0.5 + amount / 40);
      this.shake = Math.min(1.2, this.shake + 0.3 + amount / 30);
      this.fx.burst("blood", this.player.pos.clone().add(new THREE.Vector3(0, 1.2, 0)), 5);
      this.events.emit("hurt", amount);
    }
    if (from) {
      const dx = p.pos.x - from.x, dz = p.pos.z - from.z;
      const l = Math.hypot(dx, dz) || 1;
      p.vel.x += (dx / l) * Math.min(8, amount * 0.4);
      p.vel.z += (dz / l) * Math.min(8, amount * 0.4);
      // tamed creatures defend
      const attacker = this.creatures.nearest(from, 1.5, (c) => c.conscious && !c.tamed);
      if (attacker) for (const t of this.creatures.list) if (t.tamed && t.conscious && t.stance !== "passive" && t.pos.distanceTo(p.pos) < 30) { t.target = { kind: "creature", creature: attacker }; t.state = "chase"; t.chaseTimer = 0; }
    }
    if (p.health <= 0) this.killPlayer(source);
  }

  private killPlayer(cause: string) {
    const p = this.player;
    if (p.dead) return;
    p.dead = true;
    p.deathCause = cause;
    p.deathPos = [p.pos.x, p.pos.z];
    p.deaths++;
    p.health = 0;
    this.building.cancelPlacement();
    const items = [...p.inv.serialize(), ...p.bar.serialize()].filter(Boolean);
    if (items.length) this.dropBag(p.pos, items, "Seus itens", 1800);
    p.inv.load([]);
    p.bar.load([]);
    p.selected = -1;
    this.notify(`Você morreu: ${cause}`, "warn");
    this.events.emit("inventory", undefined);
    this.save();
  }

  respawnOptions(): SpawnOption[] {
    const opts: SpawnOption[] = [];
    for (const b of this.building.list) if (b.def.id === "sleeping_bag") opts.push({ id: `bag:${b.id}`, label: `Saco de Dormir`, kind: "bed", x: b.x, z: b.z, available: true });
    for (const z of this.zones) opts.push({ id: z.id, label: z.name, kind: "zone", diff: z.diff, x: z.pos.x, z: z.pos.z, available: true });
    return opts;
  }

  respawn(optId: string, appearance?: Partial<Appearance>) {
    const p = this.player;
    let pos: THREE.Vector3 | null = null;
    if (optId === "random") optId = this.zones[Math.floor(Math.random() * this.zones.length)].id;
    if (optId.startsWith("bag:")) {
      const s = this.building.get(Number(optId.slice(4)));
      if (s) {
        pos = new THREE.Vector3(s.x + 1.2, s.y + 0.1, s.z);
        this.building.remove(s); // sleeping bags are single-use
        if (this.net.role === "host") this.net.broadcast({ t: "sr", ids: [s.id] });
        this.notify("O saco de dormir foi usado.", "info");
      }
    }
    if (!pos) {
      const zone = this.zones.find((z) => z.id === optId) ?? this.zones[0];
      for (let i = 0; i < 20; i++) {
        const c = zone.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 16, 0, (Math.random() - 0.5) * 16));
        const h = this.terrain.heightAt(c.x, c.z);
        if (h > 0.3 && !this.physics.query(c.x, c.z, 0.8).some((col) => col.kind === "circle")) { pos = c.setY(h); break; }
      }
      if (!pos) pos = zone.pos.clone();
      // face inland
      this.camYaw = Math.atan2(pos.x, pos.z);
    }
    if (appearance) Object.assign(p.appearance, appearance);
    p.pos.copy(pos);
    p.resetForRespawn();
    if (this.firstSpawn) { p.food = p.max("food"); p.water = p.max("water"); this.firstSpawn = false; this.fx.burst("heal", p.pos.clone().add(new THREE.Vector3(0, 1, 0)), 14); }
    p.deathCause = "";
    this.creatures.populate(p.pos);
    this.events.emit("inventory", undefined);
    this.save();
  }

  // ================================================================ camera
  look(dx: number, dy: number) {
    const s = 0.0045;
    this.camYaw -= dx * s * this.settings.sensX;
    this.camPitch -= dy * s * this.settings.sensY * (this.settings.invertY ? -1 : 1);
    this.camPitch = THREE.MathUtils.clamp(this.camPitch, -1.35, 1.1);
  }

  toggleCamera() {
    this.firstPerson = !this.firstPerson;
  }

  zoom(delta: number) {
    this.camDist = THREE.MathUtils.clamp(this.camDist + delta, CONFIG.camera.minDistance, CONFIG.camera.maxDistance);
  }

  private camDir(out = new THREE.Vector3()) {
    const cp = Math.cos(this.camPitch);
    return out.set(-Math.sin(this.camYaw) * cp, Math.sin(this.camPitch), -Math.cos(this.camYaw) * cp);
  }

  private updateCamera(dt: number) {
    const p = this.player;
    const eyeH = this.riding ? 0.9 : p.swimming ? 0.5 : CONFIG.camera.height;
    this.camTarget.lerp(new THREE.Vector3(p.pos.x, p.pos.y + eyeH, p.pos.z), this.settings.disableCameraInterpolation ? 1 : Math.min(1, dt * 18));
    if (this.camTarget.distanceTo(p.pos) > 5) this.camTarget.set(p.pos.x, p.pos.y + eyeH, p.pos.z);
    const dir = this.camDir();
    const right = new THREE.Vector3(Math.cos(this.camYaw), 0, -Math.sin(this.camYaw));
    if (this.firstPerson || (this.riding && this.settings.firstPersonRiding)) {
      this.camera.position.set(p.pos.x, p.pos.y + (p.swimming ? 0.4 : CONFIG.player.eye * p.appearance.height), p.pos.z).addScaledVector(dir, 0.12);
      p.rig.root.visible = false;
    } else {
      p.rig.root.visible = !p.dead;
      const pivot = this.camTarget.clone().addScaledVector(right, this.settings.thirdPersonOffset || p.heldId ? CONFIG.camera.shoulder : 0);
      const back = dir.clone().negate();
      let dist = this.camDist + (this.riding ? this.riding.sp.height * this.riding.growth * 1.3 : 0);
      const hit = this.physics.raycast(pivot, back, dist + 0.3);
      if (hit.dist >= 0) dist = Math.max(0.6, hit.dist - 0.3);
      this.camera.position.copy(pivot).addScaledVector(back, dist);
      const gh = this.terrain.heightAt(this.camera.position.x, this.camera.position.z);
      if (this.camera.position.y < gh + 0.3) this.camera.position.y = gh + 0.3;
    }
    this.camera.rotation.set(this.camPitch, this.camYaw, 0);
    if ((this.firstPerson || (this.riding && this.settings.firstPersonRiding)) && this.settings.viewBob && p.onGround) {
      const hs = Math.hypot(p.vel.x, p.vel.z);
      this.viewBobT += hs * dt * 1.6;
      const a = Math.min(1, hs / 4) * 0.045;
      this.camera.position.y += Math.abs(Math.sin(this.viewBobT)) * a;
      this.camera.rotation.z = Math.sin(this.viewBobT) * a * 0.3;
    }
  }

  private updateEnvironment(dt: number) {
    const hour = this.hour();
    const ang = ((hour - 6) / 24) * Math.PI * 2;
    const elev = Math.sin(ang);
    const day = this.dayFactor();
    const dusk = Math.max(0, 1 - Math.abs(elev) / 0.28) * (elev > -0.22 ? 1 : 0);
    this.sunDir.set(Math.cos(ang), elev, 0.35).normalize();
    const cam = this.camera.position;
    const horizon = this.sky.update(cam, this.sunDir, day, dusk, this.time, this.cloudCover);
    this.skyColor.copy(horizon);
    const fog = this.scene.fog as THREE.Fog;
    fog.color.copy(horizon);
    const p = this.player.pos;
    // sun or moon drives the shadow light
    const lightDir = elev > -0.05 ? this.sunDir : this.sunDir.clone().negate();
    const snap = 2;
    const cx = Math.round(p.x / snap) * snap, cz = Math.round(p.z / snap) * snap;
    this.sun.target.position.set(cx, p.y, cz);
    this.sun.position.set(cx + lightDir.x * 120, p.y + Math.max(0.15, lightDir.y) * 120, cz + lightDir.z * 120);
    this.sun.intensity = elev > -0.05 ? 0.15 + 2.3 * day : 0.6; // moonlight
    this.sun.color.set("#fff1dc").lerp(new THREE.Color("#ff9a58"), dusk * 0.7);
    if (elev <= -0.05) this.sun.color.set("#8fa6d8");
    this.hemi.intensity = 0.52 + 0.58 * day;
    this.hemi.color.set("#bcd8ff").lerp(new THREE.Color("#6474a8"), 1 - day);
    this.hemi.groundColor.set("#6a5438").lerp(new THREE.Color("#2a2e3c"), 1 - day);
    this.ambient.intensity = 0.12 + (1 - day) * 0.22;
    this.renderer.toneMappingExposure = (0.95 + (1 - day) * 0.4) * this.settings.gamma;
    if (this.bloomPass) this.bloomPass.strength = 0.25 + (1 - day) * 0.35;
    WIND.time.value = this.time;
    this.cloudCover = this.weather.cover;
    WIND.strength.value = this.weather.wind + Math.sin(this.time * 0.05) * 0.2;
    // storms darken the scene and pull fog in; lightning flashes light everything
    const gloom = this.weather.rain * 0.45 + this.weather.fog * 0.2;
    this.sun.intensity *= 1 - gloom * 0.8;
    this.hemi.intensity *= 1 - gloom * 0.35;
    fog.far = this.viewDist * 0.97 * (1 - this.weather.fog * 0.6 - this.weather.rain * 0.25);
    fog.near = fog.far * (0.3 - this.weather.fog * 0.25);
    fog.color.lerp(new THREE.Color("#7f8a90").multiplyScalar(0.3 + day * 0.7), gloom);
    if (this.weather.flash > 0) { this.hemi.intensity += this.weather.flash * 3; fog.color.lerp(new THREE.Color("#dfe8ff"), this.weather.flash * 0.5); }
    if (this.water) this.water.update(cam, this.time, this.sunDir, horizon, this.sun.color, day, horizon, fog.near, fog.far);
    this.grass?.update(p.x, p.z, p.y);
    this.resources?.updateLod(cam, 50 + this.settings.meshLod * 120);
    this.pois?.update(this.time);
    // camera shake
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2.5);
      const a = this.shake * 0.12 * this.settings.cameraShake;
      this.camera.position.x += (Math.random() - 0.5) * a;
      this.camera.position.y += (Math.random() - 0.5) * a;
    }
    // shadow casters: only nearby creatures cast shadows
    for (const c of this.creatures.list) {
      const near = c.pos.distanceTo(p) < 18 + this.settings.shadows * 7;
      if (c.rig.root.userData.shadow !== near) {
        c.rig.root.userData.shadow = near;
        c.rig.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = near; });
      }
      const vis = 45 + this.settings.meshLod * 95;
      c.rig.root.visible = c.pos.distanceTo(cam) < Math.min(vis, this.viewDist * 0.5) || (c.tamed && c.pos.distanceTo(cam) < 150);
    }
  }

  private menuFrame(dt: number) {
    music.setMode(this.settings.disableMenuMusic ? "off" : "menu");
    music.update(dt);
    this.menuT += dt;
    this.time += dt * 4;
    this.clock = this.time;
    const sp = this.terrain.spawnPoint;
    const center = new THREE.Vector3(sp.x * 0.55, 0, sp.z * 0.55);
    const a = this.menuT * 0.035;
    const r = 70;
    const x = center.x + Math.cos(a) * r, z = center.z + Math.sin(a) * r;
    const h = Math.max(this.terrain.heightAt(x, z), 0) + 22;
    this.camera.position.set(x, h, z);
    this.camera.lookAt(center.x, 4, center.z);
    this.player.pos.copy(center);
    this.creatures.update(dt);
    this.updateEnvironment(dt);
    this.fx.update(dt, this.renderer.domElement.height, this.camera.fov);
    this.renderFrame();
  }

  private adaptResolution(dt: number) {
    if (!this.settings.dynamicRes) { if (this.resScale !== 1) { this.resScale = 1; this.applyQuality(); } return; }
    if (this.fps < 26) { this.lowFpsT += dt; this.highFpsT = 0; }
    else if (this.fps > 52) { this.highFpsT += dt; this.lowFpsT = 0; }
    else { this.lowFpsT = 0; this.highFpsT = 0; }
    if (this.lowFpsT > 2.5 && this.resScale > 0.55) { this.resScale -= 0.1; this.lowFpsT = 0; this.renderer.setPixelRatio(this.basePixelRatio() * this.resScale); this.composer?.setPixelRatio(this.renderer.getPixelRatio()); }
    if (this.highFpsT > 5 && this.resScale < 1) { this.resScale = Math.min(1, this.resScale + 0.1); this.highFpsT = 0; this.renderer.setPixelRatio(this.basePixelRatio() * this.resScale); this.composer?.setPixelRatio(this.renderer.getPixelRatio()); }
  }

  /** Continuous particle emitters (fires, torches) and footstep effects. */
  private updateAmbientFx(dt: number) {
    this.emberTimer -= dt;
    if (this.emberTimer <= 0) {
      this.emberTimer = 0.12;
      for (const s of this.building.list) {
        if (!s.lit || s.def.interact !== "campfire") continue;
        if (Math.hypot(s.x - this.player.pos.x, s.z - this.player.pos.z) > 60) continue;
        const top = new THREE.Vector3(s.x, s.y + (s.def.id === "campfire" ? 0.6 : 2.3), s.z);
        this.fx.burst("ember", top, 1);
        if (Math.random() < 0.5) this.fx.burst("smoke", top.clone().add(new THREE.Vector3(0, 0.4, 0)), 1);
      }
      if (this.player.heldId === "torch" && !this.player.dead) {
        const hp = new THREE.Vector3();
        this.player.held?.getObjectByName("flame")?.getWorldPosition(hp);
        if (hp.lengthSq() > 0) this.fx.burst("ember", hp, 1);
      }
    }
    if (Math.random() < dt * 1.5) for (const c of this.creatures.list) if (c.sleeping && c.pos.distanceTo(this.player.pos) < 40) this.fx.text(new THREE.Vector3(c.pos.x, c.pos.y + c.sp.height * 0.7, c.pos.z), "z", "#bfe8ff", 0.7);
    const p = this.player;
    if (p.onGround && !p.swimming && !p.dead) {
      this.stepDist += Math.hypot(p.vel.x, p.vel.z) * dt;
      if (this.stepDist > (p.sprinting ? 1.6 : 1.25)) {
        this.stepDist = 0;
        const biome = this.terrain.biomeAt(p.pos.x, p.pos.z);
        const onStruct = p.pos.y > this.terrain.heightAt(p.pos.x, p.pos.z) + 0.2;
        audio.play(onStruct ? "step_wood" : p.inWater ? "step_water" : biome === "beach" ? "step_sand" : biome === "hills" || biome === "peak" ? "step_stone" : "step_grass", 0.5);
        if (p.sprinting && !onStruct) this.fx.burst(p.inWater ? "splash" : "dust", p.pos.clone().add(new THREE.Vector3(0, 0.05, 0)), 2);
      }
    }
  }

  private updateLights() {
    const p = this.player.pos;
    const sources: { pos: THREE.Vector3; intensity: number; d: number }[] = [];
    for (const s of this.building.list) if (s.def.interact === "campfire" && s.lit) {
      const pos = new THREE.Vector3(s.x, s.y + (s.def.id === "campfire" ? 0.8 : 2.3), s.z);
      sources.push({ pos, intensity: 2.2 + Math.sin(this.time * 12 + s.id) * 0.3, d: pos.distanceTo(p) });
    }
    if (this.player.heldId === "torch" && !this.player.dead) {
      const hp = new THREE.Vector3();
      this.player.rig.hand.getWorldPosition(hp);
      sources.push({ pos: hp.add(new THREE.Vector3(0, 0.4, 0)), intensity: 1.8 + Math.sin(this.time * 15) * 0.2, d: 0 });
    }
    sources.sort((a, b) => a.d - b.d);
    this.lights.forEach((l, i) => {
      const s = sources[i];
      if (s && s.d < 80) { l.position.copy(s.pos); l.intensity = s.intensity; }
      else l.intensity = 0;
    });
  }

  // ================================================================ focus / targeting
  private updateFocus() {
    const p = this.player;
    this.focus = null;
    this.focusRef = null;
    if (p.dead || this.riding) return;
    const o = this.camera.position.clone();
    const d = this.camDir();
    const maxD = (this.firstPerson ? 0 : this.camDist) + CONFIG.player.interactReach + 1.5;
    let best: { dist: number; ref: Creature | ResourceNode | Structure | Bag; kind: FocusKind } | null = null;
    const withinReach = (x: number, y: number, z: number, r: number) =>
      Math.hypot(x - p.pos.x, z - p.pos.z) - r <= CONFIG.player.interactReach && Math.abs(y - p.pos.y) < 4;

    const ch = this.riding ? null : this.creatures.raycast(o, d, maxD);
    if (ch && withinReach(ch.c.pos.x, ch.c.pos.y, ch.c.pos.z, ch.c.hitRadius() + 0.5)) best = { dist: ch.dist, ref: ch.c, kind: ch.c.alive ? "creature" : "corpse" };
    const ph = this.physics.raycast(o, d, maxD);
    if (ph.dist >= 0) this.aimPoint.copy(o).addScaledVector(d, ph.dist);
    else this.aimPoint.copy(o).addScaledVector(d, 60);
    if (ph.collider && ph.collider.owner && ph.dist >= 0 && (!best || ph.dist < best.dist)) {
      const owner = ph.collider.owner as ResourceNode | Structure;
      const hp = this.aimPoint;
      if (withinReach(hp.x, hp.y, hp.z, 0.8)) {
        if ((owner as Structure).def) best = { dist: ph.dist, ref: owner as Structure, kind: "structure" };
        else best = { dist: ph.dist, ref: owner as ResourceNode, kind: "node" };
      }
    }
    // small interactables (bushes, pebbles) + bags + sleeping bags (no collider)
    for (const n of this.resources.near(p.pos.x, p.pos.z, 5)) {
      if (NODE_TYPES[n.type].gather !== "interact") continue;
      const t = raySphere(o, d, n.x, n.y + 0.4, n.z, n.type === "bush" ? 0.9 : 0.5);
      if (t >= 0 && t < maxD && (!best || t < best.dist) && withinReach(n.x, n.y, n.z, 0.6)) best = { dist: t, ref: n, kind: "node" };
    }
    for (const poi of this.pois?.pois ?? []) {
      if (!poi.terminal) continue;
      const tp = poi.terminal;
      const t = raySphere(o, d, tp.x, tp.y, tp.z, 1.2);
      if (t >= 0 && t < maxD && (!best || t < best.dist) && withinReach(tp.x, tp.y - 1.3, tp.z, 1.0)) best = { dist: t, ref: poi as unknown as Bag, kind: "obelisk" };
    }
    for (const e of this.breeding.eggs) {
      const t = raySphere(o, d, e.pos.x, e.pos.y + 0.3, e.pos.z, 0.6);
      if (t >= 0 && t < maxD && (!best || t < best.dist) && withinReach(e.pos.x, e.pos.y, e.pos.z, 0.5)) best = { dist: t, ref: e as unknown as Bag, kind: "egg" };
    }
    for (const n of this.pois?.notes ?? []) {
      if (n.collected) continue;
      const t = raySphere(o, d, n.pos.x, n.pos.y, n.pos.z, 0.7);
      if (t >= 0 && t < maxD && (!best || t < best.dist) && withinReach(n.pos.x, n.pos.y - 1, n.pos.z, 0.6)) best = { dist: t, ref: n as unknown as Bag, kind: "note" };
    }
    for (const b of this.bags) {
      if (b.falling) continue;
      const t = raySphere(o, d, b.pos.x, b.pos.y + 0.3, b.pos.z, b.kind === "supply" ? 0.9 : 0.6);
      if (t >= 0 && t < maxD && (!best || t < best.dist) && withinReach(b.pos.x, b.pos.y, b.pos.z, 0.5)) best = { dist: t, ref: b, kind: "bag" };
    }
    for (const s of this.building.list) {
      if (s.def.id !== "sleeping_bag") continue;
      const t = raySphere(o, d, s.x, s.y + 0.2, s.z, 1);
      if (t >= 0 && t < maxD && (!best || t < best.dist) && withinReach(s.x, s.y, s.z, 1)) best = { dist: t, ref: s, kind: "structure" };
    }
    // fallback: nearest interactable in front of player (mobile friendliness)
    if (!best) {
      const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
      let bd = 2.4;
      const consider = (x: number, z: number, r: number, ref: Creature | ResourceNode | Bag, kind: FocusKind) => {
        const dx = x - p.pos.x, dz = z - p.pos.z;
        const dist = Math.hypot(dx, dz) - r;
        if (dist > bd) return;
        if ((dx * fx + dz * fz) / (Math.hypot(dx, dz) || 1) < 0.4) return;
        bd = dist;
        best = { dist: dist, ref, kind };
      };
      for (const n of this.resources.near(p.pos.x, p.pos.z, 4)) consider(n.x, n.z, NODE_TYPES[n.type].gather === "interact" ? 0.4 : NODE_TYPES[n.type].radius * n.scale, n, "node");
      for (const b of this.bags) consider(b.pos.x, b.pos.z, 0.3, b, "bag");
      for (const c of this.creatures.list) if (!c.conscious || c.tamed) consider(c.pos.x, c.pos.z, c.sp.radius, c, c.alive ? "creature" : "corpse");
    }
    // water
    if (!best && p.inWater) {
      this.focus = { kind: "water", id: 0, label: "Água", action: p.water < p.max("water") - 1 ? "Beber" : undefined, dist: 0 };
      return;
    }
    if (!best) {
      // looking at shoreline water nearby
      const waterT = d.y < 0 ? (CONFIG.world.seaLevel - o.y) / d.y : -1;
      if (waterT > 0 && waterT < maxD && (ph.dist < 0 || waterT < ph.dist)) {
        const wx = o.x + d.x * waterT, wz = o.z + d.z * waterT;
        if (Math.hypot(wx - p.pos.x, wz - p.pos.z) < 3.5) {
          this.focus = { kind: "water", id: 0, label: "Água", action: "Beber", dist: waterT };
          return;
        }
      }
      return;
    }
    const b = best as { dist: number; ref: Creature | ResourceNode | Structure | Bag; kind: FocusKind };
    this.focusRef = b.ref;
    this.focus = this.describe(b.kind, b.ref, b.dist);
  }

  private describe(kind: FocusKind, ref: Creature | ResourceNode | Structure | Bag, dist: number): Focus {
    if (kind === "creature" || kind === "corpse") {
      const c = ref as Creature;
      if (!c.alive) return { kind: "corpse", id: c.id, label: `${c.name} (morto)`, hitHint: "Ataque para coletar carne/couro", dist };
      const f: Focus = { kind: "creature", id: c.id, label: `${c.name} - Nv ${c.level}`, hp: c.health, maxHp: c.maxHealth, torpor: c.torpor, maxTorpor: c.maxTorpor, tamed: c.tamed, hostile: !c.tamed && (c.sp.temperament === "aggressive" || (c.state === "chase" && c.target?.kind === "player")), dist };
      if (c.tamed) {
        f.sub = c.age < 1 ? `Filhote ${Math.round(c.age * 100)}% · Impressão ${Math.round(c.imprint * 100)}%` : `Domesticado · ${cmdLabel(c.command)} · ${c.gender === "M" ? "♂" : "♀"}${c.mating ? " · Acasalando" : ""}`;
        f.action = c.age < 1 && c.imprintRequest === "cuddle" ? "Carinho" : this.canMount(c) ? "Montar" : "Gerenciar";
        if (f.action !== "Gerenciar") f.action2 = "Gerenciar";
        if (c.age < 1 && c.imprintRequest === "feed") f.sub += " · quer ração";
      }
      else if (c.state === "unconscious") {
        f.sub = "Inconsciente";
        f.action = "Alimentar";
        f.taming = c.taming ? c.taming.affinity / c.taming.needed : 0;
      } else f.sub = c.sleeping ? "Dormindo" : temperLabel(c.sp.temperament) + (c.sp.nocturnal && !c.nightNow ? " · sonolento (dia)" : "");
      return f;
    }
    if (kind === "node") {
      const n = ref as ResourceNode;
      const def = NODE_TYPES[n.type];
      return { kind, id: n.id, label: def.name, action: def.gather === "interact" ? (n.type === "bush" ? "Colher" : "Pegar") : undefined, hitHint: def.gather === "hit" ? ((n.type === "rock" || n.type === "metal_rock") && this.equippedTool().tool.kind === "hand" ? "Precisa de picareta ou machado" : "Ataque para coletar") : undefined, dist, hp: def.gather === "hit" ? n.hp : undefined, maxHp: def.gather === "hit" ? def.hp : undefined };
    }
    if (kind === "obelisk") {
      const poi = ref as unknown as { id: string; name: string };
      return { kind, id: 0, label: `Terminal de Tributo · ${poi.name}`, sub: "Obelisco", action: "Acessar", dist };
    }
    if (kind === "egg") {
      const e = ref as unknown as Egg;
      const sp = SPECIES[e.species];
      const [lo, hi] = sp?.eggTemp ?? [20, 32];
      return { kind, id: e.id, label: `Ovo fertilizado de ${sp?.name ?? e.species}`, sub: `${e.status === "ok" ? "Incubando" : e.status === "cold" ? "FRIO DEMAIS" : "QUENTE DEMAIS"} · ${Math.round(e.temp)}°C (ideal ${lo}–${hi}°C)`, hp: e.health * 100, maxHp: 100, taming: e.progress, hostile: e.status !== "ok", dist };
    }
    if (kind === "note") {
      const n = ref as unknown as Note;
      return { kind, id: n.id, label: "Nota de Explorador", sub: n.title, action: "Ler", dist };
    }
    if (kind === "bag") {
      const b = ref as Bag;
      return { kind, id: b.id, label: b.label, action: "Abrir", dist };
    }
    const s = ref as Structure;
    let action: string | undefined;
    let target = s;
    if (s.def.snap === "doorframe") {
      const door = this.building.list.find((o) => o.def.snap === "door" && Math.abs(o.x - s.x) < 0.1 && Math.abs(o.z - s.z) < 0.1 && Math.abs(o.y - s.y) < 0.1);
      if (door) target = door;
    }
    switch (target.def.interact) {
      case "door": action = target.open ? "Fechar" : "Abrir"; break;
      case "container": case "campfire": case "station": action = "Abrir"; break;
      case "bed": action = this.player.spawnBag === target.id ? undefined : "Definir Spawn"; break;
    }
    this.focusRef = target;
    return { kind: "structure", id: target.id, label: target.def.name, sub: target.def.id === "campfire" ? (target.lit ? "Acesa" : "Apagada") : undefined, action: action ?? "Gerenciar", hp: target.hp, maxHp: target.def.hp, dist };
  }

  // ================================================================ interaction
  interact() {
    const p = this.player;
    if (this.grabbedBy) { this.letGo(); return; }
    if (this.riding && this.riding.sp.canCarry) { this.toggleCarry(); return; }
    if (p.dead || p.unconscious) return;
    const f = this.focus;
    if (!f) return;
    if (f.kind === "water") {
      if (p.water < p.max("water")) {
        p.water = Math.min(p.max("water"), p.water + 20);
        audio.play("drink");
        this.stats.drinks++;
      }
      let filled = 0;
      for (const c of [p.inv, p.bar]) for (const st of c.slots) if (st && st.id === "waterskin" && (st.dur ?? 0) < 100) { st.dur = 100; filled++; }
      if (filled) { this.notify("Cantil cheio.", "info"); this.events.emit("inventory", undefined); }
      return;
    }
    const ref = this.focusRef;
    if (!ref) return;
    if (f.kind === "node") {
      const n = ref as ResourceNode;
      if (NODE_TYPES[n.type].gather !== "interact") return;
      const got = this.scaleYield(this.resources.harvest(n, "hand", 1, 1, this.time));
      if (this.isGuest) this.net.toHost({ t: "nh", id: n.id, dmg: 1 });
      this.giveItems(got);
      this.giveXp(NODE_TYPES[n.type].xp * got.reduce((a, g) => a + g.qty, 0));
      audio.play(n.type === "bush" ? "gather" : "stone", 0.7);
      this.fx.burst(n.type === "bush" ? "leaf" : "stone", new THREE.Vector3(n.x, n.y + 0.5, n.z), 6);
      p.swing = 0.6;
    } else if (f.kind === "creature") {
      const c = ref as Creature;
      if (c.tamed && c.age < 1 && c.imprintRequest === "cuddle") { this.imprintCare(c); return; }
      if (this.canMount(c)) { this.mount(c); return; }
      this.events.emit("panel", { kind: "creature", creatureId: c.id });
    } else if (f.kind === "obelisk") {
      this.events.emit("panel", { kind: "obelisk", obeliskId: (ref as unknown as { id: string }).id });
    } else if (f.kind === "note") {
      this.collectNote(ref as unknown as Note);
    } else if (f.kind === "bag") {
      this.events.emit("panel", { kind: "bag", bagId: (ref as Bag).id });
    } else if (f.kind === "structure") {
      const s = ref as Structure;
      switch (s.def.interact) {
        case "door":
          if (this.isGuest) this.net.toHost({ t: "door", id: s.id });
          else { this.building.toggleDoor(s); if (this.net.role === "host") this.net.broadcast({ t: "s", pl: [], c: [], clk: this.clock, tm: this.time, ss: [[s.id, s.lit ? 1 : 0, s.open ? 1 : 0]] }); }
          audio.play("door");
          break;
        case "bed": p.spawnBag = s.id; this.notify("Ponto de renascimento disponível neste saco de dormir.", "good"); break;
        default:
          if (this.isGuest && s.inv) { this.notify("No multijogador, só o anfitrião acessa inventários de estruturas.", "warn"); break; }
          this.events.emit("panel", { kind: "container", structureId: s.id });
      }
    }
  }

  // ================================================================ combat
  jump() {
    this.jumpQueued = true;
  }

  private equippedTool(): { tool: ToolStats; def: ItemDef | null } {
    const def = this.player.equippedDef();
    if (def?.tool) return { tool: def.tool, def };
    return { tool: HAND, def: null };
  }

  private updateCombat(_dt: number) {
    const p = this.player;
    if (p.dead || p.unconscious) return;
    const attacking = this.input.attack || this.keys.has("Mouse0");
    if (this.riding) { if (attacking) this.mountedAttack(this.riding); return; }
    if (!attacking || p.attackCd > 0) return;
    if (this.building.ghostDef) { this.placeStructure(); this.input.attack = false; this.keys.delete("Mouse0"); return; }
    if (this.dev.killOnTap && this.dev.allowed) {
      const aimed = this.creatures.raycast(this.camera.position, this.camDir(), this.camDist + 8, false);
      const nearby = this.meleeTarget(6);
      const hit = aimed?.c ?? (nearby?.kind === "creature" ? nearby.ref as Creature : null);
      if (hit && hit.alive) {
        this.dev.kill(hit);
        p.attackCd = 0.22;
        p.swing = 1;
        return;
      }
    }
    const { tool, def } = this.equippedTool();
    if (p.stamina < CONFIG.player.attackStamina * 0.5) return;
    p.attackCd = tool.cooldown;
    if (tool.ammo) { this.fireRanged(tool, def!); return; }
    p.swing = 1;
    p.stamina -= CONFIG.player.attackStamina;
    p.staminaDelay = 0.8;
    audio.play("swing", 0.6);
    const dmg = tool.damage * p.meleeMult * this.rules.playerDamage;
    const power = tool.harvestPower * (0.8 + p.meleeMult * 0.2);
    // choose target: focus if hittable & in range, else best in cone
    const target = this.meleeTarget(tool.range);
    if (!target) {
      if (this.net.active && this.net.tryMeleePlayer(p.pos, this.camYaw, tool.range, dmg)) { audio.play("flesh", 0.8); this.hitMarker = 1; }
      return;
    }
    let used = false;
    if (target.kind === "creature") {
      const c = target.ref as Creature;
      if (c.tamed) return;
      audio.play("flesh", 0.8);
      const hitPos = new THREE.Vector3(c.pos.x, c.centerY, c.pos.z).lerp(p.pos.clone().setY(c.centerY), 0.3);
      this.fx.burst("blood", hitPos, 8);
      this.fx.burst("hit", hitPos, 3);
      this.fx.text(hitPos.clone().add(new THREE.Vector3(0, 0.6, 0)), `-${Math.round(dmg)}`, "#ffd0c0");
      if (tool.torpor > 0) this.fx.text(hitPos.clone().add(new THREE.Vector3(0.4, 1, 0)), `+${Math.round(tool.torpor * p.meleeMult)}`, "#c9a6ff", 0.8);
      this.hitMarker = 1;
      const killed = this.creatures.damage(c, dmg, tool.torpor * p.meleeMult, { kind: "player" }, p.pos);
      if (c.sp.reflect && !tool.ammo) this.damagePlayer(dmg * c.sp.reflect, c.pos, `Espinhos do ${c.sp.name}`); // Kentrosaurus spikes
      used = true;
      if (!killed) for (const t of this.creatures.list) if (t.tamed && t.conscious && t.stance !== "passive" && t.command !== "stay" && t.pos.distanceTo(p.pos) < 30) { t.target = { kind: "creature", creature: c }; t.state = "chase"; t.chaseTimer = 0; }
      if (tool.kind === "hand") this.damagePlayer(0.3, null, "", true);
    } else if (target.kind === "corpse") {
      const cc = target.ref as Creature;
      this.fx.burst("blood", new THREE.Vector3(cc.pos.x, cc.pos.y + cc.sp.height * 0.35, cc.pos.z), 6);
      const got = this.scaleYield(this.creatures.harvestCorpse(cc, tool.kind, power, dmg));
      audio.play("flesh", 0.7);
      this.giveItems(got);
      this.giveXp(got.reduce((a, g) => a + g.qty, 0) * 0.4);
      used = true;
    } else if (target.kind === "node") {
      const n = target.ref as ResourceNode;
      const nd = NODE_TYPES[n.type];
      if (nd.gather !== "hit") return;
      if (tool.kind === "hand" && (n.type === "rock" || n.type === "metal_rock")) {
        // as in the original: fists do nothing to rocks — you need a pick or hatchet
        if (this.time - this.rockHintT > 3) { this.rockHintT = this.time; this.notify("Você não consegue quebrar rochas com as mãos. Use uma picareta ou machado — pegue pedras soltas no chão.", "warn"); }
        audio.play("hurt", 0.25);
        return;
      }
      const got = this.scaleYield(this.resources.harvest(n, tool.kind, power, Math.max(dmg, 10), this.time));
      if (this.isGuest) this.net.toHost({ t: "nh", id: n.id, dmg: Math.max(dmg, 10) });
      const hp = new THREE.Vector3(n.x, n.y + Math.min(1.4, nd.height * n.scale * 0.5), n.z).lerp(p.pos.clone().setY(n.y + 1.2), 0.45);
      const fxk: FxKind = n.type === "tree" || n.type === "palm" ? "wood" : n.type === "metal_rock" ? "metal" : "stone";
      this.fx.burst(fxk, hp, 10);
      if (fxk === "wood") this.fx.burst("leaf", hp.clone().setY(n.y + nd.height * n.scale * 0.8), 5);
      if (fxk !== "wood" && tool.kind !== "hand") this.fx.burst("spark", hp, 4);
      this.hitMarker = 0.6;
      audio.play(n.type === "tree" || n.type === "palm" ? "wood" : "stone", 0.8);
      this.giveItems(got);
      this.giveXp(nd.xp * got.reduce((a, g) => a + g.qty, 0));
      if (tool.kind === "hand" && nd.handHurt) this.damagePlayer(nd.handHurt, null, "Socar objetos", true);
      if (!got.length && tool.kind === "hand" && (n.type === "rock" || n.type === "metal_rock")) this.notify("Você precisa de uma ferramenta para quebrar rochas.", "warn");
      used = true;
    }
    if (used && def) this.wearTool();
  }

  private meleeTarget(range: number): { kind: FocusKind; ref: Creature | ResourceNode } | null {
    const p = this.player;
    const f = this.focus, ref = this.focusRef;
    if (f && ref && (f.kind === "creature" || f.kind === "corpse" || f.kind === "node")) {
      const r = ref as Creature | ResourceNode;
      const pos = "sp" in r ? r.pos : new THREE.Vector3(r.x, r.y, r.z);
      const rad = "sp" in r ? r.sp.radius : NODE_TYPES[r.type].radius * r.scale;
      if (Math.hypot(pos.x - p.pos.x, pos.z - p.pos.z) - rad <= range + 0.3) return { kind: f.kind, ref: r };
    }
    // cone search
    const fx = -Math.sin(this.camYaw), fz = -Math.cos(this.camYaw);
    let best: { kind: FocusKind; ref: Creature | ResourceNode } | null = null;
    let bs = Infinity;
    const test = (x: number, z: number, rad: number, kind: FocusKind, r: Creature | ResourceNode) => {
      const dx = x - p.pos.x, dz = z - p.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist - rad > range) return;
      const dot = (dx * fx + dz * fz) / (dist || 1);
      if (dot < 0.5 && dist > rad + 0.5) return;
      const score = dist - rad - dot;
      if (score < bs) { bs = score; best = { kind, ref: r }; }
    };
    for (const c of this.creatures.list) if (!c.tamed) test(c.pos.x, c.pos.z, c.sp.radius, c.alive ? "creature" : "corpse", c);
    for (const n of this.resources.near(p.pos.x, p.pos.z, range + 1.5)) if (NODE_TYPES[n.type].gather === "hit") test(n.x, n.z, NODE_TYPES[n.type].radius * n.scale, "node", n);
    return best;
  }

  private wearTool() {
    const p = this.player;
    const st = p.equipped();
    if (!st || st.dur === undefined) return;
    st.dur -= 1;
    if (st.dur <= 0) {
      const name = ITEMS[st.id].name;
      p.bar.slots[p.selected] = null;
      p.bar.touch();
      p.selected = -1;
      this.notify(`${name} quebrou!`, "warn");
    }
    this.events.emit("inventory", undefined);
  }

  currentAmmo(tool: ToolStats): string | null {
    if (!tool.ammo) return null;
    const n = tool.ammo.length;
    for (let k = 0; k < n; k++) {
      const id = tool.ammo[(this.ammoPref + k) % n];
      if (this.player.count(id) > 0) return id;
    }
    return null;
  }

  cycleAmmo() {
    const { tool } = this.equippedTool();
    if (!tool.ammo) return;
    this.ammoPref = (this.ammoPref + 1) % tool.ammo.length;
    const a = this.currentAmmo(tool);
    if (a) this.notify(`Munição: ${ITEMS[a].name}`, "info");
  }

  private fireRanged(tool: ToolStats, _def: ItemDef) {
    const p = this.player;
    const ammo = this.currentAmmo(tool);
    if (!ammo) { this.notify("Sem munição!", "warn"); return; }
    p.remove(ammo, 1);
    p.swing = 0.6;
    audio.play("bow");
    const start = new THREE.Vector3(p.pos.x, p.pos.y + 1.45, p.pos.z);
    const dir = this.aimPoint.clone().sub(start).normalize();
    const ad = ITEMS[ammo];
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, ammo === "stone" ? 0.1 : 0.6), new THREE.MeshLambertMaterial({ color: ad.color }));
    mesh.position.copy(start);
    this.scene.add(mesh);
    const dmg = (ad.ammoDamage ?? tool.damage) * (tool.kind === "slingshot" ? 1 : 1);
    this.projectiles.push({
      mesh, pos: start, vel: dir.multiplyScalar(tool.projectileSpeed ?? 40), damage: dmg, torpor: ad.ammoTorpor ?? tool.torpor, life: 4, ammo,
    });
    this.wearTool();
    this.events.emit("inventory", undefined);
  }

  private updateProjectiles(dt: number) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      pr.life -= dt;
      const prev = pr.pos.clone();
      pr.vel.y -= 9.8 * dt;
      pr.pos.addScaledVector(pr.vel, dt);
      const seg = pr.pos.clone().sub(prev);
      const len = seg.length();
      const dir = seg.normalize();
      let done = pr.life <= 0;
      const hit = this.creatures.raycast(prev, dir, len, false);
      if (hit && !hit.c.tamed) {
        const hp2 = new THREE.Vector3(hit.c.pos.x, hit.c.centerY, hit.c.pos.z);
        this.fx.burst("blood", hp2, 6);
        this.fx.text(hp2.clone().add(new THREE.Vector3(0, 0.8, 0)), `-${Math.round(pr.damage)}`, "#ffd0c0");
        if (pr.torpor) this.fx.text(hp2.clone().add(new THREE.Vector3(0.5, 1.2, 0)), `+${Math.round(pr.torpor)}`, "#c9a6ff", 0.8);
        this.hitMarker = 1;
        const killed = this.creatures.damage(hit.c, pr.damage, pr.torpor, { kind: "player" }, this.player.pos);
        audio.play("flesh", 0.8);
        if (!killed && hit.c.conscious) this.notify(`Acertou ${hit.c.name}! Torpor ${Math.round(hit.c.torpor)}/${Math.round(hit.c.maxTorpor)}`, "info");
        done = true;
      } else {
        const ph = this.physics.raycast(prev, dir, len);
        if (ph.dist >= 0 || pr.pos.y < CONFIG.world.seaLevel - 1) done = true;
      }
      pr.mesh.position.copy(pr.pos);
      pr.mesh.lookAt(pr.pos.clone().add(pr.vel));
      if (done) {
        this.scene.remove(pr.mesh);
        (pr.mesh as THREE.Mesh).geometry.dispose();
        this.projectiles.splice(i, 1);
      }
    }
  }

  // ================================================================ items
  giveItems(list: { item: string; qty: number }[]) {
    for (const g of list) {
      const left = this.player.give(g.item, g.qty);
      const got = g.qty - left;
      if (got > 0) this.notify(`+${got} ${ITEMS[g.item].name}`, "item", ITEMS[g.item].icon);
      if (left > 0) {
        this.dropBag(this.player.pos, [{ id: g.item, qty: left }], "Itens largados", 300);
        this.notify("Inventário cheio! Itens largados no chão.", "warn");
      }
    }
    if (list.length) this.events.emit("inventory", undefined);
  }

  giveXp(amount: number, reason?: string) {
    if (amount <= 0) return;
    amount *= this.fx2.xp;
    const gained = this.player.addXp(amount);
    if (reason && amount >= 5) this.notify(`+${Math.round(amount)} XP (${reason})`, "info");
    if (gained > 0) {
      audio.play("level");
      this.fx.burst("heal", this.player.pos.clone().add(new THREE.Vector3(0, 1, 0)), 25);
      this.notify(`Nível ${this.player.level}! Distribua pontos e aprenda engramas.`, "level");
      this.events.emit("levelup", this.player.level);
    }
  }

  /** Hotbar slot tapped. Consumables are used, tools equipped, structures start placement. */
  selectSlot(i: number) {
    const p = this.player;
    if (p.dead) return;
    const st = p.bar.slots[i];
    if (!st) { p.selected = -1; this.building.cancelPlacement(); return; }
    const def = ITEMS[st.id];
    if (def.armor) { if (p.equipFrom(p.bar, i)) { audio.play("click"); this.notify(`${def.name} equipado.`, "info"); this.events.emit("inventory", undefined); } return; }
    if (st.id === "waterskin") {
      if (p.inWater) { st.dur = 100; this.notify("Cantil cheio.", "info"); }
      else if ((st.dur ?? 0) >= 20) { st.dur = (st.dur ?? 0) - 20; p.water = Math.min(p.max("water"), p.water + 20); audio.play("drink"); this.stats.drinks++; }
      else this.notify("Cantil vazio. Encha na água.", "warn");
      this.events.emit("inventory", undefined);
      return;
    }
    if (def.cat === "food" || def.cat === "consumable" || (def.cat === "resource" && def.food)) {
      this.useItem(p.bar, i);
      return;
    }
    if (p.selected === i) {
      p.selected = -1;
      this.building.cancelPlacement();
      return;
    }
    p.selected = i;
    this.building.cancelPlacement();
    if (def.structure) {
      this.building.beginPlacement(def.structure);
      this.notify(`Posicionando ${def.name}. Toque em ATACAR para colocar.`, "info");
    }
    audio.play("click");
  }

  useItem(c: Container, i: number) {
    const p = this.player;
    const st = c.slots[i];
    if (!st) return;
    const def = ITEMS[st.id];
    if (p.consume(def)) {
      c.removeAt(i, 1);
      audio.play(def.water && !def.food ? "drink" : "eat");
      if (def.health && def.health > 0) this.fx.burst("heal", this.player.pos.clone().add(new THREE.Vector3(0, 1.2, 0)), 6);
      this.events.emit("inventory", undefined);
    }
  }

  /** Move item from inventory to hotbar (first empty) or back. */
  quickMove(from: "inv" | "bar", i: number) {
    const p = this.player;
    if (from === "inv") transfer(p.inv, i, p.bar);
    else {
      if (p.selected === i) { p.selected = -1; this.building.cancelPlacement(); }
      transfer(p.bar, i, p.inv);
    }
    this.events.emit("inventory", undefined);
  }

  dropFrom(c: Container, i: number, qty?: number) {
    const st = c.slots[i];
    if (!st) return;
    if (c === this.player.bar && this.player.selected === i) { this.player.selected = -1; this.building.cancelPlacement(); }
    const out = c.removeAt(i, qty ?? st.qty);
    if (out) {
      const fwd = new THREE.Vector3(Math.sin(this.player.yaw), 0, Math.cos(this.player.yaw)).multiplyScalar(1.2);
      this.dropBag(this.player.pos.clone().add(fwd), [out], "Itens largados", 600);
    }
    this.events.emit("inventory", undefined);
  }

  dropBag(pos: THREE.Vector3, items: (ItemStack | null)[], label: string, ttl: number, exactPos = false, kind: Bag["kind"] = label === "Seus itens" ? "death" : "drop", tier = 0) {
    // merge with nearby bag of same label
    const near = kind !== "supply" ? this.bags.find((b) => b.label === label && b.pos.distanceTo(pos) < 2) : undefined;
    if (near) {
      for (const it of items) if (it) near.inv.addStack(it);
      near.expires = Math.max(near.expires, this.time + ttl);
      return near;
    }
    const inv = new Container(Math.max(24, items.length + 4));
    for (const it of items) if (it) inv.addStack(it);
    const g = this.bagMesh(kind, tier, items);
    const p = pos.clone();
    if (!exactPos) p.y = this.physics.groundAt(p.x, p.z, 0.3, p.y + 1);
    g.position.copy(p);
    this.scene.add(g);
    const b: Bag = { id: BAG_ID++, pos: p, inv, mesh: g, expires: this.time + ttl, label, kind, tier };
    this.bags.push(b);
    return b;
  }

  private bagMesh(kind: Bag["kind"], tier: number, items: (ItemStack | null)[]): THREE.Group {
    const g = new THREE.Group();
    if (kind === "supply") {
      const col = Game.LOOT[tier].color;
      const crate = new THREE.Group();
      const wood = new THREE.MeshStandardMaterial({ color: "#8a6a42", roughness: 0.8 });
      const metal = new THREE.MeshStandardMaterial({ color: "#454a52", metalness: 0.7, roughness: 0.35, emissive: col, emissiveIntensity: 0.25 });
      const box = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.8, 0.8), wood);
      box.position.y = 0.4; box.castShadow = true;
      crate.add(box);
      for (const x of [-0.5, 0.5]) { const band = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.84, 0.84), metal); band.position.set(x, 0.4, 0); crate.add(band); }
      g.add(crate);
      const chute = new THREE.Mesh(new THREE.SphereGeometry(1.6, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: col, side: THREE.DoubleSide, roughness: 1 }));
      chute.position.y = 3.4; chute.name = "chute";
      g.add(chute);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 120, 8, 1, true), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending }));
      beam.position.y = 60;
      g.add(beam);
      return g;
    }
    const col = kind === "death" ? "#e0c341" : "#a07a4a";
    const first = items.find(Boolean);
    const model = kind === "drop" && first && items.filter(Boolean).length === 1 ? itemModel(first.id) : null;
    if (model) {
      const holder = new THREE.Group();
      holder.add(model);
      const box = new THREE.Box3().setFromObject(holder);
      const sz = box.getSize(new THREE.Vector3());
      holder.scale.setScalar(0.45 / Math.max(0.15, sz.x, sz.y, sz.z));
      holder.position.y = 0.3;
      holder.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true; });
      g.add(holder);
    } else {
      const bag = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), new THREE.MeshStandardMaterial({ color: kind === "death" ? "#b08a3a" : "#8a6a42", roughness: 0.9 }));
      bag.scale.set(1, 0.85, 1);
      bag.position.y = 0.26;
      bag.castShadow = true;
      g.add(bag);
      const tie = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 0.14, 8), bag.material);
      tie.position.y = 0.52;
      g.add(tie);
    }
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, kind === "death" ? 30 : 5, 5), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending }));
    beam.position.y = kind === "death" ? 15 : 2.5;
    g.add(beam);
    return g;
  }

  getBag(id: number) {
    return this.bags.find((b) => b.id === id);
  }

  private updateBags(dt: number) {
    for (let i = this.bags.length - 1; i >= 0; i--) {
      const b = this.bags[i];
      if (b.kind !== "supply") b.mesh.children[0].rotation.y += dt;
      if (b.inv.isEmpty() || this.time > b.expires) {
        this.scene.remove(b.mesh);
        this.bags.splice(i, 1);
      }
    }
  }

  // ================================================================ Part 3: world systems
  /** One artifact of each kind is hidden at a ruin (a glowing relic bag). */
  private placeArtifacts() {
    const ruins = (this.pois?.pois ?? []).filter((p) => p.kind === "ruin");
    const ids = ["artifact_hunter", "artifact_clever", "artifact_massive"];
    ids.forEach((id, i) => {
      const r = ruins[(i * 2 + 1) % Math.max(1, ruins.length)];
      if (!r) return;
      const b = this.dropBag(r.pos.clone().add(new THREE.Vector3(0, 0, 0)), [{ id, qty: 1 }], "Relíquia antiga", 1e9, true, "drop");
      b.pos.y = r.pos.y;
      b.mesh.position.y = r.pos.y;
    });
  }

  private scaleYield(list: { item: string; qty: number }[]) {
    const m = this.fx2.harvest;
    if (m === 1) return list;
    return list.map((g) => { const q = g.qty * m; return { item: g.item, qty: Math.floor(q) + (Math.random() < q % 1 ? 1 : 0) }; }).filter((g) => g.qty > 0);
  }

  /** Unstuck: move the survivor to the nearest free, walkable spot. */
  unstuck() {
    const p = this.player;
    if (this.riding) this.dismount();
    for (let r = 1; r < 30; r += 1.5)
      for (let a = 0; a < Math.PI * 2; a += 0.5) {
        const x = p.pos.x + Math.cos(a) * r, z = p.pos.z + Math.sin(a) * r;
        const h = this.terrain.heightAt(x, z);
        if (h < 0.3 || this.terrain.normalAt(x, z).y < 0.8) continue;
        if (this.physics.query(x, z, 1).length) continue;
        p.pos.set(x, h, z);
        p.vel.set(0, 0, 0);
        this.notify("Você foi movido para um local seguro.", "info");
        return;
      }
    this.respawn("beach:0");
  }

  suicide() {
    if (this.riding) this.dismount();
    this.player.health = 0.01;
    this.damagePlayer(9999, null, "Suicídio");
  }

  sfx(name: string, vol = 1) {
    audio.play(name, vol);
  }

  /** Effective temperature at a point: ambient + nearby fires + shelter. */
  temperatureAt(p: THREE.Vector3): number {
    let t = this.weather.temperatureAt(this.terrain, p.x, p.y, p.z, this.hour());
    t += this.building.heatAt(p);
    if (this.building.covered(p)) t += (22 - t) * 0.3;
    if (p.y < -0.5) t -= 4; // water is cold
    // tamed Dimetrodons insulate their surroundings toward ~30°C (their sail regulates heat)
    for (const c of this.creatures.list) {
      if (!c.tamed || !c.sp.insulator || !c.conscious) continue;
      const d = c.pos.distanceTo(p);
      if (d < 8) t += (30 - t) * Math.min(1, 0.95 * (1 - d / 8) * (0.8 + c.level * 0.01));
    }
    return t;
  }

  private updateWorldSystems(dt: number) {
    const p = this.player;
    this.weather.update(dt, this.camera.position, this.settings.skyQuality < 0.4 ? "low" : "high");
    const sheltered = this.building.covered(p.pos);
    this.building.rain = this.weather.rain;
    this.building.resistMult = this.rules.structureResistance;
    this.resources.respawnMult = this.rules.resourceRespawn;
    this.creatures.stagger = this.settings.animationStaggering;
    this.updateNameplates();
    this.updateObeliskHum(dt);
    // temperature (felt) — insulation pulls it toward comfort (22°C)
    this.tempTimer -= dt;
    if (this.tempTimer <= 0) {
      this.tempTimer = 0.5;
      const amb = this.temperatureAt(p.pos) - (this.weather.rain > 0.3 && !sheltered && !this.riding ? 3 : 0);
      const ins = p.insulation();
      let felt = amb;
      if (amb < 22) felt = Math.min(22, amb + ins.cold);
      else felt = Math.max(22, amb - ins.heat);
      p.ambientTemp = amb;
      p.bodyTemp += (felt - p.bodyTemp) * 0.25;
    }
    // eggs
    this.breeding.update(dt * this.fx2.hatch, (pos) => this.temperatureAt(pos), (e) => this.hatch(e), (e) => this.notify(`Um ovo de ${SPECIES[e.species]?.name ?? e.species} morreu (${e.status === "cold" ? "frio" : "calor"} demais).`, "warn"));
    // tutorial
    this.tutorial.update(dt, this);
    // rain puts out unsheltered campfires slowly
    if (this.weather.rain > 0.8) for (const s of this.building.list) if (s.lit && s.def.id === "campfire" && !this.building.covered(new THREE.Vector3(s.x, s.y, s.z)) && Math.random() < dt * 0.01) { s.lit = false; this.notify("A chuva apagou uma fogueira descoberta.", "warn"); }
  }

  private hatch(e: Egg) {
    const c = this.creatures.spawn(e.species, e.pos.x, e.pos.z, e.level);
    c.pos.y = e.pos.y;
    c.tamed = true;
    c.age = 0;
    c.imprint = 0;
    c.imprintTimer = 60;
    c.statLv = { ...c.statLv, ...e.statLv } as Creature["statLv"];
    c.name = `Filhote de ${c.sp.name}`;
    c.command = "follow";
    c.state = "follow";
    c.food = c.maxFood * 0.5;
    c.recompute();
    c.health = c.maxHealth;
    this.stats.hatched++;
    this.fx.burst("tame", e.pos.clone().add(new THREE.Vector3(0, 0.5, 0)), 20);
    audio.play("tame");
    this.notify(`Um ${c.sp.name} nasceu! Alimente-o (coloque comida no inventário) e cuide para impressão.`, "good");
  }

  imprintCare(c: Creature) {
    if (!c.imprintRequest) return;
    c.imprint = Math.min(1, c.imprint + 0.2);
    c.imprintRequest = null;
    c.imprintTimer = 90 + Math.random() * 40;
    c.recompute();
    this.fx.burst("tame", new THREE.Vector3(c.pos.x, c.pos.y + c.sp.height * c.growth, c.pos.z), 10);
    audio.play("tame", 0.6);
    this.giveXp(8, "Impressão");
    this.notify(`Impressão de ${c.name}: ${Math.round(c.imprint * 100)}%`, "good");
  }

  /** ARK implant check: look at the wrist crystal, then open the inventory. */
  openImplant(cb: () => void) {
    const p = this.player;
    if (p.dead || this.riding || this.viewModel.implant > 0) { cb(); return; }
    this.viewModel.implant = 0.001;
    this.implantFired = false;
    this.implantCb = cb;
    audio.play("implant", 0.8);
  }
  cancelImplant() {
    this.viewModel.implant = 0;
    this.player.implantT = 0;
    this.implantCb = null;
  }

  /** Move a stack to a specific slot (swap, or merge into a matching stack). Works across inventory/hotbar. */
  moveSlot(from: "inv" | "bar", fi: number, to: "inv" | "bar", ti: number) {
    const p = this.player;
    const A = from === "inv" ? p.inv : p.bar, Bc = to === "inv" ? p.inv : p.bar;
    if (A === Bc && fi === ti) return;
    const a = A.slots[fi], b = Bc.slots[ti];
    if (!a) return;
    const max = ITEMS[a.id]?.stack ?? 1;
    if (b && b.id === a.id && max > 1 && b.qty < max) {
      const k = Math.min(max - b.qty, a.qty);
      b.qty += k;
      a.qty -= k;
      if (a.qty <= 0) A.slots[fi] = null;
    } else {
      A.slots[fi] = b;
      Bc.slots[ti] = a;
    }
    // keep the equipped hotbar slot pointing at the same item
    if (from === "bar" && p.selected === fi) { if (to === "bar") p.selected = ti; else { p.selected = -1; this.building.cancelPlacement(); } }
    else if (to === "bar" && p.selected === ti) { if (from === "bar") p.selected = fi; else { p.selected = -1; this.building.cancelPlacement(); } }
    A.touch();
    Bc.touch();
    audio.play("click", 0.6);
    this.events.emit("inventory", undefined);
  }

  // ---------------- floating names (tamed creatures)
  private updateNameplates() {
    const on = this.settings.floatingNames;
    const cam = this.camera.position;
    for (const [c, sp] of this.nameplates) {
      if (!on || !this.creatures.list.includes(c) || !c.alive || !c.tamed || c.rider) {
        this.scene.remove(sp);
        (sp.material as THREE.SpriteMaterial).map?.dispose();
        (sp.material as THREE.SpriteMaterial).dispose();
        this.nameplates.delete(c);
      }
    }
    if (!on) return;
    for (const c of this.creatures.list) {
      if (!c.tamed || !c.alive || c.rider) continue;
      const d = c.pos.distanceTo(cam);
      let sp = this.nameplates.get(c);
      const label = `${c.name} - Nv ${c.level}`;
      if (!sp) {
        sp = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, transparent: true }));
        sp.renderOrder = 30;
        this.scene.add(sp);
        this.nameplates.set(c, sp);
      }
      if (sp.userData.label !== label || sp.userData.hp !== Math.round((c.health / c.maxHealth) * 20)) {
        sp.userData.label = label;
        sp.userData.hp = Math.round((c.health / c.maxHealth) * 20);
        const cv = document.createElement("canvas");
        cv.width = 256; cv.height = 64;
        const ctx = cv.getContext("2d")!;
        ctx.font = "bold 26px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.lineWidth = 5;
        ctx.strokeStyle = "rgba(0,0,0,0.8)";
        ctx.strokeText(label, 128, 28);
        ctx.fillStyle = "#7dffa8";
        ctx.fillText(label, 128, 28);
        ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(48, 40, 160, 9);
        ctx.fillStyle = "#ff5a52"; ctx.fillRect(49, 41, 158 * (c.health / c.maxHealth), 7);
        (sp.material as THREE.SpriteMaterial).map?.dispose();
        const tex = new THREE.CanvasTexture(cv);
        tex.colorSpace = THREE.SRGBColorSpace;
        (sp.material as THREE.SpriteMaterial).map = tex;
        (sp.material as THREE.SpriteMaterial).needsUpdate = true;
      }
      sp.visible = d < 40;
      sp.position.set(c.pos.x, c.pos.y + c.sp.height * c.growth * 1.08 + 0.6, c.pos.z);
      const k = Math.max(1, d * 0.07);
      sp.scale.set(2 * k, 0.5 * k, 1);
    }
  }

  private updateObeliskHum(dt: number) {
    this.humTimer -= dt;
    if (this.humTimer > 0 || !this.pois) return;
    this.humTimer = 2.2;
    for (const poi of this.pois.pois) if (poi.kind === "obelisk") {
      const d = Math.hypot(poi.pos.x - this.player.pos.x, poi.pos.z - this.player.pos.z);
      if (d < 45) audio.play("hum", Math.max(0, 1 - d / 45) * 0.8);
    }
  }

  // ---------------- obelisk terminal: tribute, creature upload, replicator
  static TRIBUTES: Record<string, { artifact: string; items: [string, number][]; label: string }> = {
    "Obelisco Vermelho": { artifact: "artifact_hunter", items: [["raw_prime", 10], ["keratin", 20], ["hide", 50]], label: "Guardião Carmesim" },
    "Obelisco Verde": { artifact: "artifact_clever", items: [["chitin", 20], ["narcotic", 20], ["cooked_meat", 20]], label: "Guardião Esmeralda" },
    "Obelisco Azul": { artifact: "artifact_massive", items: [["metal_ingot", 25], ["cementing_paste", 10], ["stone", 100]], label: "Guardião Safira" },
  };
  guardian: Creature | null = null;
  arkCreatures: SavedCreature[] = [];

  tributeCheck(poiId: string): { ok: boolean; missing: [string, number][] } {
    const t = Game.TRIBUTES[poiId];
    if (!t) return { ok: false, missing: [] };
    const need: [string, number][] = [[t.artifact, 1], ...t.items];
    const missing = need.filter(([id, n]) => this.player.count(id) + this.arkData.count(id) < n).map(([id, n]) => [id, n - this.player.count(id) - this.arkData.count(id)] as [string, number]);
    return { ok: missing.length === 0, missing };
  }

  summonGuardian(poiId: string): boolean {
    const poi = this.getObelisk(poiId);
    const t = Game.TRIBUTES[poiId];
    if (!poi || !t) return false;
    if (this.guardian && this.guardian.alive) { this.notify("Um guardião já foi invocado.", "warn"); return false; }
    if (!this.tributeCheck(poiId).ok) { this.notify("Tributo incompleto.", "warn"); return false; }
    for (const [id, n] of [[t.artifact, 1], ...t.items] as [string, number][]) {
      let left = n - this.player.remove(id, n);
      if (left > 0) this.arkData.remove(id, left);
    }
    const ang = Math.random() * Math.PI * 2;
    const g2 = this.creatures.spawn("guardian", poi.pos.x + Math.cos(ang) * 22, poi.pos.z + Math.sin(ang) * 22, Math.round(30 * this.rules.difficulty));
    g2.name = t.label;
    g2.home.copy(poi.pos);
    g2.rig.materials.forEach((m) => { m.emissive?.set(poi.color); m.emissiveIntensity = 0.12; });
    g2.target = { kind: "player" };
    g2.state = "chase";
    g2.roarTimer = 1.5;
    this.guardian = g2;
    this.shake = 1.2;
    audio.play("thunder", 1);
    this.fx.burst("tame", g2.pos.clone().add(new THREE.Vector3(0, 3, 0)), 40, null, new THREE.Color(poi.color));
    this.notify(`${t.label} despertou! Derrote-o para receber Elemento e um troféu.`, "warn");
    this.events.emit("inventory", undefined);
    return true;
  }

  private onGuardianKilled(c: Creature) {
    this.guardian = null;
    this.giveItems([{ item: "element", qty: 15 }, { item: "guardian_trophy", qty: 1 }]);
    this.giveXp(1500, "Guardião derrotado");
    this.notify(`${c.name} foi derrotado!`, "good");
    audio.play("level", 1);
  }

  uploadCreature(c: Creature) {
    if (!c.tamed || !c.alive || c.rider) return;
    if (this.arkCreatures.length >= 10) { this.notify("Limite de 10 criaturas nos Dados da ARK.", "warn"); return; }
    const saved = this.creatures.serializeOne(c);
    this.arkCreatures.push(saved);
    this.creatures.remove(c);
    this.fx.burst("tame", c.pos.clone().add(new THREE.Vector3(0, 1, 0)), 20);
    audio.play("tame", 0.7);
    this.notify(`${c.name} foi enviado aos Dados da ARK.`, "good");
    this.events.emit("inventory", undefined);
  }

  downloadCreature(i: number, poiId: string) {
    const poi = this.getObelisk(poiId);
    const s = this.arkCreatures[i];
    if (!poi || !s) return;
    const pos = poi.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 6, 0, 12));
    pos.y = this.physics.groundAt(pos.x, pos.z, 0.5, pos.y + 4);
    s.pos = [pos.x, pos.y, pos.z];
    this.creatures.loadTamed([s]);
    this.arkCreatures.splice(i, 1);
    this.fx.burst("tame", pos.clone().add(new THREE.Vector3(0, 1, 0)), 20);
    audio.play("tame", 0.7);
    this.notify(`${s.name} baixado dos Dados da ARK.`, "good");
    this.events.emit("inventory", undefined);
  }

  getObelisk(id: string) {
    return this.pois?.pois.find((p) => p.id === id);
  }

  // ---------------- riding
  canMount(c: Creature) {
    return c.tamed && c.alive && c.conscious && !!c.sp.rideable && c.age >= 1 && c.hasSaddle() && !this.riding;
  }

  mount(c: Creature) {
    if (!this.canMount(c)) return;
    if (c.rider || c.remoteRider) { this.notify("Outro sobrevivente está montado.", "warn"); return; }
    if (this.isGuest) this.net.toHost({ t: "mnt", id: c.id });
    this.cancelPlacement();
    this.flightLanding = false;
    this.riding = c;
    c.rolling = false;
    c.rollSpin = 0;
    c.rider = true;
    c.target = null;
    this.player.riding = c.id;
    this.player.selected = -1;
    this.stats.rides++;
    audio.play(c.sp.sounds.idle, 0.8);
    if (c.sp.movement === "fly") this.notify(`Montado em ${c.name}. Use a faixa lateral para decolar/pousar.`, "info");
    else if (c.sp.rollSpeed) this.notify(`Montado em ${c.name}. Deslize para cima na faixa de rolagem para virar bola; deslize para baixo para parar.`, "info");
    else this.notify(`Montado em ${c.name}. Ataque com o botão vermelho.`, "info");
  }

  /** Dedicated left-screen mobile gesture: take off or climb while held. */
  flySwipeUp() {
    const c = this.riding;
    if (!c || c.sp.movement !== "fly" || c.stamina <= 1) return;
    this.flightLanding = false;
    this.input.flightClimb = true;
    if (!c.flying && c.onGround) this.jumpQueued = true;
  }

  /** Landing continues after release until the flyer safely reaches the ground. */
  /** Ridden Doedicurus: finger-drag gesture starts/stops the armoured ball roll. */
  rollSwipe(_up?: boolean) {
    // one drag in any direction starts the roll, the next drag stops it (as in the original)
    const c = this.riding;
    if (!c || !c.sp.rollSpeed) return;
    if (!c.rolling) {
      c.rolling = true;
      c.rollSpin = 0;
      audio.play("charge", 1);
      this.notify(`${c.name} enrolou numa bola blindada!`, "info");
    } else {
      c.rolling = false;
      audio.play("charge", 0.6);
      this.notify(`${c.name} desenrolou.`, "info");
    }
  }

  flySwipeDown() {
    const c = this.riding;
    if (!c || c.sp.movement !== "fly" || !c.flying) return;
    this.input.flightClimb = false;
    this.input.jump = false;
    this.flightLanding = true;
  }

  dismount(_denied = false) {
    const c = this.riding;
    if (!c) return;
    if (this.isGuest) this.net.toHost({ t: "dmt", id: c.id });
    if (this.carried) this.toggleCarry();
    if (this.carriedPlayer) this.net.dropPlayer(c.id);
    this.flightLanding = false;
    this.input.flightClimb = false;
    c.rolling = false;
    c.rollSpin = 0;
    c.rider = false;
    c.flying = false;
    c.command = "stay";
    c.state = "stay";
    c.home.copy(c.pos);
    this.riding = null;
    const p = this.player;
    p.riding = null;
    const side = new THREE.Vector3(Math.cos(c.yaw), 0, -Math.sin(c.yaw)).multiplyScalar(c.sp.radius * c.growth + 1);
    p.pos.set(c.pos.x + side.x, 0, c.pos.z + side.z);
    p.pos.y = this.physics.groundAt(p.pos.x, p.pos.z, 0.3, c.pos.y + 3);
    if (p.pos.y < this.terrain.heightAt(p.pos.x, p.pos.z)) p.pos.y = this.terrain.heightAt(p.pos.x, p.pos.z);
    p.vel.set(0, 0, 0);
  }

  private seat = new THREE.Vector3();
  private updateRiding(dt: number, mx: number, mz: number, sprint: boolean) {
    const c = this.riding!;
    const p = this.player;
    if (!c.alive || !c.conscious || !this.creatures.list.includes(c)) { this.dismount(); return; }
    const flyer = c.sp.movement === "fly";
    const stick = Math.hypot(mx, mz) > 0.05;
    // a rolling ball never stops by itself: without joystick input it keeps its heading
    const moving = stick || c.rolling;
    const overW = c.inventory.weight() > c.maxWeight();
    const run = sprint && c.stamina > 1 && stick;
    let speed = run ? c.speedFor(true) : c.speedFor(false) * 1.9;
    if (overW) speed *= 0.3;
    if (c.flying) speed = (run ? c.sp.runSpeed * 1.4 : c.sp.runSpeed * 0.9) * (c.rollT > 0 ? 1.7 : 1);
    if (c.rolling) {
      // Armoured ball rolls fast, cannot climb and drains stamina while held.
      speed = (c.sp.rollSpeed ?? 6) * (run ? 1.25 : 1);
      if (c.swimming) { c.rolling = false; this.notify(`${c.name} desenrolou na água.`, "info"); }
    }
    if (this.flightLanding) speed *= 0.55;
    if (c.rollT > 0) c.rollT = Math.max(0, c.rollT - dt);
    if (run || (c.flying && moving)) c.stamina = Math.max(0, c.stamina - ((c.flying ? 4 : 7) / 1.8) * dt);
    else c.stamina = Math.min(c.maxStamina, c.stamina + c.maxStamina * 0.1 * dt);
    const sy = Math.sin(this.camYaw), cy = Math.cos(this.camYaw);
    let wx = (-sy * mz + cy * mx) * speed, wz = (-cy * mz - sy * mx) * speed;
    if (c.rolling && !stick) { wx = Math.sin(c.yaw) * speed; wz = Math.cos(c.yaw) * speed; }
    const acc = Math.min(1, dt * (c.flying ? 2.5 : 4));
    c.vel.x += (wx - c.vel.x) * acc;
    c.vel.z += (wz - c.vel.z) * acc;
    if (moving) {
      const want = Math.atan2(wx, wz);
      let d = want - c.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      const turn = d * Math.min(1, dt * (c.flying ? 3 : 5));
      c.yaw += turn;
      c.turnRate = turn / Math.max(dt, 1e-3);
    }
    const jump = this.jumpQueued || this.input.jump || this.keys.has("Space");
    this.jumpQueued = false;
    if (jump && this.flightLanding) this.flightLanding = false;
    const ground = this.terrain.heightAt(c.pos.x, c.pos.z);
    if (c.flying) {
      const pitchVelocity = moving ? Math.sin(this.camPitch) * speed * 1.35 * Math.max(0, mz) : 0;
      const verticalSpeed = Math.max(c.sp.runSpeed * 1.15, 11);
      const targetY = this.flightLanding ? -verticalSpeed :
        jump || this.input.flightClimb ? verticalSpeed : pitchVelocity;
      c.vel.y += (targetY - c.vel.y) * Math.min(1, dt * (this.flightLanding ? 5 : 4.5));
      if (c.stamina <= 0) c.vel.y = Math.min(c.vel.y, -3);
      c.pos.addScaledVector(c.vel, dt);
      const g2 = Math.max(ground, this.physics.groundAt(c.pos.x, c.pos.z, 0.5, c.pos.y + 0.5));
      if (c.pos.y <= g2 + 0.05) {
        c.pos.y = g2;
        if (c.vel.y <= 0.1 && !jump && !this.input.flightClimb) {
          c.flying = false;
          c.vel.y = 0;
          this.flightLanding = false;
        }
      }
      const lim = this.terrain.half - 4;
      c.pos.x = THREE.MathUtils.clamp(c.pos.x, -lim, lim);
      c.pos.z = THREE.MathUtils.clamp(c.pos.z, -lim, lim);
      c.pos.y = Math.min(c.pos.y, 120);
      c.onGround = false;
    } else {
      c.vel.y -= CONFIG.player.gravity * dt;
      if (jump && c.onGround) {
        if (flyer && c.stamina > 10) { c.flying = true; c.vel.y = 8; this.flightLanding = false; this.fx.burst("dust", c.pos.clone(), 10); }
        else if (c.stamina > 7 && c.sp.height < 3.2) { c.vel.y = 7.5; c.stamina -= 12 / 1.8; }
      }
      const res = this.physics.moveBody(c.pos, c.vel, dt, c.sp.radius * c.growth * 0.8, c.sp.height * c.growth, Math.max(0.6, c.sp.height * 0.35));
      c.onGround = res.onGround;
      c.swimming = c.pos.y < -c.sp.height * 0.4;
      if (c.swimming) { c.pos.y = -c.sp.height * 0.4; c.vel.y = Math.max(0, c.vel.y); c.onGround = true; }
      const lim = this.terrain.half - 4;
      c.pos.x = THREE.MathUtils.clamp(c.pos.x, -lim, lim);
      c.pos.z = THREE.MathUtils.clamp(c.pos.z, -lim, lim);
    }
    // creature held in the talons hangs below the flyer
    if (this.carried) {
      const k = this.carried;
      if (!k.alive || !this.creatures.list.includes(k)) { this.carried = null; }
      else {
        k.pos.set(c.pos.x - Math.sin(c.yaw) * 0.2, c.pos.y - k.sp.height * k.growth * 0.9 - 0.2, c.pos.z - Math.cos(c.yaw) * 0.2);
        k.yaw = c.yaw;
        if (!c.flying && c.onGround) this.toggleCarry(); // landing drops it
      }
    }
    // armoured ball: crush creatures and gather nodes on contact
    if (c.rolling) { this.rollContact(c, dt); this.rollTrail(c, dt); }
    // place rider on the saddle
    c.rig.root.updateMatrixWorld(true);
    c.rig.saddleMount.getWorldPosition(this.seat);
    p.pos.copy(this.seat).add(new THREE.Vector3(0, 0.12 - 0.55, 0));
    p.vel.copy(c.vel);
    p.yaw = c.yaw;
    p.onGround = true;
    p.swimming = false;
    p.inWater = false;
    p.sprinting = false;
  }

  private rollTimer = 0;
  private rollDustTimer = 0;
  /** Rolling leaves a dust trail and makes the shell rumble over the ground. */
  private rollTrail(c: Creature, dt: number) {
    const speed = Math.hypot(c.vel.x, c.vel.z);
    this.rollDustTimer -= dt;
    if (speed < 1.6 || this.rollDustTimer > 0) return;
    this.rollDustTimer = 0.12;
    const r = c.sp.radius * c.growth * 0.52;
    const under = c.pos.clone().add(new THREE.Vector3(-Math.sin(c.yaw) * r * 0.7, 0.06, -Math.cos(c.yaw) * r * 0.7));
    this.fx.burst("dust", under, 2);
    // tiny rumble proportional to speed keeps the ball feeling heavy
    this.shake = Math.min(0.22, this.shake + speed * 0.0025 * dt * 60);
  }

  /** Doedicurus roll: damages creatures it touches and gathers nodes at a bonus. */
  private rollContact(c: Creature, dt: number) {
    this.rollTimer -= dt;
    if (this.rollTimer > 0) return;
    this.rollTimer = 0.25;
    const ahead = c.pos.clone().add(new THREE.Vector3(Math.sin(c.yaw), 0, Math.cos(c.yaw)).multiplyScalar(c.sp.radius * 1.15));
    for (const o of this.creatures.list) {
      if (o === c || !o.alive || o.tamed) continue;
      if (Math.hypot(o.pos.x - ahead.x, o.pos.z - ahead.z) > c.sp.radius + o.sp.radius + 0.5) continue;
      this.creatures.damage(o, c.sp.damage * 1.6 * c.damageMult, 0, { kind: "creature", creature: c }, c.pos);
      this.fx.burst("dust", o.pos.clone().add(new THREE.Vector3(0, 0.4, 0)), 8);
      this.fx.burst("hit", o.pos.clone().add(new THREE.Vector3(0, 0.5, 0)), 4);
      this.shake = Math.min(1, this.shake + 0.35);
      this.hitMarker = 1;
    }
    for (const n of this.resources.near(ahead.x, ahead.z, 1.1)) {
      if (NODE_TYPES[n.type].gather !== "hit") continue;
      const mult = c.sp.rollHarvest ?? 1;
      const got = this.scaleYield(this.resources.harvest(n, "hatchet", 1.2, n.hp, this.time)).map((gr) => ({ item: gr.item, qty: Math.round(gr.qty * mult) }));
      this.giveItems(got);
      this.giveXp(got.reduce((a, gr) => a + gr.qty, 0) * 0.2);
      this.fx.burst(n.type === "tree" || n.type === "palm" ? "wood" : "stone", new THREE.Vector3(n.x, n.y + 1, n.z), 4);
      this.hitMarker = 1;
    }
  }

  carried: Creature | null = null;
  /** Talon passenger (multiplayer): the player I hold as pilot, and the flyer holding me as passenger. */
  carriedPlayer: string | null = null;
  carriedPlayerName: string | null = null;
  grabbedBy: Creature | null = null;
  /** Another player's flyer snatched me. */
  gotGrabbed(c: Creature) {
    if (this.riding) this.dismount(true);
    this.grabbedBy = c;
    this.notify(`${c.name} te agarrou com as garras! Use "Soltar-se" para se libertar.`, "warn");
  }
  /** Released (by the pilot, by landing, or by myself): back to normal physics, falling if still high. */
  gotDropped() {
    const c = this.grabbedBy;
    if (!c) return;
    this.grabbedBy = null;
    const p = this.player;
    p.vel.set(c.vel.x, Math.min(0, c.vel.y), c.vel.z);
    p.onGround = false;
    this.notify("Você foi solto.", "info");
  }
  letGo() {
    const c = this.grabbedBy;
    if (!c) return;
    this.net.letGo(c.id);
    if (this.grabbedBy) this.gotDropped();
  }
  /** Hanging in the talons: follow the flyer, no physics and no fall damage until released. */
  private updateGrabbed() {
    const k = this.grabbedBy!, p = this.player;
    if (!k.alive || !this.creatures.list.includes(k) || !k.rig.talonMount) { this.gotDropped(); return; }
    k.rig.root.updateMatrixWorld(true);
    k.rig.talonMount.getWorldPosition(this.seat);
    p.pos.copy(this.seat).add(new THREE.Vector3(0, -1.55, 0));
    p.vel.copy(k.vel);
    p.yaw = k.yaw;
    p.onGround = true;
    p.swimming = false;
    p.inWater = false;
    p.sprinting = false;
  }
  /** Ridden Pteranodon: grab / release a small creature below (ARK carry). */
  toggleCarry() {
    const c = this.riding;
    if (!c) return;
    if (this.carriedPlayer) { this.net.dropPlayer(c.id); return; }
    if (this.carried) {
      const k = this.carried;
      k.carried = false;
      k.vel.set(c.vel.x * 0.5, 0, c.vel.z * 0.5);
      if (!k.tamed) { k.state = "flee"; k.stateTimer = 4; k.fleeFrom.copy(c.pos); }
      this.carried = null;
      this.notify(`Soltou ${k.name}.`, "info");
      return;
    }
    if (!c.sp.canCarry) return;
    if (!c.flying) { this.notify("Voe sobre a criatura para agarrá-la.", "warn"); return; }
    const k = this.creatures.nearest(c.pos.clone().setY(c.pos.y - 1.5), 4.5, (o) => o !== c && o.alive && !o.rider && o.sp.height * o.growth <= (c.sp.carryMaxH ?? 1.4) && o.sp.movement !== "fly" && o.sp.movement !== "swim");
    const pl = c.sp.carryPlayers ? this.net.nearestPlayerBelow(c) : null;
    if (pl && (!k || pl.d < k.pos.distanceTo(c.pos.clone().setY(c.pos.y - 1.5)))) { this.net.grabPlayer(c, pl.pid); return; }
    if (!k) { this.notify((c.sp.carryMaxH ?? 1.4) > 2 ? "Nenhuma criatura média abaixo (Raptor, Dilofossauro, Paquicefalossauro...)." : "Nenhuma criatura pequena abaixo (Dodô, Compy, Dilofossauro...).", "warn"); return; }
    k.carried = true;
    k.target = null;
    this.carried = k;
    audio.play(k.sp.sounds.hurt, 0.7);
    this.notify(`Agarrou ${k.name}!`, "good");
  }
  barrelRoll() {
    const c = this.riding;
    if (!c || !c.flying || c.rollT > 0 || c.stamina < 15 || c.sp.id === "argent") return; // the Argentavis can't barrel-roll
    c.rollT = 0.7;
    c.stamina -= 12;
    audio.play("swing", 1);
  }

  private mountedAttack(c: Creature) {
    if (c.attackCd > 0) return;
    if (c.rolling) {
      this.rollContact(c, 1); // rolling itself is the attack
      return;
    }
    const ex = c.sp.model.extras;
    const clubbed = ex?.includes("doedicurus") || ex?.includes("ankylo") || ex?.includes("clubtail");
    if (clubbed) {
      // club strike: a heavy swing with camera kick and impact dust
      this.shake = Math.min(1, this.shake + 0.4);
      const side = c.pos.clone().add(new THREE.Vector3(Math.sin(c.yaw), 0, Math.cos(c.yaw)).multiplyScalar(c.sp.radius * 1.5));
      this.fx.burst("dust", side.clone().setY(side.y + 0.3), 6);
    }
    const target = this.creatures.riderAttack(c);
    if (c.attackCd <= 0) return; // not enough stamina
    const front = c.pos.clone().add(new THREE.Vector3(Math.sin(c.yaw), 0, Math.cos(c.yaw)).multiplyScalar(c.sp.radius * c.growth + c.sp.attackRange * 0.6));
    front.y += c.sp.height * c.growth * 0.5;
    if (c.sp.aoe && target) {
      const dmg = c.sp.damage * c.damageMult * (1 + c.imprint * 0.3);
      const hits = this.creatures.sweep(c, dmg, c.sp.attackTorpor ?? 0);
      this.shake = Math.min(1.2, this.shake + 0.4);
      for (const t of hits) {
        this.fx.burst("blood", new THREE.Vector3(t.pos.x, t.centerY, t.pos.z), 8);
        this.fx.text(new THREE.Vector3(t.pos.x, t.centerY + 1, t.pos.z), `-${Math.round(dmg)}`, "#ffd0c0");
        if (!t.alive) { this.creatures.giveCreatureXp(c, t.sp.xp * t.level); this.stats.kills++; }
      }
      this.fx.burst("dust", c.pos.clone().add(new THREE.Vector3(-Math.sin(c.yaw) * (c.sp.model.tailLen * 0.6), 0.3, -Math.cos(c.yaw) * (c.sp.model.tailLen * 0.6))), 16);
      this.hitMarker = 1;
      return;
    }
    if (target && target.alive) {
      const dmg = c.sp.damage * c.damageMult * this.creatures.packMult(c) * (1 + c.imprint * 0.3) * (0.85 + Math.random() * 0.3);
      const tor = c.sp.attackTorpor ?? 0;
      if (tor) this.fx.text(new THREE.Vector3(target.pos.x + 0.4, target.centerY + 1.4, target.pos.z), `+${tor}`, "#c9a6ff", 0.8);
      this.fx.burst("blood", new THREE.Vector3(target.pos.x, target.centerY, target.pos.z), 10);
      this.fx.text(new THREE.Vector3(target.pos.x, target.centerY + 1, target.pos.z), `-${Math.round(dmg)}`, "#ffd0c0");
      this.hitMarker = 1;
      const killed = this.creatures.damage(target, dmg, tor, { kind: "creature", creature: c }, c.pos);
      if (killed) { this.creatures.giveCreatureXp(c, target.sp.xp * target.level); this.giveXp(target.sp.xp * (1 + target.level * 0.25) * 0.5, `Abateu ${target.name}`); this.stats.kills++; }
      return;
    }
    // corpses & resource nodes (mount gathering)
    const corpse = this.creatures.list.find((o) => !o.alive && o.pos.distanceTo(front) < o.sp.radius + c.sp.attackRange);
    if (corpse) {
      const got = this.scaleYield(this.creatures.harvestCorpse(corpse, "pick", 2.5 * c.damageMult, c.sp.damage));
      this.giveToMountOrPlayer(c, got);
      this.fx.burst("blood", front, 8);
      return;
    }
    const nodes = this.resources.near(front.x, front.z, c.sp.attackRange + 1).filter((n) => NODE_TYPES[n.type].gather === "hit" || n.type === "bush");
    if (!nodes.length) return;
    const bonus = c.sp.harvestRide ?? [];
    const out: { item: string; qty: number }[] = [];
    for (const n of nodes.slice(0, 3)) {
      const got = this.scaleYield(this.resources.harvest(n, "hatchet", 1.4 * c.damageMult, c.sp.damage * 2, this.time));
      if (this.isGuest) this.net.toHost({ t: "nh", id: n.id, dmg: c.sp.damage * 2 });
      for (const gg of got) {
        const b = bonus.find((x) => x.item === gg.item);
        out.push({ item: gg.item, qty: Math.round(gg.qty * (b ? 1 + b.mult : 0.6)) });
      }
      for (const b of bonus) if (!got.some((gg) => gg.item === b.item) && (n.type === "bush" ? b.item.endsWith("berry") || b.item === "fiber" : (n.type === "rock" || n.type === "metal_rock") ? !b.item.endsWith("berry") : false)) out.push({ item: b.item, qty: Math.round(b.mult * (1 + Math.random() * 2)) });
      this.fx.burst(n.type === "tree" || n.type === "palm" ? "wood" : n.type === "bush" ? "leaf" : "stone", new THREE.Vector3(n.x, n.y + 1, n.z), 8);
    }
    this.giveToMountOrPlayer(c, out.filter((o) => o.qty > 0));
  }

  private giveToMountOrPlayer(c: Creature, list: { item: string; qty: number }[]) {
    for (const g of list) {
      const left = c.inventory.add(g.item, g.qty);
      const got = g.qty - left;
      if (got > 0) this.notify(`+${got} ${ITEMS[g.item].name} (${c.name})`, "item", ITEMS[g.item].icon);
      if (left > 0) this.giveItems([{ item: g.item, qty: left }]);
    }
    this.events.emit("inventory", undefined);
  }

  // ---------------- whistles
  whistle(cmd: "follow" | "stay" | "attack" | "passive" | "aggressive" | "mate") {
    const near = this.creatures.list.filter((c) => c.tamed && c.alive && !c.rider && c.pos.distanceTo(this.player.pos) < 45);
    if (!near.length) { this.notify("Nenhuma criatura domesticada por perto.", "warn"); return; }
    let target: Creature | null = null;
    if (cmd === "attack") {
      const f = this.focusRef as Creature | null;
      target = f && (f as Creature).sp && !(f as Creature).tamed && (f as Creature).alive ? (f as Creature) : this.creatures.nearest(this.player.pos, 30, (o) => !o.tamed && o.conscious);
      if (!target) { this.notify("Nenhum alvo para atacar.", "warn"); return; }
    }
    for (const c of near) {
      if (cmd === "follow" || cmd === "stay") this.setCommand(c, cmd);
      else if (cmd === "passive" || cmd === "aggressive") this.setStance(c, cmd);
      else if (cmd === "mate") { c.mating = !near.every((x) => x.mating); if (c.mating) this.setCommand(c, "wander"); }
      else if (target) { c.target = { kind: "creature", creature: target }; c.state = "chase"; c.chaseTimer = 0; }
    }
    audio.play("whistle");
    const label = { follow: "Sigam-me!", stay: "Fiquem!", attack: `Ataquem ${target?.name ?? ""}!`, passive: "Posição passiva", aggressive: "Posição agressiva", mate: near[0].mating ? "Acasalamento ativado" : "Acasalamento desativado" }[cmd];
    this.notify(`Apito: ${label} (${near.length})`, "info");
  }

  // ---------------- equipment / repair
  equipArmor(c: Container, i: number) {
    if (this.player.equipFrom(c, i)) { audio.play("click"); this.events.emit("inventory", undefined); }
  }
  unequipArmor(slot: ArmorSlot) {
    if (this.player.unequip(slot)) { audio.play("click"); this.events.emit("inventory", undefined); }
    else this.notify("Inventário cheio.", "warn");
  }
  repairStructure(id: number) {
    const s = this.building.get(id);
    if (!s) return;
    const cost = this.building.repairCost(s);
    if (!cost.length) return;
    for (const [it, n] of cost) if (this.player.count(it) < n) { this.notify(`Faltam recursos: ${n}× ${ITEMS[it].name}`, "warn"); return; }
    for (const [it, n] of cost) this.player.remove(it, n);
    s.hp = s.def.hp;
    audio.play("build", 0.6);
    this.fx.burst("dust", new THREE.Vector3(s.x, s.y + 1, s.z), 10);
    this.notify(`${s.def.name} reparado.`, "good");
    this.events.emit("inventory", undefined);
  }
  waterCrop(id: number) {
    const s = this.building.get(id);
    const p = this.player;
    const ws = [...p.inv.slots, ...p.bar.slots].find((st) => st && st.id === "waterskin" && (st.dur ?? 0) >= 20);
    if (!s || !ws) { this.notify("Precisa de um cantil com água.", "warn"); return; }
    ws.dur = (ws.dur ?? 0) - 20;
    this.building.water(s, 40);
    audio.play("drink", 0.5);
    this.events.emit("inventory", undefined);
  }
  interact2() {
    const f = this.focus;
    if (f?.kind === "creature" && f.action2) this.events.emit("panel", { kind: "creature", creatureId: f.id });
  }
  allocateCreatureStat(c: Creature, k: keyof Creature["statLv"]) {
    if (c.statPoints <= 0) return;
    c.statPoints--;
    c.statLv[k]++;
    c.recompute();
    audio.play("click");
    this.events.emit("inventory", undefined);
  }

  // ================================================================ supply drops & exploration
  private static LOOT: { tier: string; color: string; items: [string, number, number, number][] }[] = [
    { tier: "Branco", color: "#f4f4f4", items: [["thatch", 20, 40, 1], ["wood", 15, 30, 1], ["fiber", 20, 40, 1], ["mejoberry", 10, 20, 0.8], ["cooked_meat", 3, 6, 0.7], ["stone_pick", 1, 1, 0.3], ["stone_hatchet", 1, 1, 0.3], ["narcoberry", 10, 20, 0.5]] },
    { tier: "Verde", color: "#5dff7a", items: [["hide", 10, 25, 1], ["flint", 15, 30, 1], ["narcotic", 3, 8, 0.8], ["spear", 1, 1, 0.5], ["wooden_club", 1, 1, 0.5], ["storage_box", 1, 1, 0.3], ["campfire", 1, 1, 0.4], ["cooked_meat", 5, 10, 0.8], ["sleeping_bag", 1, 1, 0.3]] },
    { tier: "Azul", color: "#4ab8ff", items: [["bow", 1, 1, 0.6], ["stone_arrow", 10, 25, 0.9], ["tranq_arrow", 5, 15, 0.7], ["kibble_basic", 2, 6, 0.6], ["wood_wall", 2, 4, 0.5], ["wood_foundation", 2, 3, 0.5], ["metal", 10, 25, 0.6], ["stimulant", 3, 6, 0.6]] },
  ];

  private updateSupply(dt: number) {
    if (this.rules.supplyDrops) this.supplyTimer -= dt;
    if (this.supplyTimer <= 0) {
      this.supplyTimer = 240 + Math.random() * 180;
      this.spawnSupply();
    }
    for (const b of this.bags) {
      if (b.kind !== "supply" || !b.falling) continue;
      b.falling = Math.max(0, b.falling - dt * 9);
      b.mesh.position.y = b.pos.y + b.falling;
      const chute = b.mesh.getObjectByName("chute");
      if (chute) chute.visible = b.falling > 0.1;
      if (b.falling === 0) {
        this.fx.burst("dust", b.pos.clone().add(new THREE.Vector3(0, 0.3, 0)), 14);
        const d = b.pos.distanceTo(this.player.pos);
        audio.play("build", Math.max(0, 1 - d / 80));
      }
    }
  }

  spawnSupply(near?: THREE.Vector3) {
    const p = near ?? this.player.pos;
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2, r = 40 + Math.random() * 90;
      const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
      if (!this.terrain.isInside(x, z)) continue;
      const h = this.terrain.heightAt(x, z);
      if (h < 0.5 || this.terrain.normalAt(x, z).y < 0.85) continue;
      const tier = h > 16 ? 2 : Math.hypot(x - this.terrain.spawnPoint.x, z - this.terrain.spawnPoint.z) > 180 ? 1 : Math.random() < 0.25 ? 1 : 0;
      const L = Game.LOOT[tier];
      const items: ItemStack[] = [];
      for (const [id, a0, a1, ch] of L.items) if (Math.random() < ch) items.push({ id, qty: Math.floor(a0 + Math.random() * (a1 - a0 + 1)) } as ItemStack);
      if (!items.length) items.push({ id: L.items[0][0], qty: L.items[0][1] });
      const b = this.dropBag(new THREE.Vector3(x, h, z), items.map((it) => ({ ...it, dur: ITEMS[it.id].tool?.durability, spoil: ITEMS[it.id].spoil })), `Suprimentos ${L.tier}`, 900, true, "supply", tier);
      b.falling = 60;
      this.notify(`Pacote de suprimentos ${L.tier} caindo! Siga o feixe de luz.`, "good");
      return b;
    }
    return null;
  }

  private exploreTimer = 0;
  private updateExploration() {
    this.exploreTimer -= 1 / 60;
    if (this.exploreTimer > 0 || !this.pois) return;
    this.exploreTimer = 1;
    const p = this.player;
    for (const poi of this.pois.pois) {
      if (p.explored.includes(poi.id)) continue;
      if (Math.hypot(poi.pos.x - p.pos.x, poi.pos.z - p.pos.z) < (poi.kind === "obelisk" ? 14 : 12)) {
        p.explored.push(poi.id);
        this.notify(`Local descoberto: ${poi.name}`, "good");
        this.giveXp(poi.kind === "obelisk" ? 60 : 35, "Exploração");
      }
    }
  }

  collectNote(n: Note) {
    if (n.collected) return;
    n.collected = true;
    this.player.notes.push(n.id);
    audio.play("tame", 0.6);
    this.giveXp(25, "Nota de explorador");
    this.fx.burst("heal", n.pos, 12);
    this.events.emit("panel", { kind: "note", noteId: n.id });
  }

  getNote(id: number) {
    return this.pois?.notes.find((n) => n.id === id);
  }

  // ================================================================ crafting
  sourcesFor(station: Structure | null): Container[] {
    const p = this.player;
    return station?.inv ? [station.inv] : [p.inv, p.bar];
  }

  /** Replicator crafting at obelisks: uses player inventory + ARK Data, output to the player. */
  replicatorCraft(key: string, count: number): number {
    const e = ENGRAM_BY_ID[key];
    if (!e || e.station !== "replicator") return 0;
    const src = [this.player.inv, this.player.bar, this.arkData];
    const n = this.player.queue.enqueue(key, count, src);
    if (n > 0) audio.play("click");
    this.events.emit("inventory", undefined);
    return n;
  }

  canCraft(engramId: string, station: Structure | null): number {
    const e = ENGRAM_BY_ID[engramId];
    if (!e || !this.player.learned.has(engramId)) return 0;
    const stId = station?.def.id === "mortar_pestle" || station?.def.id === "smithy" ? station.def.id : "inventory";
    if (e.station !== stId) return 0;
    return CraftQueue.maxCraftable(e, this.sourcesFor(station));
  }

  craft(engramId: string, count: number, station: Structure | null): number {
    if (this.canCraft(engramId, station) <= 0) return 0;
    const q = station?.queue ?? this.player.queue;
    const n = q.enqueue(engramId, count, this.sourcesFor(station));
    if (n > 0) audio.play("click");
    this.events.emit("inventory", undefined);
    return n;
  }

  learnEngram(id: string): boolean {
    const e = ENGRAM_BY_ID[id];
    const p = this.player;
    if (!e || p.learned.has(id) || p.level < e.level || p.engramPoints < e.cost) return false;
    p.engramPoints -= e.cost;
    p.learned.add(id);
    audio.play("craft");
    this.notify(`Engrama aprendido: ${ITEMS[id].name}`, "good");
    this.events.emit("inventory", undefined);
    return true;
  }

  spendStat(k: StatKey) {
    if (this.player.spendStat(k)) { audio.play("click"); this.events.emit("inventory", undefined); }
  }

  private updateCrafting(dt: number) {
    const p = this.player;
    p.queue.update(dt, this.fx2.craft, (id, qty, xp) => {
      const left = p.give(id, qty);
      if (left > 0) this.dropBag(p.pos, [{ id, qty: left }], "Itens largados", 600);
      if (this.settings.craftingSounds) audio.play("craft", 0.6);
      this.stats.crafted[id] = (this.stats.crafted[id] ?? 0) + qty;
      this.notify(`Criado: ${ITEMS[id].name}${qty > 1 ? ` x${qty}` : ""}`, "item", ITEMS[id].icon);
      this.giveXp(xp);
      this.events.emit("inventory", undefined);
    });
    for (const s of this.building.list) {
      if (!s.queue || !s.inv) continue;
      s.queue.update(dt, this.fx2.craft, (id, qty, xp) => {
        const left = s.inv!.add(id, qty);
        if (left > 0) this.dropBag(new THREE.Vector3(s.x, s.y, s.z), [{ id, qty: left }], "Itens largados", 600);
        this.giveXp(xp);
        this.events.emit("inventory", undefined);
      });
    }
  }

  // ================================================================ building
  private updatePlacement() {
    const p = this.player;
    const st = p.equipped();
    if (!st || !ITEMS[st.id].structure) { this.building.cancelPlacement(); return; }
    // aim point: camera ray hit, clamped within place range
    const aim = this.aimPoint.clone();
    const dx = aim.x - p.pos.x, dz = aim.z - p.pos.z;
    const d = Math.hypot(dx, dz);
    const maxR = CONFIG.building.placeRange - 1;
    const gdef = this.building.ghostDef!;
    const minR = gdef.snap === "foundation" ? 3.4 : gdef.snap === "free" ? 1.6 + Math.max(gdef.size[0], gdef.size[2]) / 2 : 0;
    if (minR > 0 && d < minR) {
      // push the aim point forward (camera direction) so pieces never spawn inside the player
      const fx = -Math.sin(this.camYaw), fz = -Math.cos(this.camYaw);
      aim.x = p.pos.x + fx * minR;
      aim.z = p.pos.z + fz * minR;
      aim.y = this.physics.groundAt(aim.x, aim.z, 0.2, p.pos.y + 3);
    } else if (d > maxR) {
      aim.x = p.pos.x + (dx / d) * maxR;
      aim.z = p.pos.z + (dz / d) * maxR;
      aim.y = this.physics.groundAt(aim.x, aim.z, 0.2, p.pos.y + 3);
    }
    this.building.updatePlacement(aim, p.pos, this.camYaw);
  }

  rotatePlacement() {
    this.building.rotate();
  }

  cancelPlacement() {
    this.player.selected = -1;
    this.building.cancelPlacement();
  }

  placeStructure() {
    const p = this.player;
    const pl = this.building.placement;
    const def = this.building.ghostDef;
    const st = p.equipped();
    if (!pl || !def || !st) return;
    if (!pl.valid) { this.notify(pl.reason ?? "Local inválido", "warn"); return; }
    if (this.isGuest) {
      // the host creates it and broadcasts it back to everyone
      this.net.toHost({ t: "pl", def: def.id, p: { x: pl.x, y: pl.y, z: pl.z, rot: pl.rot, bottom: pl.bottom } });
      p.bar.removeAt(p.selected, 1);
      audio.play("build");
      this.fx.burst("dust", new THREE.Vector3(pl.x, pl.y + 0.1, pl.z), 12);
      this.giveXp(def.xp);
      if (!p.bar.slots[p.selected]) this.cancelPlacement();
      else this.building.beginPlacement(def.id);
      this.events.emit("inventory", undefined);
      return;
    }
    const s = this.building.create(def.id, pl);
    if (this.net.role === "host") this.net.broadcast({ t: "sa", id: s.id, def: def.id, p: { x: pl.x, y: pl.y, z: pl.z, rot: pl.rot, bottom: pl.bottom } });
    p.bar.removeAt(p.selected, 1);
    audio.play("build");
    this.grass?.forceRefresh();
    this.fx.burst("dust", new THREE.Vector3(pl.x, pl.y + 0.1, pl.z), 12);
    this.giveXp(def.xp);
    if (!p.bar.slots[p.selected]) this.cancelPlacement();
    else this.building.beginPlacement(def.id);
    if (def.id === "sleeping_bag") p.spawnBag = s.id;
    this.events.emit("inventory", undefined);
  }

  demolish(id: number) {
    const s = this.building.get(id);
    if (!s) return;
    if (this.isGuest) { this.net.toHost({ t: "dm", id }); audio.play("build", 0.6); this.events.emit("panel", null); return; }
    const removed = this.building.remove(s);
    if (this.net.role === "host") this.net.broadcast({ t: "sr", ids: removed.map((r) => r.id) });
    for (const r of removed) {
      const left = this.player.give(r.def.item, 1);
      if (left) this.dropBag(new THREE.Vector3(r.x, r.y, r.z), [{ id: r.def.item, qty: 1 }], "Itens largados", 600);
      if (r.inv && !r.inv.isEmpty()) this.dropBag(new THREE.Vector3(r.x, r.y, r.z), r.inv.serialize(), "Itens largados", 600);
    }
    this.notify(removed.length > 1 ? `${removed.length} estruturas removidas (sem suporte).` : `${s.def.name} recolhido.`, "info");
    audio.play("build", 0.6);
    this.events.emit("inventory", undefined);
    this.events.emit("panel", null);
  }

  // ================================================================ creature commands
  setCommand(c: Creature, cmd: Command) {
    if (this.isGuest) this.net.toHost({ t: "cmd", id: c.id, cmd });
    c.command = cmd;
    c.home.copy(c.pos);
    c.target = null;
    c.state = cmd === "follow" ? "follow" : cmd === "stay" ? "stay" : "idle";
  }
  setStance(c: Creature, s: Stance) {
    if (this.isGuest) this.net.toHost({ t: "cmd", id: c.id, stance: s });
    c.stance = s;
    if (s === "passive") { c.target = null; if (c.state === "chase") c.state = "follow"; }
  }
  releaseCreature(c: Creature) {
    if (!c.inventory.isEmpty()) this.dropBag(c.pos, c.inventory.serialize(), `Itens de ${c.name}`, 600);
    c.inventory.load([]);
    c.tamed = false;
    c.state = "idle";
    c.home.copy(c.pos);
    this.notify(`${c.name} foi libertado.`, "info");
    this.events.emit("panel", null);
  }
  feedFromPlayer(c: Creature, itemId: string) {
    const p = this.player;
    if (p.count(itemId) <= 0) return;
    if (this.isGuest) { p.remove(itemId, 1); this.net.toHost({ t: "feed", id: c.id, item: itemId }); audio.play("eat", 0.5); this.events.emit("inventory", undefined); return; }
    if (c.tamed && c.age < 1 && c.imprintRequest === "feed" && itemId.startsWith("kibble")) { p.remove(itemId, 1); this.imprintCare(c); this.events.emit("inventory", undefined); return; }
    // force-feed torpor items; other food goes to creature inventory
    const def = ITEMS[itemId];
    if (def.torpor || (c.tamed && def.food)) {
      if (p.inv.count(itemId) > 0) this.creatures.forceFeed(c, itemId, p.inv);
      else this.creatures.forceFeed(c, itemId, p.bar);
      audio.play("eat", 0.6);
    } else {
      p.remove(itemId, 1);
      c.inventory.add(itemId, 1);
    }
    this.events.emit("inventory", undefined);
  }

  // ================================================================ HUD
  hud(): HudState {
    const p = this.player;
    const qe = p.queue.entries[0];
    const { tool } = this.player.dead ? { tool: HAND } : this.equippedTool();
    const ammoId = tool.ammo ? this.currentAmmo(tool) : null;
    const pl = this.building.placement;
    return {
      health: p.health, maxHealth: p.max("health"),
      stamina: p.stamina, maxStamina: p.max("stamina"),
      food: p.food, maxFood: p.max("food"),
      water: p.water, maxWater: p.max("water"),
      weight: p.weight(), maxWeight: p.max("weight"),
      torpor: p.torpor, maxTorpor: p.max("torpor"),
      level: p.level, xpIn: p.xpInLevel(), xpNext: p.xpToNext(),
      statPoints: p.statPoints, engramPoints: p.engramPoints,
      bar: p.bar.serialize(),
      selected: p.selected,
      focus: this.focus,
      hour: this.hour(),
      day: this.day,
      fps: this.fps,
      swimming: p.swimming,
      encumbered: p.encumbrance(),
      dead: p.dead,
      firstSpawn: this.firstSpawn,
      net: this.net.active ? { role: this.net.role, code: this.net.code, count: this.net.playerCount() } : null,
      placing: this.building.ghostDef ? { name: this.building.ghostDef.name, valid: !!pl?.valid, reason: pl?.reason } : null,
      craft: qe ? { id: qe.id, count: qe.count, progress: p.queue.progress() } : null,
      ammo: tool.ammo ? { id: ammoId ?? tool.ammo[0], count: ammoId ? p.count(ammoId) : 0 } : null,
      hurt: this.hurtFx,
      starving: p.food <= 0,
      dehydrated: p.water <= 0,
      exhausted: p.exhausted,
      cameraFirst: this.firstPerson,
      temp: p.bodyTemp,
      ambient: p.ambientTemp,
      weather: WEATHER_LABEL[this.weather.kind],
      weatherKind: this.weather.kind,
      flash: this.weather.flash,
      mount: this.riding ? { name: this.riding.name, level: this.riding.level, hp: this.riding.health, maxHp: this.riding.maxHealth, stamina: this.riding.stamina, maxStamina: this.riding.maxStamina, flying: this.riding.flying, landing: this.flightLanding, canFly: this.riding.sp.movement === "fly", canCarry: !!this.riding.sp.canCarry, carrying: this.carried?.name ?? this.carriedPlayerName ?? null, canRoll: !!this.riding.sp.rollSpeed, canBarrel: this.riding.sp.id !== "argent", rolling: this.riding.rolling } : null,
      grabbed: this.grabbedBy ? this.grabbedBy.name : null,
      mission: (() => { const m = this.tutorial.current(); return m ? { title: m.title, hint: m.hint, index: MISSIONS.indexOf(m) + 1, total: MISSIONS.length } : null; })(),
      armor: p.armorValue(),
      tames: this.creatures.list.filter((c) => c.tamed && c.alive).length,
      heading: this.camYaw,
      pos: [p.pos.x, p.pos.y, p.pos.z],
      hitMarker: this.hitMarker,
    };
  }

  structureName(id: string) {
    return STRUCTURES[id]?.name ?? id;
  }

  // ================================================================ keyboard / mouse (desktop)
  private bindKeyboard() {
    window.addEventListener("keydown", (e) => {
      if (this.state !== "playing") return;
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      this.keys.add(e.code);
      if (e.repeat) return;
      if (e.code === "Space") this.jump();
      if (e.code === "KeyE") this.interact();
      if (e.code === "KeyR") this.rotatePlacement();
      if (e.code === "KeyQ") this.cancelPlacement();
      if (e.code === "KeyV") this.toggleCamera();
      if (e.code === "KeyT") this.cycleAmmo();
      if (e.code === "KeyG") this.interact2();
      if (e.code === "KeyZ") this.whistle("follow");
      if (e.code === "KeyX") this.whistle("stay");
      if (e.code === "KeyC") this.whistle("attack");
      if (e.code === "KeyF" && this.riding) this.dismount();
      if (e.code === "KeyQ" && this.riding) this.barrelRoll();
      if (e.code.startsWith("Digit")) {
        const n = Number(e.code.slice(5));
        this.selectSlot(n === 0 ? 9 : n - 1);
      }
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("blur", () => { this.keys.clear(); this.input.attack = false; });
    this.canvas.addEventListener("mousedown", (e) => {
      if (this.state !== "playing" || this.paused) return;
      if (document.pointerLockElement !== this.canvas) { this.canvas.requestPointerLock?.(); return; }
      if (e.button === 0) this.keys.add("Mouse0");
      if (e.button === 2) this.interact();
    });
    window.addEventListener("mouseup", (e) => { if (e.button === 0) this.keys.delete("Mouse0"); });
    this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    document.addEventListener("mousemove", (e) => {
      if (document.pointerLockElement === this.canvas && !this.paused) this.look(e.movementX, e.movementY);
    });
    this.canvas.addEventListener("wheel", (e) => this.zoom(e.deltaY > 0 ? 0.6 : -0.6), { passive: true });
  }
}

function nextFrame() {
  return new Promise<void>((r) => requestAnimationFrame(() => setTimeout(r, 0)));
}

export function cmdLabel(c: Command) {
  return c === "follow" ? "Seguindo" : c === "stay" ? "Parado" : "Vagando";
}
export function temperLabel(t: string) {
  return t === "curious" ? "Curioso" : t === "shorttempered" ? "Irritadiço" : t === "angry" ? "Furioso" : t === "oblivious" ? "Alheio" : t === "ambush" ? "Emboscador" : t === "passive" ? "Passivo" : t === "skittish" ? "Assustadiço" : t === "defensive" ? "Defensivo" : t === "docile" ? "Dócil" : t === "territorial" ? "Territorial" : "Agressivo";
}
