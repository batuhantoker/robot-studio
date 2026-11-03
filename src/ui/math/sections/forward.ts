/** The tool pose and, for studio robots, the sum of rotated link offsets that produces it. */
import { linkJointStart } from '../../../core/chain/model/from-spec';
import { matVec } from '../../../core/math/linear/mat3';
import { h } from '../../dom/h';
import { column, homogeneous, label, tex } from '../tex/format';
import type { MathSection } from './types';

export const forwardSection: MathSection = {
  id: 'forward',
  title: 'Forward kinematics',
  render({ snap }) {
    const { frames } = snap.posed;
    const spec = snap.session.spec;
    const parts: (HTMLElement | null)[] = [
      tex(String.raw`T_{\text{tool}}(q) = ${homogeneous(frames.tip.R, frames.tip.p)}`),
    ];
    if (spec) {
      const starts = linkJointStart(spec);
      const terms = spec.links.map((l, i) => {
        const frame = frames.frames[starts[i] + l.dofs.length - 1];
        return { name: l.name, v: matVec(frame.R, l.offset) };
      });
      parts.push(
        h('p.note', {}, 'For a built robot the tool point is the base plus each link offset rotated into the world by everything upstream:'),
        tex(String.raw`p_{\text{tool}} = b + \sum_{i} {}^{0}R_i\, o_i + {}^{0}R_n\, t`),
        tex(terms.map((t) => String.raw`\underbrace{${column(t.v)}}_{${label(t.name)}}`).join(' + ') + String.raw` + \dots = ${column(frames.tip.p)}`),
      );
    }
    parts.push(h('p.note', {}, `MuJoCo computes the same tool point independently; they differ by ${snap.posed.agreement.toExponential(1)} m.`));
    return parts;
  },
};
