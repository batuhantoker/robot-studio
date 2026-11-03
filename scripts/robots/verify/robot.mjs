import { entryErrors } from '../manifest/schema.mjs';
import { checkChain } from './chain.mjs';
import { readErrors } from './compile.mjs';
import { notesFor } from './notes.mjs';

// Verifies one manifest entry in a fresh MuJoCo FS root (freed afterwards) and returns its report row.
export function verifyRobot(loader, entry, index, onDisk) {
  const { mj } = loader;
  const row = { id: entry?.id ?? `#${index}`, errors: entryErrors(entry, onDisk), notes: [] };
  if (row.errors.length) return row;
  row.dof = entry.dof;
  row.files = entry.files.length;
  row.chains = entry.chains?.length ?? 1;

  const base = `/verify/${index}`;
  const staged = loader.stage(base, entry.files, onDisk);
  row.bytes = staged.bytes;
  row.errors.push(...staged.errors);
  if (row.errors.length) return row;

  const { model: m, error, opened } = loader.compile(`${base}/${entry.xml}`);
  loader.unstage(base);
  if (error !== undefined) {
    row.errors.push(`compile failed: ${error}`);
    return row;
  }

  try {
    Object.assign(row, { nbody: m.nbody, njnt: m.njnt, nmesh: m.nmesh, ntex: m.ntex });
    row.verts = Array.from(m.mesh_vertnum).reduce((a, b) => a + b, 0);
    row.errors.push(...readErrors(opened, base, entry.files));
    if (Array.from(m.jnt_type).includes(mj.mjtJoint.mjJNT_FREE.value)) row.errors.push('model has a free joint (not fixed-base)');

    const chains = entry.chain ? [entry.chain, ...(entry.chains ?? [])] : [];
    let tipBody = -1;
    chains.forEach((chain, k) => {
      const res = checkChain(mj, m, chain);
      row.errors.push(...res.errors.map((e) => (k ? `chains[${k - 1}] (${chain.name}): ${e}` : `chain: ${e}`)));
      if (k === 0) tipBody = res.tipBody;
    });
    if (!row.errors.length) row.notes.push(...notesFor(mj, m, entry.chain, tipBody));
  } finally {
    m.delete();
  }
  return row;
}
