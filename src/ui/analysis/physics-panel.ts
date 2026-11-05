/** Live MuJoCo tracking: applied torque against limits, tracking error, saturation. */
import type { LiveBus } from '../../app/live/bus';
import type { Store } from '../../app/state/store';
import type { StudioState } from '../../app/state/types';
import { h, replace } from '../dom/h';
import { LineChart, jointSeries } from '../widgets/chart';
import type { AnalysisContext } from './context';

export function physicsPanel(store: Store<StudioState>, bus: LiveBus, ctx: AnalysisContext) {
  const torque = new LineChart();
  const error = new LineChart();
  const status = h('div');
  const el = h('div.section', {}, h('header', {}, h('span.cap', {}, 'Physics'), h('span.cap.mu', {}, 'MuJoCo WASM · PD + bias')),
    h('div.row', {},
      h('button.tb.primary', { onclick: () => store.set({ mode: 'physics', playing: true }) }, '▶ Simulate trajectory'),
      h('button.tb', { onclick: () => ctx.restartPhysics() }, 'Restart')),
    status,
    h('div.cap.mu', { style: 'margin-top:8px' }, 'Applied torque (band = limit)'), torque.el,
    h('div.cap.mu', { style: 'margin-top:8px' }, 'Tracking error rad'), error.el);
  bus.on(() => {
    const p = ctx.physics();
    if (!p || store.state.mode !== 'physics' || el.offsetParent === null) return;
    if (p.reason) {
      replace(status, h('p.note', {}, p.reason));
      return;
    }
    const { history: hist, limits } = p;
    const cols = (m: number[][]) => (m[0] ?? []).map((_, k) => m.map((r) => r[k]));
    const sat = hist.requested.at(-1)?.map((r, k) => Math.abs(r) > limits[k]) ?? [];
    replace(status, h('p.note', {}, `t = ${(hist.t.at(-1) ?? 0).toFixed(2)} s · `, sat.some(Boolean)
      ? h('span.accent', {}, `saturating: ${sat.map((s, k) => (s ? `j${k + 1}` : '')).filter(Boolean).join(', ')}`)
      : 'all motors within limits'));
    const lim = Math.max(...limits);
    torque.setData(hist.t, cols(hist.applied).map((values, k) => jointSeries(k, `τ${k + 1}`, values)));
    torque.draw(null, [-lim, lim]);
    error.setData(hist.t, cols(hist.error).map((values, k) => jointSeries(k, `e${k + 1}`, values)));
  }, 8);
  return el;
}
