import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const STUDIO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const ROBOTS_DIR = path.join(STUDIO, 'public', 'robots');
export const CACHE_DIR = path.join(STUDIO, '.cache', 'menagerie');
export const MANIFEST = path.join(ROBOTS_DIR, 'index.json');
export const ARMOR_CACHE = path.join(STUDIO, '.cache', 'armor');
export const ARMOR_OUT = path.join(ROBOTS_DIR, 'armor');
