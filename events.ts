type Handler<T> = (payload: T) => void;

export class Emitter<Events extends Record<string, unknown>> {
  private handlers: { [K in keyof Events]?: Set<Handler<Events[K]>> } = {};

  on<K extends keyof Events>(type: K, h: Handler<Events[K]>): () => void {
    let set = this.handlers[type];
    if (!set) {
      set = new Set();
      this.handlers[type] = set;
    }
    set.add(h);
    return () => set!.delete(h);
  }

  emit<K extends keyof Events>(type: K, payload: Events[K]) {
    const set = this.handlers[type];
    if (!set) return;
    for (const h of set) {
      try {
        h(payload);
      } catch (e) {
        console.error(`[events] handler for ${String(type)} failed`, e);
      }
    }
  }
}

export interface Notice {
  id: number;
  text: string;
  kind: "item" | "info" | "warn" | "good" | "level";
  icon?: string;
}

export type GameEvents = {
  notice: Notice;
  inventory: void;
  state: string;
  hurt: number;
  levelup: number;
  panel: PanelRequest | null;
  saved: void;
  loading: number;
};

export type PanelRequest =
  | { kind: "container"; structureId: number }
  | { kind: "creature"; creatureId: number }
  | { kind: "bag"; bagId: number }
  | { kind: "note"; noteId: number }
  | { kind: "obelisk"; obeliskId: string };
