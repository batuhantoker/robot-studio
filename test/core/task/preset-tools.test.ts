/** The library's presets with a gripper: on their castings, no pair masked, and a whole cycle planned. */
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { arrange, taskSetup } from '@/app/controller/task/setup';
import { sessionFromSpec } from '@/app/robots/from-spec';
import { pose } from '@/app/robots/session';
import { EFFECTOR_KINDS } from '@/core/robot/effectors/kinds';
import { parseRobot } from '@/core/robot/schema/parse';
import type { EffectorKind } from '@/core/robot/schema/types';
import { isClip, planTask } from '@/core/task/plan/check';

const DIR = new URL('../../../presets/studio/', import.meta.url);
const raws = fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).map((f) => ({ id: f.replace('.json', ''), raw: JSON.parse(fs.readFileSync(new URL(f, DIR), 'utf8')) }));
const ready = raws.filter(({ raw }) => raw.design);
// Decided by the tool each preset carries: a pen or bare flange has no cycle to plan, and must say so.
const holds = ({ raw }: { raw: Record<string, unknown> }) => EFFECTOR_KINDS[parseRobot(raw).effector].grips;

async function cycle(id: string, raw: Record<string, unknown>, effector?: EffectorKind) {
  const s = await sessionFromSpec(id, id, parseRobot(effector ? { ...raw, effector } : raw));
  expect((s.collision as unknown as { designed: Set<number> }).designed.size).toBe(0);
  expect(s.grips).toBe(true);
  expect(pose(s, s.home, 0).agreement).toBeLessThan(1e-9);
  const { setup: t, spots } = arrange(taskSetup(s, s.defaultFocus)!);
  expect(spots).not.toBeNull();
  expect(isClip(planTask({ ctx: t.ctx, home: t.home, pick: spots![0], place: spots![1], object: t.object, lift: t.lift, base: t.base }, t.probe))).toBe(true);
  s.dispose();
}

describe('a preset with a gripper', () => {
  it.each(ready.filter(holds))('$id plans its cycle with nothing masked', ({ id, raw }) => cycle(id, raw), 60_000);

  it.each(ready.filter((r) => !holds(r)))('$id has nothing to hold: no layout, and nothing masked', async ({ id, raw }) => {
    const s = await sessionFromSpec(id, id, parseRobot(raw));
    expect((s.collision as unknown as { designed: Set<number> }).designed.size).toBe(0);
    expect(s.grips).toBe(false);
    expect(taskSetup(s, s.defaultFocus)).toBeNull();
    s.dispose();
  }, 60_000);

  it.each(['three_finger', 'suction'] as EffectorKind[])('iiwa14 does the same with a %s', (kind) => cycle('iiwa14', raws.find((r) => r.id === 'iiwa14')!.raw, kind), 60_000);

  it('a tool that cannot hold offers no cycle', async () => {
    const s = await sessionFromSpec('iiwa14', 'iiwa14', parseRobot({ ...raws.find((r) => r.id === 'iiwa14')!.raw, effector: 'spindle' }));
    expect(s.grips).toBe(false);
    expect(taskSetup(s, s.defaultFocus)).toBeNull();
    s.dispose();
  });
});
