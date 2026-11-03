/** Library filter state; every facet combines with AND, values within a facet with OR. */
export type SourceFacet = 'all' | 'mine' | 'preset' | 'cad';
export type SortKey = 'name' | 'dof' | 'maker';

export interface DofBand {
  id: string;
  label: string;
  min: number;
  max: number;
}

export const DOF_BANDS: DofBand[] = [
  { id: '1-3', label: '1–3', min: 1, max: 3 },
  { id: '4-5', label: '4–5', min: 4, max: 5 },
  { id: '6', label: '6', min: 6, max: 6 },
  { id: '7', label: '7', min: 7, max: 7 },
  { id: '8-12', label: '8–12', min: 8, max: 12 },
  { id: '13-24', label: '13–24', min: 13, max: 24 },
  { id: '25+', label: '25+', min: 25, max: Infinity },
];

export interface LibraryFilter {
  query: string;
  source: SourceFacet;
  categories: string[];
  bands: string[];
  sort: SortKey;
}

export const EMPTY_FILTER: LibraryFilter = { query: '', source: 'all', categories: [], bands: [], sort: 'name' };
