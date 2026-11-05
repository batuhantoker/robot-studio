/** Which grips each hand can really make: the object, where it sits, how each digit gets there. Values come from searches against the hand's own meshes. */
import { type Mat3, rodrigues } from '../math/linear/mat3';
import { type Vec3, cross, normalize } from '../math/linear/vec';
import type { Digit, Grasp } from './grasp';
import { mirrored } from './grasp';
import type { Tuck } from './gesture';

/** A can or bar lying across the palm, its thumb end raised by `tilt`. */
const across = (tilt: number) => rodrigues([0, 1, 0], Math.PI / 2 - tilt);

/** An object's z along `n`, its x as near the hand's thumb side as that allows. */
function facing(n: Vec3): Mat3 {
  const z = normalize(n), y = normalize(cross(z, [1, 0, 0])), x = cross(y, z);
  return [x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]];
}

const shadowFinger = (f: string, j3 = 1, j0 = 2): Digit => ({ close: { [`rh_${f}J3`]: j3, [`rh_${f}J0`]: j0 }, stop: { [`rh_${f}J3`]: 1.45, [`rh_${f}J0`]: 2.6 } });
const shadowFold = (f: string, j3: number, j0: number): Digit => ({ set: { [`rh_${f}J3`]: j3, [`rh_${f}J0`]: j0 } });

/** Thumb in the plane of the palm, so an object can come in past it. */
const SHADOW_OPEN = { rh_THJ4: 0 };

