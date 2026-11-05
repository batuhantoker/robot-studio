import { describe, expect, it } from 'vitest';
import { toPythonDict, toStudioDict } from '@/core/robot/io/export';
import { parseRobotJson } from '@/core/robot/schema/json';
import { parseRobot } from '@/core/robot/schema/parse';
import { homePose } from '@/core/robot/config/pose';
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

describe('a robot\'s own home', () => {
  const link = (name: string) => ({ name, axis: [0, 0, 1], offset: [0, 0, 0.1], mass: 1, limits: [-1, 1] });
  const robot = (home?: number[], links = [link('a'), link('b')]) => parseRobot({ units: 'SI', links, ...(home ? { home } : {}) });

  it('starts at zero without one, as analyze() does', () => {
    expect(homePose(robot())).toEqual([0, 0]);
  });

  it('starts at the given pose, held to the limits', () => {
    expect(homePose(robot([0.5, 2]))).toEqual([0.5, 1]);
  });

  it('falls back to zero once links are added and it no longer fits', () => {
    expect(homePose(robot([0.5, 0.5], [link('a'), link('b'), link('c')]))).toEqual([0, 0, 0]);
  });

  it('rejects anything but numbers', () => {
    expect(() => parseRobot({ units: 'SI', links: [link('a')], home: ['up'] })).toThrow(/home/);
  });

  it('stays in studio files and out of the Python format', () => {
    const spec = robot([0.5, 0.5]);
    expect(toStudioDict(spec).home).toEqual([0.5, 0.5]);
    expect(toPythonDict(spec)).not.toHaveProperty('home');
  });
});
