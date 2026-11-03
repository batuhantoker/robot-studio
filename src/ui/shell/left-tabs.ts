/** Left column: Robots (browse) and Build (edit the active robot). */
import { h } from '../dom/h';

export interface LeftTabs {
  robots: HTMLElement;
  build: HTMLElement;
  show(tab: 'robots' | 'build'): void;
}

export function mountLeftTabs(el: HTMLElement): LeftTabs {
  const panes = { robots: h('div'), build: h('div') };
  const buttons = (['robots', 'build'] as const).map((tab) => {
    const b = h('button.cap', { onclick: () => show(tab) }, tab === 'robots' ? 'Robots' : 'Build');
    b.dataset.tab = tab;
    return b;
  });
  const show = (tab: keyof typeof panes) => {
    for (const b of buttons) b.classList.toggle('on', b.dataset.tab === tab);
    for (const [k, p] of Object.entries(panes)) p.style.display = k === tab ? '' : 'none';
  };
  el.append(h('nav.tabs', {}, ...buttons), panes.robots, panes.build);
  show('robots');
  return { ...panes, show };
}
