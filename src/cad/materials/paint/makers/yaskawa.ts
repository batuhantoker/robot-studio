/** Yaskawa Motoman. */
import type { PaintScheme } from '../table';

export const YASKAWA: Record<string, PaintScheme> = {
  // Estimate: the sheets disagree; this is the finish on the "MH5 / MH5L" sheet, the one for this exact model.
  'armor-motoman-mh5': { body: { color: '#c8c0bf', finish: 'paint' } },
};