const SHADOW: Grasp[] = [
  {
    name: 'power',
    label: 'Power',
    hint: 'A can is brought to the palm: the fingers wrap until each meets it, and the thumb locks over towards them',
    open: SHADOW_OPEN,
    // A slimmer can brings the thumb onto the fingers; a fatter one meets the thumb on its way across.
    sizes: [1, 1],
    shape: { kind: 'cylinder', radius: 0.023, length: 0.1 },
    at: { p: [-0.016, -0.0455, 0.31], R: across(0.2) },
    stand: { at: [-0.05, -0.0455, 0.2798], side: -1 },
    order: [['index', 'middle', 'ring', 'little', 'thumb']],
    digits: {
      index: shadowFinger('FF'), middle: shadowFinger('MF'), ring: shadowFinger('RF'), little: shadowFinger('LF'),
      thumb: { set: { rh_THJ5: 0, rh_THJ4: 1.22, rh_THJ3: 0.2, rh_THJ2: -0.3, rh_THJ1: -0.1 }, close: { rh_THJ2: 0.4, rh_THJ1: 1 } },
    },
  },
  {
    name: 'pinch',
    label: 'Pinch',
    hint: 'Index and thumb meet pad to pad on a thin brass pin, near its balance point, on one line through it',
    open: SHADOW_OPEN,
    shape: { kind: 'pin', radius: 0.0038, length: 0.05 },
    at: { p: [0.0343, -0.0903, 0.3291], R: facing([-0.927, -0.157, -0.341]) },
    stand: { at: [0.0176, -0.0931, 0.3192], side: -1 },
    order: [['index', 'thumb']],
    digits: {
      index: { close: { rh_FFJ4: 0.3, rh_FFJ3: 1.4, rh_FFJ0: 0.6 }, stop: { rh_FFJ4: 0.3, rh_FFJ3: 1.45, rh_FFJ0: 2.6 } },
      thumb: { set: { rh_THJ5: 0.7, rh_THJ4: 1.186, rh_THJ3: -0.06, rh_THJ2: -0.698, rh_THJ1: -0.262 }, close: { rh_THJ5: 1, rh_THJ3: -0.17 } },
      middle: { set: { rh_MFJ4: 0.3, rh_MFJ3: 1.3, rh_MFJ0: 0.75 } }, ring: { set: { rh_RFJ4: -0.2, rh_RFJ3: 1.25, rh_RFJ0: 0.9 } }, little: { set: { rh_LFJ4: -0.1, rh_LFJ3: 1.2, rh_LFJ0: 1 } },
    },
  },
  {
    name: 'tripod',
    label: 'Tripod',
    hint: 'Thumb, index and middle close on a small ball, the thumb pad opposite the two fingers',
    open: SHADOW_OPEN,
    shape: { kind: 'ball', radius: 0.014 },
    at: { p: [0.027, -0.085, 0.345], R: rodrigues([1, 0, 0], 0) },
    stand: { at: [0.0183, -0.0937, 0.3383], side: -1 },
    order: [['index', 'middle', 'thumb']],
    digits: {
      index: shadowFinger('FF', 1.3, 0.7), middle: shadowFinger('MF', 1.3, 0.7),
      thumb: { set: { rh_THJ5: 0.864, rh_THJ4: 1.222, rh_THJ3: -0.163, rh_THJ2: -0.698, rh_THJ1: -0.262 }, close: { rh_THJ5: 1, rh_THJ3: -0.2 } },
      ring: shadowFold('RF', 1.2, 0.9), little: shadowFold('LF', 1.2, 1),
    },
  },
  {
    name: 'key',
    label: 'Key',
    hint: 'The index curls and its side becomes the anvil: the thumb clamps the bow against it, the blade clear of the fist',
    open: SHADOW_OPEN,
    shape: { kind: 'key', bow: 0.013, blade: [0.044, 0.0085], thick: 0.0024 },
    at: { p: [0.0438, -0.1044, 0.345], R: [0, 0, 1, 0, -1, 0, 1, 0, 0] },
    stand: { at: [0.0438, -0.118, 0.3407], side: -1 },
    order: [['index', 'thumb']],
    digits: {
      index: { set: { rh_FFJ3: 1.2, rh_FFJ0: 2 }, close: { rh_FFJ4: -1 } },
      middle: shadowFold('MF', 1.2, 2), ring: shadowFold('RF', 1.2, 2), little: shadowFold('LF', 1.2, 2),
      thumb: { set: { rh_THJ5: -0.21, rh_THJ4: 0.71, rh_THJ3: -0.2, rh_THJ2: -0.3, rh_THJ1: -0.1 }, close: { rh_THJ2: 1, rh_THJ1: 0.4 } },
    },
  },
  {
    name: 'hook',
    label: 'Hook',
    hint: 'Fingers curl over a fixed rail and hook it, palm clear and thumb relaxed: the posts keep the rail where it is',
    open: SHADOW_OPEN,
    shape: { kind: 'bar', radius: 0.011, length: 0.2 },
    at: { p: [0, -0.034, 0.37], R: across(0) },
    stand: { at: [0, -0.034, 0.37], side: -1, posts: [[-0.094, -0.046, 0.37], [0.094, -0.046, 0.37]] },
    order: [['index', 'middle', 'ring', 'little']],
    digits: {
      index: { close: { rh_FFJ0: 2 }, stop: { rh_FFJ0: 2.9 } },
      middle: { close: { rh_MFJ0: 2 }, stop: { rh_MFJ0: 2.9 } },
      ring: { close: { rh_RFJ0: 2 }, stop: { rh_RFJ0: 2.9 } },
      little: { close: { rh_LFJ0: 2 }, stop: { rh_LFJ0: 2.9 } },
      thumb: { set: { rh_THJ5: 0.6, rh_THJ4: 0.1, rh_THJ2: 0.25, rh_THJ1: 0.7 } },
    },
  },
];

const close = (motor: string): Digit => ({ close: { [motor]: 1 } });

