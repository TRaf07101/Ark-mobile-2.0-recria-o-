// Creature species database. Add a new species by adding an entry here;
// AI, spawning, taming, harvesting, UI and save systems read these fields generically.
export type Temperament = "curious" | "shorttempered" | "angry" | "oblivious" | "ambush" | "passive" | "skittish" | "defensive" | "aggressive" | "territorial" | "docile";
// passive: flees when hit · skittish: flees when approached · defensive: fights back when hit
// docile: ignores almost everything, retaliates only when hit (Brontosaurus)
// territorial: aggressive near water, calms down away from it (Spinosaurus)
export type Diet = "herbivore" | "carnivore";
export type Biome = "beach" | "grassland" | "forest" | "hills" | "peak";

export interface ModelSpec {
  form: "biped" | "quad" | "flyer" | "fish";
  bodyLen: number;
  bodyH: number;
  bodyW: number;
  legLen: number;
  legW: number;
  neckLen: number;
  neckRise: number; // radians upward
  headLen: number;
  headH: number;
  tailLen: number;
  armLen?: number; // for bipeds
  color: string;
  belly: string;
  accent: string;
  eye?: string; // iris color
  pattern?: "plain" | "stripes" | "spots" | "mottled" | "bands";
  frontLegMult?: number;
  neckThick?: number;
  snout?: number; // snout end radius factor
  teeth?: boolean;
  extras?: Extra[];
}
export type Extra = "trex" | "dilo" | "doedicurus" | "argent" | "bigeyes" | "osteoderms" | "casque" | "ptera" | "ankylo" | "kentro" | "dorsalspikes" | "diplo" | "dodo" | "scythes" | "thumbspike" | "sprawl" | "scutes" | "ostrich" | "quadwalk" | "allocrest" | "sail" | "dome" | "sauropod" | "crocsnout" | "wings" | "fins" | "clubtail" | "armorback" | "frill" | "neckfrill" | "horns" | "browhorns" | "crest" | "tubecrest" | "beak" | "duckbill" | "feathers" | "wings_small" | "sickle" | "round" | "heavy" | "plates" | "spikes";

export interface Species {
  id: string;
  name: string;
  temperament: Temperament;
  diet: Diet;
  health: number;
  damage: number;
  speed: number; // walk m/s
  runSpeed: number;
  attackRange: number;
  attackCooldown: number;
  aggroRange: number;
  torpor: number;
  torporDrain: number; // per second while unconscious
  radius: number;
  height: number;
  xp: number;
  tameAffinity: number;
  eatInterval: number; // seconds between bites while taming
  foods: { item: string; affinity: number; food: number }[]; // ordered by preference
  harvest: { item: string; amount: number; tool: Partial<Record<"hand" | "pick" | "hatchet" | "other", number>> }[];
  spawn: Partial<Record<Biome, number>>; // relative weight per biome
  packSize: [number, number];
  nightMult?: number;
  sounds: { idle: string; hurt: string; attack: string };
  model: ModelSpec;
  rideable?: boolean;
  movement?: "ground" | "fly" | "swim";
  harvestRide?: { item: string; mult: number }[]; // bonus resources gathered when attacking nodes while ridden
  prime?: number; // chance to drop prime meat
  eggTemp?: [number, number]; // ideal incubation temperature range (°C)
  matureSeconds?: number;
  seat?: [number, number, number]; // rider seat offset (x, y, z) relative to root
  stamina?: number;
  weight?: number;
  attackTorpor?: number; // headbutt torpor applied on hit (Pachycephalosaurus)
  waterSpeed?: number; // speed multiplier while swimming (Spinosaurus)
  rollSpeed?: number; // armoured ball-roll speed (Doedicurus)
  rollHarvest?: number; // harvest multiplier while rolling
  aoe?: boolean; // attacks hit everything in range (Brontosaurus tail sweep)
  packBonus?: boolean; // alpha pack: +50% damage, -25% damage taken with 2+ pack members nearby (Allosaurus)
  retaliates?: boolean; // passive until attacked, then chases the attacker (Pachycephalosaurus)
  armorMult?: number; // damage taken multiplier from thick armor (Ankylosaurus)
  reflect?: number; // fraction of melee damage reflected to the attacker (Kentrosaurus)
  rage?: boolean; // builds rage when damaged → more damage, attacks anything (Giganotosaurus)
  canCarry?: boolean; // flyer that can grab small creatures while ridden (Pteranodon)
  carryPlayers?: boolean; // its talons can also hold another player (multiplayer)
  carryMaxH?: number; // tallest creature it can lift (default 1.4 m; Argentavis carries medium ones)
  scavenger?: boolean; // wild: flies to nearby carcasses and heals rapidly while eating (Argentavis)
  nocturnal?: boolean; // sluggish by day, aggressive at night; eyes glow in the dark (Troodon)
  sleepsByDay?: boolean; // lies down asleep during the day unless disturbed (Megalosaurus)
  insulator?: boolean; // tamed: pulls nearby temperature toward egg-friendly warmth (Dimetrodon)
  eggBoost?: boolean; // tamed: nearby mating pairs lay eggs faster (Oviraptor)
  special?: string; // dossier text for the unique ability
}

const meatHide = (meat: number, hide: number) => [
  { item: "raw_meat", amount: meat, tool: { hand: 0.5, pick: 1, hatchet: 0.35, other: 0.4 } },
  { item: "hide", amount: hide, tool: { hand: 0.4, pick: 0.35, hatchet: 1, other: 0.3 } },
];

const herbFoods = [
  { item: "kibble_basic", affinity: 90, food: 60 },
  { item: "mejoberry", affinity: 18, food: 12 },
  { item: "amarberry", affinity: 10, food: 8 },
];
const carnFoods = [
  { item: "kibble_basic", affinity: 90, food: 60 },
  { item: "cooked_meat", affinity: 30, food: 20 },
  { item: "raw_meat", affinity: 22, food: 18 },
];

