import { describe, expect, it } from 'vitest';
import { firstGuess } from '@/core/control/gains';
import { RunScore } from '@/core/control/score';
import { crossEntropy } from '@/core/control/learn/search';
import { decode, encode } from '@/core/control/learn/params';
import { toMjcf } from '@/core/mjcf/writer/serial-arm';
import { specDofs } from '@/core/robot/config/pose';
import { Plant } from '@/physics/control/plant';
import { Rollout, sampleReference } from '@/physics/control/rollout';
import { TrackingSim } from '@/physics/control/tracking';
import { ModelHandle } from '@/physics/model/handle';
import { OBJ, arrays, state } from '@/physics/runtime/arrays';
import { presetSpec, python } from '../support/fixtures';

const robotName = (python as unknown as { simulation: { robot: string } }).simulation.robot;

async function open() {
  const spec = presetSpec(robotName);
  const h = await ModelHandle.fromXml(toMjcf(spec));
  const m = arrays(h.model);
  const ids = specDofs(spec).map((d) => h.id(OBJ.joint, d.name));
  const qposAdr = ids.map((j) => m.jnt_qposadr[j]);
  const dofAdr = ids.map((j) => m.jnt_dofadr[j]);
  const rest = Float64Array.from(m.qpos0);
  const home = qposAdr.map(() => 0.1);
  const limbs = [{ index: ids.map((_, k) => k) }];
  const plant = new Plant({ handle: h, qposAdr, dofAdr, rest, home, torqueLimits: ids.map(() => 0), limbs });
  return { h, m, qposAdr, dofAdr, rest, home, plant, n: ids.length };
}

const wave = (n: number) => (t: number) => ({
  q: Array.from({ length: n }, (_, k) => 0.1 + 0.3 * Math.sin(2 * t + k)),
  qd: Array.from({ length: n }, (_, k) => 0.6 * Math.cos(2 * t + k)),
});

describe('torque through qfrc_applied', () => {
  it('moves a motor-driven model exactly as its own unit-gear motors would', async () => {
    const { h, qposAdr, dofAdr, rest, home, plant, n } = await open();
    try {
      const gains = plant.inertia.map((M, k) => ({ kp: M * 900, kd: 60 * M, limit: plant.limits[k] }));
      const sim = new TrackingSim(h, qposAdr, dofAdr, gains, rest);
      sim.reset(home);
      const applied: number[][] = [], viaForce: number[][] = [];
      const play = wave(n);
      for (let i = 0; i < 400; i++) {
        const r = play(i * sim.dt);
        applied.push(sim.step(r.q, r.qd).applied);
        viaForce.push(sim.q());
      }
      sim.reset(home);
      const d = state(h.data);
      for (let i = 0; i < 400; i++) {
        h.mj.mj_step1(h.model, h.data);
        applied[i].forEach((a, k) => (d.ctrl[k] = a));
        h.mj.mj_step2(h.model, h.data);
        qposAdr.forEach((adr, k) => expect(d.qpos[adr]).toBeCloseTo(viaForce[i][k], 10));
      }
    } finally {
      h.dispose();
    }
  });
});

describe('Plant', () => {
  it('estimates a limit for every joint when the model states none, and says so', async () => {
    const { h, plant } = await open();
    try {
      expect(plant.estimated.every(Boolean)).toBe(true);
      expect(plant.limits.every((l) => l > 0)).toBe(true);
    } finally {
      h.dispose();
    }
  });

  it('leaves the shared model as it found it', async () => {
    const { h, m, plant } = await open();
    try {
      const opt = h.model.opt as unknown as { disableflags: number };
      const flags = opt.disableflags;
      const armature = Array.from(m.dof_armature);
      plant.enter();
      expect(opt.disableflags).not.toBe(flags);
      plant.enter();
      state(h.data).qfrc_applied.fill(3);
      plant.leave();
      expect(opt.disableflags).toBe(flags);
      expect(Array.from(m.dof_armature)).toEqual(armature);
      expect(Array.from(state(h.data).qfrc_applied).every((v) => v === 0)).toBe(true);
    } finally {
      h.dispose();
    }
  });
});

