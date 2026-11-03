/** A gear on the viewport that opens the backdrop and floor choices. */
import type { Store } from '../../app/state/store';
import type { StudioState } from '../../app/state/types';
import { BACKDROPS, type Backdrop, type BackdropId, FLOORS, type FloorId, type Surroundings, backdropCss } from '../../scene/stage/surroundings';
import { h, replace } from '../dom/h';

const GEAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';

/** A small picture of each floor, in the current backdrop's colours. */
function floorSwatch(id: FloorId, b: Backdrop): string {
  switch (id) {
    case 'grid':
      return `background: linear-gradient(${b.grid} 1px, transparent 1px) 0 0 / 9px 9px, linear-gradient(90deg, ${b.grid} 1px, transparent 1px) 0 0 / 9px 9px, ${b.floor}`;
    case 'seamless':
      return `background: radial-gradient(ellipse 80% 70% at 50% 75%, ${b.floor} 0%, ${b.bottom} 100%)`;
    case 'polished':
      return `background: linear-gradient(135deg, rgba(255,255,255,0.7) 0%, rgba(255,255,255,0) 42%, rgba(255,255,255,0.28) 64%, rgba(255,255,255,0) 100%), ${b.floor}`;
    case 'tiles':
      return `background: repeating-conic-gradient(${b.floor} 0 25%, ${b.grid} 0 50%) 0 0 / 16px 16px`;
    case 'none':
      return `background: linear-gradient(135deg, transparent 46%, ${b.grid} 46% 54%, transparent 54%), ${backdropCss(b)}`;
  }
}

export function mountStageSettings(stage: HTMLElement, store: Store<StudioState>): void {
  const gear = h('button.stage-gear', { title: 'Surroundings: backdrop and floor', 'aria-label': 'Surroundings', 'aria-expanded': 'false' });
  gear.innerHTML = GEAR;
  const backdrops = h('div.swatches');
  const floors = h('div.swatches');
  const panel = h('div.stage-settings', { hidden: true, role: 'dialog', 'aria-label': 'Surroundings' },
    h('h4', {}, 'Backdrop'), backdrops,
    h('h4', {}, 'Floor'), floors,
    h('p.hint', {}, 'Applies to the viewport and to rendered video.'));
  stage.append(gear, panel);

  const open = (on: boolean) => {
    panel.hidden = !on;
    gear.classList.toggle('on', on);
    gear.setAttribute('aria-expanded', String(on));
  };
  gear.addEventListener('click', () => open(panel.hidden !== false));
  addEventListener('pointerdown', (e) => !panel.hidden && !panel.contains(e.target as Node) && !gear.contains(e.target as Node) && open(false));
  addEventListener('keydown', (e) => e.key === 'Escape' && !panel.hidden && open(false));

  const set = (patch: Partial<Surroundings>) => store.set({ surroundings: { ...store.state.surroundings, ...patch } });
  const render = (s: StudioState) => {
    const { backdrop, floor } = s.surroundings;
    const b = BACKDROPS[backdrop];
    replace(backdrops, ...(Object.entries(BACKDROPS) as [BackdropId, Backdrop][]).map(([id, d]) =>
      h('button.swatch', { class: id === backdrop ? 'on' : '', title: d.label, onclick: () => set({ backdrop: id }) }, h('i', { style: `background:${backdropCss(d)}` }), d.label)));
    replace(floors, ...FLOORS.map(([id, label]) =>
      h('button.swatch', { class: id === floor ? 'on' : '', title: label, onclick: () => set({ floor: id }) }, h('i', { style: floorSwatch(id, b) }), label)));
  };
  store.on(['surroundings'], render);
  render(store.state);
}
