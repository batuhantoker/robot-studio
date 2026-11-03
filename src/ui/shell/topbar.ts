/** Brand, the active robot, and the interaction modes. */
import type { Mode, StudioState } from '../../app/state/types';
import type { Store } from '../../app/state/store';
import { h, replace } from '../dom/h';
import { segmented } from '../widgets/segmented';
import markUrl from '../brand/mark.svg';

const MODES: [Mode, string][] = [
  ['pose', 'Pose'], ['motion', 'Motion'], ['ik', 'Inverse kin.'], ['trajectory', 'Trajectory'], ['physics', 'Physics'], ['workspace', 'Workspace'],
];

export function mountTopbar(el: HTMLElement, store: Store<StudioState>, titleOf: () => [string, string], extra: HTMLElement): void {
  const title = h('div.robot-title');
  const modes = segmented(MODES, store.state.mode, (mode) => store.set({ mode, playing: mode === 'trajectory' || mode === 'physics' || mode === 'motion' }));
  const tour = h('div.tourchip.cap', { onclick: () => store.set({ touring: !store.state.touring }) }, h('i'), 'Auto tour');
  el.append(h('div.brand', {}, h('img', { src: markUrl, alt: '' }), 'Robot Studio'), title, extra, h('div', { style: 'flex:1' }), modes.el, tour);
  const render = () => {
    const [name, detail] = titleOf();
    replace(title, name, h('small.mu', {}, detail));
    modes.set(store.state.mode);
    tour.classList.toggle('on', store.state.touring);
  };
  store.on(['activeId', 'mode', 'touring', 'loading', 'draft'], render);
  render();
}
