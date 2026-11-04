/** Dock bars for the modes whose tools live in the Analysis panel: the main action, and a way to the panel. */
import type { Store } from '../../app/state/store';
import type { StudioState } from '../../app/state/types';
import type { AnalysisContext } from '../analysis/context';
import { h, replace } from '../dom/h';
import { ICON, icon } from './icons';
import { reveal } from './reveal';

export function mountModeBar(stack: HTMLElement, store: Store<StudioState>, ctx: AnalysisContext): void {
  const bar = h('div.toolbar.mode-bar');
  stack.append(bar);
  const panel = (label: string) => h('button.tb.ghost', { onclick: () => reveal('analysis'), title: 'Open the Analysis panel' }, icon(ICON.analysis), label);
  const note = (text: string) => h('span.mu.bar-note', {}, text);
  const analyze = (samples: number) => {
    ctx.runWorkspace(samples);
    store.set({ overlays: { ...store.state.overlays, workspace: true } });
  };
  let shown = '';
  const render = (s: StudioState) => {
    const key = s.mode === 'physics' ? `physics:${s.playing}` : s.mode === 'ik' ? `ik:${s.targets.some(Boolean)}` : s.mode;
    if (key === shown) return;
    shown = key;
    bar.style.display = s.mode === 'ik' || s.mode === 'physics' || s.mode === 'workspace' ? '' : 'none';
    if (s.mode === 'ik') {
      replace(bar, h('span.cap', {}, 'IK'),
        note('Drag the red gizmo; every joint follows'),
        s.targets.some(Boolean) ? h('button.tb', { onclick: () => store.set({ targets: [] }) }, 'Clear targets') : null,
        panel('Targets'));
    } else if (s.mode === 'physics') {
      replace(bar, h('span.cap', {}, 'Physics'),
        h('button.tb.primary', { onclick: () => store.set({ playing: !store.state.playing, mode: 'physics' }) }, s.playing ? '❚❚ Pause' : '▶ Simulate'),
        h('button.tb', { onclick: () => ctx.restartPhysics() }, 'Restart'),
        note('MuJoCo tracks the trajectory'),
        panel('Torque charts'));
    } else if (s.mode === 'workspace') {
      replace(bar, h('span.cap', {}, 'Workspace'),
        h('button.tb.primary', { onclick: () => analyze(2500) }, 'Analyze'),
        h('button.tb', { onclick: () => analyze(10000), title: 'Denser sampling, a few seconds on big robots' }, 'Dense 10k'),
        panel('Results'));
    }
  };
  store.on(['mode', 'playing', 'targets'], render);
  render(store.state);
  // Entering Workspace turns its cloud on; leaving takes it away again, or it haunts every other mode.
  let last = store.state.mode;
  store.on(['mode'], (s) => {
    if (last === 'workspace' && s.mode !== 'workspace' && s.overlays.workspace) store.set({ overlays: { ...s.overlays, workspace: false } });
    last = s.mode;
  });
}
