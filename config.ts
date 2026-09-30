// Central balance & engine constants. Tweak here instead of scattering magic numbers.
export const CONFIG = {
  world: {
    size: 640, // meters, square island
    res: 192, // terrain grid cells per side
    seaLevel: 0,
    minHeight: -14,
    maxHeight: 46,
  },
  time: {
    daySeconds: 1200, // full day/night cycle length
    startHour: 8,
  },
  player: {
    radius: 0.35,
    height: 1.8,
    eye: 1.6,
    walkSpeed: 4.2,
    sprintMult: 1.75,
    swimSpeed: 2.6,
    jumpVel: 6.8,
    gravity: 22,
    stepHeight: 0.55,
    // stamina lasts 80% longer (all drains ÷ 1.8)
    sprintStaminaPerSec: 5,
    jumpStamina: 4.4,
    attackStamina: 2.2,
    staminaRegen: 14,
    foodDrainPerSec: 0.11,
    waterDrainPerSec: 0.16,
    sprintHungerMult: 2,
    starveDamagePerSec: 1.2,
    regenPerSec: 0.9, // when food & water ok
    punchSelfDamageTree: 0.8,
    fallDamageMinVel: 13,
    fallDamagePerVel: 7,
    reach: 3.2,
    interactReach: 3.4,
    baseStats: { health: 100, stamina: 100, food: 100, water: 100, weight: 100, melee: 100, speed: 100, torpor: 200 },
    perLevel: { health: 10, stamina: 10, food: 10, water: 10, weight: 12, melee: 5, speed: 2 },
    maxLevel: 60,
  },
  camera: {
    distance: 4.6,
    minDistance: 1.8,
    maxDistance: 9,
    height: 1.55,
    shoulder: 0.55,
    fov: 62,
  },
  creatures: {
    activeRadius: 130,
    despawnRadius: 190,
    maxWild: 24,
    corpseSeconds: 240,
    spawnInterval: 1.2,
  },
  building: {
    grid: 3,
    wallHeight: 3,
    foundationHeight: 0.6,
    thickness: 0.22,
    placeRange: 10,
  },
  save: {
    key: "ark_mobile_2_save_v1",
    settingsKey: "ark_mobile_2_settings_v1",
    autosaveSeconds: 30,
    version: 1,
  },
} as const;

export function xpForLevel(level: number): number {
  // XP required to reach `level` from level 1 (cumulative)
  if (level <= 1) return 0;
  let total = 0;
  for (let l = 2; l <= level; l++) total += Math.floor(12 * Math.pow(l - 1, 1.75) + 8);
  return total;
}

export function engramPointsForLevel(level: number): number {
  if (level < 2) return 0;
  if (level < 10) return 8;
  if (level < 20) return 12;
  if (level < 35) return 16;
  return 20;
}
