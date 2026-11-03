import { describe, expect, it } from 'vitest';
import { addStop, removeStop, reorderStop, setStopOpts } from '@/app/controller/stops';
import { dragStop, stopTips } from '@/app/controller/modes/trajectory';
import { Store } from '@/app/state/store';
import type { StudioState } from '@/app/state/types';
import { chainFrames } from '@/core/chain/kinematics/frames';
import { mergeLimbs } from '@/core/chain/limbs/types';
import { chainFromSpec } from '@/core/chain/model/from-spec';
import type { Vec3 } from '@/core/math/linear/vec';
import { parseRobot } from '@/core/robot/schema/parse';
import { solveWholeBody } from '@/core/solvers/ik/multi';
import { quinticAt } from '@/core/trajectory/quintic/profile';
import { compile } from '@/core/trajectory/plan';
import { remap, reorder } from '@/core/trajectory/stops';
import { expectClose, presetSpec } from '../../support/fixtures';

const W = [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]];

describe('stop list', () => {
  it('reorder keeps every item, and remap follows the moved selection', () => {
    const items = ['a', 'b', 'c', 'd', 'e'];
    for (let from = 0; from < items.length; from++) {
      for (let to = 0; to < items.length; to++) {
        const out = reorder(items, from, to);
        expect(out[to]).toBe(items[from]);
        expect([...out].sort()).toEqual(items);
        for (let i = 0; i < items.length; i++) expect(out[remap(i, from, to)]).toBe(items[i]);
      }
    }
  });

  it('the playhead at a stop time sits exactly on that stop', () => {
    const duration = 7.3;
    const c = compile({ waypoints: W, duration });
    W.forEach((w, i) => {
      const t = c.arrive[i];
      expectClose(quinticAt(W, duration, t).q, w, 1e-12);
      expectClose(quinticAt(W, duration, t).qd, [0, 0], 1e-12);
      expect(c.segmentAt(t)).toBe(Math.min(i, W.length - 2));
    });
    expect(c.segmentAt(c.arrive[2] - 0.01)).toBe(1);
  });
});

const store = (patch: Partial<StudioState>) =>
  new Store({ waypoints: W, stopOpts: [], pace: 'even', selectedStop: null, mode: 'trajectory', playing: false, duration: 4, time: 0, q: [9, 9], ...patch } as unknown as StudioState);

describe('stop actions', () => {
  it('adds after the selected stop, halfway to the next, and selects it', () => {
    const s = store({});
    s.set({ selectedStop: 1 });
    addStop(s, null);
    expect(s.state.waypoints).toHaveLength(6);
    expect(s.state.waypoints[2]).toEqual([1, 0.5]);
    expect(s.state.selectedStop).toBe(2);
  });

  it('without a selection, drops the paused pose into the segment the playhead is in', () => {
    const s = store({});
    s.set({ time: compile({ waypoints: W, duration: 4 }).arrive[2] + 0.3 });
    addStop(s, [0.7, 1]);
    expect(s.state.waypoints[3]).toEqual([0.7, 1]);
    expect(s.state.selectedStop).toBe(3);
  });

  it('outside trajectory mode, adds the current pose before the closing stop', () => {
    const s = store({});
    s.set({ mode: 'pose' });
    addStop(s, null);
    expect(s.state.waypoints.at(-2)).toEqual([9, 9]);
    expect(s.state.waypoints.at(-1)).toEqual([0, 0]);
    expect(s.state.mode).toBe('trajectory');
  });

  it('remove and reorder keep the selection on the same stop', () => {
    const s = store({});
    s.set({ selectedStop: 3 });
    removeStop(s, 1);
    expect(s.state.waypoints[s.state.selectedStop!]).toEqual([0, 1]);
    reorderStop(s, s.state.selectedStop!, 0);
    expect(s.state.waypoints[0]).toEqual([0, 1]);
    expect(s.state.selectedStop).toBe(0);
    removeStop(s, 0);
    expect(s.state.selectedStop).toBeNull();
    while (s.state.waypoints.length > 2) removeStop(s, 0);
    removeStop(s, 0);
    expect(s.state.waypoints).toHaveLength(2);
  });

  it('a new hold lengthens the total instead of hurrying the moves', () => {
    const s = store({ stopOpts: [{}, {}, {}, {}, {}] });
    setStopOpts(s, 2, { hold: 0.8 });
    expect(s.state.duration).toBeCloseTo(4.8, 12);
    setStopOpts(s, 2, { via: true });
    expect(s.state.duration).toBeCloseTo(4, 12);
  });

  it('keeps each stop’s options with it through add, reorder and remove', () => {
    const s = store({ stopOpts: [{}, { via: true }, { via: true }, { hold: 1 }, {}] });
    s.set({ selectedStop: 1 });
    addStop(s, null);
    expect(s.state.stopOpts.map((o) => (o.via ? 'v' : o.hold ? 'h' : 's')).join('')).toBe('svvvhs');
    reorderStop(s, 4, 1);
    expect(s.state.stopOpts[1]).toEqual({ hold: 1 });
    removeStop(s, 1);
    expect(s.state.stopOpts).toHaveLength(s.state.waypoints.length);
    expect(s.state.stopOpts.some((o) => o.hold)).toBe(false);
  });
});

