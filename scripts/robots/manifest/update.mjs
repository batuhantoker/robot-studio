import { readManifest } from './read.mjs';
import { writeManifest } from './write.mjs';

// Puts and drops entries in index.json as robots land, keeping `order` (ids); unknown ids go last.
export function updateManifest({ put = [], drop = [] }, order) {
  let robots = [];
  try {
    robots = readManifest()?.robots ?? [];
  } catch {
    // An unreadable manifest is rebuilt from what this run has.
  }
  const byId = new Map(robots.map((e) => [e.id, e]));
  for (const id of drop) byId.delete(id);
  for (const entry of put) byId.set(entry.id, entry);
  const rank = (id) => (order.includes(id) ? order.indexOf(id) : order.length);
  writeManifest([...byId.values()].sort((a, b) => rank(a.id) - rank(b.id)));
}
