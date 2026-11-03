/**
 * Reduce a compiled MuJoCo model to a serial Chain along named hinge/slide joints.
 * Mirrors mj_kinematics: within a body, each hinge turns about its anchor and each slide
 * translates, in declaration order. Joints off the chain are held at qpos0 (rigid).
 */
import type { Chain, ChainJoint, ChainMass } from '../../../core/chain/model/types';
import { type Transform, applyTransform, compose, identityTransform, invert, quatToMat, translation } from '../../../core/math/linear/transform';
import { type Vec3, scale } from '../../../core/math/linear/vec';
import { JOINT, OBJ, arrays } from '../../runtime/arrays';
import type { ModelHandle } from '../../model/handle';
import { readBodies, readJoints } from '../bodies';
import { onLastAxis, subtreeComTip } from './tip-fallback';
import { bodyTransform, nearest, pathTo, relativeTransform } from './tree';

export type TipSpec = { site: string } | { body: string; pos?: Vec3 };

export interface ModelChain {
  chain: Chain;
  /** MuJoCo joint id of each chain joint. */
  jointIds: number[];
  /** For every body: the chain joint whose moving frame carries it (-1: base) and the offset. */
  attach: { joint: number; T: Transform }[];
  /** The tool point in its body's frame, for comparing with MuJoCo's xpos/xmat. */
  tipBody: number;
  tipInBody: Vec3;
}

const defaultLimits = (type: number): [number, number] => (type === JOINT.slide ? [-0.1, 0.1] : [-Math.PI, Math.PI]);

export function chainFromModel(h: ModelHandle, jointNames: string[], tip: TipSpec, name = 'robot'): ModelChain {
  const bodies = readBodies(h), joints = readJoints(h);
  const jointIds = jointNames.map((n) => {
    const id = h.id(OBJ.joint, n);
    if (id < 0) throw new Error(`unknown joint ${n}`);
    if (joints[id].type !== JOINT.hinge && joints[id].type !== JOINT.slide) throw new Error(`${n} is not a hinge or slide`);
    return id;
  });
  const tipBody = 'site' in tip ? arrays(h.model).site_bodyid[h.id(OBJ.site, tip.site)] : h.id(OBJ.body, tip.body);
  if (tipBody === undefined || tipBody < 0) throw new Error('unknown tool site or body');
  const order = new Map(jointIds.map((id, k) => [id, k]));
  const out: ChainJoint[] = [];
  const attach = bodies.map(() => ({ joint: -1, T: identityTransform() }));
  const path = pathTo(bodies, tipBody);
  let P = identityTransform();
  for (const b of path) {
    P = compose(P, bodyTransform(bodies[b]));
    for (const j of bodies[b].joints) {
      const info = joints[j];
      if (info.type === JOINT.free || info.type === JOINT.ball) throw new Error(`${info.name}: free/ball joints are not supported on the chain`);
      if (!order.has(j)) continue;
      if (order.get(j) !== out.length) throw new Error(`chain joints are not in root-to-tip order at ${info.name}`);
      const hinge = info.type === JOINT.hinge;
      out.push({
        name: info.name,
        type: hinge ? 'hinge' : 'slide',
        fixed: hinge ? compose(P, translation(info.pos)) : P,
        axis: info.axis,
        limits: info.limited ? info.range : defaultLimits(info.type),
        q0: info.q0,
        continuous: hinge && !info.limited,
      });
      P = hinge ? translation(scale(info.pos, -1)) : identityTransform();
    }
    attach[b] = { joint: out.length - 1, T: P };
  }
  if (out.length !== jointIds.length) throw new Error('chain joints do not lie on the path to the tool');
  const placed = new Set(path);
  const masses: ChainMass[] = [];
  bodies.forEach((body, b) => {
    if (b === 0) return;
    const anchor = nearest(bodies, b, (a) => placed.has(a));
    if (anchor < 0) return;
    const T = compose(attach[anchor].T, relativeTransform(bodies, anchor, b));
    attach[b] = { joint: attach[anchor].joint, T };
    placed.add(b);
    if (body.mass > 0) masses.push({ name: body.name, mass: body.mass, com: applyTransform(T, body.ipos), joint: attach[anchor].joint });
  });
  const tipLocal = 'site' in tip
    ? { R: quatToMat(siteQuat(h, tip.site)), p: sitePos(h, tip.site) }
    : translation(tip.pos ?? [0, 0, 0]);
  let tipT = compose(attach[tipBody].T, tipLocal);
  const bodyOrigin = !('site' in tip) && !(tip.pos ?? [0, 0, 0]).some((v) => v !== 0);
  if (bodyOrigin && onLastAxis(tipT, out.at(-1))) tipT = subtreeComTip(bodies, tipBody, attach) ?? tipT;
  const opt = h.model.opt as unknown as { gravity: ArrayLike<number> };
  const chain: Chain = {
    name,
    base: identityTransform(),
    joints: out,
    tip: tipT,
    masses,
    gravity: [opt.gravity[0], opt.gravity[1], opt.gravity[2]],
  };
  return { chain, jointIds, attach, tipBody, tipInBody: applyTransform(invert(attach[tipBody].T), tipT.p) };
}

function sitePos(h: ModelHandle, site: string): Vec3 {
  const m = arrays(h.model), i = h.id(OBJ.site, site);
  return [m.site_pos[3 * i], m.site_pos[3 * i + 1], m.site_pos[3 * i + 2]];
}

function siteQuat(h: ModelHandle, site: string) {
  const m = arrays(h.model), i = h.id(OBJ.site, site);
  return [m.site_quat[4 * i], m.site_quat[4 * i + 1], m.site_quat[4 * i + 2], m.site_quat[4 * i + 3]];
}
