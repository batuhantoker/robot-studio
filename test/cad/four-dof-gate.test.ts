/** The 4-DOF Arm's design lives apart from its byte-identical file, so preset-gate never scans it. */
import fs from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { contactTol, moduleLabel } from '@/app/robots/contact';
import { homePose, reachEstimate } from '@/core/robot/config/pose';
import { parseRobot } from '@/core/robot/schema/parse';
import { hullChecker } from '@/physics/collision/from-hull';
import { contactProbe, crackedCastings, featureClashes, sameBodyOverlaps } from '../support/casting-gate';

const read = (path: string) => JSON.parse(fs.readFileSync(new URL(`../../presets/${path}.json`, import.meta.url), 'utf8'));

describe('the 4-DOF Arm passes the casting gate', () => {
  const spec = { ...parseRobot(read('serial-arm/original_4dof')), ...read('designs/original_4dof') };
  let probe: Awaited<ReturnType<typeof contactProbe>>;
  beforeAll(async () => { probe = await contactProbe(spec); });
  afterAll(() => probe.dispose());

  it('touches nothing at home, with no tolerance', () => expect([...probe.at(homePose(spec))]).toEqual([]));

  it('leaves the checker no pair to mask', async () => {
    const checker = (await hullChecker(probe.chain, probe.asm.hull!, { home: homePose(spec), floorZ: probe.asm.floorZ, tol: contactTol(reachEstimate(spec)), label: moduleLabel(probe.asm) }))!;
    expect((checker as unknown as { designed: Set<number> }).designed.size).toBe(0);
    expect(checker.hit(homePose(spec))).toBeNull();
    checker.dispose();
  });

  it('draws no part inside a casting of its own body', () => expect(sameBodyOverlaps(probe.asm, spec)).toEqual([]));
  it('has no feature cutting another', () => expect(featureClashes(spec)).toEqual([]));
  it('leaves no crack in a casting', () => expect(crackedCastings(probe.asm)).toEqual([]));

  it('gives every drawn body a hull', () => {
    const hulled = new Set(probe.asm.hull!.map((v) => v.module));
    for (const m of probe.asm.modules) if (m.id === 'base' || m.id.startsWith('link:')) expect(hulled.has(m.id), m.id).toBe(true);
  });
});
