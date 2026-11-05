/** Pick and place controls: which spot the gizmo moves, play, and what the plan says. */
import type { Store } from '../../app/state/store';
import type { StudioState } from '../../app/state/types';
import { h, replace } from '../dom/h';

export interface TaskView {
  available(): boolean;
  object(): string | null;
  status(): { text: string; bad: boolean; busy?: boolean };
  missing?(): string;
  onChange(fn: () => void): void;
}

export function mountTaskBar(el: HTMLElement, store: Store<StudioState>, view: TaskView): void {
  const bar = h('div.toolbar.task-bar');
  el.prepend(bar);
  const spots = h('div.seg');
  const play = h('button.tb', { onclick: () => store.set({ playing: !store.state.playing }) });
  const status = h('span.mu', { style: 'font-size:11px;max-width:420px' });
  bar.append(h('span.cap', {}, 'Pick & place'), spots, play, status);
  const render = () => {
    const s = store.state;
    bar.style.display = s.mode === 'task' ? '' : 'none';
    const ready = view.available();
    replace(spots, ...(ready ? (['pick', 'place'] as const).map((k) => h('button.tb', {
      class: s.task.moving === k ? 'on' : '',
      title: 'Then drag the arrows, or click the floor',
      onclick: () => store.set({ task: { ...s.task, moving: k } }),
    }, k === 'pick' ? `Pick ${view.object()?.toLowerCase() ?? ''}` : 'Place')) : []));
    const st: ReturnType<TaskView['status']> = ready ? view.status() : { text: view.missing?.() ?? 'Needs a gripper: choose one under Build → End effector.', bad: true };
    play.textContent = s.playing ? '❚❚' : '▶';
    play.disabled = !ready || st.bad || !!st.busy;
    status.textContent = st.text;
    status.classList.toggle('accent', st.bad);
  };
  store.on(['mode', 'task', 'playing', 'sessionVersion'], render);
  view.onChange(render);
  render();
}
