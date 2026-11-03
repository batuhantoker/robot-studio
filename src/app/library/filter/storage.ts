/** Remember the library filter between visits. */
import { EMPTY_FILTER, type LibraryFilter } from './types';

const KEY = 'robot-studio.library-filter.v1';

export function loadFilter(): LibraryFilter {
  try {
    return { ...EMPTY_FILTER, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<LibraryFilter>) };
  } catch {
    return { ...EMPTY_FILTER };
  }
}

export const saveFilter = (f: LibraryFilter) => localStorage.setItem(KEY, JSON.stringify(f));
