/** The View menu over the stage: look, cutaway, explode, overlays, and the part to isolate. */
import type { Store } from '../../app/state/store';
import type { Overlays, StudioState } from '../../app/state/types';
import { LOOKS, type Look } from '../../scene/look/types';
import type { Cut } from '../../scene/teardown/materials';
import { h } from '../dom/h';
import { ICON, icon } from '../shell/icons';
import { segmented, toggle } from '../widgets/segmented';

const OVERLAYS: [keyof Overlays, string][] = [
  ['frames', 'Axes'], ['com', 'CoM'], ['ellipsoid', 'Ellipsoid'], ['trail', 'Trail'], ['workspace', 'Workspace'],
];

/** Mounts the button and its menu into `tools`; returns where the part picker goes. */
export function mountViewMenu(tools: HTMLElement, store: Store<StudioState>): { parts: HTMLElement } {
  const cut = segmented<Cut>([['solid', 'Solid'], ['glass', 'Glass'], ['section', 'Section']], store.state.cut, (c) => store.set({ cut: c }));
  const look = segmented<Look>(LOOKS, store.state.look, (l) => store.set({ look: l }));
  const slider = h('input', { type: 'range', min: '0', max: '1', step: '0.01', value: String(store.state.explode), 'aria-label': 'Explode' });
  const amount = h('span.mono.mu.explode-val');
  slider.addEventListener('input', () => store.set({ explode: Number(slider.value) }));
  const toggles = OVERLAYS.map(([key, label]) => {
    const b = toggle(label, store.state.overlays[key], (v) => store.set({ overlays: { ...store.state.overlays, [key]: v } }));
    return [key, b] as const;
  });
  const parts = h('div.view-parts');
  const button = h('button.stage-gear.stage-view', { title: 'View: look, teardown, overlays', 'aria-label': 'View', 'aria-expanded': 'false' }, icon(ICON.view));
  const panel = h('div.stage-settings.view-panel', { hidden: true, role: 'dialog', 'aria-label': 'View' },
    h('h4', {}, 'Look'), h('div.fill', {}, look.el),
    h('h4', {}, 'Teardown'), h('div.fill', {}, cut.el),
    h('div.explode', {}, h('span', {}, 'Explode'), slider, amount),
    h('h4', {}, 'Show'), h('div.chips-wrap', {}, ...toggles.map(([, b]) => b)),
    h('h4', {}, 'Isolate a part'), parts,
    h('p.hint', {}, 'Isolate lists a module’s parts; raise Explode to open it up.'));
  tools.append(button, panel);

  const open = (on: boolean) => {
    panel.hidden = !on;
    button.classList.toggle('on', on);
    button.setAttribute('aria-expanded', String(on));
  };
  button.addEventListener('click', () => open(panel.hidden !== false));
  addEventListener('pointerdown', (e) => !panel.hidden && !panel.contains(e.target as Node) && !button.contains(e.target as Node) && open(false));
  addEventListener('keydown', (e) => e.key === 'Escape' && !panel.hidden && open(false));

  const render = (s: StudioState) => {
    cut.set(s.cut);
    look.set(s.look);
    if (document.activeElement !== slider) slider.value = String(s.explode);
    amount.textContent = `${Math.round(s.explode * 100)}%`;
    for (const [key, b] of toggles) b.classList.toggle('on', s.overlays[key]);
    // Anything but the plain studio view marks the button, so a changed view is never a mystery.
    const o = s.overlays;
    button.classList.toggle('dirty', s.look !== LOOKS[0][0] || s.cut !== 'solid' || s.explode > 0 || !!s.isolate || o.frames || o.com || o.ellipsoid || o.workspace);
  };
  store.on(['cut', 'look', 'explode', 'overlays', 'isolate'], render);
  render(store.state);
  return { parts };
}
