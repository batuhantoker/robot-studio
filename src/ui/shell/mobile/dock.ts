/** Phone navigation: a bottom dock whose buttons open the side panels as bottom sheets, one at a time. */
import type { Store } from '../../../app/state/store';
import type { StudioState } from '../../../app/state/types';
import { h } from '../../dom/h';
import type { Layout } from '../layout';
import { isMobile, onMobileChange } from './media';

type Side = 'left' | 'right';
interface Target {
  side: Side;
  tab: string;
  label: string;
}

const TARGETS: Target[] = [
  { side: 'left', tab: 'robots', label: 'Robots' },
  { side: 'left', tab: 'build', label: 'Build' },
  { side: 'right', tab: 'live', label: 'Live' },
  { side: 'right', tab: 'math', label: 'Math' },
  { side: 'right', tab: 'analysis', label: 'Analysis' },
];

const activeTab = (aside: HTMLElement) => aside.querySelector<HTMLElement>('nav.tabs button.on')?.dataset.tab;

export function mountMobileDock(layout: Layout, store: Store<StudioState>): void {
  const asides: Record<Side, HTMLElement> = { left: layout.left, right: layout.right };
  let open: Side | null = null;
  const buttons = TARGETS.map((t) => h('button', { onclick: () => toggle(t) }, h('i'), t.label));
  layout.left.parentElement!.append(h('nav.dock', {}, ...buttons));

  const sync = () => {
    const tab = open ? activeTab(asides[open]) : null;
    buttons.forEach((b, i) => b.classList.toggle('on', TARGETS[i].side === open && TARGETS[i].tab === tab));
  };
  const set = (side: Side | null) => {
    open = side;
    for (const [s, el] of Object.entries(asides)) el.classList.toggle('sheet', s === side);
    document.documentElement.classList.toggle('sheet-open', !!side);
    sync();
  };
  const toggle = (t: Target) => {
    if (open === t.side && activeTab(asides[t.side]) === t.tab) return set(null);
    asides[t.side].querySelector<HTMLElement>(`nav.tabs button[data-tab="${t.tab}"]`)?.click();
    set(t.side);
  };

  for (const aside of Object.values(asides)) {
    aside.prepend(h('button.sheet-grip', { onclick: () => set(null), title: 'Close', 'aria-label': 'Close panel' }, h('i')));
    // Tabs also switch from code (New robot opens Build), so follow the tab bar itself.
    const nav = aside.querySelector('nav.tabs');
    if (nav) new MutationObserver(sync).observe(nav, { subtree: true, attributes: true, attributeFilter: ['class'] });
  }
  // Picking a robot from the sheet shows it.
  store.on(['activeId'], () => isMobile() && open === 'left' && activeTab(asides.left) === 'robots' && set(null));
  onMobileChange((mobile) => !mobile && set(null));
}
