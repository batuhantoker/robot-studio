// Informational, non-failing: qpos0 vs joint limits, keyframes, the tool point and contacts at qpos0.
export function notesFor(mj, m, chain, tipBody) {
  const notes = [];
  const { mjJNT_SLIDE, mjJNT_HINGE } = mj.mjtJoint;
  const outside = [];
  for (let j = 0; j < m.njnt; j++) {
    const type = m.jnt_type[j];
    if ((type !== mjJNT_HINGE.value && type !== mjJNT_SLIDE.value) || !m.jnt_limited[j]) continue;
    const q = m.qpos0[m.jnt_qposadr[j]];
    const [lo, hi] = [m.jnt_range[2 * j], m.jnt_range[2 * j + 1]];
    if (q < lo - 1e-9 || q > hi + 1e-9) outside.push(`${m.jnt(j).name}∉[${lo.toFixed(3)},${hi.toFixed(3)}]`);
  }
  if (outside.length) notes.push(`qpos0 outside range: ${outside.join(' ')}`);
  const keys = Array.from({ length: m.nkey }, (_, k) => m.key(k).name || `#${k}`);
  if (keys.length) notes.push(`keyframes: ${keys.join(', ')}`);

  const d = new mj.MjData(m);
  try {
    mj.mj_forward(m, d);
    const p = chain?.tip.site ? [0, 0, 0] : chain?.tip.pos;
    if (d.ncon) notes.push(`${d.ncon} contact(s) at qpos0`);
    if (!chain) return notes;
    const R = d.xmat.slice(9 * tipBody, 9 * tipBody + 9);
    const x = d.xpos.slice(3 * tipBody, 3 * tipBody + 3);
    let w = [0, 1, 2].map((r) => x[r] + R[3 * r] * p[0] + R[3 * r + 1] * p[1] + R[3 * r + 2] * p[2]);
    if (chain.tip.site) {
      const s = mj.mj_name2id(m, mj.mjtObj.mjOBJ_SITE.value, chain.tip.site);
      w = Array.from(d.site_xpos.slice(3 * s, 3 * s + 3));
    }
    notes.push(`tip at qpos0: (${w.map((v) => v.toFixed(3)).join(', ')}) m`);
  } finally {
    d.delete();
  }
  return notes;
}
