/** Milling spindle: a finned motor housing around stator and rotor, the shaft on a rear bearing and one in the front cap, and an ER collet holding a fluted end mill. */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { hullCylinder } from '../../common/hull';
import { type Profile, finnedShell, hollowCylinder, lathe, solidCylinder } from '../../common/lathe';
import { part } from '../../common/part';
import { torusAbout } from '../shapes/blocks';
import { flutedCutter } from '../shapes/mechanical';
import { adapterPlate, hoseStub, opening, PLATE_FACE, SCREWS_OPEN, stackOpen, toolFrame } from './mount';
import type { EffectorBuilder } from './types';

export const millingSpindle: EffectorBuilder = (o) => {
  const { g, s, reach } = toolFrame(o, 3.2);
  const { mats } = o;
  const at = opening(s);
  const R = reach / s;
  const [capOpen, rotorOpen, housingOpen, frontOpen, bearingOpen, nutOpen, colletOpen, millOpen] = stackOpen(
    [[0.14, 0.3], [0.34, 1.72], [0.3, 1.5], [1.5, 1.62], [1.51, 1.61], [1.62, 1.86], [1.6, 1.92], [1.7, R]],
    PLATE_FACE + 0.05 + SCREWS_OPEN,
  );
  const collet: Profile = [[0, 1.6 * s], [0.2 * s, 1.6 * s], [0.27 * s, 1.72 * s], [0.17 * s, 1.92 * s], [0, 1.92 * s]];
  const mill = mergeGeometries([lathe(solidCylinder(s * 0.12, s * 1.7, s * 2.1, s * 0.02), 24), flutedCutter(s * 0.13, s * 2.1, reach, 3, (R - 2.1) / 1.5)]);
  g.add(
    part(lathe(finnedShell(s * 0.7, s * 0.1, s * 0.3, s * 1.5, 5)), mats, 'shell', { label: 'Motor housing', layer: 'housing', explode: at(housingOpen) }),
    part(lathe(hollowCylinder(s * 0.6, s * 0.42, s * 0.45, s * 1.3, s * 0.02)), mats, 'copper', { label: 'Stator windings', layer: 'drive', explode: at(housingOpen) }),
    part(lathe(hollowCylinder(s * 0.38, s * 0.1, s * 0.5, s * 1.25, s * 0.02)), mats, 'magnet', { label: 'Rotor', layer: 'drive', explode: at(rotorOpen) }),
    part(lathe(solidCylinder(s * 0.1, s * 0.34, s * 1.72, s * 0.02), 24), mats, 'steel', { label: 'Shaft', layer: 'drive', explode: at(rotorOpen) }),
    part(lathe(collet, 32), mats, 'alu', { label: 'Collet', layer: 'drive', explode: at(colletOpen) }),
    part(mill, mats, 'steel', { label: 'End mill', layer: 'drive', explode: at(millOpen) }),
    part(lathe(finnedShell(s * 0.38, s * 0.38, s * 1.62, s * 1.86, 2)), mats, 'steel', { label: 'Collet nut', layer: 'drive', explode: at(nutOpen) }),
    part(torusAbout('y', s * 0.16, s * 0.05).translate(0, s * 0.4, 0), mats, 'steel', { label: 'Rear bearing', layer: 'bearing', explode: at(rotorOpen) }),
    part(torusAbout('y', s * 0.17, s * 0.045).translate(0, s * 1.56, 0), mats, 'steel', { label: 'Front bearing', layer: 'bearing', explode: at(bearingOpen) }),
    part(lathe(solidCylinder(s * 0.72, s * 0.14, s * 0.3, s * 0.04)), mats, 'cap', { label: 'Rear cap', layer: 'housing', explode: at(capOpen) }),
    part(lathe(hollowCylinder(s * 0.62, s * 0.13, s * 1.5, s * 1.62, s * 0.03)), mats, 'alu', { label: 'Front cap', layer: 'housing', explode: at(frontOpen) }),
    ...hoseStub(mats, new THREE.Vector3(s * 0.715, s * 0.22, 0), s, ['Power connector', 'Power cable'], capOpen),
    hullCylinder(s * 0.72, s * 0.14, s * 1.62),
    hullCylinder(s * 0.38, s * 1.62, s * 1.92),
    hullCylinder(s * 0.13, s * 1.92, reach),
  );
  adapterPlate(g, mats, s);
  return { group: g, grip: null, reach, payload: null };
};
