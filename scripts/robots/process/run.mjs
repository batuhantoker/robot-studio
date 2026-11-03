import { spawn } from 'node:child_process';

// `errTail` pipes stderr and appends its last lines to the error instead of printing it.
export function run(cmd, args, { cwd, capture = false, quiet = false, env = {}, errTail = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', ...env },
      stdio: ['ignore', capture ? 'pipe' : 'inherit', errTail ? 'pipe' : quiet ? 'ignore' : 'inherit'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on('data', (chunk) => {
      stderr = (stderr + chunk).slice(-4000);
    });
    child.on('error', (err) => reject(new Error(`could not start ${cmd}: ${err.message}`)));
    child.on('close', (code, signal) => {
      if (code === 0) resolve(stdout.trim());
      else {
        const tail = stderr.trim().split('\n').slice(-6).join(' | ');
        reject(new Error(`${cmd} ${args.join(' ')} failed (${signal ?? `exit ${code}`})${tail ? `: ${tail}` : ''}`));
      }
    });
  });
}
