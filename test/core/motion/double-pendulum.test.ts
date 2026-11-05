import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contactTol, moduleLabel } from '@/app/robots/contact';
import { chainFromSpec } from '@/core/chain/model/from-spec';
import { toMjcf } from '@/core/mjcf/writer/serial-arm';
import { type Bars, type State, barsOf, energy, pendulumClip, pendulumMotions, rates, stateOf, step } from '@/core/motion/generators/double-pendulum';
import { DRIVEN_MODES, isPassive } from '@/core/robot/config/passive';
import { reachEstimate } from '@/core/robot/config/pose';
import { pythonIncompatibility, toStudioDict } from '@/core/robot/io/export';
import { parseRobot } from '@/core/robot/schema/parse';
import { hullChecker } from '@/physics/collision/from-hull';
import { ModelHandle } from '@/physics/model/handle';
import { state } from '@/physics/runtime/arrays';
import { contactProbe } from '../../support/casting-gate';

const json = (name: string) => JSON.parse(fs.readFileSync(`presets/studio/${name}.json`, 'utf8'));
const spec = parseRobot(json('double_pendulum'));
const bars = barsOf(spec) as Bars;
const H = 0.002;

const run = (s: State, seconds: number, each?: (s: State, t: number) => void): State => {
  for (let i = 1; i <= seconds / H; i++) {
    s = step(bars, s, H);
    each?.(s, i * H);
  }
  return s;
};

describe('double pendulum dynamics', () => {
  it('conserves energy over a chaotic run, with nothing to damp it', () => {
    const s = stateOf(spec.home!), e0 = energy(bars, s);
    const scale = bars.g * (bars.m[0] * bars.c[0] + bars.m[1] * (bars.l[0] + bars.c[1]));
    let worst = 0;
    run(s, 40, (x) => (worst = Math.max(worst, Math.abs(energy(bars, x) - e0))));
    expect(worst / scale).toBeLessThan(1e-4);
  });

  it('accelerates exactly as MuJoCo does, in any state', async () => {
    const h = await ModelHandle.fromXml(toMjcf(spec));
    try {
      const d = state(h.data);
      for (const [q1, q2, v1, v2] of [[2.2, 0.5, 0, 0], [1, -2, 3, -4], [-0.7, 1.3, 6, 2], [0.1, 0.1, 0, 0], [3, 3, -9, 7]]) {
        [d.qpos[0], d.qpos[1], d.qvel[0], d.qvel[1]] = [q1, q2, v1, v2];
        h.mj.mj_forward(h.model, h.data);
        const r = rates(bars, [q1, q1 + q2, v1, v1 + v2]);
        expect(r[2]).toBeCloseTo(d.qacc[0], 6);
        expect(r[3] - r[2]).toBeCloseTo(d.qacc[1], 6);
      }
    } finally {
      h.dispose();
    }
  });

  it('is chaotic from high up and regular from low down', () => {
    const apart = (q: number[], gap: number, seconds: number) => {
      let a = stateOf(q), b = stateOf([q[0] + gap, q[1]]), most = 0;
      for (let i = 0; i < seconds / H; i++) {
        a = step(bars, a, H);
        b = step(bars, b, H);
        most = Math.max(most, Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]));
      }
      return most;
    };
    expect(apart(spec.home!, 1e-6, 2)).toBeLessThan(1e-3);
    expect(apart(spec.home!, 1e-6, 15)).toBeGreaterThan(0.3);
    expect(apart([0.4, 0.1], 1e-6, 40)).toBeLessThan(1e-3);
  });

  it('flips over: nothing stops a bar at half a turn', () => {
    let most = 0;
    run(stateOf(spec.home!), 20, (s) => (most = Math.max(most, Math.abs(s[1]))));
    expect(most).toBeGreaterThan(2 * Math.PI);
  });
});

