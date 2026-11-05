/** The best gains found for a robot, kept between visits; joint names guard against a model that has since changed. */
import type { Pid } from '../../../core/control/gains';

const KEY = 'robot-studio.gains.v1';

export interface SavedGains {
  names: string[];
  gains: Pid[];
  compensate: boolean;
  score: number;
  who: 'you' | 'ai';
}

function read(): Record<string, SavedGains> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, SavedGains>;
  } catch {
    return {};
  }
}

export function loadGains(slot: string, names: string[]): SavedGains | null {
  const saved = read()[slot];
  return saved && saved.names.join() === names.join() ? saved : null;
}

export function saveGains(slot: string, entry: SavedGains): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...read(), [slot]: entry }));
  } catch {
    // Private browsing or a full quota: the lab still works, it just won't remember.
  }
}