/** Each finger is one motor through a four-bar, so it stops as a whole at its first contact. */
const ABILITY: Grasp[] = [
  {
    name: 'power',
    label: 'Power',
    hint: 'A can is brought to the palm: each finger closes until it meets it, and the thumb rotates under and presses up',
    shape: { kind: 'cylinder', radius: 0.026, length: 0.11 },
    at: { p: [0, -0.0363, 0.095], R: across(0.35) },
    sizes: [1, 1],
    stand: { at: [-0.04, -0.0363, 0.0527], side: -1, tip: 0.015 },
    order: [['index', 'middle', 'ring', 'pinky', 'thumb']],
    digits: {
      index: close('index'), middle: close('middle'), ring: close('ring'), pinky: close('pinky'),
      thumb: { set: { thumb_rotator: -1.654, thumb_flexor: 0 }, close: { thumb_flexor: 1 } },
    },
  },
  {
    name: 'pinch',
    label: 'Pinch',
    hint: 'Thumb tip and index close on a thin brass pin. Two thumb joints cannot lay the pads flat, so it meets the pin edge on',
    shape: { kind: 'pin', radius: 0.0038, length: 0.05 },
    at: { p: [0.0246, -0.0547, 0.1185], R: facing([-0.673, -0.739, -0.044]) },
    stand: { at: [0.0111, -0.0695, 0.1138], side: -1 },
    order: [['index', 'thumb']],
    digits: {
      index: close('index'),
      thumb: { set: { thumb_rotator: -1.25, thumb_flexor: 0.45 }, close: { thumb_flexor: 1 } },
      middle: { set: { middle: 1.15 } }, ring: { set: { ring: 1.3 } }, pinky: { set: { pinky: 1.4 } },
    },
  },
  {
    name: 'chuck',
    label: 'Chuck',
    hint: 'Thumb, index and middle close on a small ball, as a drill chuck grips',
    shape: { kind: 'ball', radius: 0.015 },
    at: { p: [0.015, -0.059, 0.115], R: rodrigues([1, 0, 0], 0) },
    stand: { at: [0.0014, -0.059, 0.1087], side: -1 },
    order: [['index', 'middle', 'thumb']],
    digits: {
      index: close('index'), middle: close('middle'),
      thumb: { set: { thumb_rotator: -1.59, thumb_flexor: 0.1 }, close: { thumb_flexor: 1 } },
      ring: { set: { ring: 1.2 } }, pinky: { set: { pinky: 1.3 } },
    },
  },
  {
    name: 'key',
    label: 'Key',
    hint: 'The fingers fold, and the thumb swings round and clamps the bow against the side of the index, the blade clear of the fist',
    shape: { kind: 'key', bow: 0.013, blade: [0.044, 0.0085], thick: 0.0024 },
    at: { p: [0.03456, -0.0564, 0.114], R: [0, 0, 1, 0, -1, 0, 1, 0, 0] },
    stand: { at: [0.03456, -0.072, 0.1097], side: -1 },
    order: [['thumb']],
    touch: ['index', 'thumb'],
    digits: {
      index: { set: { index: 1.25 } }, middle: { set: { middle: 1.39 } }, ring: { set: { ring: 1.39 } }, pinky: { set: { pinky: 1.39 } },
      thumb: { set: { thumb_rotator: -0.345, thumb_flexor: 0 }, close: { thumb_flexor: 1 } },
    },
  },
  {
    name: 'hook',
    label: 'Hook',
    hint: 'Fingers curl over a fixed rail and hook it, thumb out of the way: the posts keep the rail where it is',
    shape: { kind: 'bar', radius: 0.011, length: 0.17 },
    at: { p: [0, -0.025, 0.105], R: across(0) },
    stand: { at: [0, -0.025, 0.105], side: -1, posts: [[-0.08, -0.04, 0.105], [0.08, -0.04, 0.105]] },
    order: [['index', 'middle', 'ring', 'pinky']],
    digits: { index: close('index'), middle: close('middle'), ring: close('ring'), pinky: close('pinky') },
  },
];

/** One tendon closes every finger together, so nothing can finish after the first contact. */
const PISA: Grasp[] = [
  {
    name: 'power',
    label: 'Ball',
    hint: 'One tendon closes all five fingers together, so they stop at the first contact: ring and thumb touch, the others end about 3 mm short. The real hand\'s tendon would finish the wrap; this one-motor model cannot',
    shape: { kind: 'ball', radius: 0.058 },
    at: { p: [0.0033, -0.0717, 0.1847], R: rodrigues([1, 0, 0], 0) },
    sizes: [1, 1],
    stand: { at: [0.0033, -0.0717, 0.1267], side: -1 },
    order: [['hand']],
    touch: ['ring', 'thumb'],
    digits: { hand: { close: { synergy: 1 } } },
  },
];

