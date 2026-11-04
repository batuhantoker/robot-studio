/** The Rubik's cube preset's line in the dock: what the hand is doing, and a fresh scramble. */
import type { Store } from '../../app/state/store';
import type { StudioState } from '../../app/state/types';
import { h } from '../dom/h';

export interface RubikView {
  active(): boolean;
  status(): string;
  /** How well this hand keeps up; empty when there is nothing to say yet. */
  reach(): string;
  newScramble(): void;
  onChange(fn: () => void): void;
}

export function mountRubikBar(el: HTMLElement, store: Store<StudioState>, view: RubikView): void {
  const status = h('span.mu.bar-note', { style: 'font-variant-numeric:tabular-nums' });
  const reach = h('span.mu.bar-note', { style: 'font-variant-numeric:tabular-nums;opacity:.8' });
  const again = h('button.tb', { onclick: () => view.newScramble(), title: 'Scramble the cube again and solve the new one' }, 'New scramble');
  const bar = h('div.toolbar.rubik-bar', {}, h('span.cap', {}, 'Rubik’s cube'), again, status, reach);
  el.prepend(bar);
  const render = () => {
    const on = view.active();
    bar.style.display = on ? '' : 'none';
    if (!on) return;
    status.textContent = view.status();
    reach.textContent = view.reach();
  };
  store.on(['mode', 'motion', 'sessionVersion'], render);
  view.onChange(render);
  render();
}
