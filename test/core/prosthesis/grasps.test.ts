import { describe, expect, it } from 'vitest';
import { GraspController } from '@/app/controller/grasp/controller';
import { rodrigues } from '@/core/math/linear/mat3';
import { presetsFor } from '@/core/motion/presets';
import type { Limb } from '@/core/chain/limbs/types';
import { CONTACT, closeOn, type HandSurface, type Held, linkGap, lowestPoint } from '@/core/prosthesis/closure';
import { countClip, digitMotors, synergyClip } from '@/core/prosthesis/gesture';
import { type Grasp, graspClip, mirrored, solveGrasp } from '@/core/prosthesis/grasp';
import { GRASPS } from '@/core/prosthesis/grasps';
import type { HeldShape } from '@/core/prosthesis/held';
import { standRods } from '@/core/prosthesis/stand';
import { type MotorMap, motorMap, type Prosthesis } from '@/core/prosthesis/motors';
// @ts-expect-error plain JS fetch scripts
import { PROSTHESES } from '../../../scripts/robots/prosthetics/catalog.mjs';

describe('hand grasps', () => {
  it('loads the way the app does: the table builds at import and the controller resolves', () => {
    expect(typeof GraspController).toBe('function');
    expect(Object.keys(GRASPS).length).toBeGreaterThan(0);
  });

  it('gives every grasp a stand and a closing order over digits it defines', () => {
    for (const grasps of Object.values(GRASPS)) {
      for (const g of grasps) {
        expect(g.stand.at).toHaveLength(3);
        for (const d of g.order.flat()) expect(g.digits[d]).toBeDefined();
      }
    }
  });

  it('gives every catalog hand something to do, and names no others', () => {
    const ids = PROSTHESES.map((h: { id: string }) => h.id);
    expect(Object.keys(GRASPS).sort()).toEqual([...ids].sort());
    for (const id of ids) expect(GRASPS[id].length).toBeGreaterThan(0);
  });

  it('leaves a hand no generic motions: a joint wave is not something a hand does', () => {
    expect(presetsFor({ joints: [], limbs: [] }, [], 'hand')).toEqual([]);
  });
});

/** One finger of one link on a hinge at the origin, its samples along +z, closing about +y towards +x. */
const hinge = (): { surface: HandSurface; map: MotorMap } => {
  const p = Prosthesis();
  const map = motorMap(p, [{ name: 'j', limits: [0, 3] }]);
  const points = Float64Array.from(Array.from({ length: 11 }, (_, i) => [0, 0, i * 0.01]).flat());
  const surface: HandSurface = {
    links: [{ name: 'link', finger: 'index', joints: [0], points }],
    frames: ([a]) => [{ p: [0, 0, 0], R: rodrigues([0, 1, 0], a) }],
  };
  return { surface, map };
};

function Prosthesis(): Prosthesis {
  return {
    side: 'right', control: 'myoelectric',
    motors: [{ name: 'm', label: 'M', range: [0, 3], home: 0, joints: [{ joint: 'j' }] }],
    grips: [{ name: 'open', label: 'Open', motors: { m: 0 } }],
  };
}

const ball: HeldShape = { kind: 'ball', radius: 0.02 };
const grasp: Grasp = {
  name: 'g', label: 'G', hint: '', shape: ball,
  at: { p: [0.08, 0, 0.06], R: rodrigues([1, 0, 0], 0) },
  stand: { at: [0.08, 0, 0.04], side: -1 },
  order: [['index']],
  digits: { index: { close: { m: 1 } } },
};

