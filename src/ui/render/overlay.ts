/** Covers the viewport while a video renders: the frame being encoded, progress, and Cancel. */
import type { RenderProgress } from '../../app/controller/render/recorder';
import { h } from '../dom/h';

export interface RenderFeed {
  onProgress(fn: (p: RenderProgress | null) => void): void;
  cancel(): void;
}

export function mountRenderOverlay(stage: HTMLElement, feed: RenderFeed): void {
  const frame = h('div');
  const meter = h('i');
  const text = h('span');
  const el = h('div.render-overlay', { hidden: true },
    h('div.render-card', {}, frame, h('div.render-meter', {}, meter),
      h('div.row.spread', {}, text, h('button.tb', { onclick: () => feed.cancel() }, 'Cancel'))));
  stage.append(el);
  feed.onProgress((p) => {
    el.hidden = !p;
    if (!p) {
      frame.replaceChildren();
      return;
    }
    if (p.preview.parentElement !== frame) frame.replaceChildren(p.preview);
    const pct = Math.min(100, Math.round((100 * p.frame) / p.frames));
    meter.style.width = `${pct}%`;
    text.replaceChildren(h('b', {}, `Rendering ${pct}%`), `  ·  ${p.label}  ·  frame ${p.frame} / ${p.frames}`);
  });
}
