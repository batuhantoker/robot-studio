/** Pure edits on studio JSON; validation happens once, in parseRobot. */
import { toStudioDict } from '../../core/robot/io/export';
import { JOINT_KINDS } from '../../core/robot/joints/kinds';
import type { JointKind, RobotSpec } from '../../core/robot/schema/types';

export type Raw = Record<string, unknown> & { links: Record<string, unknown>[] };

export const rawOf = (spec: RobotSpec) => toStudioDict(spec) as Raw;

export function patchLink(raw: Raw, index: number, patch: Record<string, unknown>): Raw {
  const links = raw.links.map((l, i) => {
    if (i !== index) return l;
    const next = { ...l, ...patch };
    for (const [k, v] of Object.entries(patch)) if (v === undefined) delete next[k];
    if (next.joint === 'revolute') delete next.joint;
    return next;
  });
  return { ...raw, links };
}

export function moveLink(raw: Raw, index: number, delta: number): Raw {
  const links = [...raw.links];
  const j = index + delta;
  if (j < 0 || j >= links.length) return raw;
  [links[index], links[j]] = [links[j], links[index]];
  return { ...raw, links };
}

export const removeLink = (raw: Raw, index: number): Raw =>
  raw.links.length > 1 ? { ...raw, links: raw.links.filter((_, i) => i !== index) } : raw;

function uniqueName(raw: Raw, base: string): string {
  const names = new Set(raw.links.map((l) => l.name));
  for (let i = 1; ; i++) if (!names.has(`${base}_${i}`)) return `${base}_${i}`;
}

/** Append a link of the given kind, continuing the chain along a sensible direction. */
export function addLink(raw: Raw, joint: JointKind): Raw {
  const prev = raw.links.at(-1);
  const radius = Math.max(((prev?.radius as number) ?? 0.02) * 0.85, 0.008);
  const axisFor: Record<JointKind, number[]> = {
    revolute: [0, 1, 0], prismatic: [1, 0, 0], cylindrical: [0, 0, 1], universal: [0, 1, 0], spherical: [1, 0, 0], planar: [0, 0, 1],
  };
  const link: Record<string, unknown> = {
    name: uniqueName(raw, joint === 'revolute' ? 'joint' : joint),
    axis: axisFor[joint],
    offset: joint === 'planar' || joint === 'cylindrical' ? [0, 0, 0.12] : [0.15, 0, 0],
    mass: 0.3,
    radius,
  };
  if (joint !== 'revolute') link.joint = joint;
  if (JOINT_KINDS[joint].dofs.some((d) => d.axis !== 'axis')) link.axis2 = joint === 'planar' ? [1, 0, 0] : [0, 0, 1];
  return { ...raw, links: [...raw.links, link] };
}

export const blankRobot = (): Raw => ({
  name: 'my_robot',
  units: 'SI',
  base: [0, 0, 0.05],
  tool: [0.04, 0, 0],
  payload_mass: 0,
  links: [
    { name: 'base_yaw', axis: [0, 0, 1], offset: [0, 0, 0.14], mass: 0.8, radius: 0.028 },
    { name: 'shoulder', axis: [0, 1, 0], offset: [0.26, 0, 0], mass: 0.6, radius: 0.022 },
    { name: 'elbow', axis: [0, 1, 0], offset: [0.2, 0, 0], mass: 0.4, radius: 0.018 },
  ],
});
