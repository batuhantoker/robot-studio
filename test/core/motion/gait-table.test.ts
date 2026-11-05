import fs from 'node:fs';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { footingOf } from '@/app/controller/motion/footing';
import { sessionFromCatalog } from '@/app/robots/from-catalog';
import { bodyOf } from '@/core/motion/body';
import table from '@/core/motion/stepping/gaits.json';
import { steppingRung } from '@/core/motion/presets';

const PACK = 'public/robots/';

// public/robots is fetched locally and never committed, so this only runs where the pack is.
describe.skipIf(!fs.existsSync(`${PACK}index.json`))('the generated gait table', () => {
  afterAll(() => vi.unstubAllGlobals());

  it('matches the live capability check for every robot it lists', async () => {
    vi.stubGlobal('fetch', async (url: string) => new Response(fs.readFileSync(PACK + String(url).replace(/^.*robots\//, ''))));
    const robots = JSON.parse(fs.readFileSync(`${PACK}index.json`, 'utf8')).robots;
    const wrong: string[] = [];
    // Catalog order, as the table was written: MuJoCo's 2 GB heap fragments in some other orders.
    for (const robot of robots.filter((r: { id: string }) => r.id in table)) {
      const s = await sessionFromCatalog(robot);
      for (const [motion, rung] of Object.entries((table as Record<string, Record<string, number | null>>)[s.id])) {
        const live = steppingRung(motion, s, s.home, footingOf(s), bodyOf(s, s.home, s.category));
        if (live !== rung) wrong.push(`${s.id} ${motion}: table ${rung}, live ${live}; run npm run motion:gaits`);
      }
      s.dispose();
    }
    expect(wrong).toEqual([]);
  }, 900_000);
});
