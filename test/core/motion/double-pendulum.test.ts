import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contactTol, moduleLabel } from '@/app/robots/contact';
import { chainFromSpec } from '@/core/chain/model/from-spec';
import { toMjcf } from '@/core/mjcf/writer/serial-arm';
import { type Bars, type State, barsOf, energy, pendulumClip, pendulumMotions, rates, stateOf, step } from '@/core/motion/generators/double-pendulum';
import { isPendulum } from '@/core/robot/config/pendulum';
import { reachEstimate } from '@/core/robot/config/pose';
import { parseRobot } from '@/core/robot/schema/parse';
import { hullChecker } from '@/physics/collision/from-hull';
import { ModelHandle } from '@/physics/model/handle';
import { OBJ, arrays, state } from '@/physics/runtime/arrays';
import { contactProbe } from '../../support/casting-gate';

const json = (name: string) => JSON.parse(fs.readFileSync(`presets/studio/${name}.json`, 'utf8'));
const spec = parseRobot(json('double_pendulum'));
const bars = barsOf(spec) as Bars;
const H = 0.002;
/** design C.1, model_1.1, as published. */
const MODEL = {
  l1: 0.2, l2: 0.3, m1: 0.5234602302310271, m2: 0.6255677234174437, r1: 0.2, r2: 0.25569305436052964,
  I1: 0.031887199591513114, I2: 0.05086984812807257,
};

const run = (s: State, seconds: number, each?: (s: State, t: number) => void): State => {
  for (let i = 1; i <= seconds / H; i++) {
    s = step(bars, s, H);
    each?.(s, i * H);
  }
  return s;
};

describe('the identified model', () => {
  it('is what the spec says, the published inertias being about the joints', () => {
    expect(bars.l).toEqual([MODEL.l1, MODEL.l2]);
    expect(bars.m).toEqual([MODEL.m1, MODEL.m2]);
    expect(bars.c).toEqual([MODEL.r1, MODEL.r2]);
    expect(bars.I[0] + bars.m[0] * bars.c[0] ** 2).toBeCloseTo(MODEL.I1, 12);
    expect(bars.I[1] + bars.m[1] * bars.c[1] ** 2).toBeCloseTo(MODEL.I2, 12);
    expect(spec.links.map((l) => l.torque_limit)).toEqual([6, 6]);
  });

  it('is what MuJoCo compiles, not a capsule', async () => {
    const h = await ModelHandle.fromXml(toMjcf(spec));
    try {
      const m = arrays(h.model);
      spec.links.forEach((l, k) => {
        const id = h.id(OBJ.body, `body_${k}`);
        expect(m.body_mass[id]).toBeCloseTo(l.mass, 12);
        [0, 1, 2].forEach((a) => {
          expect(m.body_ipos[3 * id + a]).toBeCloseTo(l.com![a], 12);
          expect(m.body_inertia[3 * id + a]).toBeCloseTo(l.inertia![a], 12);
        });
      });
    } finally {
      h.dispose();
    }
  });

  it('puts the same centre of mass in the chain', () => {
    expect(chainFromSpec(spec).masses.map((m) => m.com)).toEqual([[0, 0, -MODEL.r1], [0, 0, -MODEL.r2]]);
  });
});

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
    expect(apart(spec.home!, 1e-6, 1.5)).toBeLessThan(1e-3);
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

  it('plays what the integrator says, rates and all', () => {
    const clip = pendulumClip(spec, bars, q0, 1, 0);
    const s = run(stateOf(q0), 3);
    expect(clip.at(3)[0]).toBeCloseTo(s[0], 3);
    expect(clip.at(3)[1]).toBeCloseTo(s[1] - s[0], 3);
    expect(clip.qd!(3)[0]).toBeCloseTo(s[2], 2);
    expect(clip.qd!(3)[1]).toBeCloseTo(s[3] - s[2], 2);
  });

  it('holds its energy through the clip the panel reads, until it is lifted back', () => {
    const clip = pendulumClip(spec, bars, q0, 1, 0), e0 = energy(bars, stateOf(q0));
    for (const t of [1, 5, 13, 29, 39]) {
      const [a, b] = clip.at(t), [v, w] = clip.qd!(t);
      expect(energy(bars, [a, a + b, v, v + w])).toBeCloseTo(e0, 1);
    }
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

  it('starts every fan from the pose you set, in front of the rig', () => {
    const q = [1.1, -0.4], fan = pendulumClip(spec, bars, q, 5, 1e-6).fan!, out = new Float32Array(20);
    fan.at(0, out);
    expect(out[2]).toBeCloseTo(spec.base[0] - bars.l[0] * Math.sin(q[0]) - bars.l[1] * Math.sin(q[0] + q[1]), 4);
    expect(fan.pivot[1]).toBeLessThan(-0.0715);
  });

  it('offers Release and one Fan', () => {
    expect(pendulumMotions(spec).map((p) => [p.id, p.label])).toEqual([['release', 'Release'], ['fan', 'Fan']]);
  });
});

describe('the rig', () => {
  it('turns all the way round, either link, and touches nothing', async () => {
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

  it('hangs clear of the floor at the bottom of its swing', async () => {
    const probe = await contactProbe(spec);
    try {
      expect(spec.base[2] - bars.l[0] - bars.l[1] - 0.0373).toBeGreaterThan(0.1);
      expect(probe.asm.floorZ).toBe(0);
    } finally {
      probe.dispose();
    }
  });

  it('is told apart by its plain joints', () => {
    expect(isPendulum(spec)).toBe(true);
    expect(isPendulum(parseRobot(json('planar_2r')))).toBe(false);
  });

  it('has joints with no stops, in the chain and the model', () => {
    expect(chainFromSpec(spec).joints.every((j) => j.continuous)).toBe(true);
    const xml = toMjcf(spec);
    expect(xml).not.toContain('range="-3.14');
    expect(xml.match(/limited="false"/g)).toHaveLength(2);
    expect(toMjcf(parseRobot(json('planar_2r')))).toContain('limited="true"');
  });

  it('has no model to integrate once its links are not a hanging pair', () => {
    const raw = json('double_pendulum');
    raw.links[1].offset = [0.1, 0, -0.25];
    expect(barsOf(parseRobot(raw))).toBeNull();
    expect(pendulumMotions(parseRobot(raw))).toEqual([]);
  });
});
