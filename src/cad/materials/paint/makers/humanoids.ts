/** Other humanoids and bipeds. No maker here publishes paint codes: colours are read from its own images. */
import type { Coat, PaintScheme } from '../table';

const BLACK: Coat = { color: '#4a4a49', finish: 'anodized' };
const WHITE: Coat = { color: '#ededed', finish: 'plastic' };
const ALLOY: Coat = { color: '#c4c6c8', finish: 'aluminium' };
const GRAPHITE: Coat = { color: '#5f6164', finish: 'anodized' };
const GUNMETAL: Coat = { color: '#6a6c70', finish: 'anodized' };

export const HUMANOIDS: Record<string, PaintScheme> = {
  'armor-agibot-x2': {
    body: WHITE,
    parts: [{ name: /head|lidar/, coat: BLACK }, { name: /^(pelvis|waist_|imu_in_pelvis)/, coat: BLACK }, { name: /_hip_/, coat: BLACK }, { name: /wrist/, coat: BLACK }, { name: /ankle_roll/, coat: BLACK }],
  },
  'armor-booster-k1': { body: GRAPHITE, parts: [{ name: /^trunk$/, coat: WHITE }, { name: /ankle_roll/, coat: BLACK }] },
  'armor-booster-t1': { body: GRAPHITE, parts: [{ name: /^(trunk|waist_yaw_link)$/, coat: WHITE }, { name: /ankle_roll/, coat: BLACK }] },
  'armor-fourier-gr1': { body: GUNMETAL, parts: [{ name: /^head_/, coat: BLACK }] },
  'armor-hightorque-hi': { body: ALLOY, parts: [{ name: /^waist_yaw_link$/, coat: BLACK }] },
  'armor-hightorque-pi': { body: BLACK },
  'armor-hightorque-pi-plus': { body: BLACK },
  'armor-berkeley-humanoid': { body: ALLOY, parts: [{ name: /_faa$/, coat: BLACK }] },
  'armor-berkeley-humanoid-lite': { body: WHITE, parts: [{ name: /^base$/, coat: BLACK }, { name: /hand_link/, coat: BLACK }] },
  'armor-reachy2': {
    body: WHITE,
    parts: [{ at: 'base', coat: ALLOY }, { name: /antenna/, coat: BLACK }, { name: /_hand_/, coat: BLACK }, { name: /_elbow_first_link$/, coat: ALLOY }],
  },
  'armor-poppy-humanoid': { body: WHITE, parts: [{ name: /motor/, coat: BLACK }] },
  'armor-roboto-origin': { body: WHITE, parts: [{ name: /_(thigh_yaw|thigh_roll|ankle_pitch)_link$/, coat: BLACK }] },
  apptronik_apollo: { body: { color: '#e7e3da', finish: 'plastic' } },
  'armor-beni': { body: WHITE, parts: [{ name: /^[LR]W_Link$/, coat: { color: '#9a9c9e', finish: 'rubber' } }] },
};
