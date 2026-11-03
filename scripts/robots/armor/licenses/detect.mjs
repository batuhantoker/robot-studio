// SPDX id from a license text, or null when it is not one of the texts below. Order matters:
// copyleft and Creative Commons texts quote permissive phrases, so they are tested first.
const RULES = [
  ['CC-BY-NC-SA-4.0', /Attribution-NonCommercial-ShareAlike 4\.0/i],
  ['CC-BY-NC-4.0', /Attribution-NonCommercial 4\.0/i],
  ['CC-BY-SA-4.0', /Attribution-ShareAlike 4\.0/i],
  ['CC-BY-4.0', /Creative Commons Attribution 4\.0/i],
  ['CC0-1.0', /CC0 1\.0|Creative Commons Zero/i],
  ['AGPL-3.0', /GNU AFFERO GENERAL PUBLIC LICENSE\s+Version 3/i],
  ['LGPL-3.0', /GNU LESSER GENERAL PUBLIC LICENSE\s+Version 3/i],
  ['LGPL-2.1', /GNU LESSER GENERAL PUBLIC LICENSE\s+Version 2\.1/i],
  ['GPL-3.0', /GNU GENERAL PUBLIC LICENSE\s+Version 3/i],
  ['GPL-2.0', /GNU GENERAL PUBLIC LICENSE\s+Version 2/i],
  ['MulanPSL-2.0', /Mulan Permissive Software License,?\s+Version 2/i],
  ['CERN-OHL-W-2.0', /CERN Open Hardware Licence Version 2 - Weakly Reciprocal/i],
  ['CERN-OHL-S-2.0', /CERN Open Hardware Licence Version 2 - Strongly Reciprocal/i],
  ['CECILL-2.1', /CeCILL[^\n]*(2\.1|v2\.1)/i],
  ['CECILL-C', /CeCILL-C/i],
  ['CECILL-B', /CeCILL-B/i],
  ['MPL-2.0', /Mozilla Public License,?\s+(Version|v\.?)\s*2\.0/i],
  ['Apache-2.0', /Apache License,?\s+Version 2\.0/i],
  ['BSD-3-Clause-Clear', /The Clear BSD License/i],
  ['MIT', /Permission is hereby granted, free of charge/i],
  ['BSL-1.0', /Boost Software License/i],
  ['Unlicense', /This is free and unencumbered software released into the public domain/i],
];

export function detectSpdx(text) {
  const t = text.replace(/\s+/g, ' ');
  for (const [id, re] of RULES) if (re.test(t)) return id;
  const bsd =
    /Redistribution and use in source and binary forms, with or without modification, are permitted/i.test(t) &&
    /Redistributions of source code must retain/i.test(t);
  if (bsd) return /Neither the name|names of its contributors/i.test(t) ? 'BSD-3-Clause' : 'BSD-2-Clause';
  return null;
}
