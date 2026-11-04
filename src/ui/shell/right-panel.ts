/** Right column: Live readouts, Math derivations, and Analysis tools. */
import type { Store } from '../../app/state/store';
import type { RightTab, StudioState } from '../../app/state/types';
import { h } from '../dom/h';
import { ICON, icon } from './icons';

export function mountRightTabs(el: HTMLElement, store: Store<StudioState>): Record<RightTab, HTMLElement> {
  const panes: Record<RightTab, HTMLElement> = { live: h('div.pane'), math: h('div.pane'), analysis: h('div.pane') };
  const labels: [RightTab, string][] = [['live', 'Live'], ['math', 'Math'], ['analysis', 'Analysis']];
  const buttons = labels.map(([tab, label]) => h('button', { onclick: () => store.set({ tab }), dataset: { tab } }, icon(ICON[tab]), h('span', {}, label)));
  el.append(h('nav.tabs', {}, ...buttons), panes.live, panes.math, panes.analysis);
  const render = (s: StudioState) => {
    for (const b of buttons) b.classList.toggle('on', b.dataset.tab === s.tab);
    for (const [tab, pane] of Object.entries(panes)) pane.style.display = tab === s.tab ? '' : 'none';
  };
  store.on(['tab'], render);
  render(store.state);
  return panes;
}
