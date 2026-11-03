/** Geometric Jacobian, its singular values, and what they mean for motion. */
import { h } from '../../dom/h';
import { column, label, matrix, n, tex } from '../tex/format';
import type { MathSection } from './types';

export const jacobianSection: MathSection = {
  id: 'jacobian',
  title: 'Jacobian & singularities',
  render({ snap, limb, joint }) {
    const { Jv, Jw } = snap.dexterity.jacobian;
    const svd = snap.dexterity.svd;
    const f = snap.posed.frames;
    const j = limb.chain.joints[joint];
    const col = Jv.map((r) => r[joint]);
    return [
      tex(String.raw`\dot p = J_v(q)\,\dot q,\qquad J_k = \begin{cases} \hat z_k \times (p - o_k) & \text{revolute} \\ \hat z_k & \text{prismatic}\end{cases}`),
      h('div.math-block', {},
        h('p', {}, 'Column for ', h('b', {}, j.name), ':'),
        tex(j.type === 'hinge'
          ? String.raw`${column(f.axes[joint])} \times \left(${column(f.tip.p)} - ${column(f.origins[joint])}\right) = ${column(col)}`
          : String.raw`J_{${label(j.name)}} = \hat z = ${column(col)}`)),
      tex(String.raw`J_v = ${matrix(Jv, 3)}`),
      tex(String.raw`J_\omega = ${matrix(Jw, 2)}`),
      tex(String.raw`J_v = U\Sigma V^\top,\;\; \sigma = (${svd.sigma.map((s) => n(s)).join(',\\,')}),\;\; w = \textstyle\prod_{i \le \min(n,3)} \sigma_i = ${n(svd.manipulability * 1e3, 3)}\times10^{-3}`),
      tex(String.raw`\kappa = \sigma_{\max}/\sigma_{\min} = ${n(svd.condition, 1)},\quad \operatorname{rank} J_v = ${svd.rank}`),
      h('p.note', {}, 'σᵢ are the tool speeds per unit joint speed along the principal directions (the ellipsoid in the viewport). When σ_min → 0 the arm loses a direction of motion: a singularity, where IK steps blow up and joint speeds diverge.'),
    ];
  },
};
