// Structure definitions. Snap kinds determine placement rules in the building system.
export type SnapKind = "foundation" | "wall" | "doorframe" | "door" | "roof" | "free";
export type Tier = "thatch" | "wood" | "stone" | "misc";

export interface StructureDef {
  id: string;
  name: string;
  item: string;
  snap: SnapKind;
  tier: Tier;
  hp: number;
  color: string;
  size: [number, number, number]; // w, h, d
  container?: number; // inventory slots
  spoilMult?: number;
  interact?: "container" | "campfire" | "door" | "bed" | "station" | "forge" | "crop";
  light?: boolean;
  xp: number;
}

const G = 3;
const T = 0.22;

export const STRUCTURES: Record<string, StructureDef> = {
  thatch_foundation: { id: "thatch_foundation", name: "Fundação de Palha", item: "thatch_foundation", snap: "foundation", tier: "thatch", hp: 400, color: "#c8a45a", size: [G, 0.6, G], xp: 2 },
  thatch_wall: { id: "thatch_wall", name: "Parede de Palha", item: "thatch_wall", snap: "wall", tier: "thatch", hp: 250, color: "#c9a95e", size: [G, 3, T], xp: 2 },
  thatch_doorframe: { id: "thatch_doorframe", name: "Batente de Palha", item: "thatch_doorframe", snap: "doorframe", tier: "thatch", hp: 250, color: "#c9a95e", size: [G, 3, T], xp: 2 },
  thatch_door: { id: "thatch_door", name: "Porta de Palha", item: "thatch_door", snap: "door", tier: "thatch", hp: 200, color: "#a68644", size: [1.2, 2.3, 0.12], interact: "door", xp: 2 },
  thatch_roof: { id: "thatch_roof", name: "Teto de Palha", item: "thatch_roof", snap: "roof", tier: "thatch", hp: 250, color: "#b8964f", size: [G, T, G], xp: 2 },
  wood_foundation: { id: "wood_foundation", name: "Fundação de Madeira", item: "wood_foundation", snap: "foundation", tier: "wood", hp: 2000, color: "#8a5a2b", size: [G, 0.6, G], xp: 4 },
  wood_wall: { id: "wood_wall", name: "Parede de Madeira", item: "wood_wall", snap: "wall", tier: "wood", hp: 1200, color: "#96643a", size: [G, 3, T], xp: 4 },
  wood_doorframe: { id: "wood_doorframe", name: "Batente de Madeira", item: "wood_doorframe", snap: "doorframe", tier: "wood", hp: 1200, color: "#96643a", size: [G, 3, T], xp: 4 },
  wood_door: { id: "wood_door", name: "Porta de Madeira", item: "wood_door", snap: "door", tier: "wood", hp: 1000, color: "#6e4524", size: [1.2, 2.3, 0.12], interact: "door", xp: 4 },
  wood_roof: { id: "wood_roof", name: "Teto de Madeira", item: "wood_roof", snap: "roof", tier: "wood", hp: 1200, color: "#7d5230", size: [G, T, G], xp: 4 },
  stone_foundation: { id: "stone_foundation", name: "Fundação de Pedra", item: "stone_foundation", snap: "foundation", tier: "stone", hp: 8000, color: "#8a857e", size: [G, 0.6, G], xp: 6 },
  stone_wall: { id: "stone_wall", name: "Parede de Pedra", item: "stone_wall", snap: "wall", tier: "stone", hp: 5000, color: "#8a857e", size: [G, 3, T], xp: 6 },
  stone_doorframe: { id: "stone_doorframe", name: "Batente de Pedra", item: "stone_doorframe", snap: "doorframe", tier: "stone", hp: 5000, color: "#8a857e", size: [G, 3, T], xp: 6 },
  stone_roof: { id: "stone_roof", name: "Teto de Pedra", item: "stone_roof", snap: "roof", tier: "stone", hp: 5000, color: "#8a857e", size: [G, T, G], xp: 6 },
  forge: { id: "forge", name: "Forja", item: "forge", snap: "free", tier: "misc", hp: 1500, color: "#6d6a66", size: [1.4, 1.5, 1.4], container: 16, interact: "forge", light: true, xp: 10 },
  smithy: { id: "smithy", name: "Ferraria", item: "smithy", snap: "free", tier: "misc", hp: 1200, color: "#6e4524", size: [2.0, 1.1, 1.0], container: 24, interact: "station", xp: 10 },
  crop_plot: { id: "crop_plot", name: "Canteiro", item: "crop_plot", snap: "free", tier: "misc", hp: 400, color: "#6b4a2b", size: [1.8, 0.45, 1.8], container: 6, interact: "crop", xp: 5 },
  campfire: { id: "campfire", name: "Fogueira", item: "campfire", snap: "free", tier: "misc", hp: 300, color: "#555", size: [1.2, 0.5, 1.2], container: 12, interact: "campfire", light: true, xp: 4 },
  storage_box: { id: "storage_box", name: "Baú Pequeno", item: "storage_box", snap: "free", tier: "misc", hp: 400, color: "#8a5a2b", size: [1.1, 0.7, 0.7], container: 24, spoilMult: 1, interact: "container", xp: 4 },
  sleeping_bag: { id: "sleeping_bag", name: "Saco de Dormir", item: "sleeping_bag", snap: "free", tier: "misc", hp: 100, color: "#3b6ea5", size: [0.9, 0.2, 2], interact: "bed", xp: 4 },
  standing_torch: { id: "standing_torch", name: "Tocha de Pé", item: "standing_torch", snap: "free", tier: "misc", hp: 200, color: "#6b4a2b", size: [0.5, 2.3, 0.5], container: 4, interact: "campfire", light: true, xp: 3 },
  mortar_pestle: { id: "mortar_pestle", name: "Pilão", item: "mortar_pestle", snap: "free", tier: "misc", hp: 300, color: "#7f7f7f", size: [0.8, 0.6, 0.8], container: 12, interact: "station", xp: 4 },
};

export const GRID = G;
export const THICK = T;