describe('double pendulum motions', () => {
  const q0 = spec.home!;

  it('starts at the pose it was let go from, and is lifted back to it', () => {
    const clip = pendulumClip(spec, bars, q0, 1, 0);
    clip.at(0).forEach((v, i) => expect(v).toBeCloseTo(q0[i], 5));
    const wrapped = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
    clip.at(clip.period - 1e-3).forEach((v, i) => expect(wrapped(v, q0[i])).toBeLessThan(1e-3));
  });

  it('plays what the integrator says', () => {
    const clip = pendulumClip(spec, bars, q0, 1, 0);
    const s = run(stateOf(q0), 3);
    expect(clip.at(3)[0]).toBeCloseTo(s[0], 3);
    expect(clip.at(3)[1]).toBeCloseTo(s[1] - s[0], 3);
  });

  it('runs a fan that starts as one bar and comes apart', () => {
    const clip = pendulumClip(spec, bars, q0, 20, 1e-6), fan = clip.fan!, out = new Float32Array(4 * fan.count);
    const spreadAt = (t: number) => {
      fan.at(t, out);
      const tips = Array.from({ length: fan.count }, (_, k) => [out[4 * k + 2], out[4 * k + 3]]);
      return Math.max(...tips.map(([x, z]) => Math.hypot(x - tips[0][0], z - tips[0][1])));
    };
    expect(fan.count).toBe(20);
    expect(spreadAt(0)).toBeLessThan(1e-5);
    expect(spreadAt(1)).toBeLessThan(1e-3);
    expect(spreadAt(20)).toBeGreaterThan(0.1);
  });

  it('starts every fan from the pose you set', () => {
    const q = [1.1, -0.4], fan = pendulumClip(spec, bars, q, 5, 1e-6).fan!, out = new Float32Array(20);
    fan.at(0, out);
    expect(out[2]).toBeCloseTo(spec.base[0] - bars.l[0] * Math.sin(q[0]) - bars.l[1] * Math.sin(q[0] + q[1]), 4);
  });

  it('offers only what bars on pins can do', () => {
    expect(pendulumMotions(spec).map((p) => p.id)).toEqual(['release', 'fan', 'swarm']);
    expect(DRIVEN_MODES).toEqual(['task', 'trajectory']);
  });
});

describe('a passive robot', () => {
  it('turns all the way round, either bar, and touches nothing', async () => {
    const probe = await contactProbe(spec);
    const checker = (await hullChecker(probe.chain, probe.asm.hull!, { home: spec.home!, floorZ: probe.asm.floorZ, tol: contactTol(reachEstimate(spec)), label: moduleLabel(probe.asm) }))!;
    try {
      for (let a = 0; a < 36; a++) for (let b = 0; b < 36; b++) {
        const q = [(a / 36) * 2 * Math.PI, (b / 36) * 2 * Math.PI];
        expect([q, checker.hit(q)]).toEqual([q, null]);
      }
    } finally {
      checker.dispose();
      probe.dispose();
    }
  }, 60000);

  it('is told apart by its pins', () => {
    expect(isPassive(spec)).toBe(true);
    expect(isPassive(parseRobot(json('planar_2r')))).toBe(false);
    expect(isPassive(null)).toBe(false);
  });

  it('has joints with no stops, in the chain and the model', () => {
    expect(chainFromSpec(spec).joints.every((j) => j.continuous)).toBe(true);
    const xml = toMjcf(spec);
    expect(xml).not.toContain('range="-3.14');
    expect(xml.match(/limited="false"/g)).toHaveLength(2);
    expect(toMjcf(parseRobot(json('planar_2r')))).toContain('limited="true"');
  });

  it('keeps that through the studio format, and the Python package refuses it', () => {
    expect(parseRobot(toStudioDict(spec)).links.every((l) => l.continuous)).toBe(true);
    expect(pythonIncompatibility(spec)).toMatch(/continuous/);
  });

  it('has no model to integrate once its bars are not a hanging pair', () => {
    const raw = json('double_pendulum');
    raw.links[1].offset = [0.1, 0, -0.25];
    expect(barsOf(parseRobot(raw))).toBeNull();
    expect(pendulumMotions(parseRobot(raw))).toEqual([]);
  });
});
