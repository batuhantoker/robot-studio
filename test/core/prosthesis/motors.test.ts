import { describe, expect, it } from 'vitest';
import { buildEntries } from '@/app/library/entries';
import { applyFilter } from '@/app/library/filter/apply';
import { EMPTY_FILTER } from '@/app/library/filter/types';
import type { Catalog, CatalogRobot } from '@/app/robots/catalog';
import { gripClip, gripPresets, openMotors } from '@/core/prosthesis/grips';
import { couple, gripMotors, jointsFor, motorMap, motorsOf, onLinkage, type Prosthesis } from '@/core/prosthesis/motors';
// @ts-expect-error plain JS fetch scripts
import { homeValues, synergyMotors } from '../../../scripts/robots/prosthetics/build.mjs';
// @ts-expect-error plain JS fetch scripts
import { PROSTHESES } from '../../../scripts/robots/prosthetics/catalog.mjs';

const PIP = { scale: 1.05851325, offset: 0.72349796 };
const finger: Prosthesis = {
  side: 'right',
  control: 'myoelectric',
  motors: [{ name: 'index', label: 'Index', range: [0, 1.74], home: 0.2, joints: [{ joint: 'mcp' }, { joint: 'pip', ...PIP }] }],
};
const joints: { name: string; limits: [number, number] }[] = [
  { name: 'wrist', limits: [-1, 1] }, { name: 'mcp', limits: [0, 1.74] }, { name: 'pip', limits: [0.766, 2.61] },
];

// A SoftHand 2 in miniature: closure moves both fingers alike, the slide closes one as the other opens.
const twoMotor: Prosthesis = {
  side: 'right',
  control: 'myoelectric',
  motors: [
    { name: 'synergy', label: 'Hand closure', range: [0, 1], home: 0.1, joints: [{ joint: 'thumb', scale: 0.8 }, { joint: 'middle', scale: 0.8 }, { joint: 'little', scale: 0.8 }] },
    { name: 'slide', label: 'Second synergy', range: [-1, 1], home: 0, joints: [{ joint: 'little', scale: 0.4 }, { joint: 'thumb', scale: -0.4 }] },
  ],
  grips: [
    { name: 'open', label: 'Open', motors: { synergy: 0.1, slide: 0 } },
    { name: 'pinch', label: 'Pinch', motors: { synergy: 0.3, slide: -0.6 } },
  ],
};
const digits: { name: string; limits: [number, number] }[] = [{ name: 'thumb', limits: [0, 0.8] }, { name: 'middle', limits: [0, 0.8] }, { name: 'little', limits: [0, 0.8] }];

