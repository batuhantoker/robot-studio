import fs from 'node:fs';
import path from 'node:path';

// Web hosts and MuJoCo's FS are case-sensitive even when the local disk is not.
export function exactCaseProblem(root, rel, listings = new Map()) {
  let dir = root;
  for (const part of rel.split('/')) {
    if (!listings.has(dir)) {
      listings.set(dir, fs.existsSync(dir) && fs.statSync(dir).isDirectory() ? fs.readdirSync(dir) : []);
    }
    const names = listings.get(dir);
    if (!names.includes(part)) {
      const near = names.find((n) => n.toLowerCase() === part.toLowerCase());
      return `missing ${rel}${near ? ` (found "${near}" with different case)` : ''}`;
    }
    dir = path.join(dir, part);
  }
  return fs.statSync(dir).isFile() ? null : `${rel} is not a file`;
}

export function assertExactFile(root, rel, context) {
  const problem = exactCaseProblem(root, rel);
  if (problem) throw new Error(`${context}: ${problem}`);
}
