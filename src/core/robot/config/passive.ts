/** A chain of nothing but pins has no motors: it can only swing, so nothing that commands joints applies to it. */
import type { RobotSpec } from '../schema/types';

/** Modes that work by commanding joints. */
export const DRIVEN_MODES: readonly string[] = ['task', 'trajectory'];

export const isPassive = (spec: RobotSpec | null | undefined): boolean => !!spec && spec.links.every((l) => spec.design?.joints?.[l.name]?.pin);
