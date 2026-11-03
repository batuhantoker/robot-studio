// The pack's landing page: what is served here, under which license, from where.
const STUDIO_URL = 'https://robotics-studio-one.vercel.app';
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function row(r) {
  const spdx = r.license?.spdx;
  const license = spdx
    ? (r.license.file ? `<a href="robots/${esc(r.license.file)}">${esc(spdx)}</a>` : esc(spdx))
    : 'Author’s own CAD';
  return `<tr><td>${esc(r.title)}</td><td>${esc(r.maker)}</td><td>${license}</td>`
    + `<td><a href="${esc(r.license?.source)}">source</a></td></tr>`;
}

export function attributionPage(robots, droppedCount) {
  const sorted = [...robots].sort((a, b) => a.title.localeCompare(b.title));
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Robot Studio · robot CAD pack</title>
<style>
  body { margin: 0; font: 14px/1.5 Inter, system-ui, sans-serif; color: #16181b; background: #eceef1; }
  main { max-width: 960px; margin: 0 auto; padding: 40px 24px 80px; }
  h1 { font-size: 22px; margin: 0 0 6px; } h1 i { display: inline-block; width: 22px; height: 3px; background: #d6182b; vertical-align: middle; margin-right: 10px; }
  p { color: #3b3f45; max-width: 70ch; } a { color: #d6182b; }
  table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #e1e3e6; margin-top: 18px; }
  th, td { text-align: left; padding: 6px 10px; border-bottom: 1px solid #f0f1f3; }
  th { font-size: 10px; letter-spacing: 1.2px; text-transform: uppercase; color: #8b8f95; }
</style></head>
<body><main>
<h1><i></i>Robot Studio · robot CAD pack</h1>
<p>These ${robots.length} robot models are loaded by <a href="${STUDIO_URL}">Robot Studio</a>. Each is converted for MuJoCo from its
upstream source at a pinned commit and stored gzipped, and is redistributed under its own license, linked below.
${droppedCount} robots whose upstream states no license are not published here.</p>
<table><thead><tr><th>Robot</th><th>Maker</th><th>License</th><th>Upstream</th></tr></thead>
<tbody>
${sorted.map(row).join('\n')}
</tbody></table>
</main></body></html>
`;
}
