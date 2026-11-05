/** Trajectory stops (pick, move, add, reorder), playback, and the joint / speed / gravity-torque profiles of the path. */
import { addStop, removeStop, reorderStop, selectStop } from '../../app/controller/stops';
import type { LiveBus } from '../../app/live/bus';
import type { Store } from '../../app/state/store';
import type { StudioState } from '../../app/state/types';
import { type Pace, compile, isVia } from '../../core/trajectory/plan';
import { planOf } from '../../app/controller/modes/trajectory';
import { h, replace } from '../dom/h';
import { LineChart, jointSeries } from '../widgets/chart';
import { numberInput } from '../widgets/fields';
import { segmented } from '../widgets/segmented';
import { reorderable } from '../trajectory/reorder';
import { stopItems } from '../trajectory/runs';
import type { AnalysisContext } from './context';

export function trajectoryPanel(store: Store<StudioState>, bus: LiveBus, ctx: AnalysisContext) {
  const qChart = new LineChart();
  const speedChart = new LineChart();
  const tauChart = new LineChart();
  const summary = h('span.cap.mu');
  const controls = h('div.row');
  const ticks = h('datalist', { id: 'stop-ticks' });
  const scrub = h('input.scrub', { type: 'range', min: '0', step: '0.01', title: 'Scrub the path' });
  scrub.setAttribute('list', ticks.id);
  scrub.addEventListener('input', () => store.set({ time: Number(scrub.value), playing: false, selectedStop: null, mode: 'trajectory' }));
  const list = h('div.stops');
  const el = h('div.section', {}, h('header', {}, h('span.cap', {}, 'Trajectory'), summary),
    controls, scrub, ticks, list,
    h('p.note', {}, 'Drag a stop’s badge in the view to move it, or select it and type its position in the bar below the view. With several limbs, the badges follow the focused one; with a stop selected, grab another limb’s marker to move that limb, while the others stay put. Drag rows or chips to reorder. ← → step through every point (Shift: stops only), Esc lets go, Delete removes. Presets live in the bar below the view.'),
    h('div.cap.mu', { style: 'margin-top:8px' }, 'Joint positions'), qChart.el,
    h('div.cap.mu', { style: 'margin-top:8px' }, 'Tool speed m/s'), speedChart.el,
    h('div.cap.mu', { style: 'margin-top:8px' }, 'Quasi-static gravity torque'), tauChart.el);

  const pace = segmented<Pace>([['even', 'Even'], ['distance', 'By distance']], store.state.pace, (p) => store.set({ pace: p }));
  pace.el.title = 'Even: every move takes the same time. By distance: time follows how far the joints travel.';

  const row = (s: StudioState, i: number, via: boolean) => {
    const on = s.selectedStop === i;
    const tip = ctx.stopTips()[i];
    const hold = s.stopOpts[i]?.hold ?? 0;
    return reorderable(h('div.stop', { class: `${on ? 'on' : ''} ${via ? 'via' : ''}`, title: 'Click to edit, drag to reorder', onclick: () => selectStop(store, on ? null : i) },
      h('span.num', {}, String(i + 1)),
      h('span.mono', {}, tip ? `${tip.map((v) => (v * 1000).toFixed(0)).join(', ')} mm` : s.waypoints[i].map((v) => v.toFixed(2)).join(' '),
        via ? h('span.mu', {}, ' · via') : hold > 0 ? h('span.mu', {}, ` · hold ${hold.toFixed(2)} s`) : null),
      s.waypoints.length > 2 ? h('button.tb', { title: 'Remove stop', onclick: (e: Event) => (e.stopPropagation(), removeStop(store, i)) }, '×') : null), i, (from, to) => reorderStop(store, from, to));
  };

  const render = (s: StudioState) => {
    const n = s.waypoints.length;
    const playing = s.playing && s.mode === 'trajectory';
    const plan = planOf(s);
    const vias = s.waypoints.filter((_, i) => isVia(plan, i)).length;
    summary.textContent = n > 1 ? `${n - vias} stops${vias ? ` · ${vias} vias` : ''} · ${s.duration.toFixed(1)} s` : '';
    pace.set(s.pace);
    replace(controls,
      h('button.tb', { class: playing ? 'on' : '', onclick: () => store.set({ playing: !playing, mode: 'trajectory' }) }, playing ? '❚❚ Pause' : '▶ Play'),
      h('button.tb.primary', { title: 'After the selected stop, or at the paused pose', onclick: () => addStop(store, bus.latest?.q ?? null) }, '+ Add stop'),
      h('span.mu', {}, 'Duration s'),
      h('div', { style: 'width:70px' }, numberInput(s.duration, (duration) => duration > 0 && store.set({ duration }), { step: 0.5, digits: 2 })),
      pace.el);
    scrub.max = String(s.duration);
    replace(ticks, ...(n > 1 ? compile(plan).arrive.filter((_, i) => !isVia(plan, i)) : []).map((t) => h('option', { value: String(t) })));
    replace(list, ...stopItems(s).map((it) => it.kind === 'stop' ? row(s, it.i, it.via)
      : h('div.stop.via-run', { title: 'Pass-through points: click to edit the first', onclick: () => selectStop(store, it.from) },
        h('span.num', {}, '⋯'), h('span.mu', {}, `${it.to - it.from + 1} via${it.to > it.from ? 's' : ''} · ${it.from + 1}–${it.to + 1}`))));
    const p = ctx.profile();
    if (!p) return;
    const cols = (m: number[][]) => (m[0] ?? []).map((_, k) => m.map((r) => r[k]));
    qChart.setData(p.t, cols(p.q).map((values, k) => jointSeries(k, `q${k + 1}`, values)));
    speedChart.setData(p.t, [{ label: 'speed', color: '#d6182b', values: p.speed }]);
    tauChart.setData(p.t, cols(p.torque).map((values, k) => jointSeries(k, `τ${k + 1}`, values)));
  };

  window.addEventListener('keydown', (e) => {
    const s = store.state;
    if (s.mode !== 'trajectory' || s.selectedStop === null || (e.target as Element).closest?.('input, textarea, select')) return;
    const n = s.waypoints.length;
    if (e.key === 'Escape') selectStop(store, null);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const plan = planOf(s), step = e.key === 'ArrowRight' ? 1 : n - 1;
      let i = (s.selectedStop + step) % n;
      // Shift skips the vias, jumping stop to stop.
      while (e.shiftKey && isVia(plan, i) && i !== s.selectedStop) i = (i + step) % n;
      selectStop(store, i);
    }
    else if (e.key === 'Delete' || e.key === 'Backspace') removeStop(store, s.selectedStop);
    else return;
    e.preventDefault();
  });

  store.on(['waypoints', 'stopOpts', 'pace', 'duration', 'playing', 'activeId', 'draft', 'selectedStop', 'mode', 'focus'], render);
  store.on(['time'], (s) => {
    if (document.activeElement !== scrub) scrub.value = String(s.time);
    if (el.offsetParent !== null) [qChart, speedChart, tauChart].forEach((c) => c.draw(s.time));
  });
  render(store.state);
  return el;
}
