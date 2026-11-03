/** One-click motions for the loaded robot: preset chips, play/pause, speed, and size. */
import type { MotionPreset } from '../../core/motion/types';
import type { Store } from '../../app/state/store';
import type { StudioState } from '../../app/state/types';
import { h, replace } from '../dom/h';

function slider(label: string, min: number, max: number, value: number, onInput: (v: number) => void) {
  const input = h('input', { type: 'range', min: String(min), max: String(max), step: '0.05', value: String(value), style: 'width:80px' });
  const out = h('span.mono.mu', { style: 'font-size:10.5px;width:34px' }, `${value.toFixed(2)}×`);
  input.addEventListener('input', () => {
    out.textContent = `${Number(input.value).toFixed(2)}×`;
    onInput(Number(input.value));
  });
  return h('label.row', { style: 'gap:4px' }, h('span.cap.mu', {}, label), input, out);
}

export function mountMotionBar(el: HTMLElement, store: Store<StudioState>, presets: () => MotionPreset[]): void {
  const bar = h('div.toolbar.motion-bar');
  el.prepend(bar);
  let sliders: HTMLElement | null = null;
  const chips = h('div.seg');
  const play = h('button.tb');
  play.addEventListener('click', () => store.set({ playing: !store.state.playing, mode: 'motion' }));
  const render = (s: StudioState) => {
    const list = presets();
    bar.style.display = list.length ? '' : 'none';
    replace(chips, ...list.map((p) => h('button.tb', {
      class: s.mode === 'motion' && s.motion.preset === p.id ? 'on' : '',
      title: p.hint,
      onclick: () => store.set({ mode: 'motion', playing: true, time: 0, motion: { ...store.state.motion, preset: p.id } }),
    }, p.label)));
    const active = s.mode === 'motion' && !!s.motion.preset;
    play.textContent = active && s.playing ? '❚❚' : '▶';
    play.disabled = !active;
  };
  sliders ??= h('div.row', {},
    slider('Speed', 0.25, 2, store.state.motion.speed, (speed) => store.set({ motion: { ...store.state.motion, speed } })),
    slider('Size', 0.25, 1.75, store.state.motion.size, (size) => store.set({ motion: { ...store.state.motion, size } })));
  bar.append(h('span.cap', {}, 'Motion'), chips, play, sliders);
  store.on(['sessionVersion', 'mode', 'motion', 'playing'], render);
  render(store.state);
}
