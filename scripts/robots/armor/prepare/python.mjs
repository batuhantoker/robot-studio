import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from '../../process/run.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEPS = ['xacro==2.1.1', 'trimesh==5.2.0', 'pycollada==0.9.3', 'networkx==3.7', 'PyYAML==6.0.3', 'numpy==2.5.4', 'scipy==1.18.1', 'fast-simplification==0.2.0', 'pillow==13.0.0'];

// Runs a helper from prepare/convert/ isolated (-I) with a JSON job file written into `workDir`.
export async function runHelper(script, job, workDir) {
  fs.mkdirSync(workDir, { recursive: true });
  const jobFile = path.join(workDir, `${path.basename(script, '.py')}.job.json`);
  fs.writeFileSync(jobFile, JSON.stringify(job));
  const args = ['run', '--quiet', '--no-project', ...DEPS.flatMap((d) => ['--with', d])];
  args.push('python', '-I', path.join(HERE, 'convert', script), jobFile);
  try {
    return await run('uv', args, { cwd: workDir, capture: true, errTail: true });
  } catch (err) {
    throw new Error(`${script} ${err.message.split(' failed ').at(-1)}`);
  }
}

export async function unzip(zipFile, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  await run('uv', ['run', '--quiet', '--no-project', 'python', '-I', '-m', 'zipfile', '-e', zipFile, destDir], {
    capture: true,
    errTail: true,
  });
}
