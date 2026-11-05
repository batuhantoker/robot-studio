/** Unitree Robotics. */
import type { Coat, PaintScheme } from '../table';

const SATIN: Coat = { color: '#b6b8ba', finish: 'aluminium' };
const BLACK: Coat = { color: '#4a4a49', finish: 'anodized' };

const GO2: PaintScheme = {
  body: { color: '#bec2cc', finish: 'paint' },
  parts: [{ name: /_(thigh|calf)$/, coat: { color: '#dcdee2', finish: 'paint' } }, { name: /_foot$/, coat: BLACK }],
};

export const UNITREE: Record<string, PaintScheme> = {
  'armor-unitree-g1': {
    body: { color: '#d8dadb', finish: 'plastic' },
    parts: [
      { name: /^(head_link|logo_link|pelvis|pelvis_contour_link)$/, coat: BLACK },
      { name: /hand|ankle/, coat: BLACK },
      { name: /elbow|shoulder_yaw|knee/, coat: { color: '#a9abae', finish: 'paint' } },
    ],
  },
  'armor-unitree-h1': { body: BLACK },
  'armor-unitree-h1-2': { body: BLACK, parts: [{ name: /^torso_link$/, coat: { color: '#dcdddd', finish: 'plastic' } }] },
  'armor-unitree-h2': {
    body: { color: '#e4e1da', finish: 'paint' },
    parts: [{ name: /^(pelvis|waist_)/, coat: BLACK }, { name: /ankle/, coat: BLACK }],
  },
  'armor-unitree-r1d': {
    body: { color: '#c6c8ca', finish: 'paint' },
    parts: [{ name: /dex1/, coat: BLACK }, { name: /[Ww]heel/, coat: { color: '#4a4a49', finish: 'rubber' } }],
  },
  'armor-unitree-b2': { body: { color: '#c8cacc', finish: 'paint' } },
  'armor-unitree-go1': {
    body: { color: '#8f8d8a', finish: 'paint' },
    parts: [{ name: /_(thigh|calf)$/, coat: { color: '#ededed', finish: 'plastic' } }],
  },
  'armor-unitree-go2': GO2,
  'armor-unitree-go2w': GO2,
  'armor-unitree-z1': { body: SATIN },
  unitree_z1: { body: SATIN, parts: [{ name: /Gripper/, coat: BLACK }] },
};
