/** Whole-body IK: a target per end effector; the gizmo drags the focused limb's, the markers pick a limb. */
import type { LiveBus } from '../../app/live/bus';
import type { Store } from '../../app/state/store';
import type { StudioState } from '../../app/state/types';
import type { Vec3 } from '../../core/math/linear/vec';
import { withTarget } from '../../app/controller/targets';
import { h, replace } from '../dom/h';
import { vecInput } from '../widgets/fields';
import type { AnalysisContext } from './context';

export function ikPanel(store: Store<StudioState>, bus: LiveBus, ctx: AnalysisContext) {
  const rows = h('div');
  const result = h('div');
  const el = h('div.section', {}, h('header', {}, h('span.cap', {}, 'Inverse kinematics'), h('span.cap.mu', {}, 'whole body')),
    h('p.note', {}, 'Give any end effectors a target (mm). One stacked DLS solve moves every joint at once, so shared joints compromise between limbs. Every limb is pinned where it is: drag the red gizmo to move the focused limb, or grab another limb’s dark marker to move that one instead. Untick a limb to let it follow freely.'),
    rows, result);
  const tipOf = (limb: number): Vec3 | undefined => bus.latest?.posed.limbs[limb]?.tip.p;
  const render = (s: StudioState) => {
    const limbs = bus.latest?.session.limbs ?? [];
    const set = (limb: number, p: Vec3 | null) => store.set({ targets: withTarget(store.state.targets, limb, p), mode: 'ik' });
    replace(rows,
      ...limbs.map((l, i) => {
        const t = s.targets[i] ?? null;
        return h('div', { class: `ik-row ${i === s.focus ? 'on' : ''}` },
          h('label', {}, h('input', { type: 'checkbox', checked: !!t, onchange: () => set(i, t ? null : tipOf(i) ?? null) }), ' ', h('b', { onclick: () => store.set({ focus: i }) }, l.name)),
          t ? vecInput(t, (v) => set(i, v as Vec3), { scale: 1000, step: 5, digits: 1 }) : null);
      }),
      limbs.length > 1 ? h('div.row', {},
        h('button.tb', { onclick: () => store.set({ targets: limbs.map((_, i) => tipOf(i) ?? null), mode: 'ik' }) }, 'Target all'),
        h('button.tb', { onclick: () => store.set({ targets: [] }) }, 'Clear')) : null);
    const r = ctx.ik();
    const blocked = ctx.ikBlocked();
    replace(result, r ? h('p', { class: r.success && !blocked ? '' : 'accent' }, blocked
      ? `Stopped at contact before the target: ${blocked}.`
      : r.success
      ? `All targets reached in ${r.steps.length} iterations (worst residual ${(r.residual * 1000).toFixed(4)} mm).`
      : `Not all reachable: worst residual ${(r.residual * 1000).toFixed(2)} mm after restarts.`) : null);
  };
  store.on(['targets', 'focus', 'activeId', 'q'], render);
  bus.on(() => rows.childElementCount === 0 && render(store.state), 2);
  return el;
}
