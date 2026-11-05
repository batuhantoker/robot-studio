import { describe, expect, it } from 'vitest';
import { twinName } from '@/app/controller/library-actions';
import { homePose } from '@/core/robot/config/pose';
import { addableKinds, kindChoices, misplacedJoint } from '@/core/robot/joints/placement';
import { parseRobot } from '@/core/robot/schema/parse';
import { addLink, blankRobot, moveLink, patchLink } from '@/ui/builder/edit';

const spec = (raw: Parameters<typeof parseRobot>[0]) => parseRobot(raw);

describe('where a joint kind may go', () => {
  it('takes a planar joint as the base stage and nowhere else', () => {
    const blank = blankRobot();
    expect(misplacedJoint(spec(blank))).toBeNull();
    const based = addLink(blank, 'planar');
    expect(based.links[0].joint).toBe('planar');
    expect(misplacedJoint(spec(based))).toBeNull();
    expect(misplacedJoint(spec(moveLink(based, 0, 1)))).toMatch(/can only be the first joint/);
    expect(misplacedJoint(spec(patchLink(blank, 2, { joint: 'planar', axis2: [1, 0, 0] })))).toMatch(/^elbow:/);
  });

  it('still parses a robot saved with one past the base, so it can be opened and fixed', () => {
    const saved = patchLink(blankRobot(), 2, { joint: 'planar', axis2: [1, 0, 0] });
    expect(() => parseRobot(saved)).not.toThrow();
    expect(kindChoices('planar', 2, false)).toContain('planar');
    expect(kindChoices('revolute', 2, false)).not.toContain('planar');
    expect(kindChoices('revolute', 0, false)).toContain('planar');
  });

  it('adds a planar base under a robot with a home, its joints in front', () => {
    const raw = { ...blankRobot(), home: [0.1, 0.2, 0.3] };
    const s = spec(addLink(raw, 'planar'));
    expect(homePose(s)).toEqual([0, 0, 0, 0.1, 0.2, 0.3]);
    expect(addableKinds(s, false)).not.toContain('planar');
    expect(addableKinds(spec(raw), false)).toContain('planar');
  });

  it('keeps a twin\'s real joints what they are, and lets a saved odd one go back', () => {
    expect(kindChoices('revolute', 3, true)).toEqual(['revolute']);
    expect(kindChoices('prismatic', 0, true)).toEqual(['prismatic']);
    expect(kindChoices('planar', 5, true)).toEqual(['planar', 'revolute']);
    expect(addableKinds(spec(blankRobot()), true)).toEqual(['revolute']);
  });
});

describe('a twin\'s name', () => {
  it('reads as the robot it came from, with the limb when there are several', () => {
    expect(twinName('Yaskawa Motoman MH5', null, [])).toBe('Yaskawa Motoman MH5 (editable)');
    expect(twinName('ABB YuMi', 'right arm', [])).toBe('ABB YuMi, right arm (editable)');
    expect(twinName('Yaskawa Motoman MH5', null, ['Yaskawa Motoman MH5 (editable)'])).toBe('Yaskawa Motoman MH5 (editable 2)');
    expect(() => parseRobot({ ...blankRobot(), name: twinName('ABB YuMi', 'right arm', []) })).not.toThrow();
  });
});
