import { describe, expect, it } from 'vitest';
import type { Snapshot } from '@/app/live/bus';
import { HISTORY_SECONDS, LiveHistory, rates } from '@/app/live/history';
import { niceTicks } from '@/ui/widgets/chart';

const snap = (session: object, q = [0.1, 0.2], sim: object | null = null) => ({
  session, q, bias: [1, 2], sim, posed: { limbs: [{ tip: { p: [1, 2, 3] } }] }, limbs: [{ svd: { manipulability: 0.5 } }],
}) as unknown as Snapshot;

function recorder() {
  const clock = { now: 0 };
  return { clock, history: new LiveHistory(() => clock.now) };
}

describe('live history', () => {
  it('records in every mode, taking torque from the sim when there is one', () => {
    const { clock, history } = recorder();
    const robot = {};
    history.record(snap(robot));
    clock.now = 0.05;
    history.record(snap(robot, [0.3, 0.4], { applied: [7, 8], error: [0.01, 0.02] }));
    expect(history.samples.map((s) => s.tau)).toEqual([[1, 2], [7, 8]]);
    expect(history.samples.map((s) => s.error)).toEqual([null, [0.01, 0.02]]);
    expect(history.samples[1].t).toBeCloseTo(0.05);
  });

  it('copies the joint vector, which the caller reuses', () => {
    const { history } = recorder();
    const q = [1, 2];
    history.record(snap({}, q));
    q[0] = 9;
    expect(history.samples[0].q).toEqual([1, 2]);
  });

  it('starts over for a new robot, whose joints differ', () => {
    const { clock, history } = recorder();
    history.record(snap({}));
    clock.now = 1;
    history.record(snap({}));
    expect(history.samples).toHaveLength(1);
  });

  it('skips the gap of a hidden tab', () => {
    const { clock, history } = recorder();
    const robot = {};
    history.record(snap(robot));
    clock.now = 500;
    history.record(snap(robot));
    expect(history.samples[1].t - history.samples[0].t).toBeLessThanOrEqual(0.25);
  });

  it('keeps only the window', () => {
    const { clock, history } = recorder();
    const robot = {};
    for (let i = 0; i < 3000; i++) {
      clock.now = i * 0.05;
      history.record(snap(robot));
    }
    const { samples } = history;
    expect(samples.at(-1)!.t - samples[0].t).toBeLessThanOrEqual(HISTORY_SECONDS);
    expect(samples.length).toBeLessThanOrEqual(HISTORY_SECONDS * 20 + 1);
  });

  it('differentiates with the real spacing and has no first rate', () => {
    const r = rates([0, 0.05, 0.15], [0, 1, 3]);
    expect(r[0]).toBeNaN();
    expect(r.slice(1)).toEqual([20, 20]);
  });
});

describe('axis ticks', () => {
  it('covers the data with round steps', () => {
    const t = niceTicks(-3.2, 17.9);
    expect(t[0]).toBeLessThanOrEqual(-3.2);
    expect(t.at(-1)).toBeGreaterThanOrEqual(17.9);
    expect(new Set(t.slice(1).map((v, i) => +(v - t[i]).toFixed(9))).size).toBe(1);
  });

  it('holds still while data moves inside a step', () => {
    expect(niceTicks(0.1, 9.4)).toEqual(niceTicks(0.3, 9.7));
  });

  it('survives a flat signal', () => {
    expect(niceTicks(0, 0).length).toBeGreaterThan(0);
    expect(niceTicks(5, 5).every(Number.isFinite)).toBe(true);
  });
});
