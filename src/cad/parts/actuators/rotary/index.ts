/** Revolute joint: a cobot-style frameless motor + strain-wave gear module about the joint axis. */
import * as THREE from 'three';
import { axisFrame, cylinderExit, v3 } from '../../../common/orient';
import { type JointModuleBuilder, moduleRadius } from '../../types';
import { buildLoadRing, buildStator } from './stator';
import { buildRotor } from './rotor';

export const rotaryModule: JointModuleBuilder = ({ mats, link }) => {
  const R = moduleRadius(link);
  const L = R * 1.45;
  const axis = v3(link.dofs[0].axis);
  const stator = axisFrame(axis);
  const ring = buildLoadRing(mats, R, L);
  stator.add(buildStator(mats, R, L), ring);
  const rotor = axisFrame(axis);
  rotor.add(buildRotor(mats, R, L));
  const [s0, s1] = [new THREE.Group(), new THREE.Group()];
  s0.add(stator);
  s1.add(rotor);
  return { stages: [s0, s1], exit: (dir) => cylinderExit(R, L / 2, axis, dir), indicators: [ring], size: L };
};
