/** The trajectory editor on the viewport: presets, stop chips, play, add, scrub, and the selected stop. */
import { planOf } from '../../app/controller/modes/trajectory';
import { addStop, removeStop, reorderStop, selectStop, setStopOpts } from '../../app/controller/stops';
import type { LiveBus } from '../../app/live/bus';
import type { Store } from '../../app/state/store';
import type { StudioState } from '../../app/state/types';
import type { Vec3 } from '../../core/math/linear/vec';
import { compile, isVia } from '../../core/trajectory/plan';
import type { TrajectoryPreset } from '../../core/trajectory/presets/build';
import type { AnalysisContext } from '../analysis/context';
import { h, replace } from '../dom/h';
import { numberInput, vecInput } from '../widgets/fields';
import { reorderable } from './reorder';
import { stopItems } from './runs';

export interface PresetSource {
  list(): TrajectoryPreset[];
  /** Load and play; returns a note for the user, if any. */
  load(id: string): string | null;
}

export function mountTrajectoryBar(el: HTMLElement, store: Store<StudioState>, bus: LiveBus, ctx: AnalysisContext, presets: PresetSource): void {
  const play = h('button.tb', { onclick: () => store.set({ playing: !store.state.playing, mode: 'trajectory' }) });
  const picker = h('select.preset', { title: 'Load a preset trajectory for the focused limb' });
  const note = h('span.mu.preset-note');
  let noteTimer = 0;
  picker.addEventListener('change', () => {
    const id = picker.value;
    picker.value = '';
    if (!id) return;
    note.textContent = 'Planning…';
    // Let the note paint before the solve.
    requestAnimationFrame(() => setTimeout(() => {
      note.textContent = presets.load(id) ?? '';
      clearTimeout(noteTimer);
      noteTimer = window.setTimeout(() => (note.textContent = ''), 7000);
    }));
  });
  const chips = h('div.seg.stop-chips');
  const ticks = h('datalist', { id: 'bar-stop-ticks' });
  const scrub = h('input.scrub-mini', { type: 'range', min: '0', step: '0.01', title: 'Scrub the path' });
  scrub.setAttribute('list', ticks.id);
  scrub.addEventListener('input', () => store.set({ time: Number(scrub.value), playing: false, selectedStop: null, mode: 'trajectory' }));
  const clock = h('span.mono.mu.clock');
  const total = h('div', { style: 'width:52px' });
  const stop = h('div.toolbar.stop-edit');
  // The stop row sits above the chips: the HUD grows upward, so the chips stay put when it appears.
  const wrap = h('div.toolbar-stack.traj', {}, stop,
    h('div.toolbar', {}, h('span.cap', {}, 'Trajectory'), picker, note),
    h('div.toolbar', {},
      play, chips,
      h('button.tb', { title: 'Add a stop after the selected one, or at the paused pose', onclick: () => addStop(store, bus.latest?.q ?? null) }, '+ Stop'),
      scrub, ticks, clock, h('span.cap.mu', {}, 'Total'), total, h('span.mu', {}, 's')));
  el.prepend(wrap);

  let listed = '';
  const fillPicker = () => {
    const list = presets.list();
    const key = list.map((p) => p.id).join();
    if (key === listed) return;
    listed = key;
    replace(picker, h('option', { value: '' }, 'Presets…'), ...list.map((p) => h('option', { value: p.id, title: p.hint }, p.label)));
  };

  const render = (s: StudioState) => {
    wrap.style.display = s.mode === 'trajectory' && s.waypoints.length > 1 ? '' : 'none';
    if (wrap.style.display) return;
    fillPicker();
    const n = s.waypoints.length, plan = planOf(s);
    play.textContent = s.playing ? '❚❚' : '▶';
    play.classList.toggle('on', s.playing);
    replace(chips, ...stopItems(s).map((it) => it.kind === 'vias'
      ? h('button.tb.via-run', {
        title: `Vias ${it.from + 1}–${it.to + 1}: the path flows through them. Click to edit one.`,
        onclick: () => selectStop(store, it.from),
      }, `⋯${it.to - it.from + 1}`)
      : reorderable(h('button.tb.stop-chip', {
        class: `${s.selectedStop === it.i ? 'on' : ''} ${it.via ? 'via' : ''} ${(s.stopOpts[it.i]?.hold ?? 0) > 0 ? 'held' : ''}`,
        title: `${it.via ? 'Via' : 'Stop'} ${it.i + 1}: click to edit, drag to reorder`,
        onclick: () => selectStop(store, s.selectedStop === it.i ? null : it.i),
      }, String(it.i + 1)), it.i, (from, to) => reorderStop(store, from, to))));
    scrub.max = String(s.duration);
    replace(ticks, ...compile(plan).arrive.filter((_, i) => !isVia(plan, i)).map((t) => h('option', { value: String(t) })));
    replace(total, numberInput(s.duration, (duration) => duration > 0 && store.set({ duration }), { step: 0.5, digits: 1 }));
    const i = s.selectedStop, tip = i === null ? undefined : ctx.stopTips()[i];
    stop.style.display = tip ? '' : 'none';
    if (i === null || !tip) return;
    const via = isVia(plan, i), end = i === 0 || i === n - 1;
    const kind = (v: boolean) => h('button.tb', { class: via === v ? 'on' : '', onclick: () => setStopOpts(store, i, { via: v }) }, v ? 'Via' : 'Stop');
    replace(stop,
      h('span.cap', {}, `${via ? 'Via' : 'Stop'} ${i + 1}`),
      end ? null : h('div.seg', { title: 'Stop: come to rest here. Via: pass through without stopping.' }, kind(false), kind(true)),
      via ? null : h('span.cap.mu', {}, 'Hold'),
      via ? null : h('div', { style: 'width:46px' }, numberInput(s.stopOpts[i]?.hold ?? 0, (hold) => setStopOpts(store, i, { hold: Math.max(hold, 0) }), { step: 0.1, digits: 2 })),
      via ? null : h('span.mu', {}, 's'),
      h('div.stop-xyz', {}, vecInput(tip, (v) => ctx.moveStop(i, v as Vec3), { scale: 1000, step: 5, digits: 0 })),
      h('span.mu', {}, 'mm'),
      n > 2 ? h('button.tb', { title: 'Remove this stop (Delete)', onclick: () => removeStop(store, i) }, 'Remove') : null,
      h('button.tb', { title: 'Let go of the stop (Esc)', onclick: () => selectStop(store, null) }, 'Done'));
  };
  const tick = (s: StudioState) => {
    if (document.activeElement !== scrub) scrub.value = String(s.time);
    clock.textContent = `${s.time.toFixed(1)} / ${s.duration.toFixed(1)} s`;
  };
  store.on(['waypoints', 'stopOpts', 'pace', 'duration', 'playing', 'selectedStop', 'mode', 'focus', 'sessionVersion'], render);
  store.on(['time', 'duration'], tick);
  render(store.state);
  tick(store.state);
}
