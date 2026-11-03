import fs from 'node:fs';
import path from 'node:path';
import { detectSpdx } from './detect.mjs';

const LICENSE_FILE = /^(licen[cs]e|copying)([._-][\w.-]*)?$/i;
const PACKAGE_SPDX = {
  'apache-2.0': 'Apache-2.0',
  'apache 2.0': 'Apache-2.0',
  'asl 2.0': 'Apache-2.0',
  mit: 'MIT',
  'bsd-3-clause': 'BSD-3-Clause',
  'bsd-3': 'BSD-3-Clause',
};
const NO_LICENSE = 'no license found upstream — local use only, do not redistribute';

// Nearest license file from the model's directory up to the repo root, read as SPDX.
export function findLicense(startDir, repoRoot) {
  for (let dir = startDir; ; dir = path.dirname(dir)) {
    const hits = fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => LICENSE_FILE.test(n)) : [];
    const file = hits.map((n) => path.join(dir, n)).find((p) => fs.statSync(p).isFile());
    if (file) {
      const spdx = detectSpdx(fs.readFileSync(file, 'utf8'));
      return { spdx, file, note: spdx ? undefined : `unrecognised license text in ${path.basename(file)}; read it before reuse` };
    }
    if (dir === repoRoot || path.dirname(dir) === dir) break;
  }
  return fromPackageXml(startDir, repoRoot) ?? { spdx: null, file: null, note: NO_LICENSE };
}

// ROS packages often declare the license only in package.xml.
function fromPackageXml(startDir, repoRoot) {
  for (let dir = startDir; ; dir = path.dirname(dir)) {
    const xml = path.join(dir, 'package.xml');
    if (fs.existsSync(xml)) {
      const declared = /<license[^>]*>\s*([^<]+?)\s*<\/license>/.exec(fs.readFileSync(xml, 'utf8'))?.[1];
      if (!declared || /^(todo|tbd|unknown|none)$/i.test(declared)) return null;
      const spdx = PACKAGE_SPDX[declared.toLowerCase()] ?? null;
      const caveat = spdx ? '' : ' (variant unknown) — local use only, do not redistribute';
      return { spdx, file: null, note: `no LICENSE file; package.xml declares "${declared}"${caveat}` };
    }
    if (dir === repoRoot || path.dirname(dir) === dir) return null;
  }
}
