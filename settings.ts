// User options (mirrors the structure of the original Options menu) and world rules (Host/Local).
import { sanitizeLayout, type ControlLayout } from "../ui/controlLayout";
export type Quality = "low" | "medium" | "high" | "epic" | "custom";
export type Level4 = 0 | 1 | 2 | 3; // Baixo, Médio, Alto, Épico

export interface Settings {
  // ---- Graphics
  quality: Quality;
  resolutionScale: number; // 0.5..2 (supersampling above 1)
  viewDistance: Level4;
  shadows: 0 | 1 | 2 | 3 | 4; // Desligado, Baixo, Médio, Alto, Épico
  antiAliasing: boolean;
  lightBloom: boolean;
  colorGrading: boolean;
  filmGrain: boolean;
  skyQuality: number; // 0..1
  groundClutterDensity: number; // 0..1
  groundClutterDistance: number; // 0..1
  meshLod: number; // 0..1
  anisotropic: boolean;
  dynamicRes: boolean;
  animationStaggering: boolean;
  gamma: number; // 0.6..1.6 (exposure)
  showFps: boolean;
  // ---- Audio
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  ambientVolume: number;
  disableMenuMusic: boolean;
  inventorySounds: boolean;
  craftingSounds: boolean;
  // ---- Camera
  fov: number; // degrees
  cameraShake: number; // 0..1.5
  sensX: number;
  sensY: number;
  invertY: boolean;
  thirdPersonOffset: boolean;
  disableCameraInterpolation: boolean;
  viewBob: boolean;
  firstPersonRiding: boolean;
  cameraDistance: number;
  // ---- HUD / Advanced
  uiScale: number; // 0.7..1
  hotbarScale: number; // 0.7..1.3
  hotbarLayout: "classic" | "mobile"; // classic: 10 in a row at the bottom; mobile: 5 over 5 in the bottom-right (ARK Mobile)
  floatingNames: boolean;
  statusNotifications: boolean;
  fahrenheit: boolean;
  crosshair: boolean;
  hitMarkers: boolean;
  floatingDamage: boolean;
  bloodOverlay: boolean;
  torpidityEffect: boolean;
  menuTransitions: boolean;
  tutorial: boolean;
  minimap: boolean;
  compass: boolean;
  // ---- Mobile controls
  buttonScale: number;
  buttonOpacity: number;
  joystickSize: number;
  autoSprint: boolean;
  controlLayout: ControlLayout; // per-button position / size / opacity overrides (see ui/controlLayout.ts)
  pauseInMenus: boolean;
  vibration: boolean;
  autoFullscreen: boolean; // enter fullscreen + landscape automatically when a game starts
}

export const DEFAULT_SETTINGS: Settings = {
  quality: "medium", resolutionScale: 1, viewDistance: 1, shadows: 2, antiAliasing: false, lightBloom: false, colorGrading: true, filmGrain: false,
  skyQuality: 0.8, groundClutterDensity: 0.7, groundClutterDistance: 0.6, meshLod: 0.6, anisotropic: true, dynamicRes: true, animationStaggering: true, gamma: 1, showFps: false,
  masterVolume: 0.9, musicVolume: 0.55, sfxVolume: 0.85, ambientVolume: 0.7, disableMenuMusic: false, inventorySounds: true, craftingSounds: true,
  fov: 62, cameraShake: 1, sensX: 1, sensY: 1, invertY: false, thirdPersonOffset: true, disableCameraInterpolation: false, viewBob: true, firstPersonRiding: false, cameraDistance: 4.6,
  uiScale: 1, hotbarScale: 1, hotbarLayout: "mobile", floatingNames: true, statusNotifications: true, fahrenheit: false, crosshair: true, hitMarkers: true, floatingDamage: true, bloodOverlay: true, torpidityEffect: true, menuTransitions: true, tutorial: true, minimap: true, compass: true,
  buttonScale: 1, buttonOpacity: 0.85, joystickSize: 1, autoSprint: true, controlLayout: {}, pauseInMenus: true, vibration: true, autoFullscreen: true,
};

