/** The quintic blend used for every segment, and the Hermite terms a via adds. */
import { planOf } from '../../../app/controller/modes/trajectory';
import { compile, isVia } from '../../../core/trajectory/plan';
import { blend } from '../../../core/trajectory/quintic/profile';
import { h } from '../../dom/h';
import { n, tex } from '../tex/format';
import type { MathSection } from './types';

export const trajectorySection: MathSection = {
  id: 'trajectory',
  title: 'Quintic trajectory',
  render({ state }) {
    const head = [
      tex(String.raw`q(t) = q_i + (q_{i+1} - q_i)\,s(u) + T_i\big(v_i\,h_1(u) + v_{i+1}\,h_4(u)\big),\quad u = \tfrac{t - t_i}{T_i}`),
      tex(String.raw`s(u) = 10u^3 - 15u^4 + 6u^5,\quad h_1 = u - 6u^3 + 8u^4 - 3u^5,\quad h_4 = -4u^3 + 7u^4 - 3u^5`),
      h('p.note', {}, 'At a stop v = 0, so only s(u) is left: zero velocity and acceleration there (the profile analyze() samples), and motions start and stop without jerk spikes. A via keeps a Catmull–Rom velocity, zeroed for any joint that turns back there, so the path flows through it; acceleration is zero at every knot either way.'),
    ];
    if (state.waypoints.length < 2) return head;
    const plan = planOf(state);
    const c = compile(plan);
    const p = c.at(state.time);
    const i = p.segment, Ti = c.arrive[i + 1] - c.leave[i];
    const b = blend(p.u);
    const kind = (k: number) => (isVia(plan, k) ? 'via' : 'stop');
    const status = p.holding !== null
      ? String.raw`\text{holding at stop } ${p.holding + 1},\; ${n(c.leave[p.holding] - state.time, 2)}\,\text{s left}`
      : String.raw`\text{segment } ${i + 1}/${state.waypoints.length - 1}\;(\text{${kind(i)}} \to \text{${kind(i + 1)}}),\; T_i = ${n(Ti, 2)}\,\text{s},\; u = ${n(p.u)},\; s = ${n(b.s)},\; \dot s = ${n(b.ds)}`;
    return [...head, tex(status)];
  },
};
