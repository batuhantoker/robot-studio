// Chain joints must be hinge/slide, in base-to-tip order, and exactly the joints on the world-to-tip path.
export function checkChain(mj, m, chain) {
  const errors = [];
  const { mjOBJ_JOINT, mjOBJ_BODY, mjOBJ_SITE } = mj.mjtObj;
  const { mjJNT_FREE, mjJNT_SLIDE, mjJNT_HINGE } = mj.mjtJoint;
  const jointName = (j) => m.jnt(j).name;
  const isAncestorOrSelf = (ancestor, body) => {
    for (let b = body; ; b = m.body_parentid[b]) {
      if (b === ancestor) return true;
      if (b === 0) return false;
    }
  };

  const joints = [];
  for (const name of chain.joints) {
    const j = mj.mj_name2id(m, mjOBJ_JOINT.value, name);
    if (j < 0) {
      errors.push(`joint ${name} not found`);
      continue;
    }
    const type = m.jnt_type[j];
    if (type !== mjJNT_HINGE.value && type !== mjJNT_SLIDE.value) errors.push(`joint ${name} is not hinge/slide`);
    joints.push(j);
  }

  const tip = chain.tip;
  let tipBody = -1;
  if (tip.site) {
    const s = mj.mj_name2id(m, mjOBJ_SITE.value, tip.site);
    if (s < 0) errors.push(`tip site ${tip.site} not found`);
    else tipBody = m.site_bodyid[s];
  } else {
    tipBody = mj.mj_name2id(m, mjOBJ_BODY.value, tip.body);
    if (tipBody < 0) errors.push(`tip body ${tip.body} not found`);
  }
  if (errors.length || !joints.length) return { errors };

  for (let k = 1; k < joints.length; k++) {
    if (!isAncestorOrSelf(m.jnt_bodyid[joints[k - 1]], m.jnt_bodyid[joints[k]])) {
      errors.push(`${jointName(joints[k])} is not below ${jointName(joints[k - 1])} in the body tree`);
    }
  }
  if (!isAncestorOrSelf(m.jnt_bodyid[joints.at(-1)], tipBody)) {
    errors.push(`tip is not below the last chain joint ${jointName(joints.at(-1))}`);
  }

  // The joints on the world-to-tip path must be exactly the chain, so no chain joint is omitted.
  const pathJoints = [];
  for (let b = tipBody, bodies = []; ; b = m.body_parentid[b]) {
    if (b === 0) {
      for (const body of bodies.reverse()) {
        for (let j = m.body_jntadr[body]; j >= 0 && j < m.body_jntadr[body] + m.body_jntnum[body]; j++) {
          if (m.jnt_type[j] === mjJNT_FREE.value) errors.push(`free joint ${jointName(j) || j} on the path (not fixed-base)`);
          else if (m.jnt_type[j] !== mjJNT_HINGE.value && m.jnt_type[j] !== mjJNT_SLIDE.value) {
            errors.push(`ball joint ${jointName(j) || j} on the path`);
          } else pathJoints.push(j);
        }
      }
      break;
    }
    bodies.push(b);
  }
  if (pathJoints.join() !== joints.join()) {
    errors.push(`path joints [${pathJoints.map(jointName).join(', ')}] differ from chain`);
  }
  return { errors, tipBody };
}