describe('dragging a stop', () => {
  it('moves only that stop, so its tool point follows the gizmo', () => {
    const chain = chainFromSpec(presetSpec('spatial_6link'));
    const { joints, limbs } = mergeLimbs([{ name: 'arm', chain, keys: chain.joints.map((j) => j.name) }]);
    const limits = joints.map((j) => j.limits);
    const waypoints = [joints.map(() => 0), joints.map(() => 0.3), joints.map(() => -0.3)];
    const before = stopTips(limits, limbs[0], waypoints);
    const goal: Vec3 = [before[1][0] + 0.03, before[1][1] - 0.02, before[1][2] + 0.02];
    const out = dragStop(limbs, joints, 0, waypoints, 1, goal);
    expect(out[0]).toBe(waypoints[0]);
    expect(out[2]).toBe(waypoints[2]);
    expectClose(chainFrames(limbs[0].chain, out[1]).tip.p, goal, 1e-4);
  });
});

describe('dragging a stop on a multi-limb robot', () => {
  it('moves the focused hand and pins the other one through the shared waist', () => {
    const arm = (side: 1 | -1) => chainFromSpec(parseRobot({
      units: 'SI',
      links: [
        { name: 'waist', axis: [0, 0, 1], offset: [0, 0.2 * side, 0.4], mass: 1 },
        { name: 'yaw', axis: [0, 0, 1], offset: [0.05, 0, 0], mass: 0.5 },
        { name: 'shoulder', axis: [0, 1, 0], offset: [0.2, 0, 0], mass: 0.5 },
        { name: 'elbow', axis: [0, 1, 0], offset: [0.2, 0, 0], mass: 0.3 },
        { name: 'hand', axis: [1, 0, 0], offset: [0.15, 0, 0], mass: 0.1 },
      ],
    }));
    const keys = (p: string) => ['waist', `${p}_yaw`, `${p}_shoulder`, `${p}_elbow`, `${p}_hand`];
    const { joints, limbs } = mergeLimbs([{ name: 'left', chain: arm(1), keys: keys('l') }, { name: 'right', chain: arm(-1), keys: keys('r') }]);
    const limits = joints.map((j) => j.limits);
    const stop = [0.2, 0, -0.4, 0.6, 0, 0, -0.4, 0.6, 0];
    const waypoints = [joints.map(() => 0), stop, joints.map(() => 0)];
    const right = stopTips(limits, limbs[1], waypoints)[1];
    // Sideways: reachable by the left arm's own yaw, but a plain solve shares it with the waist.
    const goal = stopTips(limits, limbs[0], [[0.2, 0.25, -0.3, 0.9, 0, 0, -0.4, 0.6, 0]])[0];
    const free = solveWholeBody(limbs, joints, [{ limb: 0, point: goal }], stop, { restarts: 0, maxIter: 200 }).q;
    expect(Math.hypot(...stopTips(limits, limbs[1], [free])[0].map((v, k) => v - right[k]))).toBeGreaterThan(1e-3);
    const out = dragStop(limbs, joints, 0, waypoints, 1, goal, 200);
    expect(out[0]).toBe(waypoints[0]);
    expectClose(stopTips(limits, limbs[0], out)[1], goal, 1e-4);
    expectClose(stopTips(limits, limbs[1], out)[1], right, 1e-4);
  });
});
