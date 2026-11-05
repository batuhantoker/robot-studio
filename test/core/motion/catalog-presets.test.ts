import fs from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { footingOf } from '@/app/controller/motion/footing';
import { sessionFromCatalog } from '@/app/robots/from-catalog';
import { sessionFromSpec } from '@/app/robots/from-spec';
import type { RobotSession } from '@/app/robots/session';
import { presetsFor } from '@/core/motion/presets';
import { parseRobot } from '@/core/robot/schema/parse';

const PACK = 'public/robots/';
const fetched = fs.existsSync(`${PACK}index.json`);
const SPECS = ['presets/studio', 'presets/serial-arm'];

// Straight at presetsFor, not through the player, whose catch would hide exactly what this looks for.
const offers = (s: RobotSession) => presetsFor(s, s.home, s.category, { footing: () => footingOf(s) }).map((p) => p.id);

function sweep(load: () => Promise<RobotSession>, label: string, failed: string[]) {
  return load().then((s) => {
    try {
      expect(offers(s)).toBeInstanceOf(Array);
    } catch (e) {
      failed.push(`${label}: ${e}`);
    } finally {
      s.dispose();
    }
  }, (e) => failed.push(`${label}: did not load: ${e}`));
}

describe('every robot can list its motions', () => {
  afterAll(() => vi.unstubAllGlobals());

  it('builds a preset list for each studio preset', async () => {
    const failed: string[] = [];
    for (const dir of SPECS) {
      for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
        const raw = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
        if (!raw.links) continue;
        await sweep(() => sessionFromSpec(f, f, parseRobot(raw)), f, failed);
      }
    }
    expect(failed).toEqual([]);
  }, 300_000);

  // public/robots is fetched locally and never committed, so this only runs where the pack is.
  it.skipIf(!fetched)('builds a preset list for every robot in the catalog', async () => {
    vi.stubGlobal('fetch', async (url: string) => new Response(fs.readFileSync(PACK + String(url).replace(/^.*robots\//, ''))));
    const failed: string[] = [];
    for (const robot of JSON.parse(fs.readFileSync(`${PACK}index.json`, 'utf8')).robots) {
      await sweep(() => sessionFromCatalog(robot), robot.id, failed);
    }
    expect(failed).toEqual([]);
  }, 900_000);
});
