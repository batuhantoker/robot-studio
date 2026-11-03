/** Brand, the active robot, and the interaction modes. */
import type { Mode, StudioState } from '../../app/state/types';
import type { Store } from '../../app/state/store';
import { h, replace } from '../dom/h';
import { segmented } from '../widgets/segmented';
import markUrl from '../brand/mark.svg';

const MODES: [Mode, string][] = [
  ['pose', 'Pose'], ['motion', 'Motion'], ['pilot', 'Pilot'], ['task', 'Pick & place'], ['ik', 'Inverse kin.'], ['trajectory', 'Trajectory'], ['physics', 'Physics'], ['workspace', 'Workspace'],
];

/** `enabled` greys out modes the loaded robot cannot use (Pilot needs legs or wheels). */
export function mountTopbar(el: HTMLElement, store: Store<StudioState>, titleOf: () => [string, string], extra: HTMLElement, enabled: (m: Mode) => boolean = () => true): void {
  const title = h('div.robot-title');
  const modes = segmented(MODES, store.state.mode, (mode) => store.set({ mode, playing: mode === 'trajectory' || mode === 'physics' || mode === 'motion' || mode === 'task' }));
  const tour = h('div.tourchip.cap', { onclick: () => store.set({ touring: !store.state.touring }) }, h('i'), 'Auto tour');
  el.append(h('div.brand', {}, h('img', { src: markUrl, alt: '' }), 'Robot Studio'), title, extra, h('div', { style: 'flex:1' }), modes.el, tour);
  const render = () => {
    const [name, detail] = titleOf();
    replace(title, name, h('small.mu', {}, detail));
    modes.set(store.state.mode);
    for (const b of modes.el.querySelectorAll<HTMLButtonElement>('button')) {
      b.disabled = !enabled(b.dataset.v as Mode);
      b.title = b.disabled && b.dataset.v === 'pilot' ? 'Pilot needs a robot with legs or wheels' : '';
    }
    tour.classList.toggle('on', store.state.touring);
  };
  store.on(['activeId', 'mode', 'touring', 'loading', 'draft', 'sessionVersion'], render);
  render();
}
