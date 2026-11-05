/** Other legged robots. No maker here publishes paint codes: colours are read from its own images. */
import type { Coat, PaintScheme } from '../table';

const BLACK: Coat = { color: '#4a4a49', finish: 'anodized' };
const WHITE: Coat = { color: '#ededed', finish: 'plastic' };
const CHARCOAL: Coat = { color: '#56585a', finish: 'anodized' };
const TYRE: Coat = { color: '#4a4a49', finish: 'rubber' };
const PANEL: Coat = { color: '#c6c8ca', finish: 'paint' };
const GUNMETAL: Coat = { color: '#5f6164', finish: 'anodized' };

// M20 and S10 share a chassis: white deck, charcoal and white legs, knobbed tyres.
const WHEELED: PaintScheme = {
  body: CHARCOAL,
  parts: [{ at: 'base', coat: WHITE }, { name: /_hipy$/, coat: WHITE }, { name: /_wheel$/, coat: TYRE }],
};

export const QUADRUPEDS: Record<string, PaintScheme> = {
  // Estimate: a press photo, ANYbotics' pages refuse plain requests.
  'armor-anymal': {
    body: BLACK,
    parts: [{ name: /^(top_shell|bottom_shell|face_shell_front|face_shell_rear)$/, coat: { color: '#f03a3a', finish: 'paint' } }],
  },
  'armor-deeprobotics-dr02': { body: CHARCOAL, parts: [{ name: /^body$/, coat: WHITE }, { name: /_shoulder_z_link$/, coat: WHITE }] },
  'armor-deeprobotics-lite3': {
    body: { color: '#e9e3d5', finish: 'paint' },
    parts: [{ name: /_(HIP|SHANK)$/, coat: { color: '#6d7a86', finish: 'paint' } }],
  },
  'armor-deeprobotics-m20': WHEELED,
  'armor-deeprobotics-s10': WHEELED,
  'armor-deeprobotics-x30': {
    body: { color: '#a9abae', finish: 'paint' },
    parts: [{ name: /^TORSO$/, coat: { color: '#dfe1e2', finish: 'plastic' } }, { name: /_HIP$/, coat: CHARCOAL }],
  },
  'armor-ggldnl-hexapod': {
    body: BLACK,
    parts: [{ name: /^(top|bottom)_stiffeners$/, coat: { color: '#e8792b', finish: 'paint' } }],
  },
  // Estimate: the maker's own build photo.
  'armor-indystrycc-spdrbot': { body: { color: '#b5ab99', finish: 'paint' }, parts: [{ at: 'base', coat: { color: '#c4c6c8', finish: 'aluminium' } }] },
  'armor-xgo-lite3': { body: GUNMETAL, parts: [{ name: /^body$/, coat: PANEL }] },
  'armor-xgo-mini2': { body: GUNMETAL, parts: [{ name: /^body_fixed$/, coat: PANEL }] },
  'armor-bittle': {
    body: { color: '#fdd807', finish: 'plastic' },
    parts: [{ name: /^(base_link|shank_|tube|servo|screw)/, coat: BLACK }],
  },
  'armor-interbotix-hexapod': { body: BLACK },
};
