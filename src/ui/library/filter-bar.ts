/** Search box, source / type / DOF chips, sort, and the result count. */
import { facetCounts } from '../../app/library/filter/apply';
import { DOF_BANDS, type LibraryFilter, type SortKey, type SourceFacet } from '../../app/library/filter/types';
import type { LibraryEntry } from '../../app/state/types';
import { h } from '../dom/h';
import { segmented } from '../widgets/segmented';
import { chipRow } from './chips';

const SOURCES: [SourceFacet, string][] = [['all', 'All'], ['mine', 'Mine'], ['preset', 'Presets'], ['cad', 'CAD']];
const TYPE_ORDER = ['arm', 'humanoid', 'legged', 'mobile', 'aerial', 'hand', 'other'];
const toggleIn = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

export function filterBar(entries: LibraryEntry[], f: LibraryFilter, shown: number, set: (patch: Partial<LibraryFilter>) => void) {
  const counts = facetCounts(entries, f);
  const types = TYPE_ORDER.filter((c) => entries.some((e) => e.category === c));
  const sort = segmented<SortKey>([['name', 'Name'], ['dof', 'DOF'], ['maker', 'Maker']], f.sort, (v) => set({ sort: v }));
  const active = f.query || f.source !== 'all' || f.categories.length || f.bands.length;
  return h('div.filters', {},
    chipRow('Source', SOURCES.map(([id, label]) => ({ id, label, count: counts.source(id), on: f.source === id })),
      (id) => set({ source: id as SourceFacet })),
    chipRow('Type', types.map((c) => ({ id: c, label: c[0].toUpperCase() + c.slice(1), count: counts.category(c), on: f.categories.includes(c) })),
      (id) => set({ categories: toggleIn(f.categories, id) })),
    chipRow('DOF', DOF_BANDS.map((b) => ({ id: b.id, label: b.label, count: counts.band(b.id), on: f.bands.includes(b.id) })),
      (id) => set({ bands: toggleIn(f.bands, id) })),
    h('div.row.spread', { style: 'margin-top:6px' },
      h('span.mu', {}, `Showing ${shown} of ${entries.length}`, active ? ' · ' : '', active
        ? h('a.clear', { href: '#', onclick: (e: Event) => (e.preventDefault(), set({ query: '', source: 'all', categories: [], bands: [] })) }, 'clear')
        : null),
      sort.el));
}
