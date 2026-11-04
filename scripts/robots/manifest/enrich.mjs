import { MONTAJ } from '../catalog/robots.mjs';

// Adds the shared optional fields to Menagerie and Montaj1 entries (idempotent; armor and prosthesis entries carry their own).
export function withCollectionFields(entry) {
  if (entry.collection === 'armor' || entry.collection === 'prosthetics') return entry;
  const collection = entry.id === MONTAJ.id ? 'montaj1' : 'menagerie';
  return {
    ...entry,
    collection,
    vendor: entry.vendor ?? entry.maker,
    category: entry.category ?? 'arm',
    base: entry.base ?? 'fixed',
    format: 'mjcf',
    chains: entry.chains ?? [{ name: 'arm', ...entry.chain }],
  };
}
