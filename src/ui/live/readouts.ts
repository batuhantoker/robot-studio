/** Tool pose, conditioning, mass properties, and the TS ↔ MuJoCo agreement for the current pose. */
import type { Snapshot } from '../../app/live/bus';
import { eulerZYX } from '../../core/math/linear/transform';
import { deg, mm, num, sci } from '../dom/format';
import { h, replace } from '../dom/h';

const kv = (pairs: [string, string][]) => h('dl.kv', {}, ...pairs.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]));

export function readouts() {
  const big = h('div.big');
  const caption = h('div.cap.mu', { style: 'margin-top:4px' });
  const table = h('div', { style: 'margin-top:10px' });
  const el = h('div', {}, big, caption, table);
  return {
    el,
    update(s: Snapshot) {
      const tip = s.posed.frames.tip;
      const svd = s.dexterity.svd;
      const [yaw, pitch, roll] = eulerZYX(tip.R);
      big.textContent = `${num(svd.manipulability * 1e3, 3)}`;
      caption.textContent = `manipulability Πσᵢ ×10⁻³ ${s.dexterity.nearSingular ? '· NEAR SINGULAR' : ''}`;
      caption.classList.toggle('accent', s.dexterity.nearSingular);
      replace(table, kv([
        ['Tool x y z', `${mm(tip.p[0])} ${mm(tip.p[1])} ${mm(tip.p[2])} mm`],
        ['Yaw pitch roll', `${deg(yaw)} ${deg(pitch)} ${deg(roll)} °`],
        ['σ₁ σ₂ σ₃', svd.sigma.map((v) => num(v, 3)).join(' ') + ' m/rad'],
        ['Condition κ', `${num(svd.condition, 1)} · rank ${svd.rank}`],
        ['Total mass', `${num(s.gravity.totalMass, 2)} kg`],
        ['CoM', `${s.gravity.centerOfMass.map((v) => mm(v)).join(' ')} mm`],
        ['FK vs MuJoCo', `${sci(s.posed.agreement)} m`],
      ]));
    },
  };
}
