// Engrams = craftable blueprints unlocked with engram points after meeting a level requirement.
export type Station = "inventory" | "mortar_pestle" | "smithy" | "replicator";

export interface Engram {
  id: string; // item id produced
  level: number;
  cost: number; // engram points
  station: Station;
  time: number; // seconds per craft
  qty: number; // items produced per craft
  inputs: [string, number][];
  xp: number;
  autoLearned?: boolean;
  key?: string; // unique key when the same item has several recipes (replicator variants)
}

export const ENGRAMS: Engram[] = [
  { id: "stone_pick", level: 1, cost: 0, station: "inventory", time: 2, qty: 1, inputs: [["stone", 1], ["wood", 1], ["thatch", 10]], xp: 4, autoLearned: true },
  { id: "torch", level: 2, cost: 0, station: "inventory", time: 2, qty: 1, inputs: [["flint", 1], ["wood", 1], ["stone", 1]], xp: 3, autoLearned: true },
  { id: "stone_hatchet", level: 2, cost: 3, station: "inventory", time: 2, qty: 1, inputs: [["flint", 1], ["wood", 1], ["thatch", 10]], xp: 4 },
  { id: "spear", level: 2, cost: 3, station: "inventory", time: 3, qty: 1, inputs: [["wood", 8], ["flint", 2], ["fiber", 12]], xp: 6 },
  { id: "campfire", level: 2, cost: 3, station: "inventory", time: 3, qty: 1, inputs: [["thatch", 12], ["flint", 1], ["stone", 16], ["wood", 2]], xp: 6 },
  { id: "thatch_foundation", level: 3, cost: 4, station: "inventory", time: 1.5, qty: 1, inputs: [["wood", 6], ["thatch", 4], ["fiber", 3]], xp: 3 },
  { id: "thatch_wall", level: 3, cost: 3, station: "inventory", time: 1.5, qty: 1, inputs: [["wood", 2], ["thatch", 7], ["fiber", 4]], xp: 3 },
  { id: "thatch_roof", level: 3, cost: 3, station: "inventory", time: 1.5, qty: 1, inputs: [["wood", 3], ["thatch", 4], ["fiber", 4]], xp: 3 },
  { id: "thatch_doorframe", level: 4, cost: 3, station: "inventory", time: 1.5, qty: 1, inputs: [["wood", 2], ["thatch", 6], ["fiber", 3]], xp: 3 },
  { id: "thatch_door", level: 4, cost: 3, station: "inventory", time: 1.5, qty: 1, inputs: [["wood", 2], ["thatch", 7], ["fiber", 4]], xp: 3 },
  { id: "wooden_club", level: 3, cost: 3, station: "inventory", time: 2, qty: 1, inputs: [["wood", 4], ["fiber", 15]], xp: 4 },
  { id: "sleeping_bag", level: 4, cost: 4, station: "inventory", time: 3, qty: 1, inputs: [["hide", 15], ["thatch", 12], ["fiber", 25]], xp: 6 },
  { id: "standing_torch", level: 4, cost: 3, station: "inventory", time: 2, qty: 1, inputs: [["wood", 6], ["flint", 2], ["fiber", 6], ["hide", 2]], xp: 4 },
  { id: "storage_box", level: 5, cost: 6, station: "inventory", time: 4, qty: 1, inputs: [["wood", 25], ["thatch", 20], ["fiber", 10]], xp: 8 },
  { id: "mortar_pestle", level: 5, cost: 6, station: "inventory", time: 4, qty: 1, inputs: [["stone", 65], ["hide", 15]], xp: 8 },
  { id: "slingshot", level: 5, cost: 6, station: "inventory", time: 3, qty: 1, inputs: [["hide", 1], ["fiber", 20], ["wood", 5]], xp: 6 },
  { id: "narcotic", level: 6, cost: 6, station: "mortar_pestle", time: 2, qty: 1, inputs: [["narcoberry", 5], ["spoiled_meat", 1]], xp: 3 },
  { id: "stimulant", level: 7, cost: 5, station: "mortar_pestle", time: 2, qty: 1, inputs: [["stimberry", 5], ["amarberry", 2]], xp: 3 },
  { id: "kibble_basic", level: 8, cost: 8, station: "mortar_pestle", time: 3, qty: 1, inputs: [["cooked_meat", 1], ["mejoberry", 10], ["fiber", 5]], xp: 4 },
  { id: "bow", level: 10, cost: 12, station: "inventory", time: 4, qty: 1, inputs: [["wood", 15], ["fiber", 50]], xp: 10 },
  { id: "stone_arrow", level: 10, cost: 6, station: "inventory", time: 0.5, qty: 2, inputs: [["thatch", 2], ["flint", 1], ["fiber", 2]], xp: 1 },
  { id: "tranq_arrow", level: 12, cost: 10, station: "mortar_pestle", time: 1, qty: 1, inputs: [["stone_arrow", 1], ["narcotic", 1]], xp: 2 },
  { id: "wood_foundation", level: 12, cost: 12, station: "inventory", time: 2.5, qty: 1, inputs: [["wood", 40], ["thatch", 15], ["fiber", 8]], xp: 5 },
  { id: "wood_wall", level: 12, cost: 8, station: "inventory", time: 2.5, qty: 1, inputs: [["wood", 20], ["thatch", 7], ["fiber", 5]], xp: 5 },
  { id: "wood_roof", level: 13, cost: 8, station: "inventory", time: 2.5, qty: 1, inputs: [["wood", 20], ["thatch", 7], ["fiber", 5]], xp: 5 },
  { id: "wood_doorframe", level: 13, cost: 8, station: "inventory", time: 2.5, qty: 1, inputs: [["wood", 15], ["thatch", 6], ["fiber", 4]], xp: 5 },
  { id: "wood_door", level: 13, cost: 8, station: "inventory", time: 2.5, qty: 1, inputs: [["wood", 15], ["thatch", 6], ["fiber", 4]], xp: 5 },
  { id: "waterskin", level: 3, cost: 4, station: "inventory", time: 2, qty: 1, inputs: [["hide", 4], ["fiber", 12]], xp: 4 },
  { id: "cloth_head", level: 3, cost: 3, station: "inventory", time: 2, qty: 1, inputs: [["fiber", 10]], xp: 3 },
  { id: "cloth_chest", level: 3, cost: 3, station: "inventory", time: 2, qty: 1, inputs: [["fiber", 40]], xp: 3 },
  { id: "cloth_legs", level: 3, cost: 3, station: "inventory", time: 2, qty: 1, inputs: [["fiber", 50]], xp: 3 },
  { id: "cloth_hands", level: 3, cost: 3, station: "inventory", time: 2, qty: 1, inputs: [["fiber", 10]], xp: 3 },
  { id: "cloth_feet", level: 3, cost: 3, station: "inventory", time: 2, qty: 1, inputs: [["fiber", 20], ["hide", 2]], xp: 3 },
  { id: "hide_head", level: 9, cost: 5, station: "inventory", time: 3, qty: 1, inputs: [["hide", 15], ["fiber", 6]], xp: 5 },
  { id: "hide_chest", level: 9, cost: 5, station: "inventory", time: 3, qty: 1, inputs: [["hide", 40], ["fiber", 12]], xp: 5 },
  { id: "hide_legs", level: 9, cost: 5, station: "inventory", time: 3, qty: 1, inputs: [["hide", 30], ["fiber", 10]], xp: 5 },
  { id: "hide_hands", level: 9, cost: 5, station: "inventory", time: 3, qty: 1, inputs: [["hide", 10], ["fiber", 6]], xp: 5 },
  { id: "hide_feet", level: 9, cost: 5, station: "inventory", time: 3, qty: 1, inputs: [["hide", 12], ["fiber", 8]], xp: 5 },
  { id: "parasaur_saddle", level: 6, cost: 8, station: "inventory", time: 5, qty: 1, inputs: [["hide", 25], ["fiber", 30], ["wood", 5]], xp: 10 },
  { id: "pachy_saddle", level: 9, cost: 8, station: "inventory", time: 5, qty: 1, inputs: [["hide", 30], ["fiber", 30], ["wood", 5]], xp: 10 },
  { id: "galli_saddle", level: 10, cost: 8, station: "inventory", time: 5, qty: 1, inputs: [["hide", 30], ["fiber", 25], ["wood", 5]], xp: 10 },
  { id: "iguanodon_saddle", level: 13, cost: 10, station: "inventory", time: 5, qty: 1, inputs: [["hide", 45], ["fiber", 35], ["wood", 10]], xp: 12 },
  { id: "sarco_saddle", level: 20, cost: 12, station: "inventory", time: 6, qty: 1, inputs: [["hide", 70], ["fiber", 45], ["chitin", 6]], xp: 16 },
  { id: "doedicurus_saddle", level: 19, cost: 12, station: "inventory", time: 6, qty: 1, inputs: [["hide", 55], ["fiber", 45], ["chitin", 8]], xp: 16 },
  { id: "raptor_saddle", level: 11, cost: 10, station: "inventory", time: 5, qty: 1, inputs: [["hide", 35], ["fiber", 30]], xp: 12 },
  { id: "trike_saddle", level: 14, cost: 12, station: "inventory", time: 6, qty: 1, inputs: [["hide", 50], ["fiber", 50], ["wood", 15]], xp: 14 },
  { id: "ptera_saddle", level: 16, cost: 14, station: "inventory", time: 6, qty: 1, inputs: [["hide", 60], ["fiber", 40], ["wood", 10]], xp: 16 },
  { id: "argent_saddle", level: 26, cost: 22, station: "inventory", time: 8, qty: 1, inputs: [["hide", 90], ["fiber", 60], ["wood", 15], ["metal_ingot", 8]], xp: 24 },
  { id: "stego_saddle", level: 18, cost: 14, station: "inventory", time: 6, qty: 1, inputs: [["hide", 70], ["fiber", 60], ["wood", 20]], xp: 16 },
  { id: "sparkpowder", level: 14, cost: 6, station: "mortar_pestle", time: 1, qty: 2, inputs: [["flint", 2], ["stone", 1]], xp: 1 },
  { id: "cementing_paste", level: 18, cost: 8, station: "mortar_pestle", time: 1.5, qty: 1, inputs: [["chitin", 4], ["stone", 8]], xp: 2 },
  { id: "crop_plot", level: 15, cost: 10, station: "inventory", time: 4, qty: 1, inputs: [["wood", 20], ["thatch", 30], ["stone", 20], ["fiber", 15]], xp: 8 },
  { id: "forge", level: 16, cost: 16, station: "inventory", time: 6, qty: 1, inputs: [["stone", 100], ["hide", 20], ["wood", 30], ["flint", 5], ["sparkpowder", 10]], xp: 20 },
  { id: "smithy", level: 17, cost: 16, station: "inventory", time: 6, qty: 1, inputs: [["stone", 60], ["wood", 60], ["hide", 20], ["metal_ingot", 5]], xp: 20 },
  { id: "metal_pick", level: 18, cost: 12, station: "smithy", time: 5, qty: 1, inputs: [["metal_ingot", 5], ["wood", 5], ["hide", 10]], xp: 12 },
  { id: "metal_hatchet", level: 18, cost: 12, station: "smithy", time: 5, qty: 1, inputs: [["metal_ingot", 5], ["wood", 5], ["hide", 10]], xp: 12 },
  { id: "metal_sword", level: 20, cost: 14, station: "smithy", time: 6, qty: 1, inputs: [["metal_ingot", 12], ["hide", 12]], xp: 16 },
  { id: "carno_saddle", level: 22, cost: 16, station: "smithy", time: 8, qty: 1, inputs: [["hide", 80], ["fiber", 50], ["metal_ingot", 10]], xp: 20 },
  { id: "ankylo_saddle", level: 22, cost: 16, station: "smithy", time: 8, qty: 1, inputs: [["hide", 80], ["fiber", 50], ["metal_ingot", 12]], xp: 20 },
  { id: "allo_saddle", level: 24, cost: 16, station: "smithy", time: 8, qty: 1, inputs: [["hide", 90], ["fiber", 50], ["metal_ingot", 12]], xp: 22 },
  { id: "spino_saddle", level: 26, cost: 18, station: "smithy", time: 9, qty: 1, inputs: [["hide", 100], ["fiber", 60], ["metal_ingot", 16]], xp: 24 },
  { id: "bronto_saddle", level: 32, cost: 22, station: "smithy", time: 12, qty: 1, inputs: [["hide", 160], ["fiber", 120], ["wood", 60], ["metal_ingot", 20]], xp: 34 },
  { id: "theri_saddle", level: 27, cost: 18, station: "smithy", time: 9, qty: 1, inputs: [["hide", 110], ["fiber", 70], ["metal_ingot", 14]], xp: 26 },
  { id: "bary_saddle", level: 24, cost: 14, station: "smithy", time: 8, qty: 1, inputs: [["hide", 80], ["fiber", 50], ["metal_ingot", 10]], xp: 20 },
  { id: "diplo_saddle", level: 22, cost: 14, station: "inventory", time: 8, qty: 1, inputs: [["hide", 90], ["fiber", 80], ["wood", 40]], xp: 20 },
  { id: "giga_saddle", level: 40, cost: 30, station: "smithy", time: 14, qty: 1, inputs: [["hide", 200], ["fiber", 140], ["metal_ingot", 40], ["chitin", 30]], xp: 50 },
  { id: "megalo_saddle", level: 30, cost: 20, station: "smithy", time: 10, qty: 1, inputs: [["hide", 120], ["fiber", 80], ["metal_ingot", 22]], xp: 30 },
  { id: "rex_saddle", level: 28, cost: 20, station: "smithy", time: 10, qty: 1, inputs: [["hide", 120], ["fiber", 80], ["metal_ingot", 25]], xp: 30 },
  { id: "chitin_head", level: 22, cost: 8, station: "smithy", time: 4, qty: 1, inputs: [["chitin", 10], ["fiber", 10], ["hide", 5]], xp: 8 },
  { id: "chitin_chest", level: 22, cost: 8, station: "smithy", time: 4, qty: 1, inputs: [["chitin", 25], ["fiber", 20], ["hide", 12]], xp: 8 },
  { id: "chitin_legs", level: 22, cost: 8, station: "smithy", time: 4, qty: 1, inputs: [["chitin", 20], ["fiber", 16], ["hide", 10]], xp: 8 },
  { id: "chitin_hands", level: 22, cost: 8, station: "smithy", time: 4, qty: 1, inputs: [["chitin", 8], ["fiber", 8], ["hide", 5]], xp: 8 },
  { id: "chitin_feet", level: 22, cost: 8, station: "smithy", time: 4, qty: 1, inputs: [["chitin", 10], ["fiber", 10], ["hide", 5]], xp: 8 },
  { id: "metal_head", level: 30, cost: 12, station: "smithy", time: 6, qty: 1, inputs: [["metal_ingot", 20], ["hide", 5]], xp: 14 },
  { id: "metal_chest", level: 30, cost: 12, station: "smithy", time: 6, qty: 1, inputs: [["metal_ingot", 50], ["hide", 12]], xp: 14 },
  { id: "metal_legs", level: 30, cost: 12, station: "smithy", time: 6, qty: 1, inputs: [["metal_ingot", 40], ["hide", 10]], xp: 14 },
  { id: "metal_hands", level: 30, cost: 12, station: "smithy", time: 6, qty: 1, inputs: [["metal_ingot", 15], ["hide", 5]], xp: 14 },
  { id: "metal_feet", level: 30, cost: 12, station: "smithy", time: 6, qty: 1, inputs: [["metal_ingot", 16], ["hide", 5]], xp: 14 },
  { id: "metal_sword", level: 1, cost: 0, station: "replicator", time: 3, qty: 1, inputs: [["element", 2], ["metal_ingot", 4]], xp: 10, autoLearned: true, key: "rep_sword" },
  { id: "kibble_basic", level: 1, cost: 0, station: "replicator", time: 1, qty: 10, inputs: [["element", 1], ["raw_prime", 2]], xp: 4, autoLearned: true, key: "rep_kibble" },
  { id: "metal_chest", level: 1, cost: 0, station: "replicator", time: 4, qty: 1, inputs: [["element", 4], ["metal_ingot", 20]], xp: 12, autoLearned: true, key: "rep_chest" },
  { id: "stone_foundation", level: 20, cost: 14, station: "inventory", time: 3, qty: 1, inputs: [["stone", 80], ["wood", 20], ["cementing_paste", 4]], xp: 7 },
  { id: "stone_wall", level: 20, cost: 10, station: "inventory", time: 3, qty: 1, inputs: [["stone", 50], ["wood", 10], ["cementing_paste", 2]], xp: 7 },
  { id: "stone_doorframe", level: 21, cost: 10, station: "inventory", time: 3, qty: 1, inputs: [["stone", 40], ["wood", 10], ["cementing_paste", 2]], xp: 7 },
  { id: "stone_roof", level: 21, cost: 10, station: "inventory", time: 3, qty: 1, inputs: [["stone", 50], ["wood", 10], ["cementing_paste", 2]], xp: 7 },
];

export const ENGRAM_BY_ID: Record<string, Engram> = {};
for (const e of ENGRAMS) ENGRAM_BY_ID[e.key ?? e.id] = e;
