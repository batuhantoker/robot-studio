// Adds the shared optional fields to Menagerie entries (idempotent; armor and prosthesis entries carry their own).
export function withCollectionFields(entry) {
  if (entry.collection === 'armor' || entry.collection === 'prosthetics') return entry;
  return {
    ...entry,
    collection: 'menagerie',
    vendor: entry.vendor ?? entry.maker,
    category: entry.category ?? 'arm',
    base: entry.base ?? 'fixed',
    format: 'mjcf',
    chains: entry.chains ?? [{ name: 'arm', ...entry.chain }],
  };
}