/** The second synergy's slide, set before closing, is what lets all five fingers reach. */
const QB: Grasp[] = [
  {
    name: 'power',
    label: 'Ball',
    hint: 'The tendon closes the fingers round a ball, with a touch of the second synergy so all five arrive: four touch, the middle ends under 1 mm off. The second synergy is a model, not a measurement',
    shape: { kind: 'ball', radius: 0.055 },
    at: { p: [-0.0133, -0.0888, 0.1212], R: rodrigues([1, 0, 0], 0) },
    sizes: [1, 1],
    stand: { at: [-0.0133, -0.0888, 0.0662], side: -1 },
    order: [['hand']],
    touch: ['index', 'little', 'thumb'],
    digits: { hand: { set: { slide: -0.114 }, close: { synergy: 1 } } },
  },
  {
    name: 'hook',
    label: 'Hook',
    hint: 'The synergy curls the fingers over a fixed rail: the little finger touches, the others end about 2 mm short, and the posts keep the rail where it is',
    shape: { kind: 'bar', radius: 0.009, length: 0.17 },
    at: { p: [0, -0.024, 0.1429], R: across(0) },
    sizes: [1, 1],
    stand: { at: [0, -0.024, 0.1429], side: -1, posts: [[-0.08, 0.002, 0.1429], [0.08, 0.002, 0.1429]] },
    order: [['hand']],
    touch: ['little'],
    digits: { hand: { close: { synergy: 1 } } },
  },
];

const allegroFinger = (f: string, j1 = 1, j2 = 1, j3 = 1): Digit => ({ close: { [`${f}j1`]: j1, [`${f}j2`]: j2, [`${f}j3`]: j3 } });
const allegroFold = (f: string, v: number): Digit => ({ set: { [`${f}j1`]: v, [`${f}j2`]: v, [`${f}j3`]: v } });

const ALLEGRO: Grasp[] = [
  {
    name: 'power',
    label: 'Power',
    hint: 'A can is brought to the palm: three fingers wrap until each meets it, and the long thumb closes under them',
    shape: { kind: 'cylinder', radius: 0.028, length: 0.13 },
    at: { p: [0, -0.0403, 0.015], R: across(0.15) },
    sizes: [1, 1],
    stand: { at: [-0.05, -0.0403, -0.0208], side: -1 },
    order: [['index', 'middle', 'ring', 'thumb']],
    digits: {
      index: allegroFinger('ff'), middle: allegroFinger('mf'), ring: allegroFinger('rf'),
      thumb: { set: { thj0: 1.5, thj1: 0, thj2: 0.45, thj3: 0.1 }, close: { thj2: 1, thj3: 0.5 } },
    },
  },
  {
    name: 'pinch',
    label: 'Pinch',
    hint: 'Index and thumb tips close on a thin brass pin. Their tips are round, so they meet it on the curve, not on a flat pad',
    shape: { kind: 'pin', radius: 0.003, length: 0.05 },
    at: { p: [0.0413, -0.0902, 0.0152], R: facing([-1, -0.001, -0.018]) },
    stand: { at: [0.021, -0.0902, 0.0118], side: -1 },
    order: [['index', 'thumb']],
    digits: {
      index: allegroFinger('ff', 0.797, 0.862, 0.788),
      thumb: { set: { thj0: 1.396, thj1: -0.105, thj2: 0.7, thj3: -0.16 }, close: { thj2: 1 } },
      middle: allegroFold('mf', 0.6), ring: allegroFold('rf', 0.6),
    },
  },
  {
    name: 'tripod',
    label: 'Tripod',
    hint: 'Thumb, index and middle close on a small ball. The fingers stand wide apart, so they take it from either side',
    shape: { kind: 'ball', radius: 0.016 },
    at: { p: [0.0232, -0.0743, 0.0205], R: rodrigues([1, 0, 0], 0) },
    stand: { at: [0.012, -0.0855, 0.0095], side: -1 },
    order: [['index', 'middle', 'thumb']],
    digits: {
      index: allegroFinger('ff', 0.8, 0.86, 0.79), middle: allegroFinger('mf', 0.81, 0.87, 0.8),
      thumb: { set: { thj0: 1.3, thj1: 0.22, thj2: 0.45, thj3: 0.1 }, close: { thj2: 1, thj3: 0.5 } },
      ring: allegroFold('rf', 0.7),
    },
  },
  {
    name: 'hook',
    label: 'Hook',
    hint: 'The last two joints of each finger curl over a fixed rail and hook it, palm clear: the posts keep the rail where it is',
    shape: { kind: 'bar', radius: 0.011, length: 0.22 },
    at: { p: [0, -0.03, 0.02], R: across(0) },
    stand: { at: [0, -0.03, 0.02], side: -1, posts: [[-0.105, -0.04, 0.02], [0.105, -0.04, 0.02]] },
    order: [['index', 'middle', 'ring']],
    digits: {
      index: { close: { ffj2: 1, ffj3: 1 } }, middle: { close: { mfj2: 1, mfj3: 1 } }, ring: { close: { rfj2: 1, rfj3: 1 } },
    },
  },
];

