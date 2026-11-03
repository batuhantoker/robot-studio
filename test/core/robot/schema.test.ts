import { describe, expect, it } from 'vitest';
import { toPythonDict, toStudioDict } from '@/core/robot/io/export';
import { parseRobotJson } from '@/core/robot/schema/json';
import { parseRobot } from '@/core/robot/schema/parse';
import { python } from '../../support/fixtures';

describe('robot schema matches SerialArm.from_dict', () => {
  for (const c of python.validation) {
    it(`${c.name}: ${c.ok ? 'accepts' : 'rejects'}`, () => {
      if (c.ok) {
        expect(toPythonDict(parseRobot(c.config))).toEqual(c.normalized);
      } else {
        expect(() => parseRobot(c.config)).toThrow();
      }
    });
  }

  it('round-trips every preset through to_dict unchanged', () => {
    for (const [name, robot] of Object.entries(python.robots)) {
      expect(toPythonDict(parseRobot(robot.config)), name).toEqual(robot.config);
    }
  });

  it('rejects duplicate JSON keys like from_json', () => {
    expect(() => parseRobotJson('{"units":"SI","units":"SI","links":[]}')).toThrow(/duplicate JSON key: units/);
  });

  it('keeps non-revolute joints studio-only', () => {
    const spec = parseRobot({ units: 'SI', links: [{ name: 'rail', joint: 'prismatic', axis: [1, 0, 0], offset: [0, 0, 0.1], mass: 1 }] });
    expect(spec.links[0].dofs[0]).toMatchObject({ name: 'rail', type: 'slide', limits: [-0.1, 0.1] });
    expect(() => toPythonDict(spec)).toThrow(/revolute joints only/);
    expect((toStudioDict(spec).links as { joint: string }[])[0].joint).toBe('prismatic');
  });
});
