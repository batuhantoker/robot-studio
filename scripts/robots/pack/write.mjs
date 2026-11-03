import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

// Copies each robot's files as `<path>.gz` and its LICENSE as plain text; returns the bytes written.
export function writePack(srcDir, outDir, manifest) {
  let bytes = 0;
  const put = (rel, data) => {
    const dest = path.join(outDir, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, data);
    bytes += data.length;
  };
  for (const robot of manifest.robots) {
    for (const rel of robot.files) {
      put(`${rel}.gz`, zlib.gzipSync(fs.readFileSync(path.join(srcDir, rel)), { level: 9 }));
    }
    const license = robot.license?.file;
    if (license && fs.existsSync(path.join(srcDir, license))) put(license, fs.readFileSync(path.join(srcDir, license)));
  }
  put('index.json', Buffer.from(JSON.stringify({ ...manifest, encoding: 'gzip' })));
  return bytes;
}
