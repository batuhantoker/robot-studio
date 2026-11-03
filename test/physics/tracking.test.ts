import { describe, it } from 'vitest';
import { toMjcf } from '@/core/mjcf/writer/serial-arm';
import { specDofs } from '@/core/robot/config/pose';
import { TrackingSim } from '@/physics/control/tracking';
import { ModelHandle } from '@/physics/model/handle';
import { OBJ, arrays } from '@/physics/runtime/arrays';
import { expectClose, presetSpec, python } from '../support/fixtures';

interface SimFixture {
  robot: string;
  timestep: number;
  q: number[][];
  target_q: number[][];
  target_qd: number[][];
  torque: number[][];
  requested_torque: number[][];
}

describe('TrackingSim reproduces serial_arm.simulation.run_simulation', () => {
  it('spatial_3link quintic reach, 2 s at 10 ms', async () => {
    const f = (python as unknown as { simulation: SimFixture }).simulation;
    const spec = presetSpec(f.robot);
    const h = await ModelHandle.fromXml(toMjcf(spec, f.timestep));
    try {
      const m = arrays(h.model);
      const ids = specDofs(spec).map((d) => h.id(OBJ.joint, d.name));
      const gains = spec.links.map((l) => ({ kp: l.kp, kd: l.kd, limit: l.torque_limit }));
      const sim = new TrackingSim(h, ids.map((j) => m.jnt_qposadr[j]), ids.map((j) => m.jnt_dofadr[j]), gains, Float64Array.from(m.qpos0));
      sim.reset(f.target_q[0]);
      // Python's MuJoCo is 3.12 and the WASM build 3.17, so compare with a tolerance.
      for (let i = 0; i < f.q.length; i++) {
        expectClose(sim.q(), f.q[i], 1e-6);
        const out = sim.step(f.target_q[i], f.target_qd[i]);
        expectClose(out.requested, f.requested_torque[i], 1e-5);
        expectClose(out.applied, f.torque[i], 1e-5);
      }
    } finally {
      h.dispose();
    }
  });
});
