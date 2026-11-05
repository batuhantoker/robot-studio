/** Universal Robots. */
import type { Coat, PaintScheme } from '../table';

const TUBE: Coat = { color: '#c1c1c1', finish: 'aluminium' };
const CAP: Coat = { color: '#a0c9e2', finish: 'plastic' };
const RING: Coat = { color: '#3a3b3e', finish: 'anodized' };
const GRAPHITE: Coat = { color: '#666666', finish: 'paint' };

export const UNIVERSAL: Record<string, PaintScheme> = {
  'armor-ur-series': {
    body: GRAPHITE,
    parts: [
      { at: 'tip', coat: TUBE },
      { name: /^wrist_3_link$/, within: { surfaces: [[-0.05, -0.05, -0.08], [0.05, 0.05, -0.008]] }, coat: GRAPHITE },
      { name: /^base_link_inertia$/, within: { surfaces: [[-0.11, -0.11, -0.01], [0.11, 0.11, 0.0775]] }, coat: TUBE },
      { name: /^base_link_inertia$/, within: { surfaces: [[-0.08, -0.08, 0.076], [0.08, 0.08, 0.0875]] }, coat: { color: '#4fa8e0', finish: 'plastic' } },
      { name: /^base_link_inertia$/, within: { surfaces: [[-0.08, -0.08, 0.086], [0.08, 0.08, 0.107]] }, coat: RING },
      { name: /^shoulder_link$/, within: { surfaces: [[-0.08, -0.11, -0.08], [0.08, -0.088, 0.08]] }, coat: RING },
      { name: /^upper_arm_link$/, within: { surfaces: [[-0.566, -0.08, 0.14], [-0.104, 0.08, 0.3]] }, coat: TUBE },
      { name: /^upper_arm_link$/, within: { surfaces: [[-0.582, -0.07, 0.16], [-0.564, 0.07, 0.283]] }, coat: RING },
      { name: /^upper_arm_link$/, within: { surfaces: [[-0.106, -0.08, 0.145], [-0.088, 0.08, 0.297]] }, coat: RING },
      { name: /^upper_arm_link$/, within: { surfaces: [[-0.048, -0.054, 0.193], [0.078, 0.054, 0.301]] }, coat: CAP },
      { name: /^upper_arm_link$/, within: { surfaces: [[-0.711, -0.042, 0.203], [-0.617, 0.042, 0.285]] }, coat: CAP },
      { name: /^forearm_link$/, within: { surfaces: [[-0.456, -0.07, -0.02], [-0.087, 0.07, 0.11]] }, coat: TUBE },
      { name: /^forearm_link$/, within: { surfaces: [[-0.467, -0.05, 0], [-0.454, 0.05, 0.092]] }, coat: RING },
      { name: /^forearm_link$/, within: { surfaces: [[-0.089, -0.07, -0.015], [-0.071, 0.07, 0.107]] }, coat: RING },
      { name: /^forearm_link$/, within: { surfaces: [[-0.031, -0.042, -0.018], [0.063, 0.042, 0.064]] }, coat: CAP },
      { name: /^forearm_link$/, within: { surfaces: [[-0.565, -0.033, -0.003], [-0.486, 0.033, 0.065]] }, coat: CAP },
      { name: /^wrist_1_link$/, within: { surfaces: [[-0.033, -0.018, -0.031], [0.033, 0.049, 0.048]] }, coat: CAP },
      { name: /^wrist_1_link$/, within: { surfaces: [[-0.05, -0.073, -0.05], [0.05, -0.052, 0.05]] }, coat: RING },
      { name: /^wrist_2_link$/, within: { surfaces: [[-0.05, 0.052, -0.05], [0.05, 0.073, 0.05]] }, coat: RING },
    ],
  },
  'armor-ur5e': {
    body: { color: '#8a8c90', finish: 'paint' },
    parts: [
      { at: 'tip', coat: TUBE },
      { name: /^base_link_inertia$/, within: { surfaces: [[-0.08, -0.08, -0.01], [0.08, 0.08, 0.086]] }, coat: TUBE },
      { name: /^upper_arm_link$/, within: { surfaces: [[-0.349, -0.06, 0.07], [-0.075, 0.06, 0.2]] }, coat: TUBE },
      { name: /^forearm_link$/, within: { surfaces: [[-0.34, -0.05, -0.05], [-0.078, 0.05, 0.06]] }, coat: TUBE },
      { name: /^shoulder_link$/, within: { surfaces: [[-0.061, -0.061, 0.007], [0.061, 0.061, 0.073]] }, coat: CAP },
      { name: /^upper_arm_link$/, within: { surfaces: [[-0.061, -0.061, 0.146], [0.062, 0.061, 0.211]] }, coat: CAP },
      { name: /^upper_arm_link$/, within: { surfaces: [[-0.486, -0.061, 0.146], [-0.363, 0.061, 0.211]] }, coat: CAP },
      { name: /^forearm_link$/, within: { surfaces: [[-0.432, -0.04, -0.05], [-0.351, 0.04, 0.001]] }, coat: CAP },
      { name: /^wrist_1_link$/, within: { surfaces: [[-0.04, 0.006, -0.041], [0.04, 0.057, 0.04]] }, coat: CAP },
      { name: /^wrist_2_link$/, within: { surfaces: [[-0.04, -0.058, -0.041], [0.04, -0.007, 0.04]] }, coat: CAP },
      { name: /^upper_arm_link$/, within: { surfaces: [[-0.074, -0.06, 0.079], [-0.059, 0.06, 0.197]] }, coat: RING },
      { name: /^upper_arm_link$/, within: { surfaces: [[-0.365, -0.06, 0.079], [-0.35, 0.06, 0.197]] }, coat: RING },
      { name: /^forearm_link$/, within: { surfaces: [[-0.065, -0.06, -0.042], [-0.062, 0.06, 0.061]] }, coat: RING },
      { name: /^forearm_link$/, within: { surfaces: [[-0.347, -0.04, -0.032], [-0.338, 0.04, 0.045]] }, coat: RING },
    ],
  },
};
