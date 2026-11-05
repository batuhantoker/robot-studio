/** The rollout gate: every preset with design data passes these, with no tolerance, or it is not done. */
import fs from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { contactTol, moduleLabel } from '@/app/robots/contact';
import { homePose, reachEstimate } from '@/core/robot/config/pose';
import { parseRobot } from '@/core/robot/schema/parse';
import { hullChecker } from '@/physics/collision/from-hull';
import { contactProbe, crackedCastings, featureClashes, sameBodyOverlaps, strokeEnds, strokeFaults } from '../support/casting-gate';

const DIR = new URL('../../presets/studio/', import.meta.url);
const json = (url: URL) => JSON.parse(fs.readFileSync(url, 'utf8'));
// The 4-DOF Arm's file stays byte-identical to the study, so what dresses it sits beside it.
const fourDof = { ...json(new URL('../serial-arm/original_4dof.json', DIR)), ...json(new URL('../designs/original_4dof.json', DIR)) };
const designed = [
  ...fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).map((f) => ({ id: f.replace('.json', ''), raw: json(new URL(f, DIR)) })).filter(({ raw }) => raw.design),
  { id: 'original_4dof', raw: fourDof },
];

for (const { id, raw } of designed) {
  describe(`${id} passes the casting gate`, () => {
    const spec = parseRobot(raw);
    let probe: Awaited<ReturnType<typeof contactProbe>>;
    beforeAll(async () => { probe = await contactProbe(spec); }, 60000);
    afterAll(() => probe.dispose());

    it('touches nothing at home, with no tolerance', () => expect([...probe.at(homePose(spec))]).toEqual([]));

    it('leaves the checker no pair to mask', async () => {
      const checker = (await hullChecker(probe.chain, probe.asm.hull!, { home: homePose(spec), floorZ: probe.asm.floorZ, tol: contactTol(reachEstimate(spec)), label: moduleLabel(probe.asm) }))!;
      expect((checker as unknown as { designed: Set<number> }).designed.size).toBe(0);
      expect(checker.hit(homePose(spec))).toBeNull();
      checker.dispose();
    });

    it('touches nothing at either end of any slide', () => {
      for (const q of strokeEnds(spec, homePose(spec))) expect([q, [...probe.at(q)]]).toEqual([q, []]);
    });

    it('keeps every bar in its guide and off its walls', () => expect(strokeFaults(probe.asm, spec)).toEqual([]));

    it('draws no part inside a casting of its own body', () => expect(sameBodyOverlaps(probe.asm, spec)).toEqual([]));
    it('has no feature cutting another', () => expect(featureClashes(spec)).toEqual([]));
    it('leaves no crack in a casting', () => expect(crackedCastings(probe.asm)).toEqual([]));

    it('gives every drawn body a hull', () => {
      const hulled = new Set(probe.asm.hull!.map((v) => v.module));
      for (const m of probe.asm.modules) if (m.id === 'base' || m.id.startsWith('link:')) expect(hulled.has(m.id), m.id).toBe(true);
    });
  });
}
