/** Gravity load as Jacobian-transpose sums, checked against MuJoCo's bias force. */
import { h } from '../../dom/h';
import { column, label, n, tex } from '../tex/format';
import type { MathSection } from './types';

export const staticsSection: MathSection = {
  id: 'statics',
  title: 'Gravity statics',
  render({ snap, limb, joint }) {
    const g = snap.gravity;
    const bias = limb.index.map((i) => snap.bias[i]);
    const multi = snap.session.limbs.length > 1;
    const delta = Math.max(...g.torque.map((t, k) => Math.abs(t - bias[k])));
    const top = [...g.loads].sort((a, b) => Math.abs(b.torque[joint]) - Math.abs(a.torque[joint])).slice(0, 4);
    return [
      tex(String.raw`\tau_g(q) = -\sum_{m} J_v(c_m)^\top\, m\,\mathbf g,\qquad \mathbf g = ${column(limb.chain.gravity, 2)}`),
      h('p.note', {}, 'The torque each joint must supply just to hold the pose. Each mass contributes through the Jacobian of its own centre of mass.'),
      tex(top.map((l) => String.raw`\underbrace{${n(l.torque[joint], 3)}}_{${label(l.name)}}`).join(' + ') + String.raw` + \dots = ${n(g.torque[joint], 3)}\;\text{N·m}`),
      h('p.note', {}, snap.sim
        ? `Largest contributors to ${limb.chain.joints[joint].name}. While simulating, MuJoCo's bias also carries Coriolis and centrifugal terms (Δ ${delta.toExponential(1)} N·m).`
        : multi
          ? `Largest contributors to ${limb.chain.joints[joint].name}. This limb's sum holds the other limbs rigid at their reference pose; MuJoCo's whole-robot bias differs by ${delta.toExponential(1)} N·m (the joint bars use MuJoCo's).`
          : `Largest contributors to ${limb.chain.joints[joint].name}. MuJoCo qfrc_bias at zero velocity agrees to ${delta.toExponential(1)}.`),
    ];
  },
};
