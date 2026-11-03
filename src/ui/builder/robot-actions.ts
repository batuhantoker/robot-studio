/** Actions on the active robot: export, duplicate, delete, or make an editable CAD twin. */
import type { Store } from '../../app/state/store';
import type { StudioState } from '../../app/state/types';
import { h, replace } from '../dom/h';
import type { LibraryActions } from '../library/panel';

export function mountRobotActions(el: HTMLElement, store: Store<StudioState>, actions: LibraryActions): void {
  const body = h('div.row');
  el.append(h('div.section', {}, h('header', {}, h('span.cap', {}, 'This robot')), body));
  const render = (s: StudioState) => {
    const e = s.library.find((x) => x.id === s.activeId);
    replace(body,
      e?.group === 'cad' ? h('button.tb.primary', { onclick: actions.makeEditable, title: 'An editable kinematic twin that keeps these CAD meshes' }, 'Make editable') : null,
      e?.spec ? h('button.tb', { onclick: actions.duplicate }, 'Duplicate') : null,
      e?.spec ? h('button.tb', { onclick: actions.exportPython }, 'Python JSON') : null,
      e?.spec ? h('button.tb', { onclick: actions.exportStudio }, 'Studio JSON') : null,
      e?.spec ? h('button.tb', { onclick: actions.exportMjcf }, 'MJCF') : null,
      e?.group === 'mine' ? h('button.tb', { onclick: actions.remove }, 'Delete') : null);
  };
  store.on(['activeId', 'library'], render);
  render(store.state);
}
