import { describe, expect, it } from 'vitest';
// @ts-expect-error The build scripts are plain JavaScript.
import { withHome } from '../../../scripts/robots/menagerie/studio.mjs';

const XML = '<mujoco><worldbody><body><joint name="a" axis="1 0 0"/><body><joint axis="0 1 0" name="b"/></body></body></worldbody></mujoco>\n';

describe('home keyframe', () => {
  it('fills a named pose in qpos order, the rest at zero', () => {
    expect(withHome(XML, { b: 1.5 }, 'robot')).toContain('<key name="home" qpos="0 1.5"/>');
  });

  it('refuses a joint the model does not have', () => {
    expect(() => withHome(XML, { nope: 1 }, 'robot')).toThrow(/no joint nope/);
  });

  it('leaves a model alone when no home is set', () => {
    expect(withHome(XML, undefined, 'robot')).toBe(XML);
  });
});
