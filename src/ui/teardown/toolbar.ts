/** Cutaway mode, explode amount, and overlay toggles: the teardown controls. */
import type { Store } from '../../app/state/store';
import type { Overlays, StudioState } from '../../app/state/types';
import { LOOKS, type Look } from '../../scene/look/types';
import type { Cut } from '../../scene/teardown/materials';
import { h } from '../dom/h';
import { segmented, toggle } from '../widgets/segmented';

const OVERLAYS: [keyof Overlays, string][] = [
  ['frames', 'Axes'], ['com', 'CoM'], ['ellipsoid', 'Ellipsoid'], ['trail', 'Trail'], ['workspace', 'Workspace'],
];

export function mountToolbar(el: HTMLElement, store: Store<StudioState>): HTMLElement {
  const cut = segmented<Cut>([['solid', 'Solid'], ['glass', 'Glass'], ['section', 'Section']], store.state.cut, (c) => store.set({ cut: c }));
  const look = segmented<Look>(LOOKS, store.state.look, (l) => store.set({ look: l }));
  const slider = h('input', { type: 'range', min: '0', max: '1', step: '0.01', value: String(store.state.explode) });
  slider.addEventListener('input', () => store.set({ explode: Number(slider.value) }));
  const toggles = OVERLAYS.map(([key, label]) => {
    const b = toggle(label, store.state.overlays[key], (v) => store.set({ overlays: { ...store.state.overlays, [key]: v } }));
    return [key, b] as const;
  });
  const stack = h('div.toolbar-stack', {},
    h('div.toolbar', {}, h('span.cap', {}, 'Look'), look.el),
    h('div.toolbar', {}, h('span.cap', {}, 'Teardown'), cut.el, h('span.cap.mu', {}, 'Explode'), slider, h('div.seg', {}, ...toggles.map(([, b]) => b))));
  el.append(stack);
  store.on(['cut', 'look', 'explode', 'overlays'], (s) => {
    cut.set(s.cut);
    look.set(s.look);
    if (document.activeElement !== slider) slider.value = String(s.explode);
    for (const [key, b] of toggles) b.classList.toggle('on', s.overlays[key]);
  });
  return stack;
}
