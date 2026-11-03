/** One robot in the list: name, maker and type, and its DOF. */
import type { LibraryEntry } from '../../app/state/types';
import { h } from '../dom/h';

const SOURCE: Record<LibraryEntry['group'], string> = { mine: 'Yours', preset: 'Preset', cad: 'CAD' };

export function robotRow(e: LibraryEntry, active: boolean, select: () => void): HTMLElement {
  const chain = e.chainDof && e.chainDof !== e.dof ? ` · chain ${e.chainDof}` : '';
  return h('div.robot-row', { class: active ? 'on' : '', onclick: select, title: e.subtitle, dataset: { id: e.id } },
    h('div.robot-main', {},
      h('b', {}, e.title),
      h('small', {}, [e.maker, e.category].filter(Boolean).join(' · '))),
    h('div.robot-meta', {},
      h('span.dof', {}, String(e.dof), h('em', {}, ' DOF')),
      h('span.src', { class: e.group, title: chain ? 'The math follows one chain; pick another in the top bar' : '' }, `${e.localOnly ? 'local' : SOURCE[e.group]}${chain}`)));
}
