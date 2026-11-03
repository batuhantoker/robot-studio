/** List edits for trajectory stops: pure, and selection-preserving via `remap`. */

export const midpoint = (a: number[], b: number[]): number[] => a.map((v, k) => (v + b[k]) / 2);

export const insertAt = <T>(list: T[], at: number, item: T): T[] => [...list.slice(0, at), item, ...list.slice(at)];

/** Move the item at `from` so it ends up at index `to`. */
export function reorder<T>(list: T[], from: number, to: number): T[] {
  const out = [...list];
  const [item] = out.splice(from, 1);
  out.splice(to, 0, item);
  return out;
}

/** Where index `i` ends up after `reorder(list, from, to)`. */
export function remap(i: number, from: number, to: number): number {
  if (i === from) return to;
  if (from < i && i <= to) return i - 1;
  if (to <= i && i < from) return i + 1;
  return i;
}
