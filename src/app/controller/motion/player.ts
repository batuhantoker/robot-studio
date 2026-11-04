/** Holds the playing motion clip: presets for the loaded robot, rebuilt from the pose you are in. */
import { presetsFor } from '../../../core/motion/presets';
import { gripPresets } from '../../../core/prosthesis/grips';
import type { MotionClip, MotionPreset } from '../../../core/motion/types';
import type { RobotSession } from '../../robots/session';

export class MotionPlayer {
  presets: MotionPreset[] = [];
  clip: MotionClip | null = null;
  private built = '';

  load(s: RobotSession, q: number[]): void {
    // A prosthesis with named grips shows those instead of the generic motions.
    this.presets = s.prosthesis?.grips.length ? gripPresets(s.prosthesis) : presetsFor(s, q, s.category);
    this.clip = null;
    this.built = '';
  }

  /** Build once per (preset, size, starting pose); a new pose or size makes a new clip. */
  ensure(s: RobotSession, preset: string | null, size: number, q: number[]): MotionClip | null {
    const p = this.presets.find((x) => x.id === preset);
    if (!p) return (this.clip = null);
    const key = `${s.id}|${p.id}|${size.toFixed(2)}|${q.map((v) => v.toFixed(3)).join(',')}`;
    if (key !== this.built) {
      this.clip = p.build(s, q, size);
      this.built = key;
    }
    return this.clip;
  }
}
