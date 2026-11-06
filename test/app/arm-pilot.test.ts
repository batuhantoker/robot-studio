import { readFileSync, existsSync } from 'node:fs';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { armLimb, drivesArm } from '@/app/controller/pilot/arm';
import type { CatalogRobot } from '@/app/robots/catalog';
import { sessionFromCatalog } from '@/app/robots/from-catalog';
import { sessionFromSpec } from '@/app/robots/from-spec';
import { parseRobot } from '@/core/robot/schema/parse';

const ROOT = 'public/robots/';
const pack = existsSync(`${ROOT}index.json`);
const preset = (id: string) => parseRobot(JSON.parse(readFileSync(`presets/studio/${id}.json`, 'utf8')));

describe('which robots Pilot steers by the tool', () => {
  it('takes any preset arm, and leaves the pendulum out', async () => {
    const arm = await sessionFromSpec('preset:panda', 'Panda', preset('panda'));
    const pendulum = await sessionFromSpec('preset:double_pendulum', 'Double Pendulum', preset('double_pendulum'));
    expect(drivesArm(arm)).toBe(true);
    expect(armLimb(arm, 0)).toBe(0);
    expect(drivesArm(pendulum)).toBe(false);
    arm.dispose();
    pendulum.dispose();
  });
});

describe.skipIf(!pack)('on real robots', () => {
  vi.stubGlobal('fetch', async (u: string) => new Response(readFileSync(ROOT + String(u).replace(/^.*?robots\//, ''))));
  afterAll(() => vi.unstubAllGlobals());
  const robots: CatalogRobot[] = pack ? JSON.parse(readFileSync(`${ROOT}index.json`, 'utf8')).robots : [];
  const open = (id: string, tool: 'parallel' | null = null) => sessionFromCatalog(robots.find((r) => r.id === id)!, undefined, tool);

  it('drives the focused arm of a pair, its gripper first', async () => {
    const s = await open('armor-abb-yumi', 'parallel');
    const gripped = s.rigs.flatMap((r, i) => (r?.grip ? [i] : []));
    expect(gripped.length).toBe(2);
    for (const limb of gripped) expect(armLimb(s, limb)).toBe(limb);
    expect(drivesArm(s)).toBe(true);
    s.dispose();
  });

  it('takes a bare arm too', async () => {
    const s = await open('ur5e');
    expect(drivesArm(s)).toBe(true);
    expect(s.rigs[armLimb(s, 0)]?.grip ?? null).toBeNull();
    s.dispose();
  });

  it('leaves out what has no arm', async () => {
    const s = await open('armor-crazyflie');
    expect(drivesArm(s)).toBe(false);
    s.dispose();
  });
});
