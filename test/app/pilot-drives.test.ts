import { describe, expect, it } from 'vitest';
import { drivesOf } from '@/app/controller/pilot/rig';
import type { RobotSession } from '@/app/robots/session';
import { identityTransform } from '@/core/math/linear/transform';
import type { Body, BodyPart } from '@/core/motion/body';

const joint = (axis: number[], continuous = false) => ({ name: 'j', type: 'hinge', fixed: identityTransform(), axis, limits: [-3, 3], q0: 0, continuous });
const limb = (joints: ReturnType<typeof joint>[], first = 0) => ({
  name: 'limb', index: joints.map((_, k) => first + k),
  chain: { name: 'limb', base: identityTransform(), joints, tip: identityTransform(), masses: [], gravity: [0, 0, -9.81] },
});

const LEVEL = [0, 1, 0], UPRIGHT = [0, 0, 1];
const WHEEL = joint(LEVEL, true);

function robot(limbs: ReturnType<typeof limb>[], parts: number[][]) {
  const s = { limbs, home: Array(32).fill(0) } as unknown as RobotSession;
  const body = { parts: parts.map((members) => ({ kind: 'leg', limb: members.at(-1), limbs: members })) as BodyPart[] } as Body;
  return { s, body };
}

describe('Pilot drives', () => {
  it('finds the wheel when a shorter motor branch leads the leg, as on the Go2-W', () => {
    const leg = (at: number) => limb([joint(LEVEL), joint(LEVEL), joint(LEVEL), WHEEL], at);
    const motor = (at: number) => limb([joint(LEVEL), joint(LEVEL), joint(LEVEL)], at);
    const { s, body } = robot([leg(0), motor(0), leg(4), motor(4)], [[0, 1], [2, 3]]);
    expect(drivesOf(s, body)).toEqual(['wheels', 'legs']);
  });

  it('only rolls when there is too little leg above the wheel to step', () => {
    const { s, body } = robot([limb([WHEEL], 0), limb([WHEEL], 1)], [[0], [1]]);
    expect(drivesOf(s, body)).toEqual(['wheels']);
  });

  it('leaves ordinary legs to walk', () => {
    const leg = (at: number) => limb([joint(LEVEL), joint(LEVEL), joint(LEVEL)], at);
    const { s, body } = robot([leg(0), leg(3)], [[0], [1]]);
    expect(drivesOf(s, body)).toEqual([]);
  });

  it('does not take a free upright joint for a wheel', () => {
    const leg = (at: number) => limb([joint(LEVEL), joint(LEVEL), joint(UPRIGHT, true)], at);
    const { s, body } = robot([leg(0), leg(3)], [[0], [1]]);
    expect(drivesOf(s, body)).toEqual([]);
  });

  it('needs every leg to roll', () => {
    const { s, body } = robot([limb([joint(LEVEL), joint(LEVEL), WHEEL], 0), limb([joint(LEVEL), joint(LEVEL), joint(LEVEL)], 3)], [[0], [1]]);
    expect(drivesOf(s, body)).toEqual([]);
  });
});
