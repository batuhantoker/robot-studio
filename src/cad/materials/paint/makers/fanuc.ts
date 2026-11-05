/** FANUC. It publishes no paint codes: colours are read from its own product images. */
import type { Coat, PaintScheme } from '../table';

const BLACK: Coat = { color: '#4a4a49', finish: 'anodized' };
const CONDUIT: Coat = { color: '#4a4a49', finish: 'rubber' };
const RED: Coat = { color: '#c53b35', finish: 'paint' };
const SLEEVE: Coat = { color: '#a2a29c', finish: 'rubber' };
const GREEN: Coat = { color: '#569526', finish: 'plastic' };
const YELLOW: Coat = { color: '#fdec00', finish: 'paint' };

export const FANUC: Record<string, PaintScheme> = {
  'armor-fanuc-m20id-12': {
    body: { color: '#fdec00', finish: 'paint' },
    parts: [
      { at: 'base', coat: BLACK },
      { name: /^J[56]_link$/, coat: BLACK },
      // The conduit and its clamps, which the meshes fuse to the arm.
      { name: /^J1_link$/, within: { through: [[-0.139, -0.104, -0.17]] }, coat: CONDUIT },
      { name: /^J2_link$/, within: { surfaces: [[-0.2, -0.3, -0.06], [0.02, -0.19, 0.88]] }, coat: CONDUIT },
      { name: /^J3_link$/, within: { through: [[0.27, -0.011, 0.091]] }, coat: CONDUIT },
      // Forearm-root collar, and the cover behind the J3 casing.
      { name: /^J3_link$/, within: { surfaces: [[0.24, -0.12, 0.09], [0.34, 0.12, 0.34]] }, coat: BLACK },
      { name: /^J3_link$/, within: { surfaces: [[0.13, 0.06, 0.02], [0.3, 0.22, 0.24]] }, coat: BLACK },
      // Servo motors: red end caps on black bodies, and the bolted black ring at J2.
      { name: /^J1_link$/, within: { surfaces: [[-0.14, 0.045, 0.08], [-0.03, 0.16, 0.12]] }, coat: RED },
      { name: /^J1_link$/, within: { surfaces: [[0.02, 0.18, -0.055], [0.13, 0.22, 0.055]] }, coat: RED },
      { name: /^J1_link$/, within: { surfaces: [[-0.21, 0.015, -0.21], [0.21, 0.22, 0.13]] }, coat: BLACK },
      { name: /^J1_link$/, within: { surfaces: [[-0.035, -0.11, -0.11], [0.185, -0.07, 0.11]] }, coat: BLACK },
      // Wrist fork, back to the seam where the yellow cover ends.
      { name: /^J4_link$/, within: { box: [[1.145, -1, -1], [2, 1, 1]] }, coat: BLACK },
    ],
  },
  'armor-fanuc-lrmate-200id': {
    body: YELLOW,
    parts: [
      { at: 'base', coat: { color: '#817f76', finish: 'paint' } },
      { at: 'tip', coat: BLACK },
      { name: /^J5_link$/, within: { surfaces: [[0.045, -0.05, -0.05], [0.09, 0.05, 0.05]] }, coat: BLACK },
    ],
  },
  // Read from FANUC's photos of this model. The hubs' black rings are bolt circles, which the mesh lacks.
  'armor-fanuc-r2000ic-165f': {
    body: YELLOW,
    parts: [
      { at: 'base', coat: { color: '#6a6a64', finish: 'paint' } },
      { at: 'tip', coat: BLACK },
      { name: /^base_link$/, within: { surfaces: [[-0.21, -0.21, 0.275], [0.21, 0.21, 0.34]] }, coat: BLACK },
      // Servo motors: red end caps on black bodies. J1's is out of shot, so it follows the others.
      { name: /^J1_link$/, within: { surfaces: [[-0.09, -0.24, -0.018], [0.09, -0.06, 0.03]] }, coat: RED },
      { name: /^J1_link$/, within: { surfaces: [[0.22, -0.335, -0.09], [0.402, -0.285, 0.09]] }, coat: RED },
      { name: /^J3_link$/, within: { surfaces: [[-0.09, -0.22, -0.09], [0.09, -0.172, 0.09]] }, coat: RED },
      { name: /^J3_link$/, within: { surfaces: [[-0.06, -0.14, 0.09], [-0.015, 0.14, 0.36]] }, coat: RED },
      { name: /^J1_link$/, within: { surfaces: [[-0.09, -0.24, -0.221], [0.09, -0.06, -0.0165]] }, coat: BLACK },
      { name: /^J1_link$/, within: { surfaces: [[0.22, -0.288, -0.09], [0.402, -0.08, 0.09]] }, coat: BLACK },
      { name: /^J3_link$/, within: { surfaces: [[-0.09, -0.175, -0.09], [0.09, 0.03, 0.09]] }, coat: BLACK },
      { name: /^J3_link$/, within: { surfaces: [[-0.0165, -0.136, 0.092], [0.1375, 0.133, 0.358]] }, coat: BLACK },
      // Balancer end cap, forearm-root collar and the wrist end.
      { name: /^J1_link$/, within: { surfaces: [[-0.52, 0.1, -0.14], [-0.48, 0.28, 0.04]] }, coat: BLACK },
      { name: /^J3_link$/, within: { surfaces: [[0.966, -0.112, 0.113], [1.024, 0.112, 0.337]] }, coat: BLACK },
      { name: /^J5_link$/, within: { surfaces: [[0.152, -0.1, -0.1], [0.21, 0.12, 0.1]] }, coat: BLACK },
      // The conduit, which the meshes fuse to the arm.
      { name: /^J1_link$/, within: { surfaces: [[0.155, 0.348, -0.226], [0.312, 0.419, 0.001]] }, coat: SLEEVE },
      { name: /^J2_link$/, within: { surfaces: [[-0.035, 0.326, 0.179], [0.099, 0.372, 0.413]] }, coat: SLEEVE },
      { name: /^J2_link$/, within: { surfaces: [[0.037, 0.326, 0.722], [0.097, 0.372, 0.922]] }, coat: SLEEVE },
      { name: /^J2_link$/, within: { surfaces: [[0.037, 0.354, 0.961], [0.121, 0.411, 1.076]] }, coat: SLEEVE },
      { name: /^J2_link$/, within: { surfaces: [[-0.057, 0.355, -0.001], [0.015, 0.412, 0.147]] }, coat: SLEEVE },
      { name: /^J3_link$/, within: { surfaces: [[0.064, 0.279, -0.001], [0.312, 0.418, 0.214]] }, coat: SLEEVE },
      { name: /^J3_link$/, within: { surfaces: [[0.234, -0.096, 0.007], [0.313, 0.231, 0.214]] }, coat: SLEEVE },
    ],
  },
  // Green from the base band of the maker's beauty shot.
  'armor-fanuc-crx10ia': {
    body: { color: '#ededed', finish: 'plastic' },
    parts: [
      { at: 'base', coat: BLACK },
      { at: 'tip', coat: BLACK },
      { name: /^J1_link$/, within: { surfaces: [[-0.08, -0.08, -0.16], [0.08, 0.08, -0.122]] }, coat: GREEN },
      { name: /^J3_link$/, within: { surfaces: [[0.103, -0.06, -0.06], [0.154, 0.06, 0.06]] }, coat: GREEN },
      // Fused to the shell, but a ring of vertices at x 0.089 gives a clean edge.
      { name: /^J5_link$/, within: { box: [[0.0875, -0.3, -0.1], [0.101, 0.1, 0.1]] }, coat: GREEN },
    ],
  },
};
