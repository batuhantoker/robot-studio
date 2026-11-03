import fs from 'node:fs';
import path from 'node:path';
import { ARMOR_IDS, ARMOR_ROBOTS, armorId, pinOf } from '../armor/catalog/index.mjs';
import { CATALOG_IDS, MONTAJ } from '../catalog/robots.mjs';
import { MENAGERIE_COMMIT } from '../menagerie/checkout.mjs';
import { MANIFEST, ROBOTS_DIR, STUDIO } from '../paths.mjs';

// Parsed index.json, or null when it does not exist yet.
export function readManifest() {
  if (!fs.existsSync(MANIFEST)) return null;
  return JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
}

// Entries this run does not rebuild are kept from the previous manifest when their files are still on disk.
export function keptEntries(rebuilding) {
  let old;
  try {
    old = readManifest();
  } catch (err) {
    console.warn(`warning: ignoring unreadable ${path.relative(STUDIO, MANIFEST)}: ${err.message}`);
    return new Map();
  }
  const kept = new Map();
  for (const entry of old?.robots ?? []) {
    if (rebuilding.has(entry.id)) continue;
    if (!CATALOG_IDS.includes(entry.id) && !ARMOR_IDS.includes(entry.id)) {
      console.warn(`warning: dropping ${entry.id} from the manifest (no longer in the catalog)`);
      continue;
    }
    const missing = (entry.files ?? []).filter((rel) => !fs.existsSync(path.join(ROBOTS_DIR, rel)));
    if (missing.length) {
      console.warn(`warning: dropping ${entry.id} from the manifest (${missing.length} file(s) missing on disk)`);
      continue;
    }
    if (entry.collection === 'armor') {
      const robot = ARMOR_ROBOTS.find((r) => armorId(r.slug) === entry.id);
      if ((entry.upstream?.commit ?? entry.upstream?.sha256) === pinOf(robot)) kept.set(entry.id, entry);
      else console.warn(`warning: dropping ${entry.id} (built at another upstream commit; re-run fetch for it)`);
      continue;
    }
    const fromMenagerie = entry.id !== MONTAJ.id;
    if (fromMenagerie && old.menagerie_commit !== MENAGERIE_COMMIT) {
      throw new Error(
        `${entry.id} in the existing manifest was fetched at menagerie ${old.menagerie_commit}, ` +
          `but the pin is now ${MENAGERIE_COMMIT}; re-run without --only to refresh every robot`,
      );
    }
    kept.set(entry.id, entry);
  }
  return kept;
}