/** Graphics presets (like the original: Low/Medium/High/Epic, "Custom" once anything is changed). */
export const PRESETS: Record<Exclude<Quality, "custom">, Partial<Settings>> = {
  low: { resolutionScale: 0.7, viewDistance: 0, shadows: 0, antiAliasing: false, lightBloom: false, skyQuality: 0.2, groundClutterDensity: 0.3, groundClutterDistance: 0.3, meshLod: 0.3, anisotropic: false },
  medium: { resolutionScale: 0.9, viewDistance: 1, shadows: 2, antiAliasing: false, lightBloom: false, skyQuality: 0.7, groundClutterDensity: 0.65, groundClutterDistance: 0.55, meshLod: 0.6, anisotropic: true },
  high: { resolutionScale: 1, viewDistance: 2, shadows: 3, antiAliasing: true, lightBloom: true, skyQuality: 0.9, groundClutterDensity: 0.85, groundClutterDistance: 0.75, meshLod: 0.8, anisotropic: true },
  epic: { resolutionScale: 1, viewDistance: 3, shadows: 4, antiAliasing: true, lightBloom: true, skyQuality: 1, groundClutterDensity: 1, groundClutterDistance: 1, meshLod: 1, anisotropic: true },
};
export const GRAPHICS_KEYS: (keyof Settings)[] = ["resolutionScale", "viewDistance", "shadows", "antiAliasing", "lightBloom", "skyQuality", "groundClutterDensity", "groundClutterDistance", "meshLod", "anisotropic"];

export const VIEW_METERS = [180, 280, 380, 470];
export const LEVEL_LABEL = ["Baixo", "Médio", "Alto", "Épico"];
export const SHADOW_LABEL = ["Desligado", "Baixo", "Médio", "Alto", "Épico"];

/** Migrate settings saved by earlier versions (Parts 1–3). */
export function migrateSettings(raw: Record<string, unknown> | null, isTouch: boolean): Settings {
  const s: Settings = { ...DEFAULT_SETTINGS, ...(isTouch ? PRESETS.medium : PRESETS.high), quality: isTouch ? "medium" : "high" };
  if (!raw) return s;
  const r = raw as Record<string, unknown>;
  if (typeof r.volume === "number") s.masterVolume = r.volume;
  if (typeof r.sensitivity === "number") s.sensX = s.sensY = r.sensitivity;
  if (typeof r.grass === "number") s.groundClutterDensity = r.grass;
  if (typeof r.shadows === "boolean") s.shadows = r.shadows ? 2 : 0;
  if (r.quality === "low" || r.quality === "medium" || r.quality === "high" || r.quality === "epic" || r.quality === "custom") s.quality = r.quality;
  for (const k of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    if (k === "controlLayout") continue;
    if (k in r && typeof r[k] === typeof DEFAULT_SETTINGS[k]) (s as unknown as Record<string, unknown>)[k] = r[k];
  }
  s.controlLayout = sanitizeLayout(r.controlLayout);
  return s;
}

// ------------------------------------------------------------------ world rules (Host / Local)
export interface Rules {
  difficulty: number; // 1..5  -> max wild level = 30 * difficulty
  useSingleplayerSettings: boolean;
  xpMult: number;
  tamingSpeed: number;
  harvestAmount: number;
  dayCycleSpeed: number;
  foodDrain: number;
  waterDrain: number;
  playerDamage: number;
  playerResistance: number;
  dinoDamage: number;
  structureResistance: number;
  craftingSpeed: number;
  eggHatchSpeed: number;
  babyMatureSpeed: number;
  resourceRespawn: number; // multiplier of respawn time (lower = faster)
  supplyDrops: boolean;
  maxWildCreatures: number;
}

