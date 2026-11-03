/** The fetched real-robot manifest (studio/public/robots/index.json, made by the fetch script). */
import type { Vec3 } from '../../core/math/linear/vec';

export type CatalogTip = { site: string } | { body: string; pos?: Vec3 };

export interface CatalogChain {
  name?: string;
  joints: string[];
  tip: CatalogTip;
}

export interface CatalogRobot {
  id: string;
  title: string;
  maker: string;
  dof: number;
  description: string;
  xml: string;
  files: string[];
  /** Null for view-only models with no movable joint. */
  chain: CatalogChain | null;
  /** Alternative chains (each leg/arm) for branched robots. */
  chains?: CatalogChain[];
  collection?: 'menagerie' | 'montaj1' | 'armor';
  category?: 'arm' | 'legged' | 'humanoid' | 'mobile' | 'aerial' | 'hand' | 'other';
  format?: 'urdf' | 'mjcf';
  vendor?: string;
  base?: 'fixed' | 'floating' | 'mobile';
  joints_total?: number;
  links_total?: number;
  mesh_count?: number;
  size_mb?: number;
  tags?: string[];
  upstream?: { repo: string; commit: string; path: string };
  gallery_url?: string;
  license: { spdx: string | null; file: string | null; source: string; note?: string };
}

export interface Catalog {
  version: number;
  menagerie_commit: string;
  robots: CatalogRobot[];
  /** The published pack stores every robot file as `<path>.gz`. */
  encoding?: 'gzip';
}

// Production builds read the robot pack from GitHub Pages (.env.production); dev reads public/robots/.
const BASE: string = import.meta.env.VITE_ROBOTS_BASE || `${import.meta.env.BASE_URL}robots/`;

let current: Catalog | null = null;

export const catalog = (): Catalog | null => current;

export async function loadCatalog(): Promise<Catalog | null> {
  try {
    const res = await fetch(`${BASE}index.json`, { cache: 'no-store' });
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) return null;
    current = (await res.json()) as Catalog;
    return current;
  } catch {
    return current;
  }
}

const fetched = new Map<string, Map<string, Uint8Array>>();

/** Robot files, fetched once per page so twin edits rebuild without re-downloading. */
export async function fetchRobotFiles(robot: CatalogRobot, onProgress?: (done: number, total: number) => void) {
  const cached = fetched.get(robot.id);
  if (cached) return cached;
  const files = new Map<string, Uint8Array>();
  let done = 0;
  const suffix = current?.encoding === 'gzip' ? '.gz' : '';
  await Promise.all(robot.files.map(async (path) => {
    const res = await fetch(BASE + path + suffix);
    if (!res.ok) throw new Error(`missing ${path}: run npm run robots:fetch`);
    files.set(path, await inflate(new Uint8Array(await res.arrayBuffer())));
    onProgress?.(++done, robot.files.length);
  }));
  // Keep only the latest two robots (a twin and its source share an id).
  fetched.set(robot.id, files);
  while (fetched.size > 2) fetched.delete(fetched.keys().next().value!);
  return files;
}

// A host that serves `.gz` with Content-Encoding has already inflated it, so only real gzip bytes are decoded.
async function inflate(buf: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  if (buf[0] !== 0x1f || buf[1] !== 0x8b) return buf;
  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
