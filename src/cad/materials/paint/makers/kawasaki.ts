/** Kawasaki Robotics. */
import type { Coat, PaintRule, PaintScheme } from '../table';

const BLACK: Coat = { color: '#3a3b3e', finish: 'anodized' };

const STEEL: Coat = { color: '#a7abae', finish: 'steel' };
const TEAL: Coat = { color: '#5daabe', finish: 'paint' };
const ESTOP: Coat = { color: '#d9483f', finish: 'plastic' };

// The BXP's shared castings: J1 and J2 motors, tapered elbow sleeve, J3 motor, wrist motors behind the elbow.
const BXP_BLACK: PaintRule[] = [
  { name: /^link1$/, within: { surfaces: [[-0.215, -0.225, -0.15], [0.016, 0.002, 0.2]] }, coat: BLACK },
  { name: /^link1$/, within: { surfaces: [[-0.325, 0.04, -0.155], [-0.036, 0.35, 0.16]] }, coat: BLACK },
  { name: /^link3$/, within: { surfaces: [[0.085, 0.355, -0.16], [0.375, 0.672, 0.145]] }, coat: BLACK },
  { name: /^link3$/, within: { surfaces: [[-0.115, -0.115, 0.04], [0.115, 0.115, 0.3]] }, coat: BLACK },
  { name: /^link3$/, within: { surfaces: [[0.285, 0.02, -0.1], [0.4, 0.26, 0.02]] }, coat: BLACK },
];

