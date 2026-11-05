// Writes src/core/motion/stepping/gaits.json: for every robot on legs, per stepping motion, the rung that passed, or null if none did.
// The search takes seconds per robot, so it runs here and never while a robot opens.
import fs from 'node:fs';
import { it, vi } from 'vitest';
import { footingOf } from '@/app/controller/motion/footing';
import { sessionFromCatalog } from '@/app/robots/from-catalog';
import { bodyOf } from '@/core/motion/body';
import { steppersFor, steppingRung } from '@/core/motion/presets';

const PACK = 'public/robots/';
const OUT = 'src/core/motion/stepping/gaits.json';

it('finds a gait for every robot on legs', async () => {
  vi.stubGlobal('fetch', async (url: string) => new Response(fs.readFileSync(PACK + String(url).replace(/^.*robots\//, ''))));
  const table: Record<string, Record<string, number | null>> = {};
  for (const robot of JSON.parse(fs.readFileSync(`${PACK}index.json`, 'utf8')).robots) {
    if (robot.base === 'fixed' || robot.category === 'hand' || robot.category === 'arm') continue;
    const s = await sessionFromCatalog(robot);
    const body = bodyOf(s, s.home, s.category);
    const motions = steppersFor(body);
    if (motions.length) table[s.id] = Object.fromEntries(motions.map((m) => [m, steppingRung(m, s, s.home, footingOf(s), body)]));
    s.dispose();
  }
  const sorted = Object.fromEntries(Object.keys(table).sort().map((id) => [id, table[id]]));
  fs.writeFileSync(OUT, `${JSON.stringify(sorted, null, 1)}\n`);
});