const leapFinger = (f: string, mcp = 1, pip = 1, dip = 1): Digit => ({ close: { [`${f}_mcp`]: mcp, [`${f}_pip`]: pip, [`${f}_dip`]: dip } });
const leapFold = (f: string, mcp: number, pip: number, dip: number): Digit => ({ set: { [`${f}_mcp`]: mcp, [`${f}_pip`]: pip, [`${f}_dip`]: dip } });

/** Its fingers stand 46 mm apart, too wide for three pads round a small ball, so it offers no tripod. */
const LEAP: Grasp[] = [
  {
    name: 'power',
    label: 'Power',
    hint: 'A can is brought to the palm: three fingers wrap until each meets it, and the thumb closes over it from below',
    shape: { kind: 'cylinder', radius: 0.026, length: 0.13 },
    at: { p: [-0.036, -0.0552, 0], R: across(0.15) },
    sizes: [1, 1],
    stand: { at: [-0.085, -0.0552, -0.0335], side: -1 },
    order: [['index', 'middle', 'ring', 'thumb']],
    digits: {
      index: leapFinger('if'), middle: leapFinger('mf'), ring: leapFinger('rf'),
      thumb: { set: { th_cmc: 0.514, th_axl: 0.467, th_mcp: 0.6, th_ipl: 0.3 }, close: { th_mcp: 1, th_ipl: 0.5 } },
    },
  },
  {
    name: 'pinch',
    label: 'Pinch',
    hint: 'Index and thumb close on a thin brass pin, meeting it on the corners of their square tips',
    shape: { kind: 'pin', radius: 0.005, length: 0.05 },
    at: { p: [0.0295, -0.098, 0.0007], R: facing([0.623, -0.611, 0.488]) },
    stand: { at: [0.0407, -0.109, 0.0045], side: -1 },
    order: [['index', 'thumb']],
    digits: {
      index: leapFinger('if', 0.958, 0.69, 0.838),
      thumb: { set: { th_cmc: 0.465, th_axl: 0.465, th_mcp: 0.65, th_ipl: 0.27 }, close: { th_mcp: 1 } },
      middle: leapFold('mf', 0.6, 0.4, 0.5), ring: leapFold('rf', 0.6, 0.4, 0.5),
    },
  },
  {
    name: 'hook',
    label: 'Hook',
    hint: 'The last two joints of each finger curl over a fixed rail and hook it, palm clear: the posts keep the rail where it is',
    shape: { kind: 'bar', radius: 0.011, length: 0.24 },
    at: { p: [-0.044, -0.047, 0.01], R: across(0) },
    stand: { at: [-0.044, -0.047, 0.01], side: -1, posts: [[-0.158, -0.075, 0.01], [0.07, -0.075, 0.01]] },
    order: [['index', 'middle', 'ring']],
    digits: {
      index: { close: { if_pip: 1, if_dip: 1 } }, middle: { close: { mf_pip: 1, mf_dip: 1 } }, ring: { close: { rf_pip: 1, rf_dip: 1 } },
    },
  },
];