export const DEFAULT_RULES: Rules = {
  difficulty: 1, useSingleplayerSettings: true, xpMult: 1, tamingSpeed: 1, harvestAmount: 1, dayCycleSpeed: 1, foodDrain: 1, waterDrain: 1,
  playerDamage: 1, playerResistance: 1, dinoDamage: 1, structureResistance: 1, craftingSpeed: 1, eggHatchSpeed: 1, babyMatureSpeed: 1, resourceRespawn: 1, supplyDrops: true, maxWildCreatures: 24,
};

/** Effective multipliers (Single Player Settings boosts XP ×2 and taming ×2.5, like the original). */
export function effective(r: Rules) {
  const sp = r.useSingleplayerSettings;
  return {
    xp: r.xpMult * (sp ? 2 : 1),
    taming: r.tamingSpeed * (sp ? 2.5 : 1),
    harvest: r.harvestAmount,
    maxLevel: Math.round(30 * r.difficulty),
    craft: r.craftingSpeed,
    hatch: r.eggHatchSpeed * (sp ? 2 : 1),
    mature: r.babyMatureSpeed * (sp ? 2 : 1),
  };
}

export interface RuleDef { key: keyof Rules; label: string; min?: number; max?: number; step?: number; tab: "general" | "advanced"; hint?: string }
export const RULE_DEFS: RuleDef[] = [
  { key: "difficulty", label: "Nível de Dificuldade", min: 1, max: 5, step: 0.5, tab: "general", hint: "Nível máximo das criaturas selvagens = 30 × dificuldade" },
  { key: "useSingleplayerSettings", label: "Usar Configurações de Single Player", tab: "general", hint: "XP ×2, domesticação ×2,5, reprodução ×2" },
  { key: "xpMult", label: "Multiplicador de XP", min: 0.25, max: 10, step: 0.25, tab: "general" },
  { key: "tamingSpeed", label: "Velocidade de Domesticação", min: 0.25, max: 10, step: 0.25, tab: "general" },
  { key: "harvestAmount", label: "Quantidade de Coleta", min: 0.25, max: 10, step: 0.25, tab: "general" },
  { key: "dayCycleSpeed", label: "Velocidade do Ciclo Dia/Noite", min: 0.25, max: 5, step: 0.25, tab: "general" },
  { key: "supplyDrops", label: "Pacotes de Suprimentos", tab: "general" },
  { key: "foodDrain", label: "Consumo de Comida do Jogador", min: 0.2, max: 3, step: 0.1, tab: "advanced" },
  { key: "waterDrain", label: "Consumo de Água do Jogador", min: 0.2, max: 3, step: 0.1, tab: "advanced" },
  { key: "playerDamage", label: "Dano do Jogador", min: 0.25, max: 5, step: 0.25, tab: "advanced" },
  { key: "playerResistance", label: "Resistência do Jogador", min: 0.25, max: 5, step: 0.25, tab: "advanced", hint: "Maior = recebe menos dano" },
  { key: "dinoDamage", label: "Dano das Criaturas", min: 0.25, max: 5, step: 0.25, tab: "advanced" },
  { key: "structureResistance", label: "Resistência das Estruturas", min: 0.25, max: 5, step: 0.25, tab: "advanced" },
  { key: "craftingSpeed", label: "Velocidade de Criação", min: 0.25, max: 10, step: 0.25, tab: "advanced" },
  { key: "eggHatchSpeed", label: "Velocidade de Incubação", min: 0.25, max: 20, step: 0.25, tab: "advanced" },
  { key: "babyMatureSpeed", label: "Velocidade de Maturação", min: 0.25, max: 20, step: 0.25, tab: "advanced" },
  { key: "resourceRespawn", label: "Tempo de Reaparecimento de Recursos", min: 0.2, max: 3, step: 0.1, tab: "advanced", hint: "Menor = recursos voltam mais rápido" },
  { key: "maxWildCreatures", label: "Máximo de Criaturas Selvagens", min: 8, max: 40, step: 1, tab: "advanced" },
];
