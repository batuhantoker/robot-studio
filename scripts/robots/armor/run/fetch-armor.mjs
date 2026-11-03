import fs from 'node:fs';
import path from 'node:path';
import { ARMOR_CACHE, ARMOR_OUT, STUDIO } from '../../paths.mjs';
import { armorId } from '../catalog/index.mjs';
import { armorEntry } from '../entry.mjs';
import { prepareRobot } from '../prepare/robot.mjs';
import { cachedEntry, saveEntry } from './cache.mjs';
import { freeBytes, MIN_FREE_BYTES } from './disk.mjs';
import { pool } from './pool.mjs';

const line = (tag, id, rest = '') => console.log(`  ${tag.padEnd(5)} ${id.padEnd(34)} ${rest}`);

// Builds every catalog robot (resumable, `jobs` at a time); one robot failing never stops the rest.
// `onEntry(id, entry | null)` fires as each robot lands or fails, so the manifest can follow along.
export async function fetchArmor(robots, { force = false, jobs = 4, onEntry = () => {} } = {}) {
  const entries = new Map();
  const failures = [];
  const skipped = [];
  const dirsByRepo = new Map();
  for (const r of robots) dirsByRepo.set(r.repo, [...(dirsByRepo.get(r.repo) ?? []), ...r.dirs]);
  console.log(`armor: ${robots.length} robot(s), ${jobs} at a time`);

  await pool(robots, jobs, async (robot) => {
    const id = armorId(robot.slug);
    const cached = !force && cachedEntry(robot);
    if (cached) {
      entries.set(id, cached);
      onEntry(id, cached);
      return line('kept', id, `${cached.size_mb.toFixed(2)} MB`);
    }
    if (freeBytes(STUDIO) < MIN_FREE_BYTES) {
      skipped.push({ id, reason: 'free disk space below 20 GB' });
      return line('SKIP', id, 'free disk space below 20 GB');
    }
    const started = Date.now();
    try {
      const entry = armorEntry(robot, await prepareRobot(robot, dirsByRepo.get(robot.repo)));
      saveEntry(robot, entry);
      entries.set(id, entry);
      onEntry(id, entry);
      const secs = ((Date.now() - started) / 1000).toFixed(1);
      line('ok', id, `${String(entry.dof).padStart(2)} dof ${String(entry.chains.length).padStart(2)} chains ${entry.size_mb.toFixed(2).padStart(7)} MB  ${secs}s`);
    } catch (err) {
      fs.rmSync(path.join(ARMOR_OUT, robot.slug), { recursive: true, force: true });
      failures.push({ id, error: err.message });
      onEntry(id, null);
      line('FAIL', id, err.message.slice(0, 300));
    }
  });

  fs.mkdirSync(ARMOR_CACHE, { recursive: true });
  const report = { finished: new Date().toISOString(), built: entries.size, failures, skipped };
  fs.writeFileSync(path.join(ARMOR_CACHE, 'last-run.json'), `${JSON.stringify(report, null, 2)}\n`);
  return { entries, failures, skipped };
}
