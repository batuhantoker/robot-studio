/** The studio frame: top bar, robot library/builder, viewport with HUD, analysis panel. */
import { h } from '../dom/h';

export interface Layout {
  topbar: HTMLElement;
  left: HTMLElement;
  stage: HTMLElement;
  hudTop: HTMLElement;
  /** The contextual dock: the current mode's bar, centred at the bottom of the stage. */
  hudBottom: HTMLElement;
  /** Top-right buttons over the stage (robots, view, surroundings); their popovers open beneath. */
  tools: HTMLElement;
  right: HTMLElement;
  setLoading(text: string | null): void;
}

export function createLayout(root: HTMLElement): Layout {
  const topbar = h('header.topbar');
  const left = h('aside.side.left');
  const right = h('aside.side.right');
  const hudTop = h('div.hud.top');
  const hudBottom = h('div.hud.bottom');
  const tools = h('div.stage-tools');
  const label = h('span');
  const loading = h('div.loading', { style: 'display:none' }, h('div.loading-card', {}, h('i.spinner'), label));
  const stage = h('main.stagewrap', {}, hudTop, hudBottom, tools, loading);
  root.append(h('div.studio', {}, topbar, left, stage, right));
  return {
    topbar, left, stage, hudTop, hudBottom, tools, right,
    setLoading(text) {
      loading.style.display = text ? 'grid' : 'none';
      label.textContent = text ?? '';
    },
  };
}