export const KAWASAKI: Record<string, PaintScheme> = {
  // Munsell 10GY9/1 per spec 90151-0314DEB, via the renotation table; flange black in the maker's R series brochure.
  'armor-kawasaki-rs007l': {
    body: { color: '#dbe6d9', finish: 'paint' },
    parts: [
      { at: 'tip', coat: BLACK },
      // The black band with its bolt heads round the wrist end, in the RS007L's own photo.
      { name: /^link5$/, within: { surfaces: [[0.03, -0.06, -0.06], [0.09, 0.06, 0.06]] }, coat: BLACK },
    ],
  },
  // Munsell 10GY9/1 on each model's own sheet. Flange and bolted band black in the R series brochure photo.
  'armor-kawasaki-rs013n': {
    body: { color: '#dbe6d9', finish: 'paint' },
    parts: [
      { at: 'tip', coat: BLACK },
      { name: /^link5$/, within: { surfaces: [[0.06, -0.06, -0.06], [0.09, 0.06, 0.06]] }, coat: BLACK },
    ],
  },
  'armor-kawasaki-rs015x': {
    body: { color: '#dbe6d9', finish: 'paint' },
    parts: [
      { at: 'tip', coat: BLACK },
      { name: /^link5$/, within: { surfaces: [[0.06, -0.06, -0.06], [0.09, 0.06, 0.06]] }, coat: BLACK },
    ],
  },
  // Its photo is in the 2505 R series brochure, not the older one.
  'armor-kawasaki-rs025n': {
    body: { color: '#dbe6d9', finish: 'paint' },
    parts: [
      { at: 'tip', coat: BLACK },
      { name: /^link5$/, within: { surfaces: [[0.085, -0.06, -0.06], [0.11, 0.06, 0.06]] }, coat: BLACK },
    ],
  },
  // The bolted collar stays white in the brochure photo; only the flange face is black.
  'armor-kawasaki-rs080n': {
    body: { color: '#dbe6d9', finish: 'paint' },
    parts: [{ at: 'tip', coat: BLACK }],
  },
  // BX/BXP: 10GY9/1 on each sheet; black parts read from the maker's photo, the BXP135X's from its sibling BXP210L.
  'armor-kawasaki-bx300l': {
    body: { color: '#dbe6d9', finish: 'paint' },
    parts: [
      { name: /^link6$/, coat: STEEL },
      { name: /^link1$/, within: { surfaces: [[-0.245, -0.325, -0.255], [0.035, -0.045, -0.005]] }, coat: BLACK },
      { name: /^link1$/, within: { surfaces: [[-0.4, 0.095, -0.115], [-0.155, 0.325, 0.115]] }, coat: BLACK },
      { name: /^parallel_arm2$/, within: { surfaces: [[0.155, 0.07, -0.52], [0.385, 0.3, -0.275]] }, coat: BLACK },
      { name: /^link3$/, within: { surfaces: [[-0.18, 0.228, -0.18], [0.18, 0.325, 0.18]] }, coat: BLACK },
      { name: /^link4$/, within: { surfaces: [[0.2, -0.16, 0.35], [0.24, 0.17, 1.16]] }, coat: BLACK },
      { name: /^link4$/, within: { surfaces: [[-0.2, -0.165, 0.4], [-0.168, 0.11, 1.13]] }, coat: BLACK },
      { name: /^link4$/, within: { surfaces: [[-0.15, -0.16, 0.46], [0.11, -0.04, 0.615]] }, coat: BLACK },
      { name: /^link4$/, within: { surfaces: [[-0.16, 0.015, 0.44], [0.04, 0.155, 0.6]] }, coat: BLACK },
      // The sleeve is fused to the casting, but ends at a real step in the mesh.
      { name: /^link4$/, within: { box: [[-0.3, -0.3, -0.1], [0.3, 0.3, 0.3125]] }, coat: BLACK },
    ],
  },
  'armor-kawasaki-bxp135x': {
    body: { color: '#dbe6d9', finish: 'paint' },
    parts: [
      { name: /^link6$/, coat: STEEL },
      ...BXP_BLACK,
      { name: /^link4$/, within: { surfaces: [[0.16, -0.095, 0.735], [0.19, 0.145, 1.35]] }, coat: BLACK },
      { name: /^link4$/, within: { surfaces: [[-0.155, -0.145, 0.735], [-0.128, 0.095, 1.35]] }, coat: BLACK },
      { name: /^link4$/, within: { surfaces: [[-0.1, -0.145, 0.81], [0.145, -0.03, 0.955]] }, coat: BLACK },
      { name: /^link4$/, within: { surfaces: [[-0.115, 0.03, 0.81], [0.13, 0.145, 0.955]] }, coat: BLACK },
    ],
  },
  'armor-kawasaki-bxp210l': {
    body: { color: '#dbe6d9', finish: 'paint' },
    parts: [
      { name: /^link6$/, coat: STEEL },
      ...BXP_BLACK,
      { name: /^link4$/, within: { surfaces: [[0.16, -0.095, 0.335], [0.19, 0.145, 0.95]] }, coat: BLACK },
      { name: /^link4$/, within: { surfaces: [[-0.155, -0.145, 0.335], [-0.128, 0.095, 0.95]] }, coat: BLACK },
      { name: /^link4$/, within: { surfaces: [[-0.1, -0.145, 0.41], [0.145, -0.03, 0.555]] }, coat: BLACK },
      { name: /^link4$/, within: { surfaces: [[-0.115, 0.03, 0.41], [0.13, 0.145, 0.555]] }, coat: BLACK },
    ],
  },
  // Arm "Equivalent to Munsell N-95" on sheet 90101-2892DEB; the rest read from the maker's render (~).
  'armor-kawasaki-duaro2': {
    body: { color: '#f1f1f1', finish: 'paint' },
    parts: [
      { name: /^(lower|upper)_link4$/, coat: STEEL },
      { name: /^lower_link1$/, within: { surfaces: [[-0.07, -0.07, 0.095], [0.07, 0.07, 0.127]] }, coat: BLACK },
      // The black cable ports on each wrist; the cable loops themselves are not in the model.
      { name: /^lower_link3_mimic2$/, within: { surfaces: [[0.04, -0.07, 0.1], [0.1, 0.015, 0.17]] }, coat: BLACK },
      { name: /^upper_link3_mimic2$/, within: { surfaces: [[-0.1, -0.07, 0.1], [-0.04, 0.015, 0.17]] }, coat: BLACK },
      { name: /^base_link$/, within: { surfaces: [[-0.087, 0.075, -0.01], [0.087, 0.225, 0.185]] }, coat: TEAL },
      // Vent slots and the plate behind them, then the panel they cut.
      { name: /^cart$/, within: { surfaces: [[-0.087, 0.17, 0.262], [0.087, 0.225, 0.819]] }, coat: BLACK },
      { name: /^cart$/, within: { surfaces: [[-0.1, 0.18, 0.255], [0.1, 0.195, 0.755]] }, coat: BLACK },
      { name: /^cart$/, within: { surfaces: [[-0.11, 0.17, 0.755], [0.11, 0.225, 0.825]] }, coat: BLACK },
      { name: /^cart$/, within: { surfaces: [[-0.087, 0.17, 0.255], [0.087, 0.225, 0.825]] }, coat: TEAL },
      // Corner bumpers, fork pockets, feet and castors: all of the plinth but its white shell.
      { name: /^cart$/, within: { surfaces: [[-0.3, -0.42, -0.01], [0.3, 0.3, 0.25]] }, coat: BLACK },
      { name: /^cart$/, within: { surfaces: [[-0.17, -0.38, 0.81], [0.17, -0.09, 0.84]] }, coat: BLACK },
      { name: /^cart$/, within: { surfaces: [[-0.16, -0.46, 0.75], [0.16, -0.37, 0.79]] }, coat: BLACK },
      { name: /^cart$/, within: { surfaces: [[0.02, -0.365, 0.903], [0.075, -0.31, 0.94]] }, coat: ESTOP },
      { name: /^cart$/, within: { surfaces: [[-0.095, -0.415, 0.825], [0.095, -0.29, 0.94]] }, coat: BLACK },
    ],
  },
};
