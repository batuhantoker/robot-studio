/** A small observable store: set() merges and notifies subscribers of the keys that changed. */
export type Listener<S> = (state: S, changed: Set<keyof S>) => void;

export class Store<S extends object> {
  private listeners: Listener<S>[] = [];

  constructor(private current: S) {}

  get state(): S {
    return this.current;
  }

  set(patch: Partial<S>): void {
    const changed = new Set<keyof S>();
    for (const key of Object.keys(patch) as (keyof S)[]) {
      if (this.current[key] !== patch[key]) changed.add(key);
    }
    if (!changed.size) return;
    this.current = { ...this.current, ...patch };
    for (const fn of this.listeners) fn(this.current, changed);
  }

  /** Subscribe to some keys (or all when omitted); returns an unsubscribe function. */
  on(keys: (keyof S)[] | null, fn: Listener<S>): () => void {
    const wrapped: Listener<S> = (s, changed) => {
      if (!keys || keys.some((k) => changed.has(k))) fn(s, changed);
    };
    this.listeners.push(wrapped);
    return () => (this.listeners = this.listeners.filter((l) => l !== wrapped));
  }
}
