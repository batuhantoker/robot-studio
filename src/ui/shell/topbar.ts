/** Brand and the active robot, the mode switch, the tour and the guide. */
import type { Mode, StudioState } from '../../app/state/types';
import type { Store } from '../../app/state/store';
import { h, replace } from '../dom/h';
import markUrl from '../brand/mark.svg';
import { ICON, icon } from './icons';
import { modeMenu, modeSwitch } from './modes';
import { reveal } from './reveal';

/** `enabled` greys out modes the loaded robot cannot use (Pilot needs legs or wheels). */
export function mountTopbar(el: HTMLElement, store: Store<StudioState>, titleOf: () => [string, string], extra: HTMLElement,
  enabled: (m: Mode) => boolean = () => true, onHelp: () => void = () => undefined): void {
  const name = h('b');
  const detail = h('small');
  const title = h('button.robot-title', { title: 'Choose a robot', onclick: () => reveal('robots') }, name, detail, icon(ICON.chevron, 'ico chev'));
  const toggleTour = () => store.set({ touring: !store.state.touring });
  const tour = h('button.tourchip', { onclick: toggleTour, title: 'A guided tour of the loaded robot' }, h('i.dot'), h('span', {}, 'Auto tour'));
  const help = h('button.icon-btn.help', { onclick: onHelp, title: 'Guide and shortcuts  ( ? )', 'aria-label': 'Guide' }, icon(ICON.help));
  const modes = modeSwitch(store);
  const phoneTour = h('button.tb', { onclick: toggleTour });
  const menu = modeMenu(store, [phoneTour, h('button.tb', { onclick: onHelp }, icon(ICON.help), 'Guide')]);
  el.append(
    h('div.top-left', {}, h('div.brand', {}, h('img', { src: markUrl, alt: '' }), h('span', {}, 'Robot Studio')), title, extra),
    modes.el,
    h('div.top-right', {}, menu.button, tour, help),
    menu.el);
  const render = () => {
    const [n, d] = titleOf();
    name.textContent = n;
    replace(detail, d);
    modes.render(enabled);
    menu.render(enabled);
    tour.classList.toggle('on', store.state.touring);
    phoneTour.textContent = store.state.touring ? 'Stop tour' : 'Auto tour';
  };
  store.on(['activeId', 'mode', 'touring', 'loading', 'draft', 'sessionVersion', 'library'], render);
  render();
}
