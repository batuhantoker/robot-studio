/** Epson Robots. It publishes no paint codes: every colour here is read from its product renders. */
import type { Coat, PaintScheme } from '../table';

const STEEL: Coat = { color: '#a7abae', finish: 'steel' };
const BLACK: Coat = { color: '#3a3b3e', finish: 'anodized' };

export const EPSON: Record<string, PaintScheme> = {
  'armor-epson-gx8-c452s': {
    body: { color: '#c9c9c9', finish: 'paint' },
    parts: [
      { at: 'base', coat: { color: '#b2b2b2', finish: 'paint' } },
      { name: /^j4_link$/, coat: STEEL },
      { at: 'base', within: { surfaces: [[-0.085, -0.085, 0.285], [0.085, 0.085, 0.32]] }, coat: BLACK },
      { name: /^j2_link$/, within: { surfaces: [[0.09, -0.05, -0.04], [0.29, 0.05, 0.0095]] }, coat: { color: '#363692', finish: 'paint' } },
      { name: /^j2_link$/, within: { surfaces: [[0.04, -0.06, 0.185], [0.18, 0.06, 0.25]] }, coat: { color: '#6d7074', finish: 'anodized' } },
      // The lamp is fused to the shell, so a straight cut at its base.
      { name: /^j2_link$/, within: { box: [[-0.03, -0.02, 0.2505], [0.01, 0.02, 0.27]] }, coat: { color: '#df5823', finish: 'plastic' } },
    ],
  },
  'armor-epson-rs4-c351s': {
    body: { color: '#e4e5e7', finish: 'paint' },
    parts: [
      // The ceiling stand is the model's own addition, not Epson's: it keeps its dark grey.
      { name: /^emsc$/, coat: { color: '#474d54', finish: 'paint' } },
      { at: 'base', coat: { color: '#d2d2d4', finish: 'paint' } },
      { name: /^j1_link$/, coat: { color: '#6d6e72', finish: 'paint' } },
      { name: /^j4_link$/, coat: STEEL },
      { at: 'base', within: { surfaces: [[-0.09, -0.15, -0.02], [0.09, 0.062, 0.002]] }, coat: { color: '#5d5d5d', finish: 'anodized' } },
      { at: 'base', within: { surfaces: [[-0.06, -0.06, -0.05], [0.06, 0.06, -0.015]] }, coat: BLACK },
      { at: 'base', within: { surfaces: [[-0.06, -0.06, -0.09], [0.06, 0.06, -0.043]] }, coat: STEEL },
      { name: /^j1_link$/, within: { surfaces: [[0.06, -0.06, -0.042], [0.235, 0.06, 0.025]] }, coat: { color: '#c5c5c7', finish: 'paint' } },
      { name: /^j1_link$/, within: { box: [[-0.09, -0.07, -0.11], [-0.06, 0.07, -0.03]] }, coat: { color: '#c5c5c7', finish: 'paint' } },
      { name: /^j1_link$/, within: { box: [[0.235, -0.07, -0.11], [0.26, 0.07, -0.03]] }, coat: { color: '#c5c5c7', finish: 'paint' } },
      { name: /^j2_link$/, within: { surfaces: [[-0.05, -0.05, -0.02], [0.05, 0.05, 0.005]] }, coat: BLACK },
      { name: /^j2_link$/, within: { surfaces: [[-0.05, -0.05, -0.052], [0.05, 0.05, -0.02]] }, coat: STEEL },
      { name: /^j2_link$/, within: { surfaces: [[-0.23, -0.06, -0.32], [-0.05, 0.06, -0.2545]] }, coat: { color: '#022885', finish: 'paint' } },
      { name: /^j2_link$/, within: { surfaces: [[-0.05, -0.05, -0.26], [0.05, 0.05, -0.25]] }, coat: STEEL },
    ],
  },
};
