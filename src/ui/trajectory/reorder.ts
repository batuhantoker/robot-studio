/** Drag-to-reorder for stop rows and chips; shared, so a chip can be dropped on a row and back. */
let dragging = -1;

export function reorderable<T extends HTMLElement>(el: T, i: number, onMove: (from: number, to: number) => void): T {
  el.draggable = true;
  el.addEventListener('dragstart', (e) => {
    dragging = i;
    e.dataTransfer?.setData('text/plain', String(i));
  });
  el.addEventListener('dragover', (e) => {
    if (dragging < 0 || dragging === i) return;
    e.preventDefault();
    el.classList.add(dragging < i ? 'drop-after' : 'drop-before');
  });
  el.addEventListener('dragleave', () => el.classList.remove('drop-after', 'drop-before'));
  el.addEventListener('drop', (e) => {
    e.preventDefault();
    if (dragging >= 0) onMove(dragging, i);
  });
  el.addEventListener('dragend', () => (dragging = -1));
  return el;
}
