/** Side panels fold to a thin rail that names the open tab; clicking the rail opens the panel again. */
import { h, replace } from '../../dom/h';
import { isFolded, setFolded } from './memory';

export type Side = 'left' | 'right';

export function foldableSide(aside: HTMLElement, side: Side, shortcut: string): () => void {
  const key = `side:${side}`;
  const nav = aside.querySelector('nav.tabs');
  const fold = h('button.fold', { title: `Collapse panel  ( ${shortcut} )`, onclick: () => set(true) }, side === 'left' ? '‹' : '›');
  const rail = h('button.rail', { title: `Expand panel  ( ${shortcut} )`, onclick: () => set(false) });
  if (side === 'left') nav?.append(fold);
  else nav?.prepend(fold);
  aside.append(rail);
  const set = (closed: boolean) => {
    aside.classList.toggle('closed', closed);
    aside.parentElement?.classList.toggle(`${side}-closed`, closed);
    replace(rail, h('i', {}, side === 'left' ? '›' : '‹'), h('span', {}, nav?.querySelector('button.on')?.textContent ?? ''));
    setFolded(key, closed);
  };
  set(isFolded(key));
  return () => set(!aside.classList.contains('closed'));
}