describe('closing on an object', () => {
  it('stops at the surface, not at a fixed curl, and every step on the way stays clear', () => {
    const { surface, map } = hinge();
    const c = closeOn(surface, map, [0], [0], [{ motor: 0, rate: 1, stop: 3 }], [0], { shape: ball, pose: grasp.at });
    const end = c.path[c.path.length - 1];
    expect(end[0]).toBeLessThan(1.5);
    expect(linkGap(surface.links[0], surface.frames(end)[0], { shape: ball, pose: grasp.at })).toBeCloseTo(CONTACT, 4);
    for (const u of c.path) expect(linkGap(surface.links[0], surface.frames(u)[0], { shape: ball, pose: grasp.at })).toBeGreaterThanOrEqual(CONTACT - 1e-9);
    expect(c.touching).toEqual([0]);
  });

  it('gives up at its stop when the object is out of reach', () => {
    const { surface, map } = hinge();
    const far = { shape: ball, pose: { p: [0.5, 0, 0], R: grasp.at.R } as Held['pose'] };
    const c = closeOn(surface, map, [0], [0], [{ motor: 0, rate: 1, stop: 1 }], [0], far);
    expect(c.path[c.path.length - 1][0]).toBe(1);
    expect(c.touching).toEqual([]);
  });
});

describe('the grip cycle', () => {
  const { surface, map } = hinge();
  const plan = solveGrasp(grasp, map, surface, [0], () => false);
  const clip = graspClip(plan, map, [0], plan.open);

  it('moves the object only with the stand, and holds it still while the stand is away', () => {
    const { contact, hold } = clip.beats;
    for (let t = contact; t < hold; t += 0.05) expect(clip.held(t).p).toEqual(plan.held.pose.p);
    expect(Math.hypot(...clip.stand(hold))).toBeGreaterThan(0.05);
    expect(Math.hypot(...clip.stand(contact))).toBeCloseTo(0, 6);
    const start = clip.held(0).p, seat = plan.held.pose.p;
    expect(Math.hypot(start[0] - seat[0], start[1] - seat[1], start[2] - seat[2])).toBeGreaterThan(0.1);
  });

  it('starts and ends the loop in the same place, open and parked', () => {
    expect(clip.at(0)).toEqual(clip.at(clip.period - 1e-9));
    expect(clip.held(0).p[0]).toBeCloseTo(clip.held(clip.period - 1e-9).p[0], 6);
    expect(clip.stand(0)[2]).toBeCloseTo(clip.stand(clip.period - 1e-9)[2], 6);
  });

  it('mirrors a grip for the other hand, stand and all', () => {
    const left = mirrored(grasp);
    expect(left.at.p[0]).toBe(-grasp.at.p[0]);
    expect(left.stand.at[0]).toBe(-grasp.stand.at[0]);
    expect(left.stand.side).toBe(1);
  });
});

describe('a fixed rail', () => {
  const { surface, map } = hinge();
  const rail: Grasp = { ...grasp, stand: { at: [0.08, 0, 0.06], side: -1, posts: [[-0.1, 0, 0.06], [0.1, 0, 0.06]] } };
  const plan = solveGrasp(rail, map, surface, [0], () => false);
  const clip = graspClip(plan, map, [0], plan.open);

  it('never moves: it is the hand that comes to it', () => {
    for (let t = 0; t < clip.period; t += 0.2) {
      expect(clip.held(t).p).toEqual(plan.held.pose.p);
      expect(clip.stand(t)).toEqual([0, 0, 0]);
    }
  });

  it('stands on two posts down to the floor', () => {
    const rods = standRods(rail.stand, [0, 0, 0], -0.1).filter((r) => r.b[2] === -0.1);
    expect(rods).toHaveLength(2);
  });

  it('keeps both posts when mirrored', () => {
    expect(mirrored(rail).stand.posts?.map((p) => p[0])).toEqual([0.1, -0.1]);
  });
});

describe('the floor', () => {
  it('is the lowest the hand reaches, wherever the model puts it', () => {
    const { surface } = hinge();
    expect(lowestPoint(surface, [0])).toBeCloseTo(0, 9);
    expect(lowestPoint(surface, [Math.PI])).toBeCloseTo(-0.1, 9);
  });

  it('keeps a low stand above it, going out sideways instead of through it', () => {
    const { surface, map } = hinge();
    const low: Grasp = { ...grasp, stand: { at: [0.08, 0, 0.04], side: -1, tip: 0.03 } };
    const plan = solveGrasp(low, map, surface, [0], () => false);
    const clip = graspClip({ ...plan, floor: 0 }, map, [0], plan.open);
    const arm = (t: number) => standRods(low.stand, clip.stand(t), 0)[1].a[2];
    for (let t = 0; t < clip.period; t += 0.1) expect(arm(t)).toBeGreaterThanOrEqual(0);
    expect(clip.stand(clip.beats.hold)[0]).toBeLessThan(-0.05);
  });
});

