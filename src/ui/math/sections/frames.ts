/** The chain product and Rodrigues' formula, evaluated for the focused joint. */
import { matMul, rodrigues, skew } from '../../../core/math/linear/mat3';
import { h } from '../../dom/h';
import { column, label, mat3, n, tex } from '../tex/format';
import type { MathSection } from './types';

export const framesSection: MathSection = {
  id: 'frames',
  title: 'Chain of frames',
  render({ snap, limb, lq, joint: k }) {
    const j = limb.chain.joints[k];
    const q = lq[k] - j.q0;
    const K = skew(j.axis);
    const pre = snap.posed.frames.pre[k];
    const hinge = j.type === 'hinge';
    return [
      h('p.note', {}, 'Every robot here, built or imported, reduces to one product of constant transforms F and joint motions M:'),
      tex(String.raw`T_{\text{tool}}(q) = T_{\text{base}}\;\prod_{k=1}^{n} F_k\, M_k(q_k)\;T_{\text{tip}}`),
      tex(hinge
        ? String.raw`M_k = \begin{bmatrix} R(\hat a_k, q_k) & 0 \\ 0 & 1 \end{bmatrix},\quad R(\hat a, q) = I + \sin q\,[\hat a]_\times + (1-\cos q)\,[\hat a]_\times^2`
        : String.raw`M_k = \begin{bmatrix} I & \hat a_k\, q_k \\ 0 & 1 \end{bmatrix}\quad\text{(prismatic: translate along the axis)}`),
      h('div.math-block', {},
        h('p', {}, 'Joint ', h('b', {}, j.name), hinge ? ` at q = ${(q * 180 / Math.PI).toFixed(2)}°:` : ` at q = ${(q * 1000).toFixed(1)} mm:`),
        tex(String.raw`\hat a_{${label(j.name)}} = ${column(j.axis)},\quad [\hat a]_\times = ${mat3(K)}`),
        hinge ? tex(String.raw`\sin q = ${n(Math.sin(q))},\;\; 1-\cos q = ${n(1 - Math.cos(q))}`) : null,
        hinge ? tex(String.raw`R(\hat a, q) = ${mat3(rodrigues(j.axis, q))}`) : tex(String.raw`\hat a\,q = ${column(j.axis.map((v) => v * q))}\,\text{m}`),
        h('p', {}, 'World frame entering this joint (product of everything before it):'),
        tex(String.raw`{}^{0}R_{${k}} = ${mat3(pre.R)},\quad {}^{0}o_{${k}} = ${column(pre.p)}\,\text{m}`),
        hinge ? tex(String.raw`{}^{0}R_{${k}}\,R(\hat a, q) = ${mat3(matMul(pre.R, rodrigues(j.axis, q)))}`) : null),
    ];
  },
};
