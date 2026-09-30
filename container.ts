import { ITEMS } from "../data/items";

export interface ItemStack {
  id: string;
  qty: number;
  dur?: number; // current durability for tools
  spoil?: number; // seconds left until next unit spoils
}

export function makeStack(id: string, qty: number): ItemStack {
  const d = ITEMS[id];
  const s: ItemStack = { id, qty };
  if (d?.tool) s.dur = d.tool.durability;
  if (d?.spoil) s.spoil = d.spoil;
  return s;
}

/** Generic fixed-size slot container used for player inventory, hotbar, chests, creatures, bags. */
export class Container {
  slots: (ItemStack | null)[];
  version = 0;
  constructor(public size: number, public spoilMult = 1) {
    this.slots = new Array(size).fill(null);
  }

  touch() {
    this.version++;
  }

  count(id: string): number {
    let n = 0;
    for (const s of this.slots) if (s && s.id === id) n += s.qty;
    return n;
  }

  weight(): number {
    let w = 0;
    for (const s of this.slots) if (s) w += (ITEMS[s.id]?.weight ?? 0) * s.qty;
    return w;
  }

  isEmpty() {
    return this.slots.every((s) => !s);
  }

  /** How many of `id` can still fit. */
  capacityFor(id: string): number {
    const max = ITEMS[id]?.stack ?? 1;
    let cap = 0;
    for (const s of this.slots) {
      if (!s) cap += max;
      else if (s.id === id && max > 1) cap += max - s.qty;
    }
    return cap;
  }

  /** Adds items, returns the quantity that could NOT be added. */
  add(id: string, qty: number, template?: ItemStack): number {
    const def = ITEMS[id];
    if (!def || qty <= 0) return qty;
    const max = def.stack;
    if (max > 1) {
      for (const s of this.slots) {
        if (qty <= 0) break;
        if (s && s.id === id && s.qty < max) {
          const k = Math.min(max - s.qty, qty);
          s.qty += k;
          qty -= k;
        }
      }
    }
    for (let i = 0; i < this.slots.length && qty > 0; i++) {
      if (!this.slots[i]) {
        const k = Math.min(max, qty);
        const st = template ? { ...template, id, qty: k } : makeStack(id, k);
        this.slots[i] = st;
        qty -= k;
      }
    }
    this.touch();
    return qty;
  }

  addStack(st: ItemStack): number {
    return this.add(st.id, st.qty, st);
  }

  remove(id: string, qty: number): number {
    let removed = 0;
    for (let i = this.slots.length - 1; i >= 0 && qty > 0; i--) {
      const s = this.slots[i];
      if (s && s.id === id) {
        const k = Math.min(s.qty, qty);
        s.qty -= k;
        qty -= k;
        removed += k;
        if (s.qty <= 0) this.slots[i] = null;
      }
    }
    if (removed) this.touch();
    return removed;
  }

  removeAt(i: number, qty: number): ItemStack | null {
    const s = this.slots[i];
    if (!s) return null;
    const k = Math.min(qty, s.qty);
    const out = { ...s, qty: k };
    s.qty -= k;
    if (s.qty <= 0) this.slots[i] = null;
    this.touch();
    return out;
  }

  firstIndexOf(id: string) {
    return this.slots.findIndex((s) => s && s.id === id);
  }

  /** Advance spoilage. Returns true if anything changed. */
  tickSpoil(dt: number): boolean {
    if (this.spoilMult <= 0) return false;
    let changed = false;
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      if (!s || s.spoil === undefined) continue;
      const def = ITEMS[s.id];
      if (!def?.spoil) continue;
      s.spoil -= dt * this.spoilMult;
      while (s.spoil <= 0 && s.qty > 0) {
        s.qty--;
        s.spoil += def.spoil;
        changed = true;
        if (def.spoilsTo) {
          if (s.qty <= 0) this.slots[i] = null;
          this.add(def.spoilsTo, 1);
        }
      }
      if (s.qty <= 0) this.slots[i] = null;
    }
    if (changed) this.touch();
    return changed;
  }

  serialize(): (ItemStack | null)[] {
    return this.slots.map((s) => (s ? { ...s } : null));
  }

  load(data: (ItemStack | null)[] | undefined) {
    this.slots = new Array(this.size).fill(null);
    if (!data) return;
    for (let i = 0; i < Math.min(this.size, data.length); i++) {
      const s = data[i];
      if (s && ITEMS[s.id] && s.qty > 0) this.slots[i] = { ...s };
    }
    this.touch();
  }
}

/** Move a stack between containers (whole stack or amount), merging where possible. */
export function transfer(from: Container, index: number, to: Container, amount?: number): boolean {
  const s = from.slots[index];
  if (!s) return false;
  const qty = Math.min(amount ?? s.qty, s.qty);
  const fit = Math.min(qty, to.capacityFor(s.id));
  if (fit <= 0) return false;
  const moved = from.removeAt(index, fit)!;
  const left = to.addStack(moved);
  if (left > 0) from.add(moved.id, left, moved);
  from.touch();
  to.touch();
  return true;
}

export function swapSlots(a: Container, ai: number, b: Container, bi: number) {
  const t = a.slots[ai];
  a.slots[ai] = b.slots[bi];
  b.slots[bi] = t;
  a.touch();
  b.touch();
}
