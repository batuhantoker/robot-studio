/** The eight modes: a segmented switch in the desktop top bar, a button and a menu of cards on phones. */
import type { Store } from '../../app/state/store';
import type { Mode, StudioState } from '../../app/state/types';
import { h } from '../dom/h';
import { ICON, MODE_ICON, icon } from './icons';

export interface ModeInfo {
  id: Mode;
  label: string;
  hint: string;
  group: 'play' | 'plan' | 'study';
}

export const MODES: ModeInfo[] = [
  { id: 'pose', label: 'Pose', hint: 'Drag joints and read the live numbers', group: 'play' },
  { id: 'motion', label: 'Motion', hint: 'One-click demo motions', group: 'play' },
  { id: 'pilot', label: 'Pilot', hint: 'Drive a robot on its legs or wheels, or steer an arm by its tool', group: 'play' },
  { id: 'task', label: 'Pick & place', hint: 'Set a pick and a place spot, then run it', group: 'play' },
  { id: 'ik', label: 'IK', hint: 'Drag a target, the joints follow', group: 'plan' },
  { id: 'trajectory', label: 'Trajectory', hint: 'Stops, timing, video and data export', group: 'plan' },
  { id: 'physics', label: 'Physics', hint: 'Tune the controller by hand, or teach it with RL', group: 'study' },
  { id: 'workspace', label: 'Workspace', hint: 'Reachable volume and its limits', group: 'study' },
];

export const modeInfo = (m: Mode): ModeInfo => MODES.find((x) => x.id === m) ?? MODES[0];

/** Entering a mode with something to watch starts it playing, as the old switch did. */
export const enterMode = (store: Store<StudioState>, mode: Mode) =>
  store.set({ mode, playing: mode === 'trajectory' || mode === 'physics' || mode === 'motion' || mode === 'task' });

export interface ModeSwitch {
  el: HTMLElement;
  render(enabled: (m: Mode) => boolean): void;
}

export function modeSwitch(store: Store<StudioState>): ModeSwitch {
  const buttons = MODES.map((m, i) => {
    const b = h('button.mode', { dataset: { v: m.id, group: m.group }, onclick: () => enterMode(store, m.id), title: m.hint },
      icon(MODE_ICON[m.id]), h('span', {}, m.label));
    if (i > 0 && MODES[i - 1].group !== m.group) b.classList.add('group-start');
    return b;
  });
  const el = h('nav.modes', { 'aria-label': 'Mode' }, ...buttons);
  return {
    el,
    render(enabled) {
      for (const b of buttons) {
        const id = b.dataset.v as Mode;
        b.classList.toggle('on', id === store.state.mode);
        b.setAttribute('aria-pressed', String(id === store.state.mode));
        b.disabled = !enabled(id);
        b.title = !b.disabled ? modeInfo(id).hint : id === 'pilot' ? 'Pilot needs an arm to steer, or legs or wheels to drive on' : 'Nothing on this robot is driven';
      }
    },
  };
}

/** Phones: the current mode on a button; tapping opens every mode as a card. */
export function modeMenu(store: Store<StudioState>, extra: HTMLElement[]): ModeSwitch & { button: HTMLElement } {
  const label = h('span');
  const glyph = h('span.glyph');
  const button = h('button.mode-button', { 'aria-haspopup': 'true', 'aria-expanded': 'false' }, glyph, label, icon(ICON.chevron, 'ico chev'));
  const cards = MODES.map((m) => h('button.mode-card', { dataset: { v: m.id }, onclick: () => (enterMode(store, m.id), open(false)) },
    icon(MODE_ICON[m.id]), h('b', {}, m.label), h('small', {}, m.hint)));
  const el = h('div.mode-menu', { hidden: true, role: 'menu' }, h('div.mode-grid', {}, ...cards), h('div.mode-menu-foot', {}, ...extra));
  const open = (on: boolean) => {
    el.hidden = !on;
    button.classList.toggle('on', on);
    button.setAttribute('aria-expanded', String(on));
  };
  button.addEventListener('click', () => open(el.hidden !== false));
  addEventListener('pointerdown', (e) => !el.hidden && !el.contains(e.target as Node) && !button.contains(e.target as Node) && open(false));
  addEventListener('keydown', (e) => e.key === 'Escape' && !el.hidden && open(false));
  return {
    el,
    button,
    render(enabled) {
      const m = modeInfo(store.state.mode);
      label.textContent = m.label;
      glyph.innerHTML = MODE_ICON[m.id];
      for (const c of cards) {
        const id = c.dataset.v as Mode;
        c.classList.toggle('on', id === m.id);
        c.disabled = !enabled(id);
      }
    },
  };
}
