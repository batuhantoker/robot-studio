// One candidate per leaf body: every joint on the world-to-leaf path (root to tip), if all are hinge/slide.
export function discoverChains(mj, m) {
  const { mjJNT_HINGE, mjJNT_SLIDE } = mj.mjtJoint;
  const movable = (j) => m.jnt_type[j] === mjJNT_HINGE.value || m.jnt_type[j] === mjJNT_SLIDE.value;
  const hasChild = new Array(m.nbody).fill(false);
  for (let b = 1; b < m.nbody; b++) hasChild[m.body_parentid[b]] = true;

  const walk = (body) => {
    const joints = [];
    let depth = 0;
    for (let b = body; b > 0; b = m.body_parentid[b], depth++) {
      const own = [];
      for (let j = m.body_jntadr[b], n = 0; j >= 0 && n < m.body_jntnum[b]; j++, n++) own.push(j);
      joints.unshift(...own);
    }
    return { joints, depth };
  };

  const candidates = [];
  for (let b = 1; b < m.nbody; b++) {
    if (hasChild[b]) continue;
    const { joints, depth } = walk(b);
    if (!joints.length || !joints.every(movable)) continue;
    candidates.push({ joints: joints.map((j) => m.jnt(j).name), body: m.body(b).name, depth });
  }
  // Body that carries each joint, for synthesising a tip at the last joint of a shared trunk.
  const jointBody = new Map();
  for (let j = 0; j < m.njnt; j++) jointBody.set(m.jnt(j).name, m.body(m.jnt_bodyid[j]).name);
  return { candidates, jointBody };
}
