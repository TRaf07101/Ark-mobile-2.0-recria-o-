// Item database. Every item in the game is declared here.
// New items only need a new entry; systems read these fields generically.

export type ItemCategory = "resource" | "food" | "consumable" | "tool" | "weapon" | "ammo" | "structure" | "deployable" | "armor" | "saddle";
export type ArmorSlot = "head" | "chest" | "legs" | "hands" | "feet";
export type ToolKind = "hand" | "pick" | "hatchet" | "spear" | "club" | "bow" | "slingshot" | "torch" | "sword" | "waterskin";

export interface ToolStats {
  kind: ToolKind;
  damage: number;
  torpor: number;
  range: number;
  cooldown: number; // seconds between swings
  durability: number;
  harvestPower: number; // multiplier to yields
  ammo?: string[];
  projectileSpeed?: number;
}

export interface ItemDef {
  id: string;
  name: string;
  desc: string;
  cat: ItemCategory;
  icon: string; // placeholder glyph (Part 1)
  color: string;
  weight: number;
  stack: number;
  spoil?: number; // seconds until one unit spoils
  spoilsTo?: string;
  food?: number;
  water?: number;
  health?: number;
  stamina?: number;
  torpor?: number; // positive = increases torpor
  tool?: ToolStats;
  structure?: string; // structure id placed by this item
  fuel?: number; // seconds of burn time
  cookTo?: string;
  cookTime?: number;
  ammoDamage?: number;
  ammoTorpor?: number;
  cookIn?: "campfire" | "forge";
  armor?: { slot: ArmorSlot; armor: number; cold: number; heat: number; durability: number };
  saddle?: { species: string; armor: number };
  seed?: string; // crop produced
}

