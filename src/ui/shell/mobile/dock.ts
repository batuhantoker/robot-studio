/** Phone navigation: a bottom tab bar whose buttons open the side panels as bottom sheets, one at a time. */
import type { Store } from '../../../app/state/store';
import type { StudioState } from '../../../app/state/types';
import { h } from '../../dom/h';
import { ICON, icon } from '../icons';
import type { Layout } from '../layout';
import { type PanelTab, onReveal, sideOf } from '../reveal';
import { isMobile, onMobileChange } from './media';

type Side = 'left' | 'right';

const TARGETS: [PanelTab, string][] = [['robots', 'Robots'], ['build', 'Build'], ['live', 'Live'], ['math', 'Math'], ['analysis', 'Analysis']];

const activeTab = (aside: HTMLElement) => aside.querySelector<HTMLElement>('nav.tabs button.on')?.dataset.tab;

export function mountMobileDock(layout: Layout, store: Store<StudioState>): void {
  const asides: Record<Side, HTMLElement> = { left: layout.left, right: layout.right };
  let open: Side | null = null;
  const buttons = TARGETS.map(([tab, label]) => h('button', { onclick: () => toggle(tab), dataset: { tab } }, icon(ICON[tab]), h('span', {}, label)));
  layout.left.parentElement!.append(h('nav.dock', { 'aria-label': 'Panels' }, ...buttons));

  const titles = new Map<Side, HTMLElement>();
  const sync = () => {
    const tab = open ? activeTab(asides[open]) : null;
    buttons.forEach((b) => b.classList.toggle('on', !!open && b.dataset.tab === tab));
    for (const [side, title] of titles) title.textContent = TARGETS.find(([t]) => t === activeTab(asides[side]))?.[1] ?? '';
  };
  const set = (side: Side | null) => {
    open = side;
    for (const [s, el] of Object.entries(asides)) el.classList.toggle('sheet', s === side);
    document.documentElement.classList.toggle('sheet-open', !!side);
    sync();
  };
  const show = (tab: PanelTab) => {
    const side = sideOf(tab);
    asides[side].querySelector<HTMLElement>(`nav.tabs button[data-tab="${tab}"]`)?.click();
    set(side);
    asides[side].scrollTop = 0;
  };
  const toggle = (tab: PanelTab) => (open === sideOf(tab) && activeTab(asides[open]) === tab ? set(null) : show(tab));

  for (const [side, aside] of Object.entries(asides) as [Side, HTMLElement][]) {
    const title = h('b');
    titles.set(side, title);
    aside.prepend(h('div.sheet-head', {},
      h('button.sheet-grip', { onclick: () => set(null), title: 'Close', 'aria-label': 'Close panel' }, h('i')),
      h('div.sheet-title', {}, title, h('button.icon-btn', { onclick: () => set(null), 'aria-label': 'Close panel' }, icon(ICON.close)))));
    // Tabs also switch from code (New robot opens Build), so follow the tab bar itself.
    const nav = aside.querySelector('nav.tabs');
    if (nav) new MutationObserver(sync).observe(nav, { subtree: true, attributes: true, attributeFilter: ['class'] });
  }
  onReveal((tab) => isMobile() && show(tab));
  // Picking a robot from the sheet shows it.
  store.on(['activeId'], () => isMobile() && open === 'left' && activeTab(asides.left) === 'robots' && set(null));
  onMobileChange((mobile) => !mobile && set(null));
}
