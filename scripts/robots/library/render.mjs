// The README's robot library: every robot the studio lists, grouped as its library filter groups them.
import { publishable } from '../pack/select.mjs';

export const STUDIO_URL = 'https://robotics-studio-one.vercel.app';
const START = '<!-- robot-library:start -->';
const END = '<!-- robot-library:end -->';
const GROUPS = [['preset', 'Studio presets'], ['arm', 'Arms'], ['humanoid', 'Humanoids'], ['legged', 'Legged'], ['mobile', 'Mobile'], ['hand', 'Hands'], ['aerial', 'Aerial'], ['other', 'Other']];
const JOINT_DOFS = { revolute: 1, prismatic: 1, cylindrical: 2, universal: 2, planar: 3, spherical: 3 };

const cell = (text) => String(text).replace(/\|/g, '\\|');
const byMakerThenTitle = (a, b) => a.maker.localeCompare(b.maker) || a.title.localeCompare(b.title, 'en', { numeric: true });

export const presetDof = (preset) => preset.links.reduce((n, l) => n + JOINT_DOFS[l.joint ?? 'revolute'], 0);

/** One row per robot: `presets` are `{ id, spec }` pairs of the parsed JSON files. */
export function libraryEntries(manifest, presets) {
  const live = new Set(publishable(manifest).kept.map((r) => r.id));
  return [
    ...presets.map(({ id, spec }) => ({ group: 'preset', id: `preset:${id}`, title: spec.name, maker: 'Studio', joints: presetDof(spec), license: null, live: true })),
    ...manifest.map((r) => ({
      group: r.category ?? 'arm',
      id: `${r.prosthesis ? 'prosthesis' : 'cad'}:${r.id}`,
      title: r.title,
      maker: r.vendor ?? r.maker,
      joints: r.joints_total ?? r.dof,
      license: { spdx: r.license.spdx, source: r.license.source },
      live: live.has(r.id),
    })),
  ];
}

function row(e) {
  const name = e.live ? `[${cell(e.title)}](${STUDIO_URL}/?robot=${e.id})` : cell(e.title);
  const license = !e.license ? '—' : e.license.spdx ? `[${cell(e.license.spdx)}](${e.license.source})` : `[none stated](${e.license.source}), local only`;
  return `| ${name} | ${cell(e.maker)} | ${e.joints} | ${license} |`;
}

export function renderLibrary(entries) {
  const known = new Set(GROUPS.map(([id]) => id));
  const stray = entries.filter((e) => !known.has(e.group));
  if (stray.length) throw new Error(`no library group for: ${stray.map((e) => e.id).join(', ')}`);
  const local = entries.filter((e) => !e.live).length;
  const makers = new Set(entries.filter((e) => e.group !== 'preset').map((e) => e.maker)).size;
  const blocks = GROUPS.flatMap(([id, label]) => {
    const list = entries.filter((e) => e.group === id).sort(byMakerThenTitle);
    if (!list.length) return [];
    return [`<details>\n<summary><b>${label}</b> (${list.length})</summary>\n\n| Robot | Maker | Joints | License |\n|---|---|--:|---|\n${list.map(row).join('\n')}\n\n</details>`];
  });
  return [
    `**${entries.length} robots** from ${makers} makers. Click a name to open that robot in the live studio. ${local} models whose upstream states no license are not published: \`npm run robots:fetch\` builds them on your own machine.`,
    ...blocks,
  ].join('\n\n');
}

/** The README with its library and counts brought up to date. */
export function updateReadme(readme, entries) {
  const from = readme.indexOf(START), to = readme.indexOf(END);
  if (from < 0 || to < from) throw new Error(`README has no ${START} … ${END} block`);
  const live = entries.filter((e) => e.live && e.group !== 'preset').length;
  return `${readme.slice(0, from + START.length)}\n${renderLibrary(entries)}\n${readme.slice(to)}`
    .replace(/open one of \d+ robots/, `open one of ${entries.length} robots`)
    .replace(/loads its \d+ CAD robots/, `loads its ${live} CAD robots`)
    .replace(/The \d+ robots whose upstream states no license/, `The ${entries.filter((e) => !e.live).length} robots whose upstream states no license`);
}
