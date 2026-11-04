/** Everything folds: side panels to a rail (`[` and `]`), sections and bars to their titles. */
import type { Layout } from '../layout';
import { isMobile } from '../mobile/media';
import { onReveal, sideOf } from '../reveal';
import { mountBlockFolding } from './blocks';
import { foldableSide } from './sides';

export function mountFolding(layout: Layout): void {
  const left = foldableSide(layout.left, 'left', '[');
  const right = foldableSide(layout.right, 'right', ']');
  mountBlockFolding(layout.left.parentElement!);
  addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement).closest?.('input, select, textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === '[') left.toggle();
    else if (e.key === ']') right.toggle();
  });
  onReveal((tab) => {
    if (isMobile()) return;
    const side = sideOf(tab);
    (side === 'left' ? left : right).open();
    const aside = side === 'left' ? layout.left : layout.right;
    aside.querySelector<HTMLElement>(`nav.tabs button[data-tab="${tab}"]`)?.click();
    if (tab === 'robots') aside.querySelector<HTMLInputElement>('input.search')?.focus();
  });
}
