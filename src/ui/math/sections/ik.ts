/** Damped least squares, with the trace of the last solve. */
import { h } from '../../dom/h';
import { tex } from '../tex/format';
import type { MathSection } from './types';

export const ikSection: MathSection = {
  id: 'ik',
  title: 'Inverse kinematics (DLS)',
  render({ ik }) {
    const steps = ik?.steps.slice(0, 14) ?? [];
    return [
      tex(String.raw`e_k = p^\star - p(q_k),\qquad \Delta q = J^\top\left(JJ^\top + \lambda^2 I\right)^{-1} e_k`),
      tex(String.raw`\lambda = 10^{-3}\max(\lVert J\rVert_F, 10^{-3}),\quad \lVert\Delta q\rVert \le 0.5,\quad q_{k+1} = \operatorname{clip}\!\left(q_k + 2^{-b}\Delta q\right)`),
      h('p.note', {}, 'The same bounded solver as SerialArm.inverse_kinematics: halve the step (b backtracks) until the error drops, restart from random poses if stuck. Failure does not prove a target is unreachable.'),
      ik
        ? h('table.grid', {},
          h('tr', {}, ...['iter', '‖e‖ mm', 'λ', '‖Δq‖', 'b'].map((t) => h('th', {}, t))),
          ...steps.map((s) => h('tr', {}, h('td', {}, `${s.attempt ? `r${s.attempt}·` : ''}${s.iteration}`), h('td', {}, (s.residual * 1000).toFixed(3)),
            h('td', {}, s.lambda.toExponential(1)), h('td', {}, s.stepNorm.toFixed(3)), h('td', {}, s.backtracks < 0 ? '—' : String(s.backtracks)))))
        : h('p.note', {}, 'Switch to Inverse kin. mode and move the target to see a solve.'),
      ik ? h('p', { class: ik.success ? '' : 'accent' }, ik.success ? `Converged: residual ${(ik.residual * 1000).toFixed(4)} mm in ${ik.steps.length} iterations.` : `Not reached: best residual ${(ik.residual * 1000).toFixed(2)} mm.`) : null,
    ];
  },
};
