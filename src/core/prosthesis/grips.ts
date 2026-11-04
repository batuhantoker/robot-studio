/** Grips as Motion presets: from the open hand into the grip, a hold, and back, looping. */
import type { MotionClip, MotionPreset } from '../motion/types';
import { type Grip, gripMotors, jointsFor, type MotorMap } from './motors';

const ease = (x: number) => x * x * (3 - 2 * x);

/** The open hand every grip starts from: the hand's own "open" grip, else its home. */
export function openMotors(map: MotorMap): number[] {
  const home = map.motors.map((m) => m.home);
  const open = map.grips.find((g) => g.name === 'open');
  return open ? gripMotors(map, open, home) : home;
}

/** Starts from the open hand rather than the current pose, so every run takes the same contact-free path. */
export function gripClip(map: MotorMap, grip: Grip, q0: number[], size = 1, period = 3.6): MotionClip {
  const a = openMotors(map);
  const full = gripMotors(map, grip, a);
  const b = a.map((v, i) => v + (full[i] - v) * Math.min(size, 1));
  return {
    period,
    at(t) {
      const p = (((t % period) + period) % period) / period;
      const w = p < 0.35 ? ease(p / 0.35) : p < 0.7 ? 1 : 1 - ease((p - 0.7) / 0.3);
      return jointsFor(map, a.map((v, i) => v + (b[i] - v) * w), q0);
    },
  };
}

export const gripPresets = (map: MotorMap): MotionPreset[] =>
  map.grips.filter((g) => g.name !== 'open').map((g) => ({
    id: `grip-${g.name}`,
    label: g.label,
    hint: `Opens, closes into ${g.label.toLowerCase()}, holds, and lets go`,
    build: (_robot, q0, size) => gripClip(map, g, q0, size),
  }));
