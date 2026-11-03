/** Waypoints, duration, playback, and the joint / speed / gravity-torque profiles of the path. */
import type { Store } from '../../app/state/store';
import type { StudioState } from '../../app/state/types';
import { h, replace } from '../dom/h';
import { LineChart, seriesColor } from '../widgets/chart';
import { numberInput } from '../widgets/fields';
import type { AnalysisContext } from './context';

export function trajectoryPanel(store: Store<StudioState>, ctx: AnalysisContext) {
  const qChart = new LineChart();
  const speedChart = new LineChart();
  const tauChart = new LineChart();
  const list = h('div');
  const controls = h('div.row');
  const el = h('div.section', {}, h('header', {}, h('span.cap', {}, 'Trajectory'), h('span.cap.mu', {}, 'quintic, stop at waypoints')),
    controls, list,
    h('div.cap.mu', { style: 'margin-top:8px' }, 'Joint positions'), qChart.el,
    h('div.cap.mu', { style: 'margin-top:8px' }, 'Tool speed m/s'), speedChart.el,
    h('div.cap.mu', { style: 'margin-top:8px' }, 'Quasi-static gravity torque'), tauChart.el);
  const render = (s: StudioState) => {
    replace(controls,
      h('button.tb', { class: s.playing ? 'on' : '', onclick: () => store.set({ playing: !s.playing, mode: 'trajectory' }) }, s.playing ? '❚❚ Pause' : '▶ Play'),
      h('button.tb', { onclick: () => store.set({ waypoints: [...s.waypoints.slice(0, -1), [...s.q], s.waypoints.at(-1)!] }) }, '+ Current pose'),
      h('span.mu', {}, 'Duration s'),
      h('div', { style: 'width:70px' }, numberInput(s.duration, (duration) => duration > 0 && store.set({ duration }), { step: 0.5, digits: 2 })));
    replace(list, ...s.waypoints.map((w, i) => h('div.part', {},
      h('span.mono', {}, `${i + 1}. ${w.map((v) => v.toFixed(2)).join(' ')}`),
      h('span', {},
        h('button.tb', { onclick: () => store.set({ q: [...w], playing: false, mode: 'pose' }) }, 'Go'),
        s.waypoints.length > 2 ? h('button.tb', { onclick: () => store.set({ waypoints: s.waypoints.filter((_, j) => j !== i) }) }, '×') : null))));
    const p = ctx.profile();
    if (!p) return;
    const cols = (m: number[][]) => (m[0] ?? []).map((_, k) => m.map((r) => r[k]));
    qChart.setData(p.t, cols(p.q).map((values, k) => ({ label: `q${k + 1}`, color: seriesColor(k), values })));
    speedChart.setData(p.t, [{ label: 'speed', color: '#d6182b', values: p.speed }]);
    tauChart.setData(p.t, cols(p.torque).map((values, k) => ({ label: `τ${k + 1}`, color: seriesColor(k), values })));
  };
  store.on(['waypoints', 'duration', 'playing', 'activeId', 'draft'], render);
  store.on(['time'], (s) => el.offsetParent !== null && [qChart, speedChart, tauChart].forEach((c) => c.draw(s.time)));
  render(store.state);
  return el;
}
