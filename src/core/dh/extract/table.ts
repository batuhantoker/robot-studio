/**
 * Derive a DH table from the joint axis lines at the reference pose. Frame i lies on joint i+1's
 * axis; the last frame shares the last axis direction and passes through the tool point.
 */
import { chainFrames, zeroPose } from '../../chain/kinematics/frames';
import type { Chain } from '../../chain/model/types';
import { type Mat3, transpose } from '../../math/linear/mat3';
import { type Transform, compose, invert } from '../../math/linear/transform';
import { type Vec3, cross, dot, perpendicular, scale, sub } from '../../math/linear/vec';
import type { DHRow, DHTable } from '../types';
import { angleAbout, placeFrame } from './lines';

const frameOf = (origin: Vec3, x: Vec3, z: Vec3): Transform => {
  const y = cross(z, x);
  return { R: transpose([...x, ...y, ...z] as Mat3), p: origin };
};

function baseX(z: Vec3, worldX: Vec3): Vec3 {
  const projected = sub(worldX, scale(z, dot(worldX, z)));
  const n = Math.hypot(...projected);
  return n > 1e-9 ? scale(projected, 1 / n) : perpendicular(z);
}

export function extractDH(chain: Chain): DHTable {
  const f = chainFrames(chain, zeroPose(chain));
  const n = chain.joints.length;
  const lines = f.axes.map((z, k) => ({ point: f.origins[k], z }));
  lines.push({ point: f.tip.p, z: f.axes[n - 1] });
  const z0 = lines[0].z;
  // Frame 0 sits where the first axis passes closest to the base origin.
  const o0 = sub(lines[0].point, scale(z0, dot(sub(lines[0].point, chain.base.p), z0)));
  let prev = { origin: o0, x: baseX(z0, [chain.base.R[0], chain.base.R[3], chain.base.R[6]]), z: z0 };
  const base = frameOf(prev.origin, prev.x, prev.z);
  const rows: DHRow[] = [];
  for (let i = 1; i <= n; i++) {
    const { point, z } = lines[i];
    const place = placeFrame(prev.origin, prev.z, prev.x, point, z);
    const joint = chain.joints[i - 1];
    rows.push({
      joint: joint.name,
      type: joint.type,
      theta: angleAbout(prev.x, place.x, prev.z),
      d: dot(sub(place.foot, prev.origin), prev.z),
      a: dot(sub(place.origin, place.foot), place.x),
      alpha: angleAbout(prev.z, z, place.x),
      q0: joint.q0,
      placement: place.kind,
    });
    prev = { origin: place.origin, x: place.x, z };
  }
  return { rows, base, tool: compose(invert(frameOf(prev.origin, prev.x, prev.z)), f.tip) };
}
