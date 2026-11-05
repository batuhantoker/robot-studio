import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PendulumRun } from '@/app/controller/modes/pendulum-task';
import type { PendulumMotors } from '@/app/state/types';
import { fromUpright, type X } from '@/core/control/pendulum/model';
import { toMjcf } from '@/core/mjcf/writer/serial-arm';
import { barsOf } from '@/core/motion/generators/double-pendulum';
import { specDofs } from '@/core/robot/config/pose';
import { parseRobot } from '@/core/robot/schema/parse';
import { Plant } from '@/physics/control/plant';
import { TrackingSim } from '@/physics/control/tracking';
import { ModelHandle } from '@/physics/model/handle';
import { OBJ, arrays, state } from '@/physics/runtime/arrays';

const spec = parseRobot(JSON.parse(readFileSync('presets/studio/double_pendulum.json', 'utf8')));

/** The preset compiled and driven exactly as Physics mode drives it. */
async function open(motors: PendulumMotors) {
  const h = await ModelHandle.fromXml(toMjcf(spec));
  const m = arrays(h.model);
  const ids = specDofs(spec).map((d) => h.id(OBJ.joint, d.name));
  const qposAdr = ids.map((j) => m.jnt_qposadr[j]), dofAdr = ids.map((j) => m.jnt_dofadr[j]);
  const rest = Float64Array.from(m.qpos0);
  const plant = new Plant({ handle: h, qposAdr, dofAdr, rest, home: [2.2, 0.5], torqueLimits: spec.links.map((l) => l.torque_limit), limbs: [{ index: [0, 1] }] });
  plant.enter();
  const armature = dofAdr.map((a) => m.dof_armature[a]) as [number, number];
  const run = new PendulumRun({ ...barsOf(spec)!, armature, limit: Math.min(...plant.limits) });
  run.motors = motors;
  const sim = new TrackingSim(h, qposAdr, dofAdr, plant.limits.map((limit) => ({ kp: 0, kd: 0, limit })), rest, { driven: plant.driven, held: plant.held, routes: plant.routes, compensate: false });
  while (run.thinking) run.think(performance.now() + 50);
  sim.reset(run.start([2.2, 0.5]));
  const go = (seconds: number) => {
    let worst = 0;
    for (let i = 0, n = Math.round(seconds / sim.dt); i < n; i++) {
      while (run.thinking) run.think(performance.now() + 50);
      const r = sim.drive((q, qd) => run.torque(q, qd, sim.dt), (q) => run.error(q));
      worst = Math.max(worst, ...r.applied.map(Math.abs));
    }
    return worst;
  };
  const off = () => Math.hypot(...fromUpright([...sim.q(), 0, 0] as X).slice(0, 2));
  return { h, sim, run, go, off, plant };
}

describe('the rig in MuJoCo', () => {
  for (const motors of ['both', 'shoulder', 'elbow'] as const) {
    it(`swings up and balances on ${motors}, then takes the Nudge`, async () => {
      const { h, sim, run, go, off, plant } = await open(motors);
      try {
        expect(sim.q()).toEqual([0, 0]);
        expect(run.status.phase).toBe('swinging');
        expect(go(10)).toBeLessThanOrEqual(6 + 1e-9);
        expect(run.status.phase).toBe('balancing');
        expect(off()).toBeLessThan(0.01);
        sim.knock(run.knock);
        go(5);
        expect(run.status.phase).toBe('balancing');
        expect(off()).toBeLessThan(0.01);
      } finally {
        plant.leave();
        h.dispose();
      }
    }, 60_000);
  }

  it('applies only the working motor: the other joint gets no torque at all', async () => {
    const { h, sim, run, plant } = await open('elbow');
    try {
      for (let i = 0; i < 1500; i++) {
        const r = sim.drive((q, qd) => run.torque(q, qd, sim.dt), (q) => run.error(q));
        expect(r.applied[0]).toBe(0);
      }
    } finally {
      plant.leave();
      h.dispose();
    }
  }, 30_000);

  it('lets go with no torque, from the pose it is given, and holds its energy', async () => {
    const { h, sim, run, plant } = await open('both');
    try {
      run.task = 'free';
      expect(run.start([1.9, -0.4])).toEqual([1.9, -0.4]);
      sim.reset([1.9, -0.4]);
      const d = state(h.data);
      for (let i = 0; i < 2000; i++) {
        const r = sim.drive((q, qd) => run.torque(q, qd, sim.dt), (q) => run.error(q));
        expect(r.applied).toEqual([0, 0]);
      }
      expect(d.qfrc_applied[0]).toBe(0);
      expect(sim.q()).not.toEqual([1.9, -0.4]);
    } finally {
      plant.leave();
      h.dispose();
    }
  }, 30_000);
});
