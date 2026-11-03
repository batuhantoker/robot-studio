import crypto from 'node:crypto';
import fs from 'node:fs';

// Downloads a single pinned file; the sha256 stands in for a commit.
export async function download(url, sha256, dest) {
  const res = await fetch(url, { headers: { 'user-agent': 'robot-studio-fetch' } });
  if (!res.ok) throw new Error(`GET ${url}: HTTP ${res.status}`);
  const data = Buffer.from(await res.arrayBuffer());
  const got = crypto.createHash('sha256').update(data).digest('hex');
  if (got !== sha256) throw new Error(`${url} changed upstream (sha256 ${got.slice(0, 12)}, pinned ${sha256.slice(0, 12)})`);
  fs.writeFileSync(dest, data);
  return dest;
}
