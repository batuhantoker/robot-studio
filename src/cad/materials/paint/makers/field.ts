/** Mobile bases, aircraft and hands. Colours are read from each maker's own images unless marked. */
import type { Coat, PaintScheme } from '../table';

const BLACK: Coat = { color: '#4a4a49', finish: 'anodized' };
const WHITE: Coat = { color: '#ededed', finish: 'plastic' };
const ALLOY: Coat = { color: '#c4c6c8', finish: 'aluminium' };
const TYRE: Coat = { color: '#4a4a49', finish: 'rubber' };

const SOFTHAND: PaintScheme = { body: { color: '#02a7ec', finish: 'plastic' } };
const QB: PaintScheme = {
  body: { color: '#6c6e70', finish: 'rubber' },
  parts: [{ name: /base_link$/, coat: ALLOY }, { name: /palm_link$/, coat: { color: '#52b9f1', finish: 'plastic' } }],
};

export const FIELD: Record<string, PaintScheme> = {
  // Estimate: a build photo, the airframe is bare foam.
  'armor-techpod': { body: WHITE, parts: [{ name: /propeller/, coat: BLACK }] },
  // Estimate: one photo, frame and motors only.
  'armor-hummingbird': { body: BLACK },
  // Bare electronics: a black board, with pale propellers.
  'armor-crazyflie': { body: BLACK, parts: [{ name: /_prop$/, coat: { color: '#d9dcdf', finish: 'plastic' } }] },
  'armor-husky': {
    body: { color: '#fec010', finish: 'paint' },
    parts: [{ name: /wheel/, coat: TYRE }, { name: /^(top_plate_link|user_rail_link|(front|rear)_bumper_link)$/, coat: BLACK }],
  },
  google_robot: { body: WHITE, parts: [{ name: /finger/, coat: { color: '#d9c8a8', finish: 'plastic' } }] },
  'armor-hello-robot-stretch-3': {
    body: { color: '#868686', finish: 'paint' },
    parts: [
      { name: /wheel|caster/, coat: { color: '#9a9c9e', finish: 'rubber' } },
      { name: /^link_mast$/, coat: { color: '#5e5e5e', finish: 'anodized' } },
      { name: /^link_(arm|lift|head|wrist|gripper|straight_gripper|DW3)/, coat: BLACK },
    ],
  },
  'armor-irobot-create3': { body: { color: '#4f5053', finish: 'plastic' } },
  'armor-tadeo-ecar': { body: { color: '#4a4a49', finish: 'paint' }, parts: [{ name: /wheel/, coat: TYRE }] },
  'armor-ingenuity': {
    body: { color: '#cfd1d3', finish: 'paint' },
    parts: [
      { name: /Blades|Leg/, coat: BLACK },
      // The solar panel, clear of the mast at the top of the fused body.
      { name: /MainBody/, within: { surfaces: [[-0.09, -0.22, -0.3], [0.09, 0.22, -0.205]] }, coat: { color: '#39404f', finish: 'anodized' } },
    ],
  },
  'armor-perseverance': {
    body: WHITE,
    parts: [{ name: /Rocker|Bogie/, coat: BLACK }, { name: /Wheel/, coat: { color: '#b4b6b8', finish: 'paint' } }],
  },
  'armor-turtlebot3-burger': { body: BLACK, parts: [{ name: /wheel/, coat: TYRE }] },
  'armor-yuhesen-fr-mini': { body: WHITE, parts: [{ name: /wheel/, coat: TYRE }] },
  // Estimate: base shell only.
  'armor-kobuki': { body: BLACK, parts: [{ name: /wheel/, coat: TYRE }] },
  leap_hand_right: { body: BLACK, parts: [{ name: /^(thumb_)?tip$/, coat: WHITE }] },
  allegro_hand_right: { body: BLACK, parts: [{ name: /_tip$/, coat: WHITE }] },
  // Estimate: a render sample; the printed parts are the maker's reference build.
  pisa_iit_softhand_right: SOFTHAND,
  pisa_iit_softhand_left: SOFTHAND,
  psyonic_ability_hand_right: { body: BLACK },
  psyonic_ability_hand_left: { body: BLACK },
  // Fingers were only photographed gloved, so they keep a neutral grey.
  qb_softhand2_right: QB,
  qb_softhand2_left: QB,
};
