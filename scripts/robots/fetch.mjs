#!/usr/bin/env node
// Builds public/robots/: pinned MuJoCo Menagerie arms, the repository's Montaj1 CAD arm, and every robot of the
// ARMOR gallery fetched from its own upstream repository; then writes public/robots/index.json.
//
//   node scripts/robots/fetch.mjs [--only id,...] [--collection armor|menagerie|montaj1] [--skip-montaj]
//                                 [--force] [--jobs N]
import fs from 'node:fs';
import { ARMOR_IDS, ARMOR_ROBOTS, armorId } from './armor/catalog/index.mjs';
import { SKIPPED } from './armor/catalog/skipped.mjs';
import { fetchArmor } from './armor/run/fetch-armor.mjs';
import { CATALOG_IDS, MENAGERIE_ROBOTS, MONTAJ } from './catalog/robots.mjs';
import { parseArgs, selects } from './cli/args.mjs';
import { keptEntries } from './manifest/read.mjs';
import { updateManifest } from './manifest/update.mjs';
import { printSummary, writeManifest } from './manifest/write.mjs';
import { ensureMenagerie, MENAGERIE_COMMIT } from './menagerie/checkout.mjs';
import { menagerieEntry } from './menagerie/copy.mjs';
import { montajEntry } from './montaj/export.mjs';
import { ROBOTS_DIR } from './paths.mjs';

const ALL_IDS = [...CATALOG_IDS, ...ARMOR_IDS];
const USAGE = [
  'Usage: node scripts/robots/fetch.mjs [--only id,...] [--collection armor|menagerie|montaj1] [--skip-montaj]',
  '                                     [--force] [--jobs N]',
  '',
  '  --force   rebuild armor robots even when a build with the same inputs is on disk',
  '  --jobs N  armor robots processed at once (default 4)',
  '',
  `Robots: ${CATALOG_IDS.join(', ')}, and ${ARMOR_IDS.length} armor-* ids`,
  `Menagerie commit: ${MENAGERIE_COMMIT}`,
].join('\n');

async function main() {
  const opts = parseArgs(process.argv.slice(2), { flags: ['--skip-montaj', '--force', '--jobs'], usage: USAGE });
  const unknown = (opts.only ?? []).filter((id) => !ALL_IDS.includes(id));
  if (unknown.length) throw new Error(`unknown robot id(s): ${unknown.join(', ')}\n\n${USAGE}`);
  const menagerie = MENAGERIE_ROBOTS.filter((r) => selects(opts, r.id));
  const montaj = !opts.flags.has('--skip-montaj') && selects(opts, MONTAJ.id);
  const armor = ARMOR_ROBOTS.filter((r) => selects(opts, armorId(r.slug)));
  if (!menagerie.length && !montaj && !armor.length) throw new Error('nothing to do');
  fs.mkdirSync(ROBOTS_DIR, { recursive: true });

  const rebuilding = new Set([...menagerie.map((r) => r.id), ...(montaj ? [MONTAJ.id] : []), ...armor.map((r) => armorId(r.slug))]);
  const kept = keptEntries(rebuilding);
  const built = new Map();
  if (menagerie.length) {
    await ensureMenagerie(menagerie.map((r) => r.dir));
    for (const robot of menagerie) built.set(robot.id, menagerieEntry(robot));
  }
  if (montaj) {
    try {
      built.set(MONTAJ.id, await montajEntry());
    } catch (err) {
      console.error(`montaj1 failed (keeping any previous build): ${err.message}`);
      process.exitCode = 1;
    }
  }
  updateManifest({ put: [...built.values()] }, ALL_IDS);
  const onEntry = (id, entry) => updateManifest(entry ? { put: [entry] } : { drop: [id] }, ALL_IDS);
  const armorOpts = { force: opts.flags.has('--force'), jobs: opts.jobs, onEntry };
  const report = armor.length ? await fetchArmor(armor, armorOpts) : null;
  for (const [id, entry] of report?.entries ?? []) built.set(id, entry);

  const robots = ALL_IDS.map((id) => built.get(id) ?? kept.get(id)).filter(Boolean);
  writeManifest(robots);
  printSummary(robots, built);
  if (report) {
    console.log(`  armor: ${report.entries.size} ready, ${report.failures.length} failed, ${report.skipped.length} skipped`);
    for (const f of report.failures) console.log(`    FAIL ${f.id}: ${f.error.slice(0, 200)}`);
    for (const s of report.skipped) console.log(`    SKIP ${s.id}: ${s.reason}`);
    for (const s of SKIPPED) console.log(`    not in catalog: ${s.slug}: ${s.reason}`);
  }
}

main().catch((err) => {
  console.error(`fetch-robots: ${err.message}`);
  process.exit(1);
});