/** Two digits on their own motors, and a pointing grip for the fist. */
const twoDigits = () => {
  const p: Prosthesis = {
    side: 'right', control: 'myoelectric',
    motors: [
      { name: 'i', label: 'I', range: [0, 2], home: 0, joints: [{ joint: 'a' }] },
      { name: 'm', label: 'M', range: [0, 2], home: 0, joints: [{ joint: 'b' }] },
      { name: 't', label: 'T', range: [0, 2], home: 0, joints: [{ joint: 'c' }] },
    ],
    grips: [{ name: 'open', label: 'Open', motors: { i: 0, m: 0, t: 0 } }, { name: 'point', label: 'Point', motors: { i: 0, m: 1.5, t: 1 } }],
  };
  const map = motorMap(p, ['a', 'b', 'c'].map((name) => ({ name, limits: [0, 2] as [number, number] })));
  const limbs = [['index', 0], ['middle', 1], ['thumb', 2]].map(([name, k]) => ({ name, index: [k] })) as unknown as Limb[];
  return { map, limbs };
};

describe('counting', () => {
  const { map, limbs } = twoDigits();
  const clip = countClip(map, limbs, [0, 0, 0], [0, 0, 0], { across: { t: 1.7 } })!;
  const samples = Array.from({ length: 400 }, (_, i) => clip.at((clip.period * i) / 400));

  it('makes a fist, the index folding as the middle finger does', () => {
    expect(Math.max(...samples.map((q) => q[0]))).toBeCloseTo(1.5, 3);
  });

  it('raises the index before the middle finger, and the thumb last', () => {
    const lastDown = (k: number) => samples.reduce((n, q, i) => (q[k] > 0.05 ? i : n), 0);
    expect(lastDown(0)).toBeLessThan(lastDown(1));
    expect(lastDown(1)).toBeLessThan(lastDown(2));
  });

  it('folds the thumb out of the count while the fingers rise', () => {
    expect(Math.max(...samples.map((q) => q[2]))).toBeCloseTo(1.7, 3);
  });

  it('ends open, where it starts', () => {
    expect(clip.at(clip.period - 1e-6).every((v) => Math.abs(v) < 1e-6)).toBe(true);
  });

  it('needs a motor per digit: a synergy cannot count', () => {
    const p: Prosthesis = { side: 'right', control: 'myoelectric', motors: [{ name: 's', label: 'S', range: [0, 1], home: 0, joints: [{ joint: 'a' }, { joint: 'b' }, { joint: 'c' }] }], grips: [{ name: 'open', label: 'O', motors: { s: 0 } }, { name: 'point', label: 'P', motors: { s: 1 } }] };
    const synergy = motorMap(p, ['a', 'b', 'c'].map((name) => ({ name, limits: [0, 2] as [number, number] })));
    expect(digitMotors(synergy, limbs)).toBeNull();
    expect(countClip(synergy, limbs, [0, 0, 0], [0])).toBeNull();
  });
});

describe('the synergy gesture', () => {
  it('walks the catalog grips from the open hand and back to it', () => {
    const { map } = twoDigits();
    const clip = synergyClip(map, [0, 0, 0], [0, 0, 0]);
    expect(clip.at(0)).toEqual([0, 0, 0]);
    expect(clip.at(clip.period - 1e-6).every((v) => Math.abs(v) < 1e-6)).toBe(true);
    expect(Math.max(...Array.from({ length: 100 }, (_, i) => clip.at((clip.period * i) / 100)[1]))).toBeCloseTo(1.5, 3);
  });
});
