/** The quintic blend used for every waypoint segment. */
import { blend } from '../../../core/trajectory/quintic/profile';
import { h } from '../../dom/h';
import { n, tex } from '../tex/format';
import type { MathSection } from './types';

export const trajectorySection: MathSection = {
  id: 'trajectory',
  title: 'Quintic trajectory',
  render({ state }) {
    const segments = Math.max(state.waypoints.length - 1, 1);
    const T = state.duration / segments;
    const seg = Math.min(Math.floor(state.time / T), segments - 1);
    const u = Math.min(Math.max(state.time / T - seg, 0), 1);
    const b = blend(u);
    return [
      tex(String.raw`q(t) = q_i + (q_{i+1} - q_i)\,s(u),\quad u = \tfrac{t - iT}{T},\quad s(u) = 10u^3 - 15u^4 + 6u^5`),
      tex(String.raw`\dot s = 30u^2(1-u)^2,\qquad \ddot s = 60u(1-u)(1-2u)`),
      h('p.note', {}, 'Zero velocity and acceleration at every waypoint (the profile analyze() samples), so motions start and stop without jerk spikes.'),
      tex(String.raw`\text{segment } ${seg + 1}/${segments},\; T = ${n(T, 2)}\,\text{s},\; u = ${n(u)},\; s = ${n(b.s)},\; \dot s = ${n(b.ds)},\; \ddot s = ${n(b.dds)}`),
    ];
  },
};
