/** Motion and trajectory playback halt on the last pose before contact, like a controller's protective stop. */
import { contactText } from '../../core/collision/hull';
import type { RobotSession } from '../robots/session';
import type { Mode } from '../state/types';

export interface Stop {
  q: number[];
  time: number;
  contact: string;
}

export function playbackGuard() {
  let last: { s: RobotSession; mode: Mode; q: number[]; time: number; free: boolean } | null = null;
  return (s: RobotSession, mode: Mode, q: number[], time: number, playing: boolean): Stop | null => {
    if ((mode !== 'trajectory' && mode !== 'motion' && mode !== 'task') || !s.collision) {
      last = null;
      return null;
    }
    const hit = s.collision.hit(q);
    const prev = last?.s === s && last.mode === mode ? last : null;
    // Tracked while paused too, so resuming from a stop cannot step through the contact.
    if (playing && hit && prev?.free) return { q: prev.q, time: prev.time, contact: contactText(hit) };
    last = { s, mode, q, time, free: !hit };
    return null;
  };
}
