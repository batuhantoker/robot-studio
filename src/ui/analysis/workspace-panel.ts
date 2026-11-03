/** Workspace & limits of the whole robot: every limb sampled, coloured by what limits it. */
import type { WorkspaceStudy } from '../../app/controller/workspace/study';
import type { Store } from '../../app/state/store';
import type { StudioState } from '../../app/state/types';
import type { WorkspaceMetric } from '../../scene/overlays/workspace';
import { mm, num } from '../dom/format';
import { h, replace } from '../dom/h';
import { segmented } from '../widgets/segmented';
import type { AnalysisContext } from './context';

const pct = (v: number) => `${(v * 100).toFixed(1)} %`;

function statsOf(st: WorkspaceStudy) {
  const s = st.summary;
  return [
    h('dl.kv', {}, ...([
      ['Limbs sampled', `${st.limbs} · ${s.samples} poses`],
      ['Volume (voxel est.)', `${num(s.volume * 1e3, 2)} L`],
      ['Reach from base', `${mm(s.reachMin, 0)} – ${mm(s.reachMax, 0)} mm`],
      ['Height', `${mm(s.zMin, 0)} – ${mm(s.zMax, 0)} mm`],
      ['Near-singular', pct(s.nearSingular)],
      ['Beyond torque limit', pct(s.overTorque)],
      ['Within 5 % of a limit', pct(s.nearLimit)],
    ] as [string, string][]).flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])),
    h('p.note', {}, 'The shaded shell is the boundary of the reachable volume; dots are sampled tool positions. Red marks the selected limitation: singular poses, poses the motors cannot hold against gravity, or joints at their stops. Sampling is uniform in joint space, not a certified volume.'),
  ];
}

export function workspacePanel(store: Store<StudioState>, ctx: AnalysisContext) {
  const stats = h('div');
  const metricBar = segmented<WorkspaceMetric>([['manipulability', 'Dexterity'], ['torque', 'Torque'], ['limits', 'Limits'], ['reach', 'Reach']], 'manipulability', (m) => {
    metricBar.set(m);
    ctx.recolorWorkspace(m);
  });
  const show = () => store.set({ overlays: { ...store.state.overlays, workspace: true } });
  ctx.onWorkspace((st) => replace(stats, ...(st ? statsOf(st) : [h('p.note', {}, 'Open Workspace mode or press Analyze to sample this robot.')])));
  replace(stats, h('p.note', {}, 'Open Workspace mode or press Analyze to sample this robot.'));
  const el = h('div.section', {}, h('header', {}, h('span.cap', {}, 'Workspace & limits'), h('span.cap.mu', {}, 'all limbs')),
    h('div.row', {},
      h('button.tb.primary', { onclick: () => (ctx.runWorkspace(2500), show()) }, 'Analyze'),
      h('button.tb', { onclick: () => (ctx.runWorkspace(10000), show()), title: 'Denser sampling, a few seconds on big robots' }, 'Dense 10k')),
    h('div', { style: 'margin:8px 0' }, metricBar.el), stats);
  store.on(['mode'], (s) => s.mode === 'workspace' && requestAnimationFrame(() => el.scrollIntoView({ block: 'start', behavior: 'smooth' })));
  return el;
}
