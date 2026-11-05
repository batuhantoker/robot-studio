// Shared flag parsing for fetch.mjs and verify.mjs.
import { PROSTHESIS_IDS } from '../prosthetics/catalog.mjs';

export const COLLECTIONS = ['menagerie', 'armor', 'prosthetics'];

export const collectionOf = (id) =>
  id.startsWith('armor-') ? 'armor' : PROSTHESIS_IDS.includes(id) ? 'prosthetics' : 'menagerie';

// `flags`: extra boolean flags this command accepts; `--jobs N` is accepted when listed there.
export function parseArgs(argv, { flags = [], usage }) {
  const opts = { only: null, collections: null, flags: new Set(), jobs: 4 };
  for (let i = 0; i < argv.length; i++) {
    const eq = argv[i].indexOf('=');
    const arg = eq > 0 ? argv[i].slice(0, eq) : argv[i];
    const take = () => {
      const value = eq > 0 ? argv[i].slice(eq + 1) : argv[++i];
      if (!value) throw new Error(`${arg} needs a value\n\n${usage}`);
      return value;
    };
    const list = () => take().split(',').map((s) => s.trim()).filter(Boolean);
    if (arg === '--help' || arg === '-h') {
      console.log(usage);
      process.exit(0);
    } else if (arg === '--only') opts.only = list();
    else if (arg === '--collection') {
      opts.collections = list();
      const bad = opts.collections.filter((c) => !COLLECTIONS.includes(c));
      if (bad.length) throw new Error(`unknown collection(s): ${bad.join(', ')} (use ${COLLECTIONS.join('|')})`);
    } else if (arg === '--jobs' && flags.includes('--jobs')) {
      opts.jobs = Number(take());
      if (!Number.isInteger(opts.jobs) || opts.jobs < 1) throw new Error('--jobs needs a positive integer');
    } else if (flags.includes(arg)) opts.flags.add(arg);
    else throw new Error(`unknown argument: ${argv[i]}\n\n${usage}`);
  }
  return opts;
}

export const selects = (opts, id) =>
  (!opts.only || opts.only.includes(id)) && (!opts.collections || opts.collections.includes(collectionOf(id)));
