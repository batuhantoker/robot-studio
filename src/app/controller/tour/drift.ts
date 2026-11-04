/** Left alone, the camera circles the robot slowly and nothing else changes; the user's return swings it home. */
import type { Store } from '../../state/store';
import type { StudioState } from '../../state/types';

const IDLE_SECONDS = 25;
const RATE = 0.05;
const EASE_IN = 4;

export class IdleDrift {
  private quiet = 0;
  /** Radians the camera has drifted from where the user left it. */
  private turned = 0;
  private back: { from: number; t: number; seconds: number } | null = null;

  constructor(
    private readonly store: Store<StudioState>,
    private readonly orbit: (radians: number) => void,
  ) {
    const glance = () => this.wake(false);
    const touch = () => this.wake(true);
    addEventListener('pointermove', glance, { capture: true, passive: true });
    for (const type of ['pointerdown', 'wheel', 'keydown']) addEventListener(type, touch, { capture: true, passive: true });
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && glance());
    // A newly loaded robot frames its own camera; the old view is gone.
    store.on(['sessionVersion'], () => ((this.turned = 0), (this.back = null)));
  }

  tick(dt: number): void {
    // A tab coming back from the background hands over one very long frame.
    dt = Math.min(dt, 0.1);
    if (this.back) {
      const b = this.back;
      b.t += dt;
      const u = Math.min(b.t / b.seconds, 1);
      this.swing(b.from * (1 - u * u * (3 - 2 * u)));
      if (u === 1) this.back = null;
      return;
    }
    const s = this.store.state;
    // Piloting is attended even while the robot stands still; an open guide is being read.
    const attended = s.touring || s.rendering || s.selectedStop !== null || s.mode === 'pilot'
      || document.documentElement.classList.contains('modal-open');
    if (attended) {
      this.quiet = 0;
      return;
    }
    this.quiet += dt;
    const ramp = (this.quiet - IDLE_SECONDS) / EASE_IN;
    if (ramp > 0) this.swing(this.turned + RATE * Math.min(ramp, 1) * dt);
  }

  /** A pointer passing by eases the camera home; a click, wheel or key puts it there at once. */
  private wake(now: boolean): void {
    this.quiet = 0;
    if (this.turned && !this.back) {
      this.turned = Math.atan2(Math.sin(this.turned), Math.cos(this.turned));
      this.back = { from: this.turned, t: 0, seconds: 0.4 + 0.35 * Math.abs(this.turned) };
    }
    // OrbitControls must start its drag from the home view, not fight the swing.
    if (now && this.back) {
      this.swing(0);
      this.back = null;
    }
  }

  private swing(to: number): void {
    this.orbit(to - this.turned);
    this.turned = to;
  }
}
