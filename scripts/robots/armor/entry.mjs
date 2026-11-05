import fs from 'node:fs';
import path from 'node:path';
import { ROBOTS_DIR } from '../paths.mjs';
import { armorId } from './catalog/index.mjs';
import { repoCommit, repoUrl } from './catalog/repos.mjs';

const GALLERY = 'https://armor.dc-engineer.com/gallery';

function upstreamOf(robot) {
  if (robot.url) return { repo: null, url: robot.url, sha256: robot.sha256, path: robot.url, format: 'urdf', tree: robot.url };
  const commit = repoCommit(robot.repo);
  const file = robot.urdf ?? robot.xacro ?? robot.zip;
  return {
    repo: repoUrl(robot.repo),
    commit,
    path: robot.zip ? `${robot.zip}!/${robot.inner}` : file,
    format: robot.xacro ? 'xacro' : robot.zip ? 'urdf-zip' : 'urdf',
    ...(robot.args ? { args: robot.args } : {}),
    tree: `${repoUrl(robot.repo)}/tree/${commit}/${path.posix.dirname(file)}`.replace(/\/\.$/, ''),
  };
}

// Manifest entry for a prepared robot; the first nine keys are the contract shared with the other collections.
export function armorEntry(robot, prep) {
  const { facts } = prep;
  const rel = `armor/${robot.slug}`;
  const upstream = upstreamOf(robot);
  const bytes = facts.files.reduce((sum, f) => sum + fs.statSync(path.join(ROBOTS_DIR, f)).size, 0);
  const lic = prep.license;
  const notes = [...prep.notes];
  if (facts.neq) notes.push(`${facts.neq} mimic joint(s) kept as MuJoCo joint equality constraints`);
  if (prep.maxFaces > 200_000) notes.push(`largest mesh has ${prep.maxFaces.toLocaleString('en-US')} faces (OBJ)`);
  if (!facts.chain) notes.push('no movable joint: view-only model');
  return {
    id: armorId(robot.slug),
    title: robot.title,
    maker: robot.vendor,
    dof: facts.chain ? facts.chain.joints.length : 0,
    description: robot.description,
    xml: `${rel}/robot.xml`,
    files: facts.files,
    chain: facts.chain,
    license: {
      spdx: lic.spdx,
      file: lic.file ? `${rel}/${path.basename(lic.file)}` : null,
      source: upstream.tree,
      ...(lic.note || robot.licenseNote ? { note: [robot.licenseNote, lic.note].filter(Boolean).join('; ') } : {}),
    },
    collection: 'armor',
    vendor: robot.vendor,
    category: robot.category,
    base: robot.base,
    format: 'mjcf',
    chains: facts.chains,
    joints_total: facts.joints_total,
    links_total: prep.links,
    mesh_count: facts.nmesh,
    size_mb: +(bytes / 1e6).toFixed(2),
    tags: robot.tags,
    upstream,
    gallery_url: `${GALLERY}/${robot.slug}/`,
    visual_geoms: facts.visual_geoms,
    collision_geoms: facts.collision_geoms,
    mimic_joints: facts.neq,
    base_lift_m: facts.lift ?? 0,
    excluded_contact_pairs: facts.excluded,
    excluded_contacts: facts.excluded_pairs,
    import_notes: notes,
  };
}
