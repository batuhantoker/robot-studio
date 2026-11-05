/** What Physics does with a double pendulum: swing it up and hold it, let it go, or leave it to the control lab. */
import { SwingController } from '../../../core/control/pendulum/controller';
import { type Rig, type Torque, type X, fromUpright } from '../../../core/control/pendulum/model';
import type { PendulumMotors, PendulumStatus, PendulumTask } from '../../state/types';

const JOINTS: Record<PendulumMotors, number[]> = { both: [0, 1], shoulder: [0], elbow: [1] };
/** One motor on the elbow has far less authority up there: a knock it can take is a much smaller one (rad/s). */
const KNOCK: Record<PendulumMotors, number> = { both: 0.6, shoulder: 0.6, elbow: 0.15 };

export class PendulumRun {
  task: PendulumTask = 'swing';
  motors: PendulumMotors = 'both';
  private readonly controllers = new Map<PendulumMotors, SwingController>();

  constructor(private readonly rig: Rig) {}

  private get controller(): SwingController {
    let c = this.controllers.get(this.motors);
    if (!c) this.controllers.set(this.motors, (c = new SwingController(this.rig, JOINTS[this.motors])));
    return c;
  }

  get status(): PendulumStatus {
    return { task: this.task, motors: this.motors, phase: this.task === 'swing' ? this.controller.phase : null };
  }

  get thinking(): boolean {
    return this.task === 'swing' && this.controller.phase === 'planning';
  }

  get knock(): number[] {
    const k = KNOCK[this.task === 'swing' ? this.motors : 'both'];
    return [k, -k];
  }

  /** Where a run starts: hanging for a swing-up, the pose you set when let go. */
  start(pose: number[]): number[] {
    if (this.task !== 'swing') return pose;
    this.controller.restart();
    return [0, 0];
  }

  think(deadline: number): void {
    if (this.thinking) this.controller.think(deadline);
  }

  torque(q: number[], qd: number[], dt: number): Torque {
    return this.task === 'swing' ? this.controller.torque([q[0], q[1], qd[0], qd[1]], dt) : [0, 0];
  }

  /** Off upright while swinging; nothing is being aimed at when let go. */
  error(q: number[]): number[] {
    if (this.task !== 'swing') return [0, 0];
    const e = fromUpright([q[0], q[1], 0, 0] as X);
    return [e[0], e[1]];
  }
}
