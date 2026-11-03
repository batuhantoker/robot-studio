/** Filter, sort, and count library entries. Pure, so the panel and tests share it. */
import type { LibraryEntry } from '../../state/types';
import { parseQuery } from './query';
import { DOF_BANDS, type LibraryFilter } from './types';

const haystack = (e: LibraryEntry) => `${e.title} ${e.maker} ${e.category} ${e.tags.join(' ')} ${e.id}`.toLowerCase();

type Facet = 'source' | 'categories' | 'bands' | 'query';

/** Test an entry against every facet except `skip` (used for per-chip counts). */
export function matches(e: LibraryEntry, f: LibraryFilter, skip?: Facet): boolean {
  if (skip !== 'source' && f.source !== 'all' && e.group !== f.source) return false;
  if (skip !== 'categories' && f.categories.length && !f.categories.includes(e.category)) return false;
  if (skip !== 'bands' && f.bands.length) {
    const bands = DOF_BANDS.filter((b) => f.bands.includes(b.id));
    if (!bands.some((b) => e.dof >= b.min && e.dof <= b.max)) return false;
  }
  if (skip !== 'query') {
    const q = parseQuery(f.query);
    if (e.dof < q.min || e.dof > q.max) return false;
    const text = haystack(e);
    if (!q.words.every((w) => text.includes(w))) return false;
  }
  return true;
}

const ORDER = { mine: 0, preset: 1, cad: 2 };

export function applyFilter(entries: LibraryEntry[], f: LibraryFilter): LibraryEntry[] {
  const by = {
    name: (a: LibraryEntry, b: LibraryEntry) => ORDER[a.group] - ORDER[b.group] || a.title.localeCompare(b.title),
    dof: (a: LibraryEntry, b: LibraryEntry) => a.dof - b.dof || a.title.localeCompare(b.title),
    maker: (a: LibraryEntry, b: LibraryEntry) => a.maker.localeCompare(b.maker) || a.title.localeCompare(b.title),
  }[f.sort];
  return entries.filter((e) => matches(e, f)).sort(by);
}

/** How many entries each chip would show, given the other active facets. */
export function facetCounts(entries: LibraryEntry[], f: LibraryFilter) {
  const count = (skip: Facet, test: (e: LibraryEntry) => boolean) => entries.filter((e) => matches(e, f, skip) && test(e)).length;
  return {
    source: (s: LibraryFilter['source']) => count('source', (e) => s === 'all' || e.group === s),
    category: (c: string) => count('categories', (e) => e.category === c),
    band: (id: string) => {
      const b = DOF_BANDS.find((x) => x.id === id)!;
      return count('bands', (e) => e.dof >= b.min && e.dof <= b.max);
    },
  };
}
