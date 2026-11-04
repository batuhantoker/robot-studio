/** The Analysis tab shows the current mode's tools; the other tools wait in a short list below. */
import type { Store } from '../../app/state/store';
import type { Mode, StudioState } from '../../app/state/types';
import { h, replace } from '../dom/h';
import { MODE_ICON, icon } from './icons';
import { enterMode, modeInfo } from './modes';

export interface Tool {
  el: HTMLElement;
  modes: Mode[];
}

const TOOL_MODES: Mode[] = ['ik', 'trajectory', 'physics', 'workspace'];

export function mountAnalysisPane(pane: HTMLElement, store: Store<StudioState>, tools: Tool[]): void {
  const index = h('div.tool-index');
  pane.append(...tools.map((t) => t.el), index);
  let shown: Mode | null = null;
  const render = (s: StudioState) => {
    if (s.mode === shown) return;
    shown = s.mode;
    for (const t of tools) t.el.style.display = t.modes.includes(s.mode) ? '' : 'none';
    const current = TOOL_MODES.includes(s.mode);
    replace(index,
      h('div.cap.mu', {}, current ? 'Other tools' : 'Analysis tools'),
      current ? null : h('p.note', {}, 'Each tool is a mode. Pick one to open its controls here and on the stage.'),
      ...TOOL_MODES.filter((m) => m !== s.mode).map((m) => h('button.tool-card', { onclick: () => enterMode(store, m) },
        icon(MODE_ICON[m]), h('span', {}, h('b', {}, modeInfo(m).label), h('small', {}, modeInfo(m).hint)))));
  };
  store.on(['mode'], render);
  render(store.state);
}
