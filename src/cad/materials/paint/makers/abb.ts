/** ABB. */
import type { Coat, PaintScheme } from '../table';

const GOFA_WHITE: Coat = { color: '#f2f3f3', finish: 'plastic' };
const GOFA_GREY: Coat = { color: '#929a9f', finish: 'plastic' };
const YUMI_WHITE: Coat = { color: '#e9e9e9', finish: 'plastic' };
const YUMI_DARK: Coat = { color: '#8a8a8a', finish: 'rubber' };

export const ABB: Record<string, PaintScheme> = {
  'armor-abb-crb15000': {
    body: GOFA_WHITE,
    parts: [
      { at: 'base', coat: GOFA_GREY },
      { name: /^link_[123]$/, coat: GOFA_GREY },
      { name: /^link_6$/, coat: { color: '#b9bcbd', finish: 'steel' } },
    ],
  },
  // RAL 7035 per 3HAC044265-001, as RAL itself lists it; Graphite White is the standard casting.
  'armor-abb-irb6700': { body: { color: '#c2c6c3', finish: 'paint' } },
  'armor-abb-yumi': {
    body: YUMI_WHITE,
    parts: [{ name: /^yumi_link_[246]_[lr]$/, coat: YUMI_DARK }],
  },
};
