/** What matters on a double pendulum, where a manipulator shows its dexterity: kinetic, potential and total energy, live. */
import type { Snapshot } from '../../app/live/bus';
import { type Bars, type State, energy } from '../../core/motion/generators/double-pendulum';
import { num } from '../dom/format';
import { h, replace } from '../dom/h';

const kv = (pairs: [string, string][]) => h('dl.kv', {}, ...pairs.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]));

export function energyReadout(bars: Bars) {
  const big = h('div.big');
  const table = h('div', { style: 'margin-top:10px' });
  const el = h('div', {}, big, h('div.cap.mu', { style: 'margin-top:4px' }, 'total energy, joules · zero hanging at rest'), table);
  const rest = energy(bars, [0, 0, 0, 0]);
  return {
    el,
    update(s: Snapshot) {
      const [q1, q2] = s.q, [w1, w2] = s.qd ?? [0, 0];
      const moving: State = [q1, q1 + q2, w1, w1 + w2], still: State = [q1, q1 + q2, 0, 0];
      const potential = energy(bars, still) - rest, kinetic = energy(bars, moving) - energy(bars, still);
      big.textContent = num(kinetic + potential, 3);
      replace(table, kv([['Kinetic', `${num(kinetic, 3)} J`], ['Potential', `${num(potential, 3)} J`]]));
    },
  };
}
