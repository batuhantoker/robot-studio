/** KUKA. */
import type { Coat, PaintScheme } from '../table';

const BLACK: Coat = { color: '#4a4a49', finish: 'anodized' };
const ORANGE: Coat = { color: '#f88540', finish: 'paint' };

export const KUKA: Record<string, PaintScheme> = {
  // Estimate: read off a 2010 range catalogue thumbnail; KUKA's general orange-on-black scheme.
  'armor-kuka-kr16': {
    body: ORANGE,
    parts: [
      { at: 'base', coat: BLACK },
      { name: /^base_link$/, within: { surfaces: [[-0.4, -0.3, -0.01], [0.3, 0.3, 0.048]] }, coat: ORANGE },
      // The three motors behind the elbow.
      { name: /^link_3$/, within: { surfaces: [[-0.36, -0.05, -0.17], [-0.128, 0.05, 0.1]] }, coat: BLACK },
      // J1 and J2: the same housing, and dark beside the column in the thumbnail.
      { name: /^link_1$/, within: { surfaces: [[-0.085, -0.085, -0.275], [0.085, 0.085, -0.028]] }, coat: BLACK },
      { name: /^link_1$/, within: { surfaces: [[0.178, 0.01, -0.082], [0.343, 0.255, 0.082]] }, coat: BLACK },
    ],
  },
  // White is the standard colour per KUKA's press page; the pedestal is the bare cast metal of its data sheet.
  'armor-kuka-kr3': {
    // Upstream's mesh is coarse: at the default angle its facets smooth into dents.
    crease: Math.PI / 12,
    body: { color: '#f3efec', finish: 'paint' },
    parts: [
      { at: 'base', coat: { color: '#8f8d8b', finish: 'aluminium' } },
      { at: 'tip', coat: BLACK },
    ],
  },
};
