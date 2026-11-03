import fs from 'node:fs';
import path from 'node:path';

const isFile = (p) => fs.existsSync(p) && fs.statSync(p).isFile();

// Same path with each component matched case-insensitively, for URDFs written on case-insensitive disks.
function caseFold(abs) {
  if (isFile(abs)) return abs;
  const parts = abs.split(path.sep).filter(Boolean);
  let cur = path.sep;
  for (const part of parts) {
    const exact = path.join(cur, part);
    if (fs.existsSync(exact)) {
      cur = exact;
      continue;
    }
    if (!fs.existsSync(cur) || !fs.statSync(cur).isDirectory()) return null;
    const near = fs.readdirSync(cur).find((n) => n.toLowerCase() === part.toLowerCase());
    if (!near) return null;
    cur = path.join(cur, near);
  }
  return isFile(cur) ? cur : null;
}

// Absolute path of a URDF mesh reference, or null. ctx: { urdfDir, files, packages }.
export function resolveMesh(ref, ctx) {
  let spec = safeDecode(ref.trim()).replaceAll('\\', '/');
  let candidates = [];
  let tail = spec;
  const pkg = /^(?:package|model):\/\/([^/]+)\/(.*)$/.exec(spec);
  if (pkg) {
    tail = `${pkg[1]}/${pkg[2]}`;
    const base = ctx.packages.get(pkg[1]);
    if (base) candidates.push(path.join(base, pkg[2]));
  } else {
    spec = spec.replace(/^file:\/\//, '');
    candidates.push(path.isAbsolute(spec) ? spec : path.resolve(ctx.urdfDir, spec));
  }
  for (const c of candidates) {
    const hit = caseFold(path.normalize(c));
    if (hit && (ctx.fileSet ??= new Set(ctx.files)).has(hit)) return hit;
  }
  return suffixMatch(tail, ctx.files);
}

const safeDecode = (s) => {
  try {
    return decodeURI(s);
  } catch {
    return s;
  }
};

// Unique checked-out file whose path ends with the longest possible suffix of `tail`.
function suffixMatch(tail, files) {
  const parts = tail.split('/').filter((p) => p && p !== '.' && p !== '..');
  for (let k = parts.length; k >= 1; k--) {
    const suffix = `/${parts.slice(-k).join('/')}`.toLowerCase();
    const hits = files.filter((f) => f.split(path.sep).join('/').toLowerCase().endsWith(suffix));
    if (hits.length === 1) return hits[0];
    if (hits.length > 1) return null;
  }
  return null;
}
