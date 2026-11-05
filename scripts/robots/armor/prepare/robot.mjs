import fs from 'node:fs';
import path from 'node:path';
import { resetDir } from '../../files/output-dir.mjs';
import { ARMOR_CACHE, ARMOR_OUT } from '../../paths.mjs';
import { compileInChild } from '../compile/spawn.mjs';
import { findLicense } from '../licenses/find.mjs';
import { pullLfs } from '../resolve/lfs.mjs';
import { resolveMesh } from '../resolve/mesh-path.mjs';
import { resolveSource } from '../resolve/source.mjs';
import { convertMeshes, meshKey } from './convert-meshes.mjs';
import { fitFaceBudget } from './face-budget.mjs';
import { finishUrdf, loadUrdf } from './urdf-rewrite.mjs';

// Fetches, converts and compiles one catalog robot into public/robots/armor/<slug>/; returns raw facts.
export async function prepareRobot(robot, repoDirs = robot.dirs) {
  const out = path.join(ARMOR_OUT, robot.slug);
  const work = path.join(ARMOR_CACHE, 'work', robot.slug);
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(work, { recursive: true });
  const src = await resolveSource(robot, work, repoDirs);
  const model = loadUrdf(fs.readFileSync(src.urdf, 'utf8'), path.basename(src.urdf));
  const notes = [...model.notes];

  const refs = [...new Set(model.meshRefs.map((r) => r.ref))];
  const resolved = new Map(refs.map((ref) => [ref, resolveMesh(ref, src.ctx)]));
  const missing = refs.filter((ref) => !resolved.get(ref));
  if (missing.length) notes.push(`${missing.length} mesh file(s) missing upstream, parts dropped: ${missing.slice(0, 3).join(', ')}`);
  const srcs = [...new Set([...resolved.values()].filter(Boolean))];
  for (const { key, dir } of src.repos) await pullLfs(key, dir, srcs.filter((s) => s.startsWith(dir + path.sep)));

  resetDir(out);
  const items = new Map();
  for (const r of model.meshRefs) {
    const src = resolved.get(r.ref);
    if (src) items.set(meshKey(src, r.hull), { src, hull: r.hull });
  }
  const upAxis = { upAxis: Boolean(robot.colladaUpAxis) };
  const meshes = await convertMeshes([...items.values()], path.join(out, 'meshes'), work, upAxis);
  const decimated = await fitFaceBudget(meshes, [...items.values()], path.join(out, 'meshes'), work, upAxis);
  if (decimated) notes.push(decimated);
  fs.writeFileSync(path.join(work, 'meshes.json'), JSON.stringify(Object.fromEntries(meshes), null, 1));
  const failed = [...meshes.values()].filter((m) => m.error);
  if (failed.length) notes.push(`${failed.length} mesh(es) failed to convert, parts dropped: ${failed[0].error}`);
  const yUp = [...meshes].filter(([k, m]) => !k.startsWith('hull:') && m.up === 'Y_UP').length;
  if (yUp && upAxis.upAxis) notes.push(`${yUp} Collada mesh(es) declare Y_UP and were rotated to Z-up (catalog override)`);
  else if (yUp) notes.push(`${yUp} Collada mesh(es) declare Y_UP; up_axis ignored as ROS tools do (matches collision geometry)`);
  const fileFor = (r) => meshes.get(meshKey(resolved.get(r.ref), r.hull))?.file ?? null;
  fs.writeFileSync(path.join(out, 'robot.urdf'), finishUrdf(model, fileFor));

  const facts = await compileInChild(`armor/${robot.slug}`, robot.category, robot.rootQuat, { home: robot.home, maxChains: robot.maxChains, extraGeoms: robot.extraGeoms });
  if (facts.error) throw new Error(`MuJoCo: ${facts.error}`);
  if (facts.errors?.length) throw new Error(facts.errors.join('; '));

  const license = robot.spdx ? { spdx: robot.spdx, file: null } : findLicense(src.licenseDir, src.repoRoot);
  if (license.file) fs.copyFileSync(license.file, path.join(out, path.basename(license.file)));
  const maxFaces = Math.max(0, ...[...meshes.values()].map((m) => m.faces ?? 0));
  return { facts, notes, license, links: model.links, maxFaces };
}
