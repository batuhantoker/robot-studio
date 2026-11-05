/** A studio tool compiled into a CAD arm: procedural parts to draw, its hull as real collision geoms, a site at its working end. */
import * as THREE from 'three';
import type { EffectorKind } from '../../../core/robot/schema/types';
import { matToQuat } from '../../../core/math/linear/transform';
import { hullOf } from '../../common/hull';
import { transformOf } from '../../common/orient';
import { settle } from '../../common/part';
import type { MaterialSet } from '../../materials/library';
import { EFFECTOR_BUILDERS } from '../../registry/effectors';
import type { EffectorRig } from '../types';
import type { ToolMount } from './mounts';

/** An industrial tool's density, averaged over a hull that is mostly housing and air between the jaws. */
const DENSITY = 2000;

const list = (v: ArrayLike<number>) => Array.from(v, (x) => +x.toFixed(6)).join(' ');

export const toolSite = (limb: number) => `tool:${limb}`;

/** Its frame is the flange's: +z along the approach, the working end `reach` out. */
export function buildRig(kind: EffectorKind, size: number, mats: MaterialSet): EffectorRig {
  const at = new THREE.Vector3();
  const rig = EFFECTOR_BUILDERS[kind]({ mats, flange: at, tip: at, approach: new THREE.Vector3(0, 0, 1), size, payload: 0 });
  settle(rig.group);
  const side = new THREE.Vector3(1, 0, 0).applyQuaternion(rig.group.quaternion);
  return { ...rig, kind, size, tool: { approach: [0, 0, 1], side: side.toArray(), beyond: 0 } };
}

const volume = (shape: string, s: number[]) =>
  shape === 'box' ? 8 * s[0] * s[1] * s[2] : shape === 'sphere' ? (4 / 3) * Math.PI * s[0] ** 3 : 2 * Math.PI * s[0] ** 2 * s[1];

/** The tool as a body: no joints, so the model's qpos and keyframes stay as they were. */
export function toolBody(name: string, m: ToolMount, rig: EffectorRig): string {
  const geoms: string[] = [];
  const centre = new THREE.Vector3();
  let total = 0;
  rig.group.updateWorldMatrix(true, true);
  rig.group.traverse((o) => {
    const h = hullOf(o);
    if (!h) return;
    const T = transformOf(o.matrixWorld);
    const v = volume(h.shape, h.size);
    total += v;
    centre.addScaledVector(new THREE.Vector3(...T.p), v);
    // Every attribute spelt out: a childclass above the flange would otherwise restyle these.
    geoms.push(`<geom type="${h.shape}" size="${list(h.size)}" pos="${list(T.p)}" quat="${list(matToQuat(T.R))}" contype="1" conaffinity="1" group="3" rgba="0 0 0 0"/>`);
  });
  const mass = DENSITY * total;
  const inertia = 0.1 * mass * rig.reach ** 2;
  return `<body name="${name}" pos="${list(m.pos)}" quat="${list(m.quat)}">`
    + `<inertial pos="${list(centre.divideScalar(total).toArray())}" mass="${mass.toFixed(5)}" diaginertia="${inertia.toFixed(7)} ${inertia.toFixed(7)} ${inertia.toFixed(7)}"/>`
    + `${geoms.join('')}<site name="${toolSite(m.limb)}" pos="0 0 ${rig.reach.toFixed(6)}" group="5"/></body>`;
}

/** Just the working end, for a tool the arm already carries. */
export const toolPoint = (m: ToolMount) => `<site name="${toolSite(m.limb)}" pos="${list(m.pos)}" quat="${list(m.quat)}" group="5"/>`;

/** `xml` put inside a named body of an MJCF text, or null if the text has no such body. */
export function insertInBody(text: string, body: string, xml: string): string | null {
  const name = body.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tag = new RegExp(`<body\\b[^>]*?\\bname="${name}"[^>]*?(/?)>`).exec(text);
  if (!tag) return null;
  const end = tag.index + tag[0].length;
  return tag[1] ? `${text.slice(0, end - 2)}>${xml}</body>${text.slice(end)}` : text.slice(0, end) + xml + text.slice(end);
}

/** A copy of a robot's files with each piece of XML inside its body, wherever in the includes that body lives. */
export function withXml(files: Map<string, Uint8Array>, main: string, parts: { body: string; xml: string }[]): Map<string, Uint8Array> {
  const out = new Map(files);
  const names = [main, ...[...files.keys()].filter((f) => f.endsWith('.xml') && f !== main)];
  for (const { body, xml } of parts) {
    const hit = names.some((f) => {
      const next = insertInBody(new TextDecoder().decode(out.get(f)), body, xml);
      if (next !== null) out.set(f, new TextEncoder().encode(next));
      return next !== null;
    });
    if (!hit) throw new Error(`no body ${body} to mount a tool on`);
  }
  return out;
}
