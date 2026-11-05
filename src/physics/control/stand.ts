/** The floor's test: hold the home pose, take a shove, stay up. A fall ends the run, which also saves most of its compute. */
import type { MjData } from '@mujoco/mujoco';
import { ROOT_BODY } from '../model/floor-copy';
import { state } from '../runtime/arrays';

export const STAND_SECONDS = 4;
const SHOVE_AT = 1.5;
const SHOVE_FOR = 0.12;
/** Share of the robot's weight, about 0.4 m/s of sudden sideways speed. */
const SHOVE_WEIGHT = 0.35;
/** Centre of mass below this share of its start, or tipped past this (rad): it has fallen. */
const FELL_HEIGHT = 0.35;
const FELL_TILT = Math.PI / 4;
/** The scored test's shove, degrees from forward. */
export const SHOVE_ANGLE = 53;

export interface Upright {
  height: number;
  tilt: number;
}

export class StandTest {
  constructor(
    /** qpos address of the free joint: position, then quaternion. */
    readonly rootAdr: number,
    /** dof address of the free joint: linear, then angular. */
    readonly rootDof: number,
    /** Centre of mass above the floor at the start (m). */
    private readonly comHeight: number,
    private readonly mass: number,
    private readonly dt: number,
  ) {}

  /** Steps a shove lasts. */
  get shoveSteps(): number {
    return Math.round(SHOVE_FOR / this.dt);
  }

  upright(data: MjData): Upright {
    const q = state(data).qpos, a = this.rootAdr;
    const up = 1 - 2 * (q[a + 4] ** 2 + q[a + 5] ** 2);
    return { height: (q[a + 2] + this.comHeight) / this.comHeight, tilt: Math.acos(Math.min(Math.max(up, -1), 1)) };
  }

  /** Before each step: push if it's time, or `extra` asks; false once the robot is down. */
  watch(data: MjData, step: number, extra = false, angle: number | null = SHOVE_ANGLE): boolean {
    const t = step * this.dt;
    const due = angle !== null && t >= SHOVE_AT && t < SHOVE_AT + SHOVE_FOR;
    const f = extra || due ? SHOVE_WEIGHT * this.mass * 9.81 : 0;
    const wrench = state(data).xfrc_applied;
    const heading = ((angle ?? SHOVE_ANGLE) * Math.PI) / 180;
    wrench[6 * ROOT_BODY] = f * Math.cos(heading);
    wrench[6 * ROOT_BODY + 1] = f * Math.sin(heading);
    const { height, tilt } = this.upright(data);
    return height > FELL_HEIGHT && tilt < FELL_TILT;
  }
}
