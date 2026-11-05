/** Which joint kinds the Builder offers where. Its rule, not the spec's: parseRobot mirrors Python, and a robot saved before this must still open. */
import type { JointKind, RobotSpec } from '../schema/types';
import { JOINT_KIND_LIST, JOINT_KINDS } from './kinds';

const fits = (kind: JointKind, index: number) => kind !== 'planar' || index === 0;

/** Why the spec's joints cannot stand as they are, or null. */
export function misplacedJoint(spec: RobotSpec): string | null {
  const k = spec.links.findIndex((l, i) => !fits(l.joint, i));
  return k < 0 ? null : `${spec.links[k].name}: a planar joint is a base stage, so it can only be the first joint. Change its kind, or remove it and add a planar base.`;
}

/**
 * What one link may be. Nothing procedural stands in properly for a twin's real joint, so that keeps its kind;
 * a twin saved with another kind can still go back. The kind it has now always stays listed.
 */
export function kindChoices(current: JointKind, index: number, twin: boolean): JointKind[] {
  if (twin) return current === 'revolute' || current === 'prismatic' ? [current] : [current, 'revolute'];
  return JOINT_KIND_LIST.map((k) => k.kind).filter((k) => k === current || fits(k, index));
}

/** What "Add joint" offers: a planar base goes in front, once; past a twin's flange only what is drawn to its scale. */
export function addableKinds(spec: RobotSpec, twin: boolean): JointKind[] {
  if (twin) return ['revolute'];
  return JOINT_KIND_LIST.map((k) => k.kind).filter((k) => k !== 'planar' || spec.links[0].joint !== 'planar');
}

export const addLabel = (kind: JointKind) => (kind === 'planar' ? 'Planar base' : JOINT_KINDS[kind].label);
