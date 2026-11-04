/** Side panels fold to a thin rail of tab icons; any icon opens the panel on that tab. */
import { h } from '../../dom/h';
import { ICON, icon } from '../icons';
import { isFolded, setFolded } from './memory';

export type Side = 'left' | 'right';

export interface FoldableSide {
  toggle(): void;
  open(): void;
}

export function foldableSide(aside: HTMLElement, side: Side, shortcut: string): FoldableSide {
  const key = `side:${side}`;
  const nav = aside.querySelector('nav.tabs');
  const tabs = [...(nav?.querySelectorAll<HTMLButtonElement>('button[data-tab]') ?? [])];
  const fold = h('button.fold', { title: `Hide panel  ( ${shortcut} )`, 'aria-label': 'Hide panel', onclick: () => set(true) }, icon(side === 'left' ? ICON.left : ICON.right));
  const rail = h('div.rail', {},
    h('button.rail-open', { title: `Show panel  ( ${shortcut} )`, 'aria-label': 'Show panel', onclick: () => set(false) }, icon(side === 'left' ? ICON.right : ICON.left)),
    ...tabs.map((t) => h('button', {
      title: t.textContent ?? '',
      dataset: { tab: t.dataset.tab ?? '' },
      onclick: () => (t.click(), set(false)),
    }, icon(t.querySelector('.ico')?.innerHTML ?? ''))));
  if (side === 'left') nav?.append(fold);
  else nav?.prepend(fold);
  aside.append(rail);
  const set = (closed: boolean) => {
    aside.classList.toggle('closed', closed);
    aside.parentElement?.classList.toggle(`${side}-closed`, closed);
    setFolded(key, closed);
  };
  set(isFolded(key));
  return { toggle: () => set(!aside.classList.contains('closed')), open: () => set(false) };
}
