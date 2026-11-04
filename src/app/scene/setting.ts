/** The settings are furnished around one arm-sized robot; when that doesn't hold, the stage stays an open floor. */
import type { Surroundings } from '../../scene/stage/surroundings';
import type { StudioState } from '../state/types';

/** Why the setting is held to the open floor, or null when any setting can be chosen. */
export function openOnly(s: StudioState): string | null {
  if (s.scene.length > 1) return 'Several robots share the stage, so it stays an open floor.';
  // A 20 cm hand among benches and racking built for arms reads as a giant in a doll's house.
  if (s.library.find((e) => e.id === s.activeId)?.category === 'hand') return 'Settings are furnished for arms; a hand shows on the open floor.';
  return null;
}

/** What the stage shows: the saved choice, unless it is held open. The saved choice stays for the next robot. */
export const shownSurroundings = (s: StudioState): Surroundings =>
  openOnly(s) ? { ...s.surroundings, environment: 'open' } : s.surroundings;