describe('a headless run', () => {
  it('scores exactly what the same gains score on the live data', async () => {
    const { h, qposAdr, dofAdr, rest, plant, n } = await open();
    try {
      plant.enter();
      const joints = Array.from({ length: n }, (_, k) => k);
      const gains = firstGuess(plant.inertia).map((g, k) => ({ ...g, limit: plant.limits[k] }));
      const options = { driven: plant.driven, held: plant.held, compensate: false };
      const ref = sampleReference(wave(n), 1, (h.model.opt as unknown as { timestep: number }).timestep);
      const rollout = new Rollout({ handle: h, qposAdr, dofAdr, rest, options, joints, limits: plant.limits }, ref, gains);
      rollout.run(Infinity);
      const live = new TrackingSim(h, qposAdr, dofAdr, gains, rest, options);
      live.reset(Array.from(ref.q[0]));
      const score = new RunScore(joints, plant.limits);
      ref.q.forEach((q, i) => {
        const out = live.step(q, ref.qd[i]);
        score.add(out.error, out.applied, out.saturated);
      });
      expect(rollout.stats()).toEqual(score.stats());
      rollout.dispose();
    } finally {
      h.dispose();
    }
  });

  it('teaches a poor start to track far better from the score alone', async () => {
    const { h, qposAdr, dofAdr, rest, plant, n } = await open();
    try {
      plant.enter();
      const joints = Array.from({ length: n }, (_, k) => k);
      const start = firstGuess(plant.inertia);
      const toGains = (g: typeof start) => g.map((x, k) => ({ ...x, limit: plant.limits[k] }));
      const ref = sampleReference(wave(n), 1, (h.model.opt as unknown as { timestep: number }).timestep);
      const options = { driven: plant.driven, held: plant.held, compensate: false };
      const rollout = new Rollout({ handle: h, qposAdr, dofAdr, rest, options, joints, limits: plant.limits }, ref, toGains(start));
      const trial = (g: typeof start) => {
        rollout.begin(toGains(g));
        rollout.run(Infinity);
        return rollout.stats().score;
      };
      const space = { joints, inertia: plant.inertia };
      const search = crossEntropy({ start: encode(start, space), sigma: 1, population: 12, seed: 2 });
      const before = trial(start);
      let best = before;
      for (let round = 0; round < 12; round++) {
        const scores = search.ask().map((theta) => trial(decode(theta, start, space)));
        best = Math.max(best, ...scores);
        search.tell(scores);
      }
      expect(best).toBeGreaterThan(before + 20);
      rollout.dispose();
    } finally {
      h.dispose();
    }
  });
});

describe('a soft hand', () => {
  // One near-weightless motor joint off every limb; the fingers follow it, and c follows b.
  const hand = `<mujoco><compiler angle="radian"/><option timestep="0.002"/><worldbody>
    <body name="motor"><joint name="synergy" axis="0 1 0" range="0 1" limited="true"/><geom size="0.001" mass="0.0001"/></body>
    <body name="a"><joint name="a" axis="0 1 0" range="-3 3" limited="true"/><geom type="capsule" fromto="0 0 0 0 0 -0.05" size="0.01" mass="0.02"/></body>
    <body name="b"><joint name="b" axis="0 1 0" range="-3 3" limited="true"/><geom type="capsule" fromto="0 0 0 0 0 -0.05" size="0.01" mass="0.02"/></body>
    <body name="c"><joint name="c" axis="0 1 0" range="-3 3" limited="true"/><geom type="capsule" fromto="0 0 0 0 0 -0.05" size="0.01" mass="0.02"/></body>
  </worldbody><equality><joint joint1="a" joint2="synergy" polycoef="0 -2 0 0 0"/><joint joint1="b" joint2="synergy" polycoef="0 1 0 0 0"/><joint joint1="c" joint2="b" polycoef="0 0.5 0 0 0"/></equality></mujoco>`;

  it('pulls every finger in proportion to its gearing, and they move together', async () => {
    const h = await ModelHandle.fromXml(hand);
    try {
      const m = arrays(h.model);
      const ids = ['a', 'b', 'c'].map((n) => h.id(OBJ.joint, n));
      const qposAdr = ids.map((j) => m.jnt_qposadr[j]);
      const dofAdr = ids.map((j) => m.jnt_dofadr[j]);
      const rest = Float64Array.from(m.qpos0);
      const plant = new Plant({ handle: h, qposAdr, dofAdr, rest, home: [0, 0, 0], torqueLimits: [0, 0, 0], limbs: [{ index: [0, 1, 2] }] });
      expect(plant.driven).toEqual([true, false, false]);
      expect(plant.routes.get(0)?.map((r) => r.scale).sort((x, y) => x - y)).toEqual([-0.5, -0.25, 1]);
      expect(plant.held).toEqual([]);
      plant.enter();
      const gains = plant.inertia.map((M, k) => ({ kp: M * 900, kd: 60 * M, limit: plant.limits[k] }));
      const sim = new TrackingSim(h, qposAdr, dofAdr, gains, rest, { driven: plant.driven, held: plant.held, routes: plant.routes });
      sim.reset([0, 0, 0]);
      for (let i = 0; i < 1500; i++) sim.step([-0.4, 0, 0], [0, 0, 0]);
      const [a, b, c] = sim.q();
      expect(a).toBeCloseTo(-0.4, 1);
      expect(b).toBeCloseTo(0.2, 1);
      expect(c).toBeCloseTo(0.1, 1);
    } finally {
      h.dispose();
    }
  });
});