describe('prosthesis motors', () => {
  it('drives the follower through the linkage and leaves other joints alone', () => {
    const map = motorMap(finger, joints);
    const q = jointsFor(map, [1], [0.3, 0, 0]);
    expect(q[0]).toBe(0.3);
    expect(q[1]).toBe(1);
    expect(q[2]).toBeCloseTo(PIP.scale + PIP.offset, 12);
    expect(motorsOf(map, q)[0]).toBeCloseTo(1, 9);
    expect(onLinkage(map, q)).toBe(true);
    expect(onLinkage(map, [0.3, 1, 0.9])).toBe(false);
  });

  it('lets the lead joint define the motor when a pose is off the linkage', () => {
    const map = motorMap(finger, joints);
    // A joint-by-joint motion bends the PIP on its own; the MCP still says where the motor is.
    expect(motorsOf(map, [0, 1, 0.9])[0]).toBeCloseTo(1, 2);
    expect(couple(map, [0, 1, 0.9])[2]).toBeCloseTo(PIP.offset + PIP.scale, 2);
  });

  it('clamps the motor to its range and each joint to its limits', () => {
    const map = motorMap(finger, joints);
    const [, mcp, pip] = jointsFor(map, [5], [0, 0, 0]);
    expect(mcp).toBe(1.74);
    expect(pip).toBeCloseTo(PIP.offset + PIP.scale * 1.74, 12);
    // At motor 0 the four-bar fit sits just under the PIP stop.
    expect(jointsFor(map, [0], [0, 0, 0])[2]).toBe(0.766);
  });

  it('rejects a motor that names a missing joint', () => {
    expect(() => motorMap(finger, joints.slice(1, 2))).toThrow(/no joint pip/);
  });

  it('sums two motors on a shared joint and reads both back, even with one joint at its stop', () => {
    const map = motorMap(twoMotor, digits);
    const q = jointsFor(map, [0.5, 0.5], [0, 0, 0]);
    expect(q[0]).toBeCloseTo(0.8 * 0.5 - 0.4 * 0.5, 12);
    expect(q[2]).toBeCloseTo(0.8 * 0.5 + 0.4 * 0.5, 12);
    const back = motorsOf(map, q);
    expect(back[0]).toBeCloseTo(0.5, 6);
    expect(back[1]).toBeCloseTo(0.5, 6);
    // Little hits its stop (0.8): thumb and middle still tell both motors apart.
    const stopped = jointsFor(map, [0.8, 0.6], [0, 0, 0]);
    expect(stopped[2]).toBe(0.8);
    expect(motorsOf(map, stopped)[0]).toBeCloseTo(0.8, 6);
    expect(motorsOf(map, stopped)[1]).toBeCloseTo(0.6, 6);
    expect(couple(map, stopped)).toEqual(stopped.map((v) => expect.closeTo(v, 9)));
  });

  it('plays a grip from the open hand into the grip and back', () => {
    const map = motorMap(twoMotor, digits);
    expect(gripPresets(map).map((p) => p.id)).toEqual(['grip-pinch']);
    expect(openMotors(map)).toEqual([0.1, 0]);
    const clip = gripClip(map, twoMotor.grips![1], [0, 0, 0], 1, 4);
    const at = (t: number) => motorsOf(map, clip.at(t));
    expect(at(0)[0]).toBeCloseTo(0.1, 6);
    expect(at(2)[0]).toBeCloseTo(0.3, 6);
    expect(at(2)[1]).toBeCloseTo(-0.6, 6);
    expect(gripMotors(map, { name: 'x', label: 'X', motors: { slide: 5 } }, [0.2, 0])).toEqual([0.2, 1]);
    // The pinch puts the little finger right on its open stop; the fit still recovers both motors.
    expect(clip.at(2)[2]).toBeCloseTo(0, 12);
  });

  it('drives every chain joint of each hand with catalog motors exactly once', () => {
    const hands = (PROSTHESES as { id: string; chains: { joints: string[] }[]; prosthesis: Prosthesis }[]).filter((h) => h.prosthesis.motors);
    expect(hands.length).toBeGreaterThan(0);
    for (const hand of hands) {
      const chainJoints = hand.chains.flatMap((c) => c.joints).sort();
      const driven = hand.prosthesis.motors.flatMap((m) => m.joints.map((j) => j.joint)).sort();
      expect(driven, hand.id).toEqual(chainJoints);
      for (const m of hand.prosthesis.motors) expect(m.home, `${hand.id} ${m.name}`).toBeGreaterThanOrEqual(m.range[0]);
      for (const m of hand.prosthesis.motors) expect(m.home, `${hand.id} ${m.name}`).toBeLessThanOrEqual(m.range[1]);
    }
  });

  it('names only real motors in every catalog grip, each with an open hand to start from', () => {
    type Hand = { id: string; synergy?: unknown; secondSynergy?: { name: string }; prosthesis: Prosthesis };
    for (const hand of PROSTHESES as Hand[]) {
      const names = hand.prosthesis.motors?.map((m) => m.name) ?? ['synergy', ...(hand.secondSynergy ? [hand.secondSynergy.name] : [])];
      const grips = hand.prosthesis.grips ?? [];
      expect(grips.some((g) => g.name === 'open'), hand.id).toBe(true);
      for (const g of grips) for (const m of Object.keys(g.motors)) expect(names, `${hand.id} ${g.name}`).toContain(m);
    }
  });

  it('turns a one-motor synergy into drives, read back through a joint that never stops first', () => {
    const xml = `<mujoco><worldbody>
      <joint name="syn" range="0 1"/><joint name="thumb_abd" range="0 1.5708"/><joint name="mid_abd" range="-0.5 0.5"/>
      <joint name="curl_a" range="0 0.785398"/><joint name="curl_b" range="0 0.785398"/></worldbody>
      <equality>
        <joint joint1="thumb_abd" joint2="syn" polycoef="0 2.04204 0 0 0"/>
        <joint joint1="mid_abd" joint2="syn" polycoef="0 0 0 0 0"/>
        <joint joint1="curl_a" joint2="syn" polycoef="0 0.785398 0 0 0"/>
        <joint joint1="curl_b" joint2="syn" polycoef="0 0.785398 0 0 0"/>
      </equality></mujoco>`;
    const hand = { id: 'h', chains: [], synergy: { joint: 'syn', label: 'Hand closure', home: 0.1 }, prosthesis: { side: 'right', control: 'myoelectric' } };
    const p = synergyMotors(hand, xml) as Prosthesis & { motorJoint: string };
    expect(p.motorJoint).toBe('syn');
    const [m] = p.motors;
    expect(m).toMatchObject({ unit: 'fraction', range: [0, 1], home: 0.1 });
    expect(m.joints.map((j) => j.joint)).toEqual(['curl_a', 'thumb_abd', 'mid_abd', 'curl_b']);
    const map = motorMap(p, [['thumb_abd', 1.5708], ['mid_abd', 0.5], ['curl_a', 0.785398], ['curl_b', 0.785398]].map(([name, hi]) => ({ name: name as string, limits: [name === 'mid_abd' ? -0.5 : 0, hi as number] as [number, number] })));
    const q = jointsFor(map, [0.9], [0, 0, 0, 0]);
    expect(q[0]).toBe(1.5708);
    expect(motorsOf(map, q)[0]).toBeCloseTo(0.9, 6);
    expect(() => synergyMotors(hand, xml.replace('joint2="syn" polycoef="0 0 0', 'joint2="other" polycoef="0 0 0'))).toThrow(/does not lead to syn/);
  });

  it('follows a rolling joint whose second hinge mimics the first (default polycoef) back to the motor', () => {
    const xml = `<mujoco><worldbody><joint name="syn" range="0 1"/><joint name="prox" range="0 0.785"/><joint name="prox_virtual" range="0 0.785"/></worldbody>
      <equality><joint joint1="prox" joint2="syn" polycoef="0 0.785 0 0 0"/><joint joint1="prox_virtual" joint2="prox"/></equality></mujoco>`;
    const hand = { id: 'h', chains: [], synergy: { joint: 'syn', label: 'Hand closure', home: 0 }, prosthesis: { side: 'left', control: 'myoelectric' } };
    const [m] = (synergyMotors(hand, xml) as Prosthesis).motors;
    expect(m.joints).toEqual([{ joint: 'prox', offset: 0, scale: 0.785 }, { joint: 'prox_virtual', offset: 0, scale: 0.785 }]);
    expect(() => synergyMotors(hand, xml.replace('joint2="prox"/>', 'joint2="prox_virtual"/>'))).toThrow(/does not lead/);
  });

  it('adds a second synergy that shares each joint, and a home pose that sums both motors', () => {
    const xml = `<mujoco><worldbody><joint name="syn" range="0 1"/><joint name="t" range="0 0.8"/><joint name="l" range="0 0.8"/><joint name="idle" range="-1 1"/></worldbody>
      <equality><joint joint1="t" joint2="syn" polycoef="0 0.8 0 0 0"/><joint joint1="l" joint2="syn" polycoef="0 0.8 0 0 0"/></equality></mujoco>`;
    const hand = {
      id: 'h', idle: ['idle'],
      chains: [{ name: 'thumb', joints: ['t'] }, { name: 'little', joints: ['l'] }],
      synergy: { joint: 'syn', label: 'Hand closure', home: 0.5 },
      secondSynergy: { name: 'slide', label: 'Second synergy', range: [-1, 1], home: 0.5, gain: 0.5, weights: { thumb: -1, little: 1 } },
      prosthesis: { side: 'right', control: 'myoelectric' },
    };
    const p = synergyMotors(hand, xml) as Prosthesis & { motorJoint: string };
    expect(p.motors.map((m) => m.name)).toEqual(['synergy', 'slide']);
    expect(p.motors[1].joints).toEqual(expect.arrayContaining([{ joint: 't', scale: -0.4, offset: 0 }, { joint: 'l', scale: 0.4, offset: 0 }]));
    const home = homeValues(hand, p, [{ name: 'syn', range: [0, 1] }, { name: 't', range: [0, 0.8] }, { name: 'l', range: [0, 0.8] }, { name: 'idle', range: [-1, 1] }]);
    expect(home[0]).toBe(0.5);
    expect(home[1]).toBeCloseTo(0.4 - 0.2, 12);
    expect(home[2]).toBeCloseTo(0.4 + 0.2, 12);
    expect(home[3]).toBe(0);
  });

  it('lists prostheses as their own library group, counted in motors', () => {
    const hand = PROSTHESES[0] as { id: string; title: string; maker: string; prosthesis: Prosthesis; tags: string[] };
    const robot = {
      id: hand.id, title: hand.title, maker: hand.maker, dof: 2, description: '', xml: 'x.xml', files: ['x.xml'], chain: null,
      category: 'hand', collection: 'prosthetics', joints_total: 10, tags: hand.tags, prosthesis: hand.prosthesis,
      license: { spdx: 'MIT', file: null, source: '' },
    } satisfies CatalogRobot;
    const catalog: Catalog = { version: 1, menagerie_commit: '', robots: [robot] };
    const [entry] = buildEntries(catalog, []).filter((e) => e.catalogId === hand.id);
    expect(entry).toMatchObject({ group: 'prosthesis', dof: 6, category: 'hand', id: `prosthesis:${hand.id}` });
    expect(applyFilter([entry], { ...EMPTY_FILTER, source: 'prosthesis' })).toEqual([entry]);
    expect(applyFilter([entry], { ...EMPTY_FILTER, source: 'cad' })).toEqual([]);
  });
});
