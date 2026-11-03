import fs from 'node:fs';
import path from 'node:path';
import { runHelper, unzip } from '../prepare/python.mjs';
import { ensureRepo, repoDir } from './checkout.mjs';
import { download } from './download.mjs';
import { listFiles, packageMap } from './packages.mjs';

// Checks out the robot's repo(s) and returns its source URDF on disk plus the lookup context for meshes.
// `repoDirs`: the sparse set for the main repo (the union over all robots sharing it, so it is checked out once).
export async function resolveSource(robot, workDir, repoDirs = robot.dirs) {
  if (robot.url) {
    const urdf = await download(robot.url, robot.sha256, path.join(workDir, 'source.urdf'));
    const ctx = { urdfDir: workDir, files: [urdf], packages: new Map() };
    return { repoRoot: workDir, roots: [workDir], repos: [], urdf, licenseDir: workDir, ctx };
  }
  const main = await ensureRepo(robot.repo, repoDirs);
  const extras = Object.entries(robot.extra ?? {});
  for (const [key, dirs] of extras) await ensureRepo(key, dirs);
  const roots = [main, ...extras.map(([key]) => repoDir(key))];
  if (robot.zip) {
    const unpacked = path.join(workDir, 'unzipped');
    fs.rmSync(unpacked, { recursive: true, force: true });
    await unzip(path.join(main, robot.zip), unpacked);
    roots.push(unpacked);
  }
  const files = listFiles(roots);
  const packages = packageMap(files, roots);

  let urdf;
  if (robot.urdf) urdf = path.join(main, robot.urdf);
  else if (robot.zip) urdf = path.join(roots.at(-1), robot.inner);
  else if (robot.xacro) {
    urdf = path.join(workDir, 'expanded.urdf');
    const job = {
      input: path.join(main, robot.xacro),
      output: urdf,
      args: robot.args ?? {},
      packages: Object.fromEntries(packages),
    };
    await runHelper('expand_xacro.py', job, workDir);
  } else throw new Error('catalog entry needs urdf, xacro or zip');
  if (!fs.existsSync(urdf)) throw new Error(`source URDF not found: ${path.relative(main, urdf)}`);
  // Relative mesh paths in a xacro are relative to the xacro, not to the expanded output.
  const urdfDir = path.dirname(robot.xacro ? path.join(main, robot.xacro) : urdf);
  const licenseDir = path.dirname(path.join(main, robot.urdf ?? robot.xacro ?? robot.zip));
  const repos = [{ key: robot.repo, dir: main }, ...extras.map(([key]) => ({ key, dir: repoDir(key) }))];
  return { repoRoot: main, roots, repos, urdf, licenseDir, ctx: { urdfDir, files, packages } };
}
