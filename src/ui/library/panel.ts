/** The Robots tab: search and filter every robot, then pick one. `/` focuses search; ↑ ↓ ⏎ navigate. */
import { applyFilter } from '../../app/library/filter/apply';
import { loadFilter, saveFilter } from '../../app/library/filter/storage';
import type { LibraryFilter } from '../../app/library/filter/types';
import type { Store } from '../../app/state/store';
import type { StudioState } from '../../app/state/types';
import { h, replace } from '../dom/h';
import { filterBar } from './filter-bar';
import { robotRow } from './robot-row';

export interface LibraryActions {
  create(): void;
  duplicate(): void;
  remove(): void;
  importFile(file: File): void;
  exportPython(): void;
  exportStudio(): void;
  exportMjcf(): void;
  makeEditable(): void;
  refreshCatalog(): Promise<void>;
}

export function mountLibrary(el: HTMLElement, store: Store<StudioState>, actions: LibraryActions): void {
  let filter: LibraryFilter = loadFilter();
  const file = h('input', { type: 'file', accept: '.json,application/json', style: 'display:none' });
  file.addEventListener('change', () => file.files?.[0] && actions.importFile(file.files[0]));
  const search = h('input.text.search', { placeholder: 'Search name, maker, type, tag…  ( / )', value: filter.query, spellcheck: false });
  const filters = h('div');
  const tally = h('span.cap.mu');
  const list = h('div.robot-list');
  el.append(
    h('div.row', { style: 'margin-top:12px' },
      h('button.tb.primary', { onclick: actions.create }, '+ New robot'),
      h('button.tb', { onclick: () => file.click() }, 'Import'),
      h('button.tb', { onclick: () => void actions.refreshCatalog(), title: 'Re-read the fetched robot manifest' }, 'Refresh'),
      file),
    search,
    h('div.note', { style: 'margin:4px 0 2px' }, 'Try ', h('span.mono', {}, 'kuka'), ' · ', h('span.mono', {}, 'humanoid'), ' · ', h('span.mono', {}, 'dof:6-7'), ' · ', h('span.mono', {}, 'dof>20')),
    h('div.section.lib-filters', { dataset: { fold: '' } }, h('header', {}, h('span.cap', {}, 'Filters'), tally), filters), list);
  let shown: StudioState['library'] = [];
  const render = (s: StudioState) => {
    shown = applyFilter(s.library, filter);
    replace(filters, filterBar(s.library, filter, shown.length, update));
    tally.textContent = `${shown.length} of ${s.library.length}`;
    replace(list, ...shown.map((e) => robotRow(e, e.id === s.activeId, () => store.set({ activeId: e.id }))),
      shown.length ? null : h('p.note', {}, 'No robots match. ', s.library.some((e) => e.group === 'cad') ? '' : 'Run npm run robots:fetch for real robot CAD.'));
  };
  const update = (patch: Partial<LibraryFilter>) => {
    filter = { ...filter, ...patch };
    if ('query' in patch && search.value !== filter.query) search.value = filter.query;
    saveFilter(filter);
    render(store.state);
  };
  search.addEventListener('input', () => update({ query: search.value }));
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') update({ query: '' });
    if (e.key === 'Enter' && shown[0]) store.set({ activeId: shown[0].id });
  });
  addEventListener('keydown', (e) => {
    const typing = (e.target as HTMLElement).closest('input, select, textarea');
    if (e.key === '/' && !typing) {
      e.preventDefault();
      search.focus();
    }
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && (!typing || e.target === search) && shown.length) {
      e.preventDefault();
      const i = shown.findIndex((x) => x.id === store.state.activeId);
      const next = shown[Math.min(Math.max((i < 0 ? -1 : i) + (e.key === 'ArrowDown' ? 1 : -1), 0), shown.length - 1)];
      store.set({ activeId: next.id });
      list.querySelector(`[data-id="${CSS.escape(next.id)}"]`)?.scrollIntoView({ block: 'nearest' });
    }
  });
  store.on(['library', 'activeId'], render);
  render(store.state);
  window.setInterval(() => void actions.refreshCatalog(), 15_000);
}
