/**
 * Every section header, bar label and legend title folds its block. Panels rebuild their DOM
 * freely, so folds are keyed by scope and title and re-applied to whatever gets added.
 */
import { isFolded, setFolded } from './memory';

// Math sections open and close their own bodies; the stop editor's label names the stop being edited.
const HANDLES = ['.section:not([data-section]) > header', '.toolbar:not(.stop-edit) > span.cap:first-child', '.legend > .cap:first-child'];
const HANDLE = HANDLES.join(', ');
const BLOCK = HANDLES.map((s) => s.slice(0, s.indexOf(' >'))).join(', ');
const CONTROL = 'button, input, select, textarea, a, label';

function keyOf(handle: Element): string {
  const block = handle.parentElement!;
  const scope = block.closest('.side.right') ? 'right' : block.closest('.side') ? 'left' : 'stage';
  const title = (handle.matches('header') ? handle.querySelector('.cap') : handle)?.textContent?.trim() ?? '';
  return `${scope}:${block.classList[0]}:${title}`;
}

function restore(block: Element): void {
  const handle = [...block.children].find((c) => c.matches(HANDLE));
  if (handle) block.classList.toggle('folded', isFolded(keyOf(handle)));
}

function restoreWithin(node: Element): void {
  if (node.matches(BLOCK)) restore(node);
  node.querySelectorAll(BLOCK).forEach(restore);
}

export function mountBlockFolding(root: HTMLElement): void {
  root.addEventListener('click', (e) => {
    const target = e.target as Element;
    const handle = target.closest(HANDLE);
    const control = target.closest(CONTROL);
    if (!handle || (control && handle.contains(control))) return;
    const block = handle.parentElement!;
    setFolded(keyOf(handle), block.classList.toggle('folded'));
  });
  restoreWithin(root);
  new MutationObserver((records) => {
    for (const r of records) r.addedNodes.forEach((n) => n instanceof Element && restoreWithin(n));
  }).observe(root, { childList: true, subtree: true });
}
