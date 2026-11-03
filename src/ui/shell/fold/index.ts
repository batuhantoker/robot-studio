/** Everything folds: side panels to a rail (`[` and `]`), sections and bars to their titles. */
import type { Layout } from '../layout';
import { mountBlockFolding } from './blocks';
import { foldableSide } from './sides';

export function mountFolding(layout: Layout): void {
  const left = foldableSide(layout.left, 'left', '[');
  const right = foldableSide(layout.right, 'right', ']');
  mountBlockFolding(layout.left.parentElement!);
  addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement).closest?.('input, select, textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === '[') left();
    else if (e.key === ']') right();
  });
}
