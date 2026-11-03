/** DH table extracted from the joint axis lines, live θ/d, and its verification against the chain. */
import { extractDH } from '../../../core/dh/extract/table';
import { dhMatrix, rowAt, verifyDH } from '../../../core/dh/forward/transform';
import type { Chain } from '../../../core/chain/model/types';
import type { DHTable } from '../../../core/dh/types';
import { DEG } from '../../dom/format';
import { h } from '../../dom/h';
import { homogeneous, n, tex } from '../tex/format';
import type { MathSection } from './types';

const cache = new WeakMap<Chain, { table: DHTable; error: number }>();

function tableFor(chain: Chain) {
  let entry = cache.get(chain);
  if (!entry) {
    const table = extractDH(chain);
    entry = { table, error: verifyDH(table, chain) };
    cache.set(chain, entry);
  }
  return entry;
}

export const dhSection: MathSection = {
  id: 'dh',
  title: 'Denavit–Hartenberg parameters',
  render({ limb, lq, joint }) {
    const { table, error } = tableFor(limb.chain);
    const ok = error < 1e-8;
    const rows = table.rows.map((r, i) => {
      const { theta, d } = rowAt(r, lq[i]);
      return h('tr', { style: i === joint ? 'background:#fff4f4' : '' },
        h('td', {}, r.joint), h('td', {}, r.type === 'hinge' ? `${(theta * DEG).toFixed(1)}*` : (theta * DEG).toFixed(1)),
        h('td', {}, r.type === 'slide' ? `${(d * 1000).toFixed(1)}*` : (d * 1000).toFixed(1)),
        h('td', {}, (r.a * 1000).toFixed(1)), h('td', {}, (r.alpha * DEG).toFixed(1)), h('td.mu', {}, r.placement));
    });
    const r = table.rows[joint];
    const at = rowAt(r, lq[joint]);
    const A = dhMatrix(at.theta, at.d, r.a, r.alpha);
    return [
      h('p.note', {}, 'Derived from the geometry, not typed in: frame i sits on joint i+1’s axis, x along the common normal between consecutive axes (skew, intersecting, parallel and coincident cases handled).'),
      tex(String.raw`A_i = \mathrm{Rot}_z(\theta_i)\,\mathrm{Trans}_z(d_i)\,\mathrm{Trans}_x(a_i)\,\mathrm{Rot}_x(\alpha_i)`),
      h('table.grid', {}, h('tr', {}, ...['joint', 'θ °', 'd mm', 'a mm', 'α °', 'case'].map((t) => h('th', {}, t))), ...rows),
      h('p.note', {}, '* the joint variable. ', ok ? `Verified: DH FK matches the chain to ${error.toExponential(1)} over random poses.` : `Verification failed (Δ ${error.toExponential(1)}).`),
      tex(String.raw`A_{${joint + 1}}(\theta=${n(at.theta * DEG, 1)}^\circ) = ${homogeneous(A.R, A.p)}`),
    ];
  },
};
