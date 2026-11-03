import fs from 'node:fs';
import path from 'node:path';
import { assertExactFile } from '../files/exact-case.mjs';

function detectSpdx(text) {
  const t = text.replace(/\s+/g, ' ');
  if (/GNU (Lesser |Affero )?General Public License|Creative Commons|NonCommercial/i.test(t)) return null;
  if (/Apache License,? Version 2\.0/i.test(t)) return 'Apache-2.0';
  if (/Permission is hereby granted, free of charge/i.test(t)) return 'MIT';
  const bsd =
    /Redistribution and use in source and binary forms, with or without modification, are permitted/i.test(t) &&
    /Redistributions of source code must retain/i.test(t) &&
    /Redistributions in binary form must reproduce/i.test(t);
  if (bsd) return /Neither the name/i.test(t) ? 'BSD-3-Clause' : 'BSD-2-Clause';
  return null;
}

// Returns the SPDX id read from srcDir/LICENSE, or throws unless it is the one the catalog expects.
export function checkLicense(srcDir, robot) {
  assertExactFile(srcDir, 'LICENSE', robot.dir);
  const spdx = detectSpdx(fs.readFileSync(path.join(srcDir, 'LICENSE'), 'utf8'));
  if (spdx !== robot.spdx) {
    throw new Error(`${robot.dir}/LICENSE reads as ${spdx ?? 'unrecognised/restrictive'}, expected ${robot.spdx}`);
  }
  return spdx;
}
