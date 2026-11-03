/** What a part is made of; drives its physical material, the Materials look, and its legend. */
export type MaterialClass =
  | 'paint' | 'plastic' | 'aluminium' | 'steel' | 'anodized' | 'rubber' | 'copper' | 'glass' | 'electronics';

export const MATERIAL_INFO: Record<MaterialClass, { label: string; swatch: string }> = {
  paint: { label: 'Lacquered paint', swatch: '#ee6c4d' },
  plastic: { label: 'Satin plastic', swatch: '#f4d35e' },
  aluminium: { label: 'Brushed aluminium', swatch: '#6fa8dc' },
  steel: { label: 'Steel', swatch: '#3d5a80' },
  anodized: { label: 'Dark anodized', swatch: '#8e7dbe' },
  rubber: { label: 'Rubber', swatch: '#2a9d8f' },
  copper: { label: 'Copper / brass', swatch: '#c27a45' },
  glass: { label: 'Glass / lens', swatch: '#9ad1d4' },
  electronics: { label: 'Electronics', swatch: '#57a773' },
};
