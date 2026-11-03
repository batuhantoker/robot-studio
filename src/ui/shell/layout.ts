/** The studio frame: top bar, robot library/builder, viewport with HUD, analysis panel. */
import { h } from '../dom/h';

export interface Layout {
  topbar: HTMLElement;
  left: HTMLElement;
  stage: HTMLElement;
  hudTop: HTMLElement;
  hudBottom: HTMLElement;
  right: HTMLElement;
  setLoading(text: string | null): void;
}

export function createLayout(root: HTMLElement): Layout {
  const topbar = h('header.topbar');
  const left = h('aside.side');
  const right = h('aside.side.right');
  const hudTop = h('div.hud.top');
  const hudBottom = h('div.hud.bottom');
  const loading = h('div.loading', { style: 'display:none' });
  const stage = h('main.stagewrap', {}, hudTop, hudBottom, loading);
  root.append(h('div.studio', {}, topbar, left, stage, right));
  return {
    topbar, left, stage, hudTop, hudBottom, right,
    setLoading(text) {
      loading.style.display = text ? 'grid' : 'none';
      loading.textContent = text ?? '';
    },
  };
}
