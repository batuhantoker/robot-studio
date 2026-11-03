#!/usr/bin/env node
// Compiles every robot in public/robots/index.json in MuJoCo WASM from only its listed files, the way
// the browser does, and checks its kinematic chains. Exits 1 on any failure.
//
//   node scripts/robots/verify.mjs [--only id,id,...] [--collection armor|menagerie|montaj1]
import path from 'node:path';
import { parseArgs, selects } from './cli/args.mjs';
import { exactCaseProblem } from './files/exact-case.mjs';
import { readManifest } from './manifest/read.mjs';
import { manifestErrors } from './manifest/schema.mjs';
import { MANIFEST, ROBOTS_DIR, STUDIO } from './paths.mjs';
import { createLoader, errorText } from './verify/compile.mjs';
import { printReport } from './verify/report.mjs';
import { verifyRobot } from './verify/robot.mjs';

async function main() {
  const usage = 'usage: node scripts/robots/verify.mjs [--only id,id,...] [--collection armor|menagerie|montaj1]';
  const opts = parseArgs(process.argv.slice(2), { usage });
  const manifest = readManifest();
  if (!manifest) throw new Error(`${path.relative(STUDIO, MANIFEST)} not found; run scripts/robots/fetch.mjs`);
  const errors = manifestErrors(manifest, opts.only);
  if (errors.length) {
    for (const e of errors) console.error(`index.json: ${e}`);
    process.exit(1);
  }

  const loader = await createLoader();
  const listings = new Map();
  const onDisk = (rel) => !exactCaseProblem(ROBOTS_DIR, rel, listings);
  const robots = manifest.robots.filter((r) => selects(opts, r.id));
  const rows = robots.map((entry, index) => verifyRobot(loader, entry, index, onDisk));
  if (printReport(rows, manifest)) process.exitCode = 1;
}

main().catch((err) => {
  console.error(`verify-robots: ${errorText(err)}`);
  process.exit(1);
});
