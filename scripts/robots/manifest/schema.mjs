const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isText = (v) => typeof v === 'string' && v.trim().length > 0;
const isRelPath = (p) =>
  isText(p) && !p.startsWith('/') && !p.includes('\\') && !p.split('/').some((s) => s === '' || s === '.' || s === '..');

export function manifestErrors(manifest, only) {
  const errors = [];
  if (manifest.version !== 1) errors.push(`version must be 1 (got ${manifest.version})`);
  if (!/^[0-9a-f]{40}$/.test(manifest.menagerie_commit ?? '')) errors.push('menagerie_commit must be a 40-hex SHA');
  if (!Array.isArray(manifest.robots) || !manifest.robots.length) errors.push('robots must be a non-empty array');
  const ids = (manifest.robots ?? []).map((r) => r?.id);
  if (new Set(ids).size !== ids.length) errors.push('duplicate robot ids');
  if (only) {
    const unknown = only.filter((id) => !ids.includes(id));
    if (unknown.length) errors.push(`--only: not in manifest: ${unknown.join(', ')}`);
  }
  return errors;
}

// `onDisk(rel)` must check existence with exact letter case.
export function entryErrors(entry, onDisk) {
  const errors = [];
  if (!isObject(entry)) return ['entry is not an object'];
  for (const key of ['id', 'title', 'maker', 'description', 'xml']) {
    if (!isText(entry[key])) errors.push(`${key} must be a non-empty string`);
  }
  const files = entry.files;
  if (!Array.isArray(files) || !files.length) {
    errors.push('files must be a non-empty array');
  } else {
    const bad = files.filter((f) => !isRelPath(f));
    if (bad.length) errors.push(`files has non-relative or non-forward-slash paths: ${bad.join(', ')}`);
    if (new Set(files).size !== files.length) errors.push('files has duplicates');
    if (!files.includes(entry.xml)) errors.push('xml is not listed in files');
  }
  const chains = entry.chains;
  if (entry.chain === null) {
    if (entry.dof !== 0) errors.push(`dof must be 0 when chain is null (got ${entry.dof})`);
    if (!Array.isArray(chains) || chains.length) errors.push('chains must be [] when chain is null');
  } else {
    errors.push(...chainErrors(entry.chain, 'chain'));
    if (entry.dof !== entry.chain?.joints?.length) errors.push(`dof ${entry.dof} != ${entry.chain?.joints?.length} chain joints`);
  }
  if (chains !== undefined) {
    if (!Array.isArray(chains) || chains.length > 24) errors.push('chains must be an array of at most 24');
    else chains.forEach((c, i) => errors.push(...chainErrors(c, `chains[${i}]`, true)));
  }
  const lic = entry.license;
  if (!isObject(lic) || !('spdx' in lic) || !('file' in lic) || !isText(lic.source)) {
    errors.push('license must have spdx, file and source');
  } else {
    if (lic.spdx !== null && !isText(lic.spdx)) errors.push('license.spdx must be a string or null');
    if (lic.file !== null && !(isRelPath(lic.file) && onDisk(lic.file))) {
      errors.push(`license.file ${lic.file} does not exist`);
    }
  }
  return errors;
}

function chainErrors(chain, label, named = false) {
  if (!isObject(chain) || !Array.isArray(chain.joints) || !chain.joints.length || !chain.joints.every(isText)) {
    return [`${label}.joints must be a non-empty array of joint names`];
  }
  const errors = [];
  if (named && !isText(chain.name)) errors.push(`${label}.name must be a non-empty string`);
  if (new Set(chain.joints).size !== chain.joints.length) errors.push(`${label}.joints has duplicates`);
  const tip = chain.tip;
  const keys = isObject(tip) ? Object.keys(tip).sort().join(',') : '';
  const siteTip = keys === 'site' && isText(tip.site);
  const bodyTip =
    keys === 'body,pos' && isText(tip.body) && Array.isArray(tip.pos) && tip.pos.length === 3 && tip.pos.every(Number.isFinite);
  if (!siteTip && !bodyTip) errors.push(`${label}.tip must be {site} or {body, pos:[x,y,z]}`);
  return errors;
}