const defs: ItemDef[] = [
  // ---------- resources ----------
  { id: "wood", name: "Madeira", desc: "Obtida de árvores. Machado rende mais.", cat: "resource", icon: "🪵", color: "#8a5a2b", weight: 0.5, stack: 100, fuel: 30 },
  { id: "thatch", name: "Palha", desc: "Obtida de árvores. Picareta e mãos rendem mais.", cat: "resource", icon: "🌾", color: "#c8a45a", weight: 0.4, stack: 200, fuel: 8 },
  { id: "stone", name: "Pedra", desc: "Coletada do chão ou de rochas com machado.", cat: "resource", icon: "🪨", color: "#8c8c8c", weight: 1, stack: 100 },
  { id: "flint", name: "Pederneira", desc: "Obtida de rochas com picareta.", cat: "resource", icon: "🔷", color: "#5d6f86", weight: 0.05, stack: 100 },
  { id: "fiber", name: "Fibra", desc: "Coletada de arbustos com as mãos.", cat: "resource", icon: "🧵", color: "#6c9a3c", weight: 0.01, stack: 300 },
  { id: "hide", name: "Couro", desc: "Obtido de carcaças. Machado rende mais.", cat: "resource", icon: "🟫", color: "#9b6b43", weight: 0.01, stack: 200 },
  { id: "keratin", name: "Queratina", desc: "Obtida de carcaças de Triceratops.", cat: "resource", icon: "🦴", color: "#d9cfa8", weight: 0.01, stack: 100 },
  { id: "metal", name: "Minério de Metal", desc: "Encontrado em rochas nas colinas. Derreta na Forja.", cat: "resource", icon: "⛏️", color: "#9aa3ad", weight: 1, stack: 100, cookTo: "metal_ingot", cookTime: 8, cookIn: "forge" },
  { id: "metal_ingot", name: "Lingote de Metal", desc: "Metal refinado para ferramentas e estruturas avançadas.", cat: "resource", icon: "🔩", color: "#c9d1d8", weight: 1, stack: 100 },
  { id: "sparkpowder", name: "Pólvora de Faísca", desc: "Pederneira e pedra moídas. Usada em forjas.", cat: "resource", icon: "✨", color: "#8a8a8a", weight: 0.1, stack: 100 },
  { id: "cementing_paste", name: "Pasta de Cimento", desc: "Liga estruturas de pedra.", cat: "resource", icon: "🧱", color: "#9a9282", weight: 0.1, stack: 100 },
  { id: "mejoberry_seed", name: "Semente de Mejoberry", desc: "Plante num canteiro para colher mejoberries.", cat: "resource", icon: "🌱", color: "#6a9a3a", weight: 0.05, stack: 100, seed: "mejoberry" },
  { id: "amarberry_seed", name: "Semente de Amarberry", desc: "Plante num canteiro para colher amarberries.", cat: "resource", icon: "🌱", color: "#b0a03a", weight: 0.05, stack: 100, seed: "amarberry" },
  { id: "narcoberry_seed", name: "Semente de Narcoberry", desc: "Plante num canteiro para colher narcoberries.", cat: "resource", icon: "🌱", color: "#3a3a4a", weight: 0.05, stack: 100, seed: "narcoberry" },
  { id: "spoiled_meat", name: "Carne Estragada", desc: "Usada em narcóticos. Não coma.", cat: "resource", icon: "🟩", color: "#6b7a3a", weight: 0.1, stack: 100, food: 2, health: -8 },
  // ---------- food ----------
  { id: "mejoberry", name: "Mejoberry", desc: "Fruta favorita de herbívoros.", cat: "food", icon: "🫐", color: "#6a4bd1", weight: 0.1, stack: 100, spoil: 300, spoilsTo: undefined, food: 6, water: 1 },
  { id: "amarberry", name: "Amarberry", desc: "Fruta comum.", cat: "food", icon: "🟡", color: "#e2b93b", weight: 0.1, stack: 100, spoil: 300, food: 4, water: 1 },
  { id: "narcoberry", name: "Narcoberry", desc: "Aumenta o torpor. Mantém criaturas desmaiadas.", cat: "consumable", icon: "⚫", color: "#2c2c3c", weight: 0.1, stack: 100, spoil: 400, food: 2, torpor: 8 },
  { id: "stimberry", name: "Stimberry", desc: "Reduz torpor, mas dá sede.", cat: "consumable", icon: "⚪", color: "#e8e8f0", weight: 0.1, stack: 100, spoil: 400, food: 2, water: -6, torpor: -10, stamina: 20 },
  { id: "raw_meat", name: "Carne Crua", desc: "Cozinhe na fogueira. Carnívoros adoram.", cat: "food", icon: "🥩", color: "#c0392b", weight: 0.1, stack: 40, spoil: 180, spoilsTo: "spoiled_meat", food: 10, health: -4, cookTo: "cooked_meat", cookTime: 12, cookIn: "campfire" },
  { id: "raw_prime", name: "Carne Nobre Crua", desc: "Carne de grandes criaturas. Doma carnívoros muito mais rápido.", cat: "food", icon: "🥩", color: "#e04a3a", weight: 0.1, stack: 20, spoil: 150, spoilsTo: "spoiled_meat", food: 20, health: -4, cookTo: "cooked_prime", cookTime: 16, cookIn: "campfire" },
  { id: "cooked_prime", name: "Carne Nobre Cozida", desc: "Restaura muita vida e comida.", cat: "food", icon: "🍖", color: "#9e5a2f", weight: 0.1, stack: 20, spoil: 500, spoilsTo: "spoiled_meat", food: 45, health: 30 },
  { id: "fish_meat", name: "Filé de Peixe", desc: "Carne crua do oceano.", cat: "food", icon: "🐟", color: "#e0a090", weight: 0.1, stack: 40, spoil: 160, spoilsTo: "spoiled_meat", food: 8, health: -2, cookTo: "cooked_meat", cookTime: 10, cookIn: "campfire" },
  { id: "cooked_meat", name: "Carne Cozida", desc: "Restaura muita fome e vida.", cat: "food", icon: "🍖", color: "#8e4a1f", weight: 0.1, stack: 40, spoil: 600, spoilsTo: "spoiled_meat", food: 28, health: 15 },
  // ---------- consumables ----------
  { id: "narcotic", name: "Narcótico", desc: "Aumenta muito o torpor. Não estraga.", cat: "consumable", icon: "💊", color: "#6b3fa0", weight: 0.1, stack: 100, torpor: 40, health: 5 },
  { id: "stimulant", name: "Estimulante", desc: "Reduz muito o torpor e restaura stamina.", cat: "consumable", icon: "🧪", color: "#2fa39a", weight: 0.1, stack: 100, torpor: -40, stamina: 60, water: -15 },
  { id: "kibble_basic", name: "Ração Básica", desc: "Doma criaturas muito mais rápido.", cat: "food", icon: "🍪", color: "#b08a50", weight: 0.1, stack: 50, food: 20 },
  // ---------- ammo ----------
  { id: "stone_arrow", name: "Flecha de Pedra", desc: "Munição para o arco.", cat: "ammo", icon: "➶", color: "#a0a0a0", weight: 0.05, stack: 100, ammoDamage: 22, ammoTorpor: 0 },
  { id: "tranq_arrow", name: "Flecha Tranquilizante", desc: "Causa grande torpor. Ideal para domar.", cat: "ammo", icon: "💉", color: "#7d4fb0", weight: 0.05, stack: 100, ammoDamage: 12, ammoTorpor: 55 },
  // ---------- tools & weapons ----------
  { id: "stone_pick", name: "Picareta de Pedra", desc: "Mais palha, pederneira e carne.", cat: "tool", icon: "⛏", color: "#9c7b52", weight: 1, stack: 1, tool: { kind: "pick", damage: 12, torpor: 0, range: 2.8, cooldown: 0.65, durability: 60, harvestPower: 1 } },
  { id: "stone_hatchet", name: "Machado de Pedra", desc: "Mais madeira, pedra e couro.", cat: "tool", icon: "🪓", color: "#9c7b52", weight: 1, stack: 1, tool: { kind: "hatchet", damage: 14, torpor: 0, range: 2.8, cooldown: 0.7, durability: 60, harvestPower: 1 } },
  { id: "spear", name: "Lança", desc: "Arma corpo-a-corpo de longo alcance.", cat: "weapon", icon: "🗡", color: "#b08a50", weight: 2, stack: 1, tool: { kind: "spear", damage: 26, torpor: 0, range: 3.6, cooldown: 0.8, durability: 40, harvestPower: 0.3 } },
  { id: "wooden_club", name: "Porrete de Madeira", desc: "Causa torpor. Use para desmaiar criaturas.", cat: "weapon", icon: "🏏", color: "#7a4f28", weight: 2, stack: 1, tool: { kind: "club", damage: 6, torpor: 22, range: 2.8, cooldown: 0.8, durability: 60, harvestPower: 0.2 } },
  { id: "slingshot", name: "Estilingue", desc: "Atira pedras. Causa torpor à distância.", cat: "weapon", icon: "🪃", color: "#7a4f28", weight: 1, stack: 1, tool: { kind: "slingshot", damage: 8, torpor: 18, range: 40, cooldown: 0.9, durability: 60, harvestPower: 0, ammo: ["stone"], projectileSpeed: 34 } },
  { id: "bow", name: "Arco", desc: "Dispara flechas. Use flechas tranquilizantes para domar.", cat: "weapon", icon: "🏹", color: "#7a4f28", weight: 1, stack: 1, tool: { kind: "bow", damage: 0, torpor: 0, range: 60, cooldown: 1.0, durability: 80, harvestPower: 0, ammo: ["stone_arrow", "tranq_arrow"], projectileSpeed: 48 } },
  { id: "metal_pick", name: "Picareta de Metal", desc: "Coleta muito mais metal, pederneira e carne.", cat: "tool", icon: "⛏", color: "#c9d1d8", weight: 2, stack: 1, tool: { kind: "pick", damage: 20, torpor: 0, range: 2.9, cooldown: 0.6, durability: 200, harvestPower: 2.2 } },
  { id: "metal_hatchet", name: "Machado de Metal", desc: "Coleta muito mais madeira, pedra e couro.", cat: "tool", icon: "🪓", color: "#c9d1d8", weight: 2, stack: 1, tool: { kind: "hatchet", damage: 22, torpor: 0, range: 2.9, cooldown: 0.65, durability: 200, harvestPower: 2.2 } },
  { id: "metal_sword", name: "Espada de Metal", desc: "Arma corpo-a-corpo poderosa.", cat: "weapon", icon: "🗡", color: "#c9d1d8", weight: 3, stack: 1, tool: { kind: "sword", damage: 48, torpor: 0, range: 3.0, cooldown: 0.6, durability: 160, harvestPower: 0.3 } },
  { id: "waterskin", name: "Cantil", desc: "Encha na água e beba quando precisar. Também rega canteiros.", cat: "tool", icon: "🥤", color: "#9b6b43", weight: 0.5, stack: 1, tool: { kind: "waterskin", damage: 0, torpor: 0, range: 2, cooldown: 0.5, durability: 100, harvestPower: 0 } },
  { id: "torch", name: "Tocha", desc: "Ilumina a noite.", cat: "tool", icon: "🔥", color: "#e67e22", weight: 0.5, stack: 1, tool: { kind: "torch", damage: 5, torpor: 0, range: 2.4, cooldown: 0.7, durability: 300, harvestPower: 0.2 } },
  // ---------- armor & saddles ----------
  { id: "cloth_head", name: "Chapéu de Pano", desc: "Armadura. Reduz dano e isola do frio/calor.", cat: "armor", icon: "🛡", color: "#b8a888", weight: 0.5, stack: 1, armor: { slot: "head", armor: 2.4, cold: 4.8, heat: 3.6, durability: 60 } },
  { id: "cloth_chest", name: "Camisa de Pano", desc: "Armadura. Reduz dano e isola do frio/calor.", cat: "armor", icon: "🛡", color: "#b8a888", weight: 1.0, stack: 1, armor: { slot: "chest", armor: 5.6, cold: 11.2, heat: 8.4, durability: 60 } },
  { id: "cloth_legs", name: "Calças de Pano", desc: "Armadura. Reduz dano e isola do frio/calor.", cat: "armor", icon: "🛡", color: "#b8a888", weight: 1.0, stack: 1, armor: { slot: "legs", armor: 4.4, cold: 8.8, heat: 6.6, durability: 60 } },
  { id: "cloth_hands", name: "Luvas de Pano", desc: "Armadura. Reduz dano e isola do frio/calor.", cat: "armor", icon: "🛡", color: "#b8a888", weight: 0.2, stack: 1, armor: { slot: "hands", armor: 2.0, cold: 4.0, heat: 3.0, durability: 60 } },
  { id: "cloth_feet", name: "Botas de Pano", desc: "Armadura. Reduz dano e isola do frio/calor.", cat: "armor", icon: "🛡", color: "#b8a888", weight: 0.5, stack: 1, armor: { slot: "feet", armor: 2.4, cold: 4.8, heat: 3.6, durability: 60 } },
  { id: "hide_head", name: "Capacete de Couro", desc: "Armadura. Reduz dano e isola do frio/calor.", cat: "armor", icon: "🛡", color: "#8a6040", weight: 1.0, stack: 1, armor: { slot: "head", armor: 7.2, cold: 8.4, heat: 2.4, durability: 90 } },
  { id: "hide_chest", name: "Peitoral de Couro", desc: "Armadura. Reduz dano e isola do frio/calor.", cat: "armor", icon: "🛡", color: "#8a6040", weight: 2.0, stack: 1, armor: { slot: "chest", armor: 16.8, cold: 19.6, heat: 5.6, durability: 90 } },
  { id: "hide_legs", name: "Calças de Couro", desc: "Armadura. Reduz dano e isola do frio/calor.", cat: "armor", icon: "🛡", color: "#8a6040", weight: 2.0, stack: 1, armor: { slot: "legs", armor: 13.2, cold: 15.4, heat: 4.4, durability: 90 } },
  { id: "hide_hands", name: "Luvas de Couro", desc: "Armadura. Reduz dano e isola do frio/calor.", cat: "armor", icon: "🛡", color: "#8a6040", weight: 0.5, stack: 1, armor: { slot: "hands", armor: 6.0, cold: 7.0, heat: 2.0, durability: 90 } },
  { id: "hide_feet", name: "Botas de Couro", desc: "Armadura. Reduz dano e isola do frio/calor.", cat: "armor", icon: "🛡", color: "#8a6040", weight: 1.0, stack: 1, armor: { slot: "feet", armor: 7.2, cold: 8.4, heat: 2.4, durability: 90 } },
  { id: "chitin_head", name: "Capacete de Quitina", desc: "Armadura. Reduz dano e isola do frio/calor.", cat: "armor", icon: "🛡", color: "#4a5a48", weight: 1.5, stack: 1, armor: { slot: "head", armor: 15.6, cold: 2.4, heat: 2.4, durability: 140 } },
  { id: "chitin_chest", name: "Peitoral de Quitina", desc: "Armadura. Reduz dano e isola do frio/calor.", cat: "armor", icon: "🛡", color: "#4a5a48", weight: 3.0, stack: 1, armor: { slot: "chest", armor: 36.4, cold: 5.6, heat: 5.6, durability: 140 } },
  { id: "chitin_legs", name: "Calças de Quitina", desc: "Armadura. Reduz dano e isola do frio/calor.", cat: "armor", icon: "🛡", color: "#4a5a48", weight: 3.0, stack: 1, armor: { slot: "legs", armor: 28.6, cold: 4.4, heat: 4.4, durability: 140 } },
  { id: "chitin_hands", name: "Luvas de Quitina", desc: "Armadura. Reduz dano e isola do frio/calor.", cat: "armor", icon: "🛡", color: "#4a5a48", weight: 0.8, stack: 1, armor: { slot: "hands", armor: 13.0, cold: 2.0, heat: 2.0, durability: 140 } },
  { id: "chitin_feet", name: "Botas de Quitina", desc: "Armadura. Reduz dano e isola do frio/calor.", cat: "armor", icon: "🛡", color: "#4a5a48", weight: 1.5, stack: 1, armor: { slot: "feet", armor: 15.6, cold: 2.4, heat: 2.4, durability: 140 } },
  { id: "metal_head", name: "Capacete de Metal", desc: "Armadura. Reduz dano e isola do frio/calor.", cat: "armor", icon: "🛡", color: "#9aa3ad", weight: 2.0, stack: 1, armor: { slot: "head", armor: 30.0, cold: 1.2, heat: 0.6, durability: 260 } },
  { id: "metal_chest", name: "Peitoral de Metal", desc: "Armadura. Reduz dano e isola do frio/calor.", cat: "armor", icon: "🛡", color: "#9aa3ad", weight: 4.0, stack: 1, armor: { slot: "chest", armor: 70.0, cold: 2.8, heat: 1.4, durability: 260 } },
  { id: "metal_legs", name: "Calças de Metal", desc: "Armadura. Reduz dano e isola do frio/calor.", cat: "armor", icon: "🛡", color: "#9aa3ad", weight: 4.0, stack: 1, armor: { slot: "legs", armor: 55.0, cold: 2.2, heat: 1.1, durability: 260 } },
  { id: "metal_hands", name: "Luvas de Metal", desc: "Armadura. Reduz dano e isola do frio/calor.", cat: "armor", icon: "🛡", color: "#9aa3ad", weight: 1.0, stack: 1, armor: { slot: "hands", armor: 25.0, cold: 1.0, heat: 0.5, durability: 260 } },
  { id: "metal_feet", name: "Botas de Metal", desc: "Armadura. Reduz dano e isola do frio/calor.", cat: "armor", icon: "🛡", color: "#9aa3ad", weight: 2.0, stack: 1, armor: { slot: "feet", armor: 30.0, cold: 1.2, heat: 0.6, durability: 260 } },
  { id: "parasaur_saddle", name: "Sela de Parassaurolofo", desc: "Coloque no inventário da criatura domesticada para montá-la.", cat: "saddle", icon: "🐎", color: "#7a4f28", weight: 5, stack: 1, saddle: { species: "parasaur", armor: 10 } },
  { id: "trike_saddle", name: "Sela de Triceratops", desc: "Coloque no inventário da criatura domesticada para montá-la.", cat: "saddle", icon: "🐎", color: "#7a4f28", weight: 5, stack: 1, saddle: { species: "trike", armor: 18 } },
  { id: "raptor_saddle", name: "Sela de Raptor", desc: "Coloque no inventário da criatura domesticada para montá-la.", cat: "saddle", icon: "🐎", color: "#7a4f28", weight: 5, stack: 1, saddle: { species: "raptor", armor: 12 } },
  { id: "stego_saddle", name: "Sela de Estegossauro", desc: "Coloque no inventário da criatura domesticada para montá-la.", cat: "saddle", icon: "🐎", color: "#7a4f28", weight: 5, stack: 1, saddle: { species: "stego", armor: 22 } },
  { id: "carno_saddle", name: "Sela de Carnotauro", desc: "Coloque no inventário da criatura domesticada para montá-la.", cat: "saddle", icon: "🐎", color: "#7a4f28", weight: 5, stack: 1, saddle: { species: "carno", armor: 20 } },
  { id: "ankylo_saddle", name: "Sela de Anquilossauro", desc: "Coloque no inventário da criatura domesticada para montá-la.", cat: "saddle", icon: "🐎", color: "#7a4f28", weight: 5, stack: 1, saddle: { species: "ankylo", armor: 30 } },
  { id: "ptera_saddle", name: "Sela de Pteranodonte", desc: "Coloque no inventário da criatura domesticada para montá-la.", cat: "saddle", icon: "🐎", color: "#7a4f28", weight: 5, stack: 1, saddle: { species: "ptera", armor: 8 } },
  { id: "argent_saddle", name: "Sela de Argentavis", desc: "Coloque no inventário da criatura domesticada para montá-la.", cat: "saddle", icon: "🐎", color: "#7a4f28", weight: 6, stack: 1, saddle: { species: "argent", armor: 14 } },
  { id: "rex_saddle", name: "Sela de Rex", desc: "Coloque no inventário da criatura domesticada para montá-la.", cat: "saddle", icon: "🐎", color: "#7a4f28", weight: 5, stack: 1, saddle: { species: "rex", armor: 35 } },
  { id: "pachy_saddle", name: "Sela de Paquicefalossauro", desc: "Coloque no inventário da criatura domesticada para montá-la.", cat: "saddle", icon: "🐎", color: "#7a4f28", weight: 5, stack: 1, saddle: { species: "pachy", armor: 14 } },
  { id: "allo_saddle", name: "Sela de Alossauro", desc: "Coloque no inventário da criatura domesticada para montá-la.", cat: "saddle", icon: "🐎", color: "#7a4f28", weight: 6, stack: 1, saddle: { species: "allo", armor: 24 } },
  { id: "spino_saddle", name: "Sela de Espinossauro", desc: "Coloque no inventário da criatura domesticada para montá-la.", cat: "saddle", icon: "🐎", color: "#7a4f28", weight: 7, stack: 1, saddle: { species: "spino", armor: 28 } },
  { id: "bronto_saddle", name: "Sela de Brontossauro", desc: "Plataforma de sela para o gigante de pescoço longo.", cat: "saddle", icon: "🐎", color: "#7a4f28", weight: 12, stack: 1, saddle: { species: "bronto", armor: 40 } },
  { id: "artifact_hunter", name: "Artefato do Caçador", desc: "Relíquia encontrada em ruínas. Oferecida como tributo no Obelisco Vermelho.", cat: "resource", icon: "🔺", color: "#ff4a3a", weight: 0.5, stack: 5 },
  { id: "artifact_clever", name: "Artefato do Astuto", desc: "Relíquia encontrada em ruínas. Oferecida como tributo no Obelisco Verde.", cat: "resource", icon: "🟢", color: "#3aff7a", weight: 0.5, stack: 5 },
  { id: "artifact_massive", name: "Artefato do Colosso", desc: "Relíquia encontrada em ruínas. Oferecida como tributo no Obelisco Azul.", cat: "resource", icon: "🔷", color: "#3ab0ff", weight: 0.5, stack: 5 },
  { id: "element", name: "Elemento", desc: "Matéria energética dos guardiões. Usada no Replicador dos obeliscos.", cat: "resource", icon: "💠", color: "#ff5ad8", weight: 0.1, stack: 100 },
  { id: "guardian_trophy", name: "Troféu de Guardião", desc: "Prova de que você derrotou um guardião do obelisco.", cat: "resource", icon: "🏆", color: "#ffc24a", weight: 2, stack: 10 },
  { id: "galli_saddle", name: "Sela de Gallimimus", desc: "Coloque no inventário da criatura domesticada para montá-la.", cat: "saddle", icon: "🐎", color: "#7a4f28", weight: 4, stack: 1, saddle: { species: "galli", armor: 8 } },
  { id: "doedicurus_saddle", name: "Sela de Doedicurus", desc: "Coloque no inventário da criatura domesticada para montá-la.", cat: "saddle", icon: "🐎", color: "#7a4f28", weight: 6, stack: 1, saddle: { species: "doedicurus", armor: 24 } },
  { id: "iguanodon_saddle", name: "Sela de Iguanodonte", desc: "Coloque no inventário da criatura domesticada para montá-la.", cat: "saddle", icon: "🐎", color: "#7a4f28", weight: 5, stack: 1, saddle: { species: "iguanodon", armor: 16 } },
  { id: "sarco_saddle", name: "Sela de Sarcosuchus", desc: "Coloque no inventário da criatura domesticada para montá-la.", cat: "saddle", icon: "🐎", color: "#7a4f28", weight: 6, stack: 1, saddle: { species: "sarco", armor: 20 } },
  { id: "theri_saddle", name: "Sela de Therizinossauro", desc: "Coloque no inventário da criatura domesticada para montá-la.", cat: "saddle", icon: "🐎", color: "#7a4f28", weight: 8, stack: 1, saddle: { species: "theri", armor: 26 } },
  { id: "bary_saddle", name: "Sela de Barionix", desc: "Coloque no inventário da criatura domesticada para montá-la.", cat: "saddle", icon: "🐎", color: "#7a4f28", weight: 6, stack: 1, saddle: { species: "bary", armor: 20 } },
  { id: "diplo_saddle", name: "Sela de Diplodoco", desc: "Plataforma de sela para o Diplodoco.", cat: "saddle", icon: "🐎", color: "#7a4f28", weight: 9, stack: 1, saddle: { species: "diplo", armor: 24 } },
  { id: "giga_saddle", name: "Sela de Giganotossauro", desc: "Sela para o maior predador da ilha.", cat: "saddle", icon: "🐎", color: "#7a4f28", weight: 14, stack: 1, saddle: { species: "giga", armor: 40 } },
  { id: "megalo_saddle", name: "Sela de Megalossauro", desc: "Coloque no inventário da criatura domesticada para montá-la.", cat: "saddle", icon: "🐎", color: "#7a4f28", weight: 10, stack: 1, saddle: { species: "megalo", armor: 32 } },
  { id: "chitin", name: "Quitina", desc: "Carapaça dura. Obtida de carcaças de Anquilossauro e Megalodonte.", cat: "resource", icon: "🪨", color: "#4a5a48", weight: 0.1, stack: 100 },
  // ---------- structures / deployables ----------
  { id: "campfire", name: "Fogueira", desc: "Cozinha carne. Use madeira ou palha como combustível.", cat: "deployable", icon: "🔥", color: "#d35400", weight: 4, stack: 5, structure: "campfire" },
  { id: "standing_torch", name: "Tocha de Pé", desc: "Ilumina a base. Queima madeira ou palha.", cat: "deployable", icon: "🕯", color: "#6b4a2b", weight: 3, stack: 10, structure: "standing_torch" },
  { id: "storage_box", name: "Baú Pequeno", desc: "Guarda itens com segurança.", cat: "deployable", icon: "📦", color: "#8a5a2b", weight: 4, stack: 5, structure: "storage_box" },
  { id: "sleeping_bag", name: "Saco de Dormir", desc: "Ponto de renascimento.", cat: "deployable", icon: "🛏", color: "#3b6ea5", weight: 3, stack: 5, structure: "sleeping_bag" },
  { id: "mortar_pestle", name: "Pilão", desc: "Estação para narcóticos e rações.", cat: "deployable", icon: "🥣", color: "#7f7f7f", weight: 4, stack: 5, structure: "mortar_pestle" },
  { id: "thatch_foundation", name: "Fundação de Palha", desc: "Base para construções.", cat: "structure", icon: "▭", color: "#c8a45a", weight: 4, stack: 50, structure: "thatch_foundation" },
  { id: "thatch_wall", name: "Parede de Palha", desc: "Encaixa nas bordas de fundações.", cat: "structure", icon: "▯", color: "#c8a45a", weight: 3, stack: 50, structure: "thatch_wall" },
  { id: "thatch_doorframe", name: "Batente de Palha", desc: "Parede com vão para porta.", cat: "structure", icon: "⛩", color: "#c8a45a", weight: 3, stack: 50, structure: "thatch_doorframe" },
  { id: "thatch_door", name: "Porta de Palha", desc: "Encaixa em batentes.", cat: "structure", icon: "🚪", color: "#c8a45a", weight: 2, stack: 50, structure: "thatch_door" },
  { id: "thatch_roof", name: "Teto de Palha", desc: "Encaixa sobre paredes.", cat: "structure", icon: "▰", color: "#c8a45a", weight: 3, stack: 50, structure: "thatch_roof" },
  { id: "forge", name: "Forja", desc: "Derrete minério de metal em lingotes. Queima madeira.", cat: "deployable", icon: "🔥", color: "#6d6a66", weight: 20, stack: 2, structure: "forge" },
  { id: "smithy", name: "Ferraria", desc: "Estação para ferramentas de metal, armaduras e selas.", cat: "deployable", icon: "⚒", color: "#6e4524", weight: 20, stack: 2, structure: "smithy" },
  { id: "crop_plot", name: "Canteiro", desc: "Plante sementes. Precisa de água (chuva ou cantil).", cat: "deployable", icon: "🪴", color: "#6b4a2b", weight: 8, stack: 10, structure: "crop_plot" },
  { id: "stone_foundation", name: "Fundação de Pedra", desc: "Base muito resistente.", cat: "structure", icon: "▭", color: "#8a857e", weight: 8, stack: 50, structure: "stone_foundation" },
  { id: "stone_wall", name: "Parede de Pedra", desc: "Resiste a quase todos os predadores.", cat: "structure", icon: "▯", color: "#8a857e", weight: 7, stack: 50, structure: "stone_wall" },
  { id: "stone_doorframe", name: "Batente de Pedra", desc: "Parede de pedra com vão.", cat: "structure", icon: "⛩", color: "#8a857e", weight: 7, stack: 50, structure: "stone_doorframe" },
  { id: "stone_roof", name: "Teto de Pedra", desc: "Teto resistente.", cat: "structure", icon: "▰", color: "#8a857e", weight: 7, stack: 50, structure: "stone_roof" },
  { id: "wood_foundation", name: "Fundação de Madeira", desc: "Base resistente.", cat: "structure", icon: "▭", color: "#8a5a2b", weight: 6, stack: 50, structure: "wood_foundation" },
  { id: "wood_wall", name: "Parede de Madeira", desc: "Parede resistente.", cat: "structure", icon: "▯", color: "#8a5a2b", weight: 5, stack: 50, structure: "wood_wall" },
  { id: "wood_doorframe", name: "Batente de Madeira", desc: "Parede com vão para porta.", cat: "structure", icon: "⛩", color: "#8a5a2b", weight: 5, stack: 50, structure: "wood_doorframe" },
  { id: "wood_door", name: "Porta de Madeira", desc: "Porta resistente.", cat: "structure", icon: "🚪", color: "#8a5a2b", weight: 4, stack: 50, structure: "wood_door" },
  { id: "wood_roof", name: "Teto de Madeira", desc: "Teto resistente. Pode ser usado como piso superior.", cat: "structure", icon: "▰", color: "#8a5a2b", weight: 5, stack: 50, structure: "wood_roof" },
];

export const ITEMS: Record<string, ItemDef> = {};
for (const d of defs) ITEMS[d.id] = d;

export function item(id: string): ItemDef {
  const d = ITEMS[id];
  if (!d) throw new Error(`Unknown item: ${id}`);
  return d;
}

export const CAT_LABEL: Record<ItemCategory, string> = {
  resource: "Recurso",
  food: "Comida",
  consumable: "Consumível",
  tool: "Ferramenta",
  weapon: "Arma",
  ammo: "Munição",
  structure: "Estrutura",
  deployable: "Utilitário",
  armor: "Armadura",
  saddle: "Sela",
};