const sharpaFinger = (f: string, mcp = 1, pip = 1, dip = 0.8): Digit => ({ close: { [`right_${f}_MCP_FE`]: mcp, [`right_${f}_PIP`]: pip, [`right_${f}_DIP`]: dip } });
const sharpaFold = (f: string, mcp: number, pip: number, dip: number): Digit => ({ set: { [`right_${f}_MCP_FE`]: mcp, [`right_${f}_PIP`]: pip, [`right_${f}_DIP`]: dip } });

const SHARPA: Grasp[] = [
  {
    name: 'power',
    label: 'Power',
    hint: 'A can is brought to the palm: every finger wraps with all three of its links, and the thumb closes over it',
    shape: { kind: 'cylinder', radius: 0.03, length: 0.105 },
    at: { p: [0, -0.051, 0.105], R: across(0.15) },
    sizes: [1, 1],
    stand: { at: [-0.04, -0.051, 0.0687], side: -1 },
    order: [['index', 'middle', 'ring', 'little', 'thumb']],
    digits: {
      index: sharpaFinger('index'), middle: sharpaFinger('middle'), ring: sharpaFinger('ring'), little: sharpaFinger('pinky'),
      thumb: { set: { right_thumb_CMC_FE: 1.5, right_thumb_CMC_AA: 0.02, right_thumb_MCP_FE: -0.26, right_thumb_MCP_AA: -0.33, right_thumb_IP: 0.2 }, close: { right_thumb_CMC_FE: 1, right_thumb_IP: 1 }, stop: { right_thumb_CMC_FE: 1.92 } },
    },
  },
  {
    name: 'pinch',
    label: 'Pinch',
    hint: 'Index and thumb close on a thin brass pin, near its balance point',
    shape: { kind: 'pin', radius: 0.005, length: 0.05 },
    at: { p: [0.033, -0.0791, 0.1346], R: facing([0.431, -0.768, 0.474]) },
    stand: { at: [0.0217, -0.0594, 0.124], side: -1, tip: 0.015 },
    order: [['index', 'thumb']],
    digits: {
      index: sharpaFinger('index', 0.524, 0.698, 0.559),
      thumb: { set: { right_thumb_CMC_FE: 0.75, right_thumb_CMC_AA: 0.349, right_thumb_MCP_FE: -0.14, right_thumb_MCP_AA: -0.349, right_thumb_IP: 0.349 }, close: { right_thumb_CMC_FE: 1 } },
      middle: sharpaFold('middle', 0.53, 0.7, 0.56), ring: sharpaFold('ring', 0.53, 0.7, 0.56), little: sharpaFold('pinky', 0.53, 0.7, 0.56),
    },
  },
  {
    name: 'tripod',
    label: 'Tripod',
    hint: 'Thumb, index and middle close on a small ball, the thumb pad opposite the two fingers',
    shape: { kind: 'ball', radius: 0.014 },
    at: { p: [0.022, -0.078, 0.125], R: rodrigues([1, 0, 0], 0) },
    stand: { at: [0.0101, -0.0849, 0.1226], side: -1 },
    order: [['index', 'middle', 'thumb']],
    digits: {
      index: sharpaFinger('index', 1, 1, 1), middle: sharpaFinger('middle', 1, 1, 1),
      thumb: { set: { right_thumb_CMC_FE: 1.55, right_thumb_CMC_AA: 0.248, right_thumb_MCP_FE: -0.524, right_thumb_MCP_AA: 0.349, right_thumb_IP: 0 }, close: { right_thumb_CMC_FE: 1 } },
      ring: sharpaFold('ring', 0.75, 0.9, 0.7), little: sharpaFold('pinky', 0.75, 0.9, 0.7),
    },
  },
  {
    name: 'hook',
    label: 'Hook',
    hint: 'The last two joints of each finger curl over a fixed rail and hook it, palm clear: the posts keep the rail where it is',
    shape: { kind: 'bar', radius: 0.011, length: 0.17 },
    at: { p: [0, -0.032, 0.12], R: across(0) },
    stand: { at: [0, -0.032, 0.12], side: -1, posts: [[-0.08, 0.002, 0.12], [0.08, 0.002, 0.12]] },
    order: [['index', 'middle', 'ring', 'little']],
    digits: {
      index: { close: { right_index_PIP: 1, right_index_DIP: 0.8 } }, middle: { close: { right_middle_PIP: 1, right_middle_DIP: 0.8 } },
      ring: { close: { right_ring_PIP: 1, right_ring_DIP: 0.8 } }, little: { close: { right_pinky_PIP: 1, right_pinky_DIP: 0.8 } },
    },
  },
];

