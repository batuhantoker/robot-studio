/** The original AUTOLEV/Kane closed form, shown when the robot has that structure. */
import { kaneFK, kaneLengths } from '../../../core/legacy/kane/closed-form';
import { h } from '../../dom/h';
import { column, n, tex } from '../tex/format';
import type { MathSection } from './types';

export const kaneSection: MathSection = {
  id: 'kane',
  title: 'Kane closed form (original arm)',
  applies: ({ snap }) => !!snap.session.spec && !!kaneLengths(snap.session.spec),
  render({ snap }) {
    const L = kaneLengths(snap.session.spec!)!;
    const p = kaneFK(snap.q, L);
    const tip = snap.posed.frames.tip.p;
    const delta = Math.hypot(p[0] - tip[0], p[1] - tip[1], p[2] - tip[2]);
    return [
      h('p.note', {}, 'From kinematics/4DOF_kane.all: N→A Simprot(Z,q₁), A→B (X,q₂), B→C (Z,q₃), C→D (X,q₄); P_O_G = Laz·A₃ + Lax·A₁ + Lb·B₁ + Lt·D₃.'),
      tex(String.raw`\begin{aligned} x &= (L_{ax}+L_b)c_1 + L_t\,(s_3s_4c_1 + s_1(s_2c_4 + s_4c_2c_3)) \\ y &= (L_{ax}+L_b)s_1 + L_t\,(s_1s_3s_4 - c_1(s_2c_4 + s_4c_2c_3)) \\ z &= L_{az} + L_t\,(c_2c_4 - s_2s_4c_3)\end{aligned}`),
      tex(String.raw`L = (${[L.Laz, L.Lax, L.Lb, L.Lt].map((v) => n(v * 1000, 0)).join(',')})\,\text{mm} \;\Rightarrow\; p = ${column(p.map((v) => v * 1000), 2)}\,\text{mm}`),
      h('p.note', {}, `Closed form vs. chain product: |Δ| = ${delta.toExponential(1)} m. The general chain reproduces the hand-derived result.`),
    ];
  },
};
