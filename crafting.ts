import { ENGRAM_BY_ID, type Engram } from "../data/engrams";
import { ITEMS } from "../data/items";
import { Container } from "./container";

export interface QueueEntry {
  id: string; // engram id
  count: number;
  timer: number;
}

/** A crafting queue bound to input containers and an output container. */
export class CraftQueue {
  entries: QueueEntry[] = [];
  constructor(public label: string) {}

  static maxCraftable(e: Engram, sources: Container[]): number {
    let max = Infinity;
    for (const [id, n] of e.inputs) {
      const have = sources.reduce((a, c) => a + c.count(id), 0);
      max = Math.min(max, Math.floor(have / n));
    }
    return max === Infinity ? 0 : max;
  }

  /** Consumes resources upfront. Returns how many were queued. */
  enqueue(engramId: string, count: number, sources: Container[]): number {
    const e = ENGRAM_BY_ID[engramId];
    if (!e) return 0;
    const n = Math.min(count, CraftQueue.maxCraftable(e, sources));
    if (n <= 0) return 0;
    for (const [id, q] of e.inputs) {
      let need = q * n;
      for (const c of sources) {
        if (need <= 0) break;
        need -= c.remove(id, need);
      }
    }
    const last = this.entries[this.entries.length - 1];
    if (last && last.id === engramId) last.count += n;
    else this.entries.push({ id: engramId, count: n, timer: e.time });
    return n;
  }

  cancel(index: number, refundTo: Container) {
    const en = this.entries[index];
    if (!en) return;
    const e = ENGRAM_BY_ID[en.id];
    for (const [id, q] of e.inputs) refundTo.add(id, q * en.count);
    this.entries.splice(index, 1);
  }

  /** Advance; calls onDone(itemId, qty, xp) for each finished craft. */
  update(dt: number, speedMult: number, onDone: (itemId: string, qty: number, xp: number) => void) {
    const en = this.entries[0];
    if (!en) return;
    en.timer -= dt * speedMult;
    while (en.timer <= 0 && en.count > 0) {
      const e = ENGRAM_BY_ID[en.id];
      onDone(e.id, e.qty, e.xp);
      en.count--;
      en.timer += e.time;
    }
    if (en.count <= 0) this.entries.shift();
  }

  progress(): number {
    const en = this.entries[0];
    if (!en) return 0;
    const e = ENGRAM_BY_ID[en.id];
    return 1 - Math.max(0, en.timer) / e.time;
  }

  serialize(): QueueEntry[] {
    return this.entries.map((e) => ({ ...e }));
  }
  load(d: QueueEntry[] | undefined) {
    this.entries = (d ?? []).filter((e) => ENGRAM_BY_ID[e.id] && ITEMS[ENGRAM_BY_ID[e.id].id]).map((e) => ({ ...e }));
  }
}