/** The left model is not quite the right one's mirror, and a fit this close feels the difference. */
const QB_LEFT_POWER: Partial<Grasp> = {
  at: { p: [0.0142, -0.0903, 0.123], R: rodrigues([1, 0, 0], 0) },
  stand: { at: [0.0142, -0.0903, 0.068], side: 1 },
  digits: { hand: { set: { slide: -0.126 }, close: { synergy: 1 } } },
  touch: ['ring', 'little'],
};

const left = (n: string) => n.replace(/^rh_/, 'lh_');

/** Over the index and middle in the fist; for one to four, folded as far across the palm as its joints go. */
const SHADOW_TUCK: Tuck = {
  over: { rh_THJ5: 0.33, rh_THJ4: 1.22, rh_THJ3: 0.02, rh_THJ2: 0.07, rh_THJ1: 1.05 },
  across: { rh_THJ5: 0.2, rh_THJ4: 1.22, rh_THJ3: 0.21, rh_THJ2: 0.1, rh_THJ1: 1.25 },
};
const renamed = (t: Record<string, number>) => Object.fromEntries(Object.entries(t).map(([n, v]) => [left(n), v]));

/** Where the thumb goes while each hand counts. */
export const COUNT_TUCK: Record<string, Tuck> = {
  shadow_hand_right: SHADOW_TUCK,
  shadow_hand_left: { over: renamed(SHADOW_TUCK.over!), across: renamed(SHADOW_TUCK.across!) },
  allegro_hand_right: { over: { thj0: 1.4, thj1: 1.16, thj2: 0.42, thj3: 1.09 } },
  leap_hand_right: { over: { th_cmc: 0.47, th_axl: 0.47, th_mcp: 0.5, th_ipl: 1.88 } },
  // A fist a little looser than its pointing grip leaves the thumb room to lie across it; ring and little touch at an equal curl.
  sharpa_wave_right: { curl: 0.75, over: { right_thumb_CMC_FE: 1.92, right_thumb_CMC_AA: 0, right_thumb_MCP_FE: -0.5, right_thumb_MCP_AA: -0.3, right_thumb_IP: 1.2, right_pinky_MCP_FE: 0.49 } },
  psyonic_ability_hand_right: { over: { thumb_rotator: -1, thumb_flexor: 0.8 } },
  psyonic_ability_hand_left: { over: { thumb_rotator: -1, thumb_flexor: 0.8 } },
};

export const GRASPS: Record<string, Grasp[]> = {
  shadow_hand_right: SHADOW,
  shadow_hand_left: SHADOW.map((g) => mirrored(g, left)),
  psyonic_ability_hand_right: ABILITY,
  psyonic_ability_hand_left: ABILITY.map((g) => mirrored(g)),
  pisa_iit_softhand_right: PISA,
  pisa_iit_softhand_left: PISA.map((g) => mirrored(g)),
  qb_softhand2_right: QB,
  qb_softhand2_left: QB.map((g) => mirrored(g)).map((g) => (g.name === 'power' ? { ...g, ...QB_LEFT_POWER } : g)),
  allegro_hand_right: ALLEGRO,
  leap_hand_right: LEAP,
  sharpa_wave_right: SHARPA,
};
