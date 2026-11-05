/** Other collaborative and research arms. No maker here publishes paint codes: colours are read from its own images. */
import type { Coat, PaintRule, PaintScheme } from '../table';

const BLACK: Coat = { color: '#4a4a49', finish: 'anodized' };
const WHITE: Coat = { color: '#ededed', finish: 'plastic' };
const STEEL: Coat = { color: '#b9bcbd', finish: 'steel' };
const ALLOY: Coat = { color: '#c4c6c8', finish: 'aluminium' };
const TM_CAP: Coat = { color: '#c3c7cc', finish: 'paint' };

// Source Robotics prints the shells in any colour; white is the unit in each maker image.
const SOURCE_ROBOTICS: PaintScheme = { body: WHITE, parts: [{ name: /_actuator_visual$/, coat: BLACK }] };

const ring = (name: RegExp, min: [number, number, number], max: [number, number, number]): PaintRule => ({ name, within: { surfaces: [min, max] }, coat: BLACK });

export const COBOTS: Record<string, PaintScheme> = {
  'armor-agilex-piper': {
    body: { color: '#7d7d7d', finish: 'anodized' },
    parts: [{ at: 'base', coat: BLACK }, { name: /^(link1|link[4-8]|gripper_base)$/, coat: BLACK }],
  },
  // Dobot's own images disagree on which links are white, so only the palette is firm.
  'armor-dobot-cr5': {
    body: WHITE,
    parts: [{ at: 'base', coat: { color: '#c8cacc', finish: 'plastic' } }, { name: /^Link6$/, coat: STEEL }],
  },
  // White is the "Basic model" on Doosan's page; navy is an option.
  'armor-doosan-m1013': {
    body: WHITE,
    // Paint, not metal: a metal finish mirrors the dark floor and the bright tube reads black.
    parts: [{ name: /^mf1013_2_1$/, coat: { color: '#cdcfd1', finish: 'paint' } }, { name: /^mf1013_6_0$/, coat: STEEL }],
  },
  'armor-franka': {
    body: WHITE,
    parts: [{ name: /^fr3_link7$/, coat: ALLOY }, { name: /finger$/, coat: BLACK }],
  },
  'armor-kinova-gen3': {
    body: WHITE,
    parts: [{ name: /^bracelet_link$/, within: { surfaces: [[-0.037, -0.037, -0.066], [0.037, 0.037, -0.055]] }, coat: { color: '#c8cacc', finish: 'plastic' } }],
  },
  'armor-openarm': {
    body: BLACK,
    parts: [
      { name: /^finger_(inner|outer)$/, coat: ALLOY },
      { name: /^openarm_body_link0$/, within: { surfaces: [[-0.16, -0.1, -0.003], [0.1, 0.1, 0.012]] }, coat: STEEL },
    ],
  },
  'armor-par6': SOURCE_ROBOTICS,
  'armor-parol6': SOURCE_ROBOTICS,
  'armor-techman-tm5-900': {
    body: { color: '#929394', finish: 'paint' },
    parts: [
      { at: 'base', coat: { color: '#a8acb0', finish: 'paint' } },
      { name: /^link_6$/, coat: ALLOY },
      { name: /^link_1$/, within: { surfaces: [[-0.062, -0.07, -0.062], [0.062, -0.064, 0.062]] }, coat: TM_CAP },
      { name: /^link_2$/, within: { surfaces: [[0.368, -0.06, -0.068], [0.49, 0.06, -0.061]] }, coat: TM_CAP },
      { name: /^link_3$/, within: { surfaces: [[-0.062, -0.062, -0.07], [0.062, 0.062, -0.064]] }, coat: TM_CAP },
      ring(/^link_1$/, [-0.06, -0.06, -0.083], [0.06, 0.06, -0.069]),
      ring(/^link_2$/, [-0.06, -0.06, -0.077], [0.06, 0.06, -0.065]),
      ring(/^link_2$/, [0.368, -0.06, -0.077], [0.49, 0.06, -0.065]),
      ring(/^link_3$/, [0.366, -0.045, -0.077], [0.456, 0.045, -0.069]),
      ring(/^link_[45]$/, [-0.045, -0.06, -0.045], [0.045, -0.053, 0.045]),
    ],
  },
  trossen_vx300s: { body: BLACK },
  aloha: { body: BLACK },
};
