/** A chain of nothing but plain pins is a pendulum: its motions are swings, and it has nothing to hold a part with. */
import type { RobotSpec } from '../schema/types';

/** Modes that need a tool on the end. */
export const TOOL_MODES: readonly string[] = ['task'];

export const isPendulum = (spec: RobotSpec | null | undefined): boolean => !!spec && spec.links.every((l) => spec.design?.joints?.[l.name]?.pin);
