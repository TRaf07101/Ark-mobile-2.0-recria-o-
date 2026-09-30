import type { Game } from "../game";

/** Guided onboarding missions. Each step checks live game state and grants rewards. */
export interface Mission {
  id: string;
  title: string;
  hint: string;
  check: (g: Game) => boolean;
  reward: { xp: number; items?: [string, number][] };
}

export const MISSIONS: Mission[] = [
  { id: "thatch", title: "Colete 20 de palha", hint: "Soque ou golpeie árvores (botão vermelho).", check: (g) => g.player.count("thatch") >= 20, reward: { xp: 10 } },
  { id: "stones", title: "Pegue 5 pedras", hint: "Pedras soltas no chão: aproxime-se e use o botão verde.", check: (g) => g.player.count("stone") >= 5, reward: { xp: 10 } },
  { id: "pick", title: "Crie uma Picareta de Pedra", hint: "Abra a mochila → Criar.", check: (g) => g.player.count("stone_pick") > 0 || g.stats.crafted.stone_pick > 0, reward: { xp: 20, items: [["fiber", 15]] } },
  { id: "equip", title: "Equipe a picareta na barra rápida", hint: "Mova-a para a barra e toque nela.", check: (g) => g.player.heldId === "stone_pick", reward: { xp: 10 } },
  { id: "flint", title: "Colete 10 de pederneira", hint: "Golpeie rochas grandes com a picareta.", check: (g) => g.player.count("flint") >= 10, reward: { xp: 15 } },
  { id: "drink", title: "Beba água", hint: "Entre na água e use o botão verde, ou use um cantil.", check: (g) => g.stats.drinks > 0, reward: { xp: 10 } },
  { id: "level2", title: "Alcance o nível 2", hint: "Coletar e criar dá XP.", check: (g) => g.player.level >= 2, reward: { xp: 0, items: [["mejoberry", 10]] } },
  { id: "engram", title: "Aprenda um engrama", hint: "Mochila → Engramas. Tente a Fogueira.", check: (g) => g.player.learned.size > 2, reward: { xp: 15 } },
  { id: "campfire", title: "Construa uma fogueira", hint: "Crie a fogueira, coloque-a na barra e posicione.", check: (g) => g.building.list.some((s) => s.def.id === "campfire"), reward: { xp: 25, items: [["wood", 10]] } },
  { id: "hunt", title: "Abata uma criatura", hint: "Dodôs são presas fáceis. Colete carne da carcaça.", check: (g) => g.stats.kills > 0, reward: { xp: 25 } },
  { id: "cook", title: "Cozinhe carne", hint: "Coloque madeira e carne crua na fogueira e acenda.", check: (g) => g.player.count("cooked_meat") > 0 || g.stats.cooked > 0, reward: { xp: 25 } },
  { id: "shelter", title: "Construa uma fundação e 3 paredes", hint: "Aprenda os engramas de palha (nível 3).", check: (g) => g.building.list.some((s) => s.def.snap === "foundation") && g.building.list.filter((s) => s.def.snap === "wall" || s.def.snap === "doorframe").length >= 3, reward: { xp: 40, items: [["thatch", 30]] } },
  { id: "armor", title: "Vista uma peça de armadura", hint: "Roupas de pano ajudam contra o frio (nível 3).", check: (g) => g.player.armorValue() > 0, reward: { xp: 20 } },
  { id: "tame", title: "Domestique uma criatura", hint: "Desmaie um dodô com socos e alimente-o com frutas.", check: (g) => g.creatures.list.some((c) => c.tamed), reward: { xp: 60, items: [["narcoberry", 20]] } },
  { id: "explore", title: "Descubra um local", hint: "Siga as colunas de luz dos obeliscos ou ruínas no mapa.", check: (g) => g.player.explored.length > 0, reward: { xp: 30 } },
  { id: "ride", title: "Monte uma criatura", hint: "Crie uma sela, coloque no inventário da criatura e monte.", check: (g) => g.stats.rides > 0, reward: { xp: 80 } },
];

export class Tutorial {
  done = new Set<string>();
  enabled = true;
  private t = 0;

  current(): Mission | null {
    if (!this.enabled) return null;
    return MISSIONS.find((m) => !this.done.has(m.id)) ?? null;
  }

  update(dt: number, g: Game) {
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 0.5;
    const m = this.current();
    if (!m) return;
    if (m.check(g)) {
      this.done.add(m.id);
      g.notify(`Missão concluída: ${m.title}`, "good");
      if (m.reward.xp) g.giveXp(m.reward.xp, "Missão");
      if (m.reward.items) g.giveItems(m.reward.items.map(([item, qty]) => ({ item, qty })));
      g.sfx("tame", 0.5);
    }
  }

  serialize() {
    return { done: [...this.done], enabled: this.enabled };
  }
  load(d: { done: string[]; enabled: boolean } | undefined) {
    this.done = new Set(d?.done ?? []);
    this.enabled = d?.enabled ?? true;
  }
}