export const SPECIES: Record<string, Species> = {
  doedicurus: {
    id: "doedicurus", name: "Doedicurus", temperament: "docile", diet: "herbivore",
    health: 380, damage: 22, speed: 1.5, runSpeed: 6.2, attackRange: 2.4, attackCooldown: 1.5, aggroRange: 0,
    torpor: 340, torporDrain: 0.7, radius: 0.95, height: 1.25, xp: 32,
    tameAffinity: 320, eatInterval: 5, foods: herbFoods,
    harvest: [...meatHide(20, 14), { item: "keratin", amount: 8, tool: { hand: 0.2, pick: 1, hatchet: 0.5 } }],
    spawn: { grassland: 1.2, hills: 1.0, beach: 0.4 }, packSize: [1, 2],
    sounds: { idle: "grunt", hurt: "bellow", attack: "charge" },
    model: {
      form: "quad", bodyLen: 2.0, bodyH: 1.16, bodyW: 1.48, legLen: 0.5, legW: 0.28,
      frontLegMult: 0.95, neckLen: 0.3, neckRise: -0.08, headLen: 0.52, headH: 0.3, tailLen: 1.3,
      color: "#7a6a4c", belly: "#cbb995", accent: "#3f3322", pattern: "mottled", snout: 0.34,
      neckThick: 1.6, eye: "#b8862c", extras: ["doedicurus", "beak", "round", "heavy"],
    },
    armorMult: 0.55,
    rollSpeed: 7.5,
    rollHarvest: 3,
    rideable: true, seat: [0, 1.23, -0.1], stamina: 240, weight: 480, eggTemp: [22, 34], matureSeconds: 1000,
    harvestRide: [{ item: "stone", mult: 4 }, { item: "wood", mult: 3 }, { item: "thatch", mult: 2 }, { item: "flint", mult: 2 }],
    special: "Casco blindado (−45% de dano recebido) e clava na cauda. Montado, enrola em bola ao arrastar o dedo: rola depressa, esmaga criaturas e quebra rochas e árvores com grande eficiência.",
  },
  dodo: {
    id: "dodo", name: "Dodô", temperament: "oblivious", diet: "herbivore",
    health: 40, damage: 3, speed: 1.2, runSpeed: 3.6, attackRange: 1.2, attackCooldown: 1.2, aggroRange: 0,
    torpor: 30, torporDrain: 0.4, radius: 0.35, height: 0.8, xp: 6,
    tameAffinity: 60, eatInterval: 4, foods: herbFoods,
    harvest: [...meatHide(4, 2), { item: "fiber", amount: 2, tool: { hand: 1, pick: 0.5, hatchet: 0.5 } }],
    spawn: { beach: 3, grassland: 3, forest: 1 }, packSize: [1, 3],
    sounds: { idle: "chirp", hurt: "squawk", attack: "peck" },
    model: { form: "biped", bodyLen: 0.62, bodyH: 0.55, bodyW: 0.52, legLen: 0.3, legW: 0.06, neckLen: 0.22, neckRise: 1.1, headLen: 0.24, headH: 0.2, tailLen: 0.16, color: "#7f776c", belly: "#b8ab98", accent: "#d9b23c", pattern: "mottled", snout: 0.35, neckThick: 1.3, extras: ["dodo"] },
  },
  parasaur: {
    id: "parasaur", name: "Parassaurolofo", temperament: "skittish", diet: "herbivore",
    health: 220, damage: 8, speed: 2.2, runSpeed: 8.5, attackRange: 2.2, attackCooldown: 1.4, aggroRange: 14,
    torpor: 160, torporDrain: 0.6, radius: 0.9, height: 2.6, xp: 18,
    tameAffinity: 260, eatInterval: 5, foods: herbFoods,
    harvest: meatHide(18, 12),
    spawn: { grassland: 3, forest: 2, beach: 1 }, packSize: [1, 3],
    sounds: { idle: "horn", hurt: "bellow", attack: "grunt" },
    model: { form: "biped", bodyLen: 2.3, bodyH: 1.15, bodyW: 1.0, legLen: 1.45, legW: 0.2, neckLen: 1.0, neckRise: 0.85, headLen: 0.75, headH: 0.36, tailLen: 2.4, armLen: 0.72, color: "#5f7d4a", belly: "#d4ccaa", accent: "#b5452f", pattern: "stripes", snout: 0.35, extras: ["tubecrest", "duckbill"] },
    rideable: true, seat: [0, 2.55, -0.15], stamina: 180, weight: 250, eggTemp: [22, 34], matureSeconds: 900,
  },
  trike: {
    id: "trike", name: "Triceratops", temperament: "defensive", diet: "herbivore",
    health: 380, damage: 24, speed: 1.8, runSpeed: 6.5, attackRange: 2.8, attackCooldown: 1.6, aggroRange: 0,
    torpor: 250, torporDrain: 0.7, radius: 1.2, height: 2.2, xp: 30,
    tameAffinity: 380, eatInterval: 6, foods: herbFoods,
    harvest: [...meatHide(24, 16), { item: "keratin", amount: 10, tool: { hand: 0.2, pick: 1, hatchet: 0.5 } }],
    spawn: { grassland: 2, forest: 1, hills: 1 }, packSize: [1, 2],
    sounds: { idle: "rumble", hurt: "bellow", attack: "charge" },
    rideable: true, seat: [0, 2.25, -0.3], stamina: 200, weight: 350, eggTemp: [24, 34], matureSeconds: 1100,
    harvestRide: [{ item: "mejoberry", mult: 2 }, { item: "thatch", mult: 1 }],
    model: { form: "quad", bodyLen: 2.6, bodyH: 1.45, bodyW: 1.5, legLen: 0.95, legW: 0.3, frontLegMult: 0.92, neckLen: 0.35, neckRise: 0.15, headLen: 1.15, headH: 0.62, tailLen: 1.5, color: "#86683f", belly: "#cdb88e", accent: "#3f6f7a", pattern: "bands", snout: 0.2, neckThick: 1.5, extras: ["frill", "horns", "beak", "heavy"] },
  },
  dilo: {
    id: "dilo", name: "Dilofossauro", temperament: "aggressive", diet: "carnivore",
    health: 110, damage: 7, speed: 1.7, runSpeed: 3.8, attackRange: 1.8, attackCooldown: 1.1, aggroRange: 13,
    torpor: 75, torporDrain: 0.5, radius: 0.5, height: 1.3, xp: 14,
    tameAffinity: 150, eatInterval: 4, foods: carnFoods,
    harvest: meatHide(8, 6),
    spawn: { forest: 3, grassland: 1 }, packSize: [1, 2], nightMult: 1.5,
    sounds: { idle: "hiss", hurt: "screech", attack: "snap" },
    model: { form: "biped", bodyLen: 1.1, bodyH: 0.58, bodyW: 0.46, legLen: 0.95, legW: 0.11, neckLen: 0.6, neckRise: 0.85, headLen: 0.45, headH: 0.22, tailLen: 1.5, armLen: 0.38, color: "#6a8a38", belly: "#e3dc9e", accent: "#e0632a", eye: "#f2c21a", pattern: "stripes", teeth: true, snout: 0.35, extras: ["dilo", "neckfrill", "crest"] },
  },
  raptor: {
    id: "raptor", name: "Raptor", temperament: "aggressive", diet: "carnivore",
    health: 180, damage: 13, speed: 2.6, runSpeed: 9.2, attackRange: 2.0, attackCooldown: 0.9, aggroRange: 24,
    torpor: 180, torporDrain: 0.65, radius: 0.6, height: 1.6, xp: 26,
    tameAffinity: 300, eatInterval: 5, foods: carnFoods,
    harvest: meatHide(14, 10),
    spawn: { grassland: 1, forest: 2, hills: 1 }, packSize: [2, 3], nightMult: 1.6,
    sounds: { idle: "chitter", hurt: "shriek", attack: "screech" },
    model: { form: "biped", bodyLen: 1.35, bodyH: 0.62, bodyW: 0.5, legLen: 1.05, legW: 0.12, neckLen: 0.55, neckRise: 0.75, headLen: 0.55, headH: 0.25, tailLen: 1.9, armLen: 0.48, color: "#a0683a", belly: "#e3cca2", accent: "#3a3226", pattern: "stripes", teeth: true, snout: 0.3, extras: ["feathers", "sickle"] },
    rideable: true, seat: [0, 1.55, -0.1], stamina: 150, weight: 150, eggTemp: [26, 36], matureSeconds: 700,
  },
  stego: {
    id: "stego", name: "Estegossauro", temperament: "defensive", diet: "herbivore",
    health: 520, damage: 30, speed: 1.6, runSpeed: 5.8, attackRange: 3.4, attackCooldown: 1.8, aggroRange: 0,
    torpor: 320, torporDrain: 0.75, radius: 1.3, height: 2.8, xp: 38,
    tameAffinity: 460, eatInterval: 6, foods: herbFoods,
    harvest: [...meatHide(28, 18), { item: "raw_prime", amount: 3, tool: { hand: 0.2, pick: 0.6, hatchet: 0.2, other: 0.2 } }],
    spawn: { grassland: 1, forest: 1, hills: 2 }, packSize: [1, 2],
    sounds: { idle: "rumble", hurt: "bellow", attack: "charge" },
    model: { form: "quad", bodyLen: 2.8, bodyH: 1.5, bodyW: 1.3, legLen: 1.25, legW: 0.3, frontLegMult: 0.62, neckLen: 0.7, neckRise: -0.25, headLen: 0.6, headH: 0.32, tailLen: 2.2, color: "#6d7a4d", belly: "#c9c3a0", accent: "#a45a2e", pattern: "mottled", snout: 0.3, extras: ["plates", "spikes", "beak", "heavy"] },
    rideable: true, seat: [0, 2.6, 0.55], stamina: 220, weight: 400, eggTemp: [22, 32], matureSeconds: 1200, harvestRide: [{ item: "mejoberry", mult: 3 }, { item: "fiber", mult: 1 }],
  },
  carno: {
    id: "carno", name: "Carnotauro", temperament: "aggressive", diet: "carnivore",
    health: 420, damage: 32, speed: 2.2, runSpeed: 8.4, attackRange: 2.8, attackCooldown: 1.3, aggroRange: 28,
    torpor: 360, torporDrain: 0.9, radius: 1.0, height: 3.0, xp: 45,
    tameAffinity: 520, eatInterval: 6, foods: carnFoods,
    harvest: [...meatHide(30, 20), { item: "raw_prime", amount: 6, tool: { hand: 0.2, pick: 0.6, hatchet: 0.2, other: 0.2 } }],
    spawn: { grassland: 0.6, hills: 1, forest: 0.4 }, packSize: [1, 1], nightMult: 1.3,
    sounds: { idle: "rumble", hurt: "bellow", attack: "roar" },
    model: { form: "biped", bodyLen: 2.2, bodyH: 1.05, bodyW: 0.95, legLen: 1.75, legW: 0.22, neckLen: 0.55, neckRise: 0.55, headLen: 0.9, headH: 0.5, tailLen: 2.6, armLen: 0.3, color: "#8a3e2c", belly: "#d6b596", accent: "#4a2018", pattern: "bands", teeth: true, snout: 0.45, neckThick: 1.4, extras: ["browhorns"] },
    rideable: true, seat: [0, 2.8, -0.1], stamina: 250, weight: 350, eggTemp: [28, 38], matureSeconds: 1300, prime: 0.3,
  },
  ankylo: {
    id: "ankylo", name: "Anquilossauro", temperament: "docile", diet: "herbivore",
    health: 700, damage: 28, speed: 1.1, runSpeed: 3.8, attackRange: 3.4, attackCooldown: 1.9, aggroRange: 0,
    torpor: 420, torporDrain: 0.8, radius: 1.35, height: 1.9, xp: 42,
    tameAffinity: 500, eatInterval: 6, foods: herbFoods,
    harvest: [...meatHide(24, 14), { item: "chitin", amount: 18, tool: { hand: 0.2, pick: 1, hatchet: 0.6, other: 0.3 } }],
    spawn: { hills: 1.6, grassland: 0.4, forest: 0.2 }, packSize: [1, 2],
    sounds: { idle: "rumble", hurt: "bellow", attack: "charge" },
    model: { form: "quad", bodyLen: 3.0, bodyH: 1.15, bodyW: 2.0, legLen: 0.72, legW: 0.34, frontLegMult: 0.88, neckLen: 0.32, neckRise: -0.05, headLen: 0.66, headH: 0.44, tailLen: 2.5, color: "#8a6a42", belly: "#cdb88e", accent: "#5a4630", pattern: "mottled", snout: 0.42, neckThick: 1.5, eye: "#9a6a2a", extras: ["ankylo", "beak", "heavy"] },
    rideable: true, seat: [0, 1.95, 0.1], stamina: 220, weight: 650, eggTemp: [24, 34], matureSeconds: 1200,
    waterSpeed: 2.2, armorMult: 0.55,
    harvestRide: [{ item: "metal", mult: 3 }, { item: "stone", mult: 2 }, { item: "flint", mult: 1.5 }],
    special: "Dócil: ignora você até ser atacado, então golpeia com a clava da cauda. Carapaça grossa (−45% de dano recebido). Lento em terra, rápido nadando. Montado, a clava quebra rochas e rende muito metal.",
  },
  ptera: {
    id: "ptera", name: "Pteranodonte", temperament: "skittish", diet: "carnivore",
    health: 180, damage: 12, speed: 2.4, runSpeed: 12, attackRange: 2.2, attackCooldown: 1.1, aggroRange: 14,
    torpor: 120, torporDrain: 0.55, radius: 0.8, height: 1.5, xp: 22,
    tameAffinity: 240, eatInterval: 5, foods: [{ item: "kibble_basic", affinity: 90, food: 60 }, { item: "fish_meat", affinity: 30, food: 20 }, ...carnFoods.slice(1)],
    harvest: [...meatHide(10, 8)],
    spawn: { beach: 1.2, hills: 1.0, peak: 1.3 }, packSize: [1, 1],
    sounds: { idle: "squawk", hurt: "screech", attack: "screech" },
    model: { form: "flyer", bodyLen: 0.95, bodyH: 0.52, bodyW: 0.46, legLen: 0.5, legW: 0.065, neckLen: 0.6, neckRise: 0.85, headLen: 1.0, headH: 0.19, tailLen: 0.25, color: "#7a6a58", belly: "#d9ccb4", accent: "#a8452c", pattern: "plain", snout: 0.06, eye: "#d8a040", extras: ["ptera"] },
    rideable: true, movement: "fly", seat: [0, 0.95, 0.05], stamina: 320, weight: 130, eggTemp: [25, 36], matureSeconds: 800, canCarry: true,
    special: "Assustadiço: foge ao ser abordado. Pousa às vezes na praia. Montado: pule para decolar, role no ar para acelerar e agarre criaturas pequenas (Dodô, Compy, Dilo...) com as patas.",
  },
  argent: {
    id: "argent", name: "Argentavis", temperament: "aggressive", diet: "carnivore",
    health: 420, damage: 26, speed: 3.0, runSpeed: 10.5, attackRange: 3.4, attackCooldown: 1.3, aggroRange: 30,
    torpor: 320, torporDrain: 0.7, radius: 1.1, height: 1.9, xp: 70,
    tameAffinity: 520, eatInterval: 5.5, foods: [{ item: "kibble_basic", affinity: 90, food: 60 }, { item: "raw_prime", affinity: 46, food: 32 }, ...carnFoods.slice(1)],
    harvest: [...meatHide(24, 16)],
    spawn: { peak: 1.4, hills: 1.1, grassland: 0.5 }, packSize: [1, 1],
    sounds: { idle: "squawk", hurt: "screech", attack: "screech" },
    model: { form: "flyer", bodyLen: 1.8, bodyH: 0.9, bodyW: 0.85, legLen: 0.8, legW: 0.1, neckLen: 0.8, neckRise: 0.8, headLen: 0.6, headH: 0.32, tailLen: 1.0, color: "#4a5670", belly: "#d3d6db", accent: "#a9482a", pattern: "plain", snout: 0.1, eye: "#c98a2c", extras: ["argent"] },
    rideable: true, movement: "fly", seat: [0, 1.7, -0.08], stamina: 900, weight: 340, eggTemp: [22, 34], matureSeconds: 1500, canCarry: true, carryMaxH: 2.4, carryPlayers: true, scavenger: true,
    special: "Ave de rapina territorial: ataca qualquer coisa que se aproxime e persegue até em pleno ar. Carniceira: voa até carcaças e regenera vida rapidamente ao comer. Doma: mais lenta que o Pteranodonte, mas com muito mais fôlego de voo. Montado: agarra criaturas médias (Raptor, Dilofossauro, Paquicefalossauro...).",
  },
  rex: {
    id: "rex", name: "Tiranossauro Rex", temperament: "aggressive", diet: "carnivore",
    health: 1100, damage: 60, speed: 2.4, runSpeed: 8.8, attackRange: 3.8, attackCooldown: 1.5, aggroRange: 32,
    torpor: 900, torporDrain: 1.4, radius: 1.5, height: 4.2, xp: 110,
    tameAffinity: 900, eatInterval: 7, foods: [{ item: "kibble_basic", affinity: 140, food: 80 }, { item: "raw_prime", affinity: 80, food: 50 }, ...carnFoods.slice(1)],
    harvest: [...meatHide(60, 40), { item: "raw_prime", amount: 14, tool: { hand: 0.2, pick: 0.6, hatchet: 0.2, other: 0.2 } }, { item: "keratin", amount: 10, tool: { pick: 1, hatchet: 0.4 } }],
    spawn: { hills: 0.35, forest: 0.15, peak: 0.2 }, packSize: [1, 1], nightMult: 1.2,
    sounds: { idle: "rumble", hurt: "roar", attack: "roar" },
    model: { form: "biped", bodyLen: 3.2, bodyH: 1.6, bodyW: 1.4, legLen: 2.4, legW: 0.34, neckLen: 0.8, neckRise: 0.55, headLen: 1.5, headH: 0.8, tailLen: 3.8, armLen: 0.35, color: "#a35b3d", belly: "#c99a68", accent: "#6b6590", pattern: "mottled", teeth: true, snout: 0.5, neckThick: 1.6, eye: "#e8901e", extras: ["trex"] },
    rideable: true, seat: [0, 4.0, -0.2], stamina: 300, weight: 500, eggTemp: [30, 40], matureSeconds: 1800, prime: 0.5,
  },
  megalodon: {
    id: "megalodon", name: "Megalodonte", temperament: "aggressive", diet: "carnivore",
    health: 450, damage: 34, speed: 3, runSpeed: 9, attackRange: 2.8, attackCooldown: 1.2, aggroRange: 26,
    torpor: 300, torporDrain: 1.0, radius: 1.2, height: 1.4, xp: 40,
    tameAffinity: 400, eatInterval: 5, foods: carnFoods,
    harvest: [{ item: "fish_meat", amount: 25, tool: { hand: 0.5, pick: 1, hatchet: 0.4, other: 0.4 } }, { item: "chitin", amount: 8, tool: { hand: 0.2, pick: 0.8, hatchet: 0.5 } }, { item: "hide", amount: 10, tool: { hand: 0.3, pick: 0.3, hatchet: 1 } }],
    spawn: {}, packSize: [1, 2],
    sounds: { idle: "hiss", hurt: "bellow", attack: "snap" },
    model: { form: "fish", bodyLen: 4.0, bodyH: 1.1, bodyW: 1.0, legLen: 0, legW: 0.1, neckLen: 0.1, neckRise: 0, headLen: 1.1, headH: 0.8, tailLen: 1.8, color: "#5a6a78", belly: "#dfe6ea", accent: "#3a4450", pattern: "plain", teeth: true, snout: 0.35, extras: ["fins"] },
    movement: "swim",
  },
  guardian: {
    id: "guardian", name: "Guardião do Obelisco", temperament: "aggressive", diet: "carnivore",
    health: 6000, damage: 70, speed: 2.6, runSpeed: 7.5, attackRange: 5, attackCooldown: 1.6, aggroRange: 60,
    torpor: 99999, torporDrain: 0, radius: 2.2, height: 6.2, xp: 800,
    tameAffinity: 999999, eatInterval: 999, foods: [],
    harvest: [{ item: "element", amount: 20, tool: { hand: 1, pick: 1, hatchet: 1, other: 1 } }, { item: "raw_prime", amount: 25, tool: { hand: 0.4, pick: 1, hatchet: 0.4, other: 0.4 } }],
    spawn: {}, packSize: [1, 1],
    sounds: { idle: "roar", hurt: "roar", attack: "roar" },
    model: { form: "biped", bodyLen: 4.6, bodyH: 2.3, bodyW: 2.0, legLen: 3.4, legW: 0.48, neckLen: 1.1, neckRise: 0.55, headLen: 2.1, headH: 1.1, tailLen: 5.2, armLen: 0.6, color: "#2a1f2e", belly: "#6b4a6b", accent: "#ff3ac8", pattern: "stripes", teeth: true, snout: 0.5, neckThick: 1.6, eye: "#ff40ff", extras: ["browhorns", "crest"] },
    special: "Chefe invocado no Terminal de Tributo. Não pode ser domesticado.",
  },
  bronto: {
    id: "bronto", name: "Brontossauro", temperament: "docile", diet: "herbivore",
    health: 2400, damage: 48, speed: 1.6, runSpeed: 4.4, attackRange: 5.5, attackCooldown: 2.2, aggroRange: 0,
    torpor: 1600, torporDrain: 1.2, radius: 2.4, height: 7.6, xp: 150,
    tameAffinity: 1400, eatInterval: 8, foods: [{ item: "kibble_basic", affinity: 220, food: 120 }, { item: "mejoberry", affinity: 22, food: 18 }, { item: "amarberry", affinity: 14, food: 12 }],
    harvest: [...meatHide(90, 55), { item: "raw_prime", amount: 18, tool: { hand: 0.2, pick: 0.6, hatchet: 0.2, other: 0.2 } }],
    spawn: { grassland: 0.45, forest: 0.25, beach: 0.1 }, packSize: [1, 2],
    sounds: { idle: "horn", hurt: "bellow", attack: "rumble" },
    model: { form: "quad", bodyLen: 5.6, bodyH: 2.7, bodyW: 2.5, legLen: 2.7, legW: 0.58, frontLegMult: 0.92, neckLen: 6.2, neckRise: 0.55, headLen: 1.05, headH: 0.5, tailLen: 8.4, color: "#6e7462", belly: "#bdb89e", accent: "#4c5244", pattern: "bands", snout: 0.62, neckThick: 1.7, eye: "#8a6a3a", extras: ["sauropod", "heavy"] },
    rideable: true, seat: [0, 5.4, 0.4], stamina: 400, weight: 1400, eggTemp: [26, 36], matureSeconds: 2200,
    harvestRide: [{ item: "mejoberry", mult: 4 }, { item: "thatch", mult: 3 }, { item: "wood", mult: 2 }, { item: "fiber", mult: 2 }],
    aoe: true, special: "Dócil: ignora quase tudo, até predadores, mas revida com força se atacado. Varredura de cauda atinge tudo ao redor; carrega peso enorme.",
  },
  spino: {
    id: "spino", name: "Espinossauro", temperament: "territorial", diet: "carnivore",
    health: 780, damage: 42, speed: 2.4, runSpeed: 8.2, attackRange: 3.6, attackCooldown: 1.3, aggroRange: 26,
    torpor: 600, torporDrain: 1.6, radius: 1.3, height: 4.4, xp: 85,
    tameAffinity: 700, eatInterval: 6, foods: [{ item: "kibble_basic", affinity: 110, food: 70 }, { item: "fish_meat", affinity: 45, food: 30 }, { item: "raw_prime", affinity: 60, food: 40 }, ...carnFoods.slice(1)],
    harvest: [...meatHide(45, 28), { item: "raw_prime", amount: 8, tool: { hand: 0.2, pick: 0.6, hatchet: 0.2, other: 0.2 } }],
    spawn: { beach: 0.5, forest: 0.25 }, packSize: [1, 1], nightMult: 1.2,
    sounds: { idle: "rumble", hurt: "bellow", attack: "roar" },
    model: { form: "biped", bodyLen: 3.6, bodyH: 1.4, bodyW: 1.05, legLen: 2.0, legW: 0.3, neckLen: 1.15, neckRise: 0.5, headLen: 1.75, headH: 0.44, tailLen: 4.8, armLen: 1.25, color: "#56624e", belly: "#cdc2a0", accent: "#8a3322", pattern: "stripes", teeth: true, snout: 0.22, neckThick: 1.1, eye: "#e0b030", extras: ["sail", "crocsnout", "quadwalk"] },
    rideable: true, seat: [0, 3.6, -0.5], stamina: 280, weight: 450, eggTemp: [28, 38], matureSeconds: 1600, prime: 0.35,
    waterSpeed: 2.1, special: "Territorial: muito agressivo perto da água, mais calmo longe dela (desiste da perseguição). Nada ~2× mais rápido. Predadores menores o evitam.",
  },
  allo: {
    id: "allo", name: "Alossauro", temperament: "aggressive", diet: "carnivore",
    health: 620, damage: 34, speed: 2.5, runSpeed: 9.4, attackRange: 3.0, attackCooldown: 1.1, aggroRange: 28,
    torpor: 480, torporDrain: 1.1, radius: 1.1, height: 3.3, xp: 70,
    tameAffinity: 600, eatInterval: 6, foods: [{ item: "kibble_basic", affinity: 100, food: 65 }, { item: "raw_prime", affinity: 60, food: 40 }, ...carnFoods.slice(1)],
    harvest: [...meatHide(36, 24), { item: "raw_prime", amount: 5, tool: { hand: 0.2, pick: 0.6, hatchet: 0.2, other: 0.2 } }],
    spawn: { hills: 0.9, grassland: 0.35, forest: 0.25 }, packSize: [3, 3], nightMult: 1.3,
    sounds: { idle: "rumble", hurt: "roar", attack: "roar" },
    model: { form: "biped", bodyLen: 2.7, bodyH: 1.25, bodyW: 0.95, legLen: 1.95, legW: 0.26, neckLen: 0.75, neckRise: 0.62, headLen: 1.12, headH: 0.55, tailLen: 3.4, armLen: 0.62, color: "#8a6446", belly: "#dcc6a2", accent: "#5a2618", pattern: "stripes", teeth: true, snout: 0.4, neckThick: 1.3, eye: "#e8a020", extras: ["allocrest"] },
    rideable: true, seat: [0, 3.0, -0.2], stamina: 300, weight: 380, eggTemp: [28, 38], matureSeconds: 1500, prime: 0.3,
    packBonus: true, special: "Bando Alfa: vive em grupos de 3. Com o bando por perto, causa +50% de dano e recebe -25%. Mordidas serrilhadas causam sangramento.",
  },
  pachy: {
    id: "pachy", name: "Paquicefalossauro", temperament: "passive", diet: "herbivore",
    health: 260, damage: 14, speed: 2.0, runSpeed: 7.6, attackRange: 2.2, attackCooldown: 1.4, aggroRange: 0,
    torpor: 200, torporDrain: 0.6, radius: 0.7, height: 1.8, xp: 24, retaliates: true,
    tameAffinity: 280, eatInterval: 5, foods: herbFoods,
    harvest: [...meatHide(14, 10), { item: "keratin", amount: 6, tool: { hand: 0.2, pick: 1, hatchet: 0.4 } }],
    spawn: { grassland: 1.3, forest: 1.1, hills: 0.4 }, packSize: [1, 3],
    sounds: { idle: "grunt", hurt: "bellow", attack: "charge" },
    model: { form: "biped", bodyLen: 1.5, bodyH: 0.85, bodyW: 0.75, legLen: 1.1, legW: 0.16, neckLen: 0.5, neckRise: 0.35, headLen: 0.52, headH: 0.4, tailLen: 1.9, armLen: 0.32, color: "#6f5a40", belly: "#d6c8a8", accent: "#9a4a28", pattern: "spots", snout: 0.3, neckThick: 1.35, eye: "#9a7030", extras: ["dome", "beak"] },
    rideable: true, seat: [0, 1.7, -0.1], stamina: 220, weight: 200, eggTemp: [24, 34], matureSeconds: 800,
    attackTorpor: 28, special: "Passivo até ser atacado: então fica extremamente agressivo e persegue em alta velocidade. Cabeçada causa torpor; montado, desmaia criaturas.",
  },
  sarco: {
    id: "sarco", name: "Sarcosuchus", temperament: "ambush", diet: "carnivore",
    health: 520, damage: 30, speed: 1.0, runSpeed: 4.2, attackRange: 2.8, attackCooldown: 1.4, aggroRange: 22,
    torpor: 420, torporDrain: 0.9, radius: 1.0, height: 1.1, xp: 45,
    tameAffinity: 500, eatInterval: 6, foods: [{ item: "kibble_basic", affinity: 100, food: 60 }, { item: "fish_meat", affinity: 45, food: 30 }, ...carnFoods.slice(1)],
    harvest: [...meatHide(28, 22), { item: "chitin", amount: 6, tool: { hand: 0.2, pick: 0.8, hatchet: 0.5 } }],
    spawn: { beach: 0.8 }, packSize: [1, 1],
    sounds: { idle: "hiss", hurt: "bellow", attack: "snap" },
    model: { form: "quad", bodyLen: 3.0, bodyH: 0.62, bodyW: 1.05, legLen: 0.5, legW: 0.2, frontLegMult: 0.9, neckLen: 0.35, neckRise: 0.02, headLen: 1.6, headH: 0.34, tailLen: 3.6, color: "#4f5638", belly: "#b8ae82", accent: "#2e3322", pattern: "mottled", teeth: true, snout: 0.2, neckThick: 1.3, eye: "#c8b030", extras: ["crocsnout", "sprawl", "scutes"] },
    rideable: true, seat: [0, 1.25, -0.2], stamina: 220, weight: 350, eggTemp: [28, 36], matureSeconds: 1300,
    waterSpeed: 2.6, special: "Emboscador: espera imóvel perto da água e ataca quem se aproxima (9 m) ou entra na água. Lento em terra, veloz nadando. Desiste longe da água.",
  },
  galli: {
    id: "galli", name: "Gallimimus", temperament: "skittish", diet: "herbivore",
    health: 150, damage: 0, speed: 3.2, runSpeed: 13, attackRange: 1.5, attackCooldown: 2, aggroRange: 18,
    torpor: 100, torporDrain: 0.5, radius: 0.6, height: 2.2, xp: 15,
    tameAffinity: 220, eatInterval: 4, foods: herbFoods,
    harvest: meatHide(10, 7),
    spawn: { grassland: 1.1, beach: 0.3 }, packSize: [1, 2],
    sounds: { idle: "chirp", hurt: "squawk", attack: "peck" },
    model: { form: "biped", bodyLen: 1.2, bodyH: 0.62, bodyW: 0.5, legLen: 1.35, legW: 0.12, neckLen: 1.0, neckRise: 1.05, headLen: 0.38, headH: 0.16, tailLen: 1.9, armLen: 0.4, color: "#9a7f5a", belly: "#e2d6b8", accent: "#5a4a34", pattern: "stripes", snout: 0.2, neckThick: 0.8, eye: "#d8b040", extras: ["ostrich", "beak"] },
    rideable: true, seat: [0, 1.75, -0.1], stamina: 260, weight: 140, eggTemp: [26, 34], matureSeconds: 700,
    special: "Assustadiço: foge ao notar você e nunca anda devagar. Uma das criaturas mais rápidas da ilha — ótima montaria de viagem.",
  },
  theri: {
    id: "theri", name: "Therizinossauro", temperament: "aggressive", diet: "herbivore",
    health: 870, damage: 38, speed: 1.6, runSpeed: 6.4, attackRange: 3.8, attackCooldown: 1.4, aggroRange: 22,
    torpor: 700, torporDrain: 1.2, radius: 1.3, height: 4.2, xp: 90,
    tameAffinity: 800, eatInterval: 7, foods: herbFoods,
    harvest: [...meatHide(40, 30), { item: "keratin", amount: 12, tool: { hand: 0.2, pick: 1, hatchet: 0.4 } }],
    spawn: { forest: 0.35, hills: 0.3 }, packSize: [1, 1],
    sounds: { idle: "rumble", hurt: "bellow", attack: "roar" },
    model: { form: "biped", bodyLen: 2.4, bodyH: 1.6, bodyW: 1.3, legLen: 1.9, legW: 0.3, neckLen: 1.4, neckRise: 1.0, headLen: 0.55, headH: 0.3, tailLen: 1.7, armLen: 1.3, color: "#6d5c44", belly: "#c9b896", accent: "#3e2f22", pattern: "bands", snout: 0.25, neckThick: 1.1, eye: "#b0802a", extras: ["scythes", "feathers", "beak"] },
    rideable: true, seat: [0, 3.4, -0.3], stamina: 280, weight: 420, eggTemp: [26, 36], matureSeconds: 1600,
    harvestRide: [{ item: "fiber", mult: 3 }, { item: "mejoberry", mult: 3 }, { item: "wood", mult: 2 }, { item: "thatch", mult: 2 }],
    special: "Herbívoro agressivo: ataca à vista com garras-foice enormes. Montado, colhe fibra, frutas, madeira e palha com eficiência.",
  },
  iguanodon: {
    id: "iguanodon", name: "Iguanodonte", temperament: "defensive", diet: "herbivore",
    health: 380, damage: 22, speed: 2.0, runSpeed: 9.0, attackRange: 2.6, attackCooldown: 1.3, aggroRange: 0,
    torpor: 300, torporDrain: 0.8, radius: 1.0, height: 3.0, xp: 32,
    tameAffinity: 380, eatInterval: 5, foods: herbFoods,
    harvest: meatHide(22, 16),
    spawn: { grassland: 0.8, forest: 0.5 }, packSize: [1, 2],
    sounds: { idle: "horn", hurt: "bellow", attack: "grunt" },
    model: { form: "biped", bodyLen: 2.3, bodyH: 1.1, bodyW: 0.95, legLen: 1.55, legW: 0.24, neckLen: 0.8, neckRise: 0.7, headLen: 0.75, headH: 0.38, tailLen: 2.8, armLen: 1.1, color: "#6f7a52", belly: "#d2caa2", accent: "#3e4a2e", pattern: "bands", snout: 0.3, neckThick: 1.2, eye: "#a0782a", extras: ["thumbspike", "quadwalk", "beak"] },
    rideable: true, seat: [0, 2.3, -0.2], stamina: 240, weight: 300, eggTemp: [24, 34], matureSeconds: 1100,
    harvestRide: [{ item: "mejoberry", mult: 3 }, { item: "mejoberry_seed", mult: 1 }],
    special: "Defensivo: pacífico, mas revida quando atacado. Alterna entre andar em duas e quatro patas; esporões nos polegares. Montado, colhe frutas e sementes.",
  },
  compy: {
    id: "compy", name: "Compsognato", temperament: "curious", diet: "carnivore",
    health: 50, damage: 5, speed: 2.8, runSpeed: 9.5, attackRange: 1.1, attackCooldown: 0.7, aggroRange: 16,
    torpor: 40, torporDrain: 0.4, radius: 0.3, height: 0.55, xp: 6,
    tameAffinity: 80, eatInterval: 4, foods: carnFoods,
    harvest: meatHide(3, 2),
    spawn: { forest: 0.7, grassland: 0.35 }, packSize: [3, 4],
    sounds: { idle: "chitter", hurt: "shriek", attack: "snap" },
    model: { form: "biped", bodyLen: 0.42, bodyH: 0.24, bodyW: 0.2, legLen: 0.36, legW: 0.045, neckLen: 0.24, neckRise: 0.8, headLen: 0.2, headH: 0.1, tailLen: 0.65, armLen: 0.12, color: "#6a7a3a", belly: "#dcd4a0", accent: "#3a2a1a", pattern: "stripes", teeth: true, snout: 0.32, eye: "#e0a020", extras: ["crest"] },
    special: "Curioso: aproxima-se sem atacar, mas quando 2 ou mais estão juntos o bando fica hostil. Pequeno demais para montar.",
  },
  giga: {
    id: "giga", name: "Giganotossauro", temperament: "angry", diet: "carnivore",
    health: 2400, damage: 70, speed: 2.4, runSpeed: 8.6, attackRange: 4.4, attackCooldown: 1.5, aggroRange: 40,
    torpor: 1400, torporDrain: 2.2, radius: 1.7, height: 5.0, xp: 180,
    tameAffinity: 1600, eatInterval: 8, foods: [{ item: "kibble_basic", affinity: 200, food: 100 }, { item: "raw_prime", affinity: 90, food: 60 }, ...carnFoods.slice(1)],
    harvest: [...meatHide(80, 50), { item: "raw_prime", amount: 20, tool: { hand: 0.2, pick: 0.6, hatchet: 0.2, other: 0.2 } }, { item: "keratin", amount: 14, tool: { pick: 1, hatchet: 0.4 } }],
    spawn: { hills: 0.12, peak: 0.1 }, packSize: [1, 1],
    sounds: { idle: "rumble", hurt: "roar", attack: "roar" },
    model: { form: "biped", bodyLen: 4.0, bodyH: 1.9, bodyW: 1.5, legLen: 2.9, legW: 0.4, neckLen: 1.0, neckRise: 0.5, headLen: 1.95, headH: 0.8, tailLen: 5.0, armLen: 0.45, color: "#4a4a44", belly: "#b8ae94", accent: "#2a2622", pattern: "stripes", teeth: true, snout: 0.38, neckThick: 1.55, eye: "#e03a20", extras: ["browhorns", "dorsalspikes"] },
    rideable: true, seat: [0, 4.6, -0.3], stamina: 320, weight: 700, eggTemp: [32, 42], matureSeconds: 2400, prime: 0.5,
    rage: true, special: "Furioso: ataca tudo e todos. Ao receber dano acumula fúria: fica mais rápido e causa +40% de dano, atacando qualquer criatura por perto.",
  },
  bary: {
    id: "bary", name: "Barionix", temperament: "aggressive", diet: "carnivore",
    health: 460, damage: 26, speed: 2.3, runSpeed: 8.8, attackRange: 2.8, attackCooldown: 1.0, aggroRange: 22,
    torpor: 380, torporDrain: 1.0, radius: 0.95, height: 2.6, xp: 48,
    tameAffinity: 450, eatInterval: 5, foods: [{ item: "kibble_basic", affinity: 100, food: 60 }, { item: "fish_meat", affinity: 50, food: 30 }, ...carnFoods.slice(1)],
    harvest: [...meatHide(26, 18)],
    spawn: { beach: 0.45, forest: 0.15 }, packSize: [1, 1],
    sounds: { idle: "hiss", hurt: "bellow", attack: "snap" },
    model: { form: "biped", bodyLen: 2.4, bodyH: 1.0, bodyW: 0.85, legLen: 1.6, legW: 0.22, neckLen: 0.95, neckRise: 0.45, headLen: 1.3, headH: 0.36, tailLen: 3.0, armLen: 0.8, color: "#5a6a4a", belly: "#d6cca6", accent: "#2e3a2a", pattern: "bands", teeth: true, snout: 0.22, neckThick: 1.1, eye: "#e0b030", extras: ["crocsnout", "thumbspike", "crest"] },
    rideable: true, seat: [0, 2.4, -0.2], stamina: 260, weight: 320, eggTemp: [28, 36], matureSeconds: 1200,
    waterSpeed: 2.3, attackTorpor: 18, special: "Agressivo e semiaquático: nada muito rápido e seus golpes de cauda atordoam (torpor). Adora peixe.",
  },
  diplo: {
    id: "diplo", name: "Diplodoco", temperament: "passive", diet: "herbivore",
    health: 1400, damage: 0, speed: 1.4, runSpeed: 4.8, attackRange: 5, attackCooldown: 2.4, aggroRange: 0,
    torpor: 900, torporDrain: 1.0, radius: 1.7, height: 5.6, xp: 60,
    tameAffinity: 700, eatInterval: 7, foods: herbFoods,
    harvest: [...meatHide(60, 40)],
    spawn: { grassland: 0.35, beach: 0.1 }, packSize: [1, 2],
    sounds: { idle: "horn", hurt: "bellow", attack: "rumble" },
    model: { form: "quad", bodyLen: 3.6, bodyH: 1.8, bodyW: 1.6, legLen: 2.0, legW: 0.4, frontLegMult: 0.9, neckLen: 5.0, neckRise: 0.28, headLen: 0.7, headH: 0.32, tailLen: 8.0, color: "#7a7a60", belly: "#c8c2a2", accent: "#9a4a30", pattern: "stripes", snout: 0.5, neckThick: 1.2, eye: "#8a6a3a", extras: ["diplo", "dorsalspikes"] },
    rideable: true, seat: [0, 3.4, 0.2], stamina: 300, weight: 500, eggTemp: [26, 34], matureSeconds: 1600,
    special: "Passivo e ingênuo: não causa dano e foge quando continuam a atacá-lo. Pescoço e cauda em chicote enormes; carrega bastante peso.",
  },
  kentro: {
    id: "kentro", name: "Kentrossauro", temperament: "shorttempered", diet: "herbivore",
    health: 330, damage: 28, speed: 1.6, runSpeed: 5.6, attackRange: 3.0, attackCooldown: 1.5, aggroRange: 9,
    torpor: 220, torporDrain: 0.6, radius: 0.95, height: 1.8, xp: 30,
    tameAffinity: 320, eatInterval: 5, foods: herbFoods,
    harvest: [...meatHide(18, 12), { item: "keratin", amount: 8, tool: { hand: 0.2, pick: 1, hatchet: 0.4 } }],
    spawn: { forest: 0.55, grassland: 0.35, hills: 0.3 }, packSize: [2, 3],
    sounds: { idle: "grunt", hurt: "bellow", attack: "charge" },
    model: { form: "quad", bodyLen: 2.1, bodyH: 1.0, bodyW: 0.9, legLen: 0.95, legW: 0.22, frontLegMult: 0.72, neckLen: 0.55, neckRise: -0.15, headLen: 0.45, headH: 0.26, tailLen: 1.9, color: "#7a6a3a", belly: "#d0c49a", accent: "#b04a28", pattern: "mottled", snout: 0.3, eye: "#b07a2a", extras: ["kentro", "beak"] },
    reflect: 0.25,
    special: "Irritadiço: ataca quem ficar por perto por alguns segundos; em bando o alcance aumenta. Espinhos refletem 25% do dano corpo-a-corpo. Não pode ser montado.",
  },
  dimetro: {
    id: "dimetro", name: "Dimetrodonte", temperament: "aggressive", diet: "carnivore",
    health: 380, damage: 22, speed: 1.3, runSpeed: 4.8, attackRange: 2.4, attackCooldown: 1.3, aggroRange: 14,
    torpor: 320, torporDrain: 1.4, radius: 0.95, height: 1.8, xp: 36,
    tameAffinity: 380, eatInterval: 5, foods: [{ item: "kibble_basic", affinity: 100, food: 60 }, { item: "fish_meat", affinity: 30, food: 20 }, ...carnFoods.slice(1)],
    harvest: [...meatHide(18, 14)],
    spawn: { beach: 0.45, forest: 0.25 }, packSize: [1, 1],
    sounds: { idle: "hiss", hurt: "screech", attack: "snap" },
    model: { form: "quad", bodyLen: 2.1, bodyH: 0.62, bodyW: 0.8, legLen: 0.5, legW: 0.16, frontLegMult: 0.95, neckLen: 0.28, neckRise: 0.05, headLen: 0.62, headH: 0.36, tailLen: 1.9, color: "#5a4a3a", belly: "#c8b08a", accent: "#b85a2a", pattern: "bands", teeth: true, snout: 0.4, neckThick: 1.3, eye: "#e0a020", extras: ["sail", "sprawl"] },
    eggTemp: [26, 36], matureSeconds: 900, insulator: true,
    special: "Agressivo, lento em terra. Domesticado, sua vela regula a temperatura ao redor: ovos e sobreviventes próximos ficam na faixa ideal (~30°C). Perfeito para chocar ovos.",
  },
  ovi: {
    id: "ovi", name: "Oviraptor", temperament: "skittish", diet: "carnivore",
    health: 110, damage: 6, speed: 2.4, runSpeed: 10, attackRange: 1.3, attackCooldown: 0.9, aggroRange: 14,
    torpor: 90, torporDrain: 0.5, radius: 0.45, height: 1.2, xp: 12,
    tameAffinity: 160, eatInterval: 4, foods: [{ item: "kibble_basic", affinity: 90, food: 60 }, { item: "raw_meat", affinity: 22, food: 18 }, { item: "mejoberry", affinity: 12, food: 8 }],
    harvest: meatHide(6, 5),
    spawn: { grassland: 0.55, forest: 0.4, beach: 0.2 }, packSize: [1, 2],
    sounds: { idle: "chirp", hurt: "squawk", attack: "peck" },
    model: { form: "biped", bodyLen: 0.8, bodyH: 0.46, bodyW: 0.38, legLen: 0.75, legW: 0.075, neckLen: 0.42, neckRise: 0.95, headLen: 0.28, headH: 0.2, tailLen: 0.95, armLen: 0.32, color: "#3e5a6a", belly: "#e0d6c0", accent: "#e0762a", pattern: "stripes", snout: 0.3, eye: "#e8c040", extras: ["feathers", "casque", "beak"] },
    eggTemp: [24, 34], matureSeconds: 600, eggBoost: true,
    special: "Assustadiço: foge ao notar você. Domesticado, deixa os casais próximos (15 m) acasalarem e botarem ovos duas vezes mais rápido.",
  },
  troodon: {
    id: "troodon", name: "Troodonte", temperament: "aggressive", diet: "carnivore",
    health: 90, damage: 7, speed: 2.8, runSpeed: 10.5, attackRange: 1.4, attackCooldown: 0.8, aggroRange: 20,
    torpor: 80, torporDrain: 0.5, radius: 0.4, height: 1.0, xp: 16,
    tameAffinity: 180, eatInterval: 4, foods: carnFoods,
    harvest: meatHide(5, 4),
    spawn: { forest: 0.45, hills: 0.25 }, packSize: [2, 3], nightMult: 2.5,
    sounds: { idle: "chitter", hurt: "shriek", attack: "screech" },
    model: { form: "biped", bodyLen: 0.72, bodyH: 0.36, bodyW: 0.3, legLen: 0.72, legW: 0.07, neckLen: 0.36, neckRise: 0.75, headLen: 0.32, headH: 0.17, tailLen: 1.05, armLen: 0.3, color: "#4a4034", belly: "#bfae8a", accent: "#2a2420", pattern: "spots", teeth: true, snout: 0.3, eye: "#ffd23a", extras: ["feathers", "sickle", "bigeyes"] },
    eggTemp: [26, 36], matureSeconds: 700, nocturnal: true, attackTorpor: 9,
    special: "Noturno: quase inofensivo de dia, caça em bandos à noite. Olhos brilham no escuro e a mordida envenenada causa torpor.",
  },
  megalo: {
    id: "megalo", name: "Megalossauro", temperament: "aggressive", diet: "carnivore",
    health: 980, damage: 46, speed: 2.2, runSpeed: 8.0, attackRange: 3.6, attackCooldown: 1.4, aggroRange: 30,
    torpor: 800, torporDrain: 1.3, radius: 1.35, height: 3.9, xp: 95,
    tameAffinity: 850, eatInterval: 7, foods: [{ item: "kibble_basic", affinity: 150, food: 90 }, { item: "raw_prime", affinity: 70, food: 50 }, ...carnFoods.slice(1)],
    harvest: [...meatHide(55, 35), { item: "raw_prime", amount: 10, tool: { hand: 0.2, pick: 0.6, hatchet: 0.2, other: 0.2 } }],
    spawn: { forest: 0.2, hills: 0.18 }, packSize: [1, 1],
    sounds: { idle: "rumble", hurt: "roar", attack: "roar" },
    model: { form: "biped", bodyLen: 3.2, bodyH: 1.5, bodyW: 1.25, legLen: 2.3, legW: 0.33, neckLen: 0.85, neckRise: 0.55, headLen: 1.45, headH: 0.64, tailLen: 3.9, armLen: 0.6, color: "#3e3a30", belly: "#a8987a", accent: "#7a5a2e", pattern: "spots", teeth: true, snout: 0.42, neckThick: 1.45, eye: "#e8b030", extras: ["osteoderms", "crest"] },
    rideable: true, seat: [0, 3.6, -0.25], stamina: 300, weight: 480, eggTemp: [28, 38], matureSeconds: 1700, prime: 0.35,
    sleepsByDay: true, nocturnal: true,
    special: "Dorme durante o dia (não reage a menos que seja atacado) e caça ferozmente à noite. Ideal para domesticar dormindo — mas acorda com dano.",
  },
};

export const SPECIES_LIST = Object.values(SPECIES);

export function statAtLevel(base: number, level: number, perLevel: number) {
  return base * (1 + perLevel * (level - 1));
}
