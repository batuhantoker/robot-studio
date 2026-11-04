/** A gear on the viewport that opens the backdrop, floor and setting choices. */
import type { Store } from '../../app/state/store';
import type { StudioState } from '../../app/state/types';
import { ENVIRONMENTS, type EnvironmentId } from '../../scene/stage/environment';
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

// Line drawings over the backdrop: an open floor, a desk, a lab bench, a fenced cell, a machine tool, racking.
const SETTING_ICON: Record<EnvironmentId, string> = {
  open: '<path d="M6 25h28"/><path d="M17 25v-4h6v4M20 21l3-7 6 3"/>',
  desk: '<path d="M5 17h30M8 17v11M32 17v11"/><path d="M14 17v-3h5v3M16.5 14l2-6 5 2"/>',
  lab: '<path d="M4 19h32M7 19v9M33 19v9"/><path d="M9 19v-3h5v3M11.5 16l2-6 5 2"/><path d="M27 8v4l-3.5 7h9L29 12V8M26 8h4"/><path d="M24.6 16.5h6.8" stroke-width="1"/>',
  cell: '<path d="M5 27V8M13 27V8M5 11h8M5 23h8M13 8l7-3M20 5v17"/><path d="M9 14h2M9 18h2" stroke-width="1"/><path d="M18 24h17M18 27h17"/><path d="M27 24v-3h4v3"/>',
  machine: '<path d="M16 27V6h19v21M16 23h19"/><path d="M19 10h13v10H19z"/><path d="M25.5 10v5" stroke-width="1"/><path d="M33 6V3"/><path d="M4 27h8M6 27v-4h4v4M8 23l2-7 5 2"/>',
  warehouse: '<path d="M5 27V5M17 27V5M5 12h12M5 19h12M5 26h12"/><path d="M7 12V9h3v3M11 12V9.5h4V12M8 19v-3h5v3M7 26v-3h4v3" stroke-width="1"/><path d="M21 25.5h13v-3H21zM23 22.5V19h7v3.5"/><path d="M33 22v-1.5" stroke-width="1"/>',
};

export function mountStageSettings(stage: HTMLElement, store: Store<StudioState>): void {
  const gear = h('button.stage-gear', { title: 'Surroundings: backdrop and floor', 'aria-label': 'Surroundings', 'aria-expanded': 'false' });
  gear.innerHTML = GEAR;
  const backdrops = h('div.swatches');
  const floors = h('div.swatches');
  const settings = h('div.swatches.three');
  const motion = h('button.tb.scenery-motion', { title: 'Run the setting\'s conveyors, machines and vehicles', onclick: () => set({ motion: !store.state.surroundings.motion }) }, 'Motion');
  const panel = h('div.stage-settings', { hidden: true, role: 'dialog', 'aria-label': 'Surroundings' },
    h('h4', {}, 'Backdrop'), backdrops,
    h('h4', {}, 'Floor'), floors,
    h('div.stage-settings-head', {}, h('h4', {}, 'Setting'), motion), settings,
    h('p.hint', {}, 'Applies to the viewport and to rendered video. Pilot stops short of the scenery, and its loose parts can be picked up. In Pick & place, click the top of a bench, table or belt to stand a spot on it.'));
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
    const { backdrop, floor, environment } = s.surroundings;
    motion.classList.toggle('on', s.surroundings.motion);
    motion.setAttribute('aria-pressed', String(s.surroundings.motion));
    const b = BACKDROPS[backdrop];
    replace(backdrops, ...(Object.entries(BACKDROPS) as [BackdropId, Backdrop][]).map(([id, d]) =>
      h('button.swatch', { class: id === backdrop ? 'on' : '', title: d.label, onclick: () => set({ backdrop: id }) }, h('i', { style: `background:${backdropCss(d)}` }), d.label)));
    replace(floors, ...FLOORS.map(([id, label]) =>
      h('button.swatch', { class: id === floor ? 'on' : '', title: label, onclick: () => set({ floor: id }) }, h('i', { style: floorSwatch(id, b) }), label)));
    replace(settings, ...ENVIRONMENTS.map(([id, label]) => {
      const icon = h('i', { style: `background:${backdropCss(b)};color:${b.dark ? '#e9edf3' : '#2a2e34'}` });
      icon.innerHTML = `<svg viewBox="0 0 40 32" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${SETTING_ICON[id]}</svg>`;
      return h('button.swatch', { class: id === environment ? 'on' : '', title: label, onclick: () => set({ environment: id }) }, icon, label);
    }));
  };
  store.on(['surroundings'], render);
  render(store.state);
}
