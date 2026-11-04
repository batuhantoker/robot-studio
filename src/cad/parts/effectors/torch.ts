/** Robotic MIG torch: a spring breakaway sensor, a clamped insulated neck, and the gas diffuser, contact tip and nozzle. */
import { screwsAt } from '../../common/fasteners';
import * as THREE from 'three';
import { hullCylinder } from '../../common/hull';
import { type Profile, hollowCylinder, lathe, solidCylinder } from '../../common/lathe';
import { part } from '../../common/part';
import { pin } from '../shapes/blocks';
import { coil } from '../shapes/mechanical';
import { adapterPlate, opening, PLATE_FACE, SCREWS_OPEN, sideHose, stackOpen, toolFrame } from './mount';
import type { EffectorBuilder } from './types';

const scaled = (p: Profile, s: number): Profile => p.map(([r, y]) => [r * s, y * s]);

export const weldingTorch: EffectorBuilder = (o) => {
  const { g, s, reach } = toolFrame(o, 3);
  const { mats } = o;
  const at = opening(s);
  const R = reach / s;
  const [n0, tip0] = [R - 0.85, R - 0.14];
  const contact = n0 + 0.26;
  const [springOpen, sensorOpen, capOpen, clampOpen, neckOpen, diffuserOpen, tipOpen, nozzleOpen] = stackOpen(
    [[0.22, 0.66], [0.14, 0.7], [0.7, 0.9], [0.9, 1.14], [0.92, n0], [n0 - 0.06, n0 + 0.32], [contact, R + 0.04], [n0, tip0]],
    PLATE_FACE + 0.05 + SCREWS_OPEN,
  );
  const neck: Profile = [[0, 0.92], [0.27, 0.92], [0.27, 1.14], [0.3, 1.18], [0.3, 1.32], [0.27, n0 - 0.1], [0.24, n0], [0, n0]];
  const diffuser: Profile = [[0, n0 - 0.06], [0.16, n0 - 0.06], [0.18, n0], [0.18, n0 + 0.12], [0.14, n0 + 0.14], [0.14, n0 + 0.2], [0.18, n0 + 0.22], [0.18, n0 + 0.3], [0.12, n0 + 0.32], [0, n0 + 0.32]];
  const tip: Profile = [[0, contact], [0.1, contact], [0.1, contact + 0.1], [0.08, contact + 0.13], [0.075, R - 0.09], [0.05, R - 0.03], [0, R - 0.03]];
  const nozzle: Profile = [[0.27, n0], [0.38, n0], [0.39, n0 + 0.25], [0.3, tip0], [0.22, tip0], [0.3, n0 + 0.25], [0.27, n0]];
  g.add(
    part(lathe(solidCylinder(s * 0.62, s * 0.14, s * 0.7, s * 0.06)), mats, 'shell', { label: 'Collision sensor', layer: 'housing', explode: at(sensorOpen) }),
    part(coil(s * 0.4, s * 0.04, s * 0.22, s * 0.66, 4), mats, 'steel', { label: 'Breakaway spring', layer: 'drive', explode: at(springOpen) }),
    part(lathe(scaled(neck, s)), mats, 'cap', { label: 'Swan neck', layer: 'structure', explode: at(neckOpen) }),
    part(lathe(scaled(diffuser, s), 32), mats, 'brass', { label: 'Gas diffuser', layer: 'drive', explode: at(diffuserOpen) }),
    part(lathe(scaled(tip, s), 24), mats, 'copper', { label: 'Contact tip', layer: 'drive', explode: at(tipOpen) }),
    part(lathe(scaled(nozzle, s)), mats, 'copper', { label: 'Gas nozzle', layer: 'housing', explode: at(nozzleOpen) }),
    part(lathe(hollowCylinder(s * 0.42, s * 0.28, s * 0.9, s * 1.14, s * 0.03)), mats, 'alu', { label: 'Torch clamp', layer: 'structure', explode: at(clampOpen) }),
    part(lathe(solidCylinder(s * 0.6, s * 0.7, s * 0.9, s * 0.05)), mats, 'cap', { label: 'Sensor cap', layer: 'housing', explode: at(capOpen) }),
    screwsAt(mats, [new THREE.Vector3(s * 0.42, s * 1.02, 0)], s * 0.06, 'x', 1, { label: 'Clamp screw', layer: 'fastener', explode: at(clampOpen, 0.6) }),
    part(pin(s * 0.025, s * 0.24, 'y').translate(0, s * (R - 0.08), 0), mats, 'steel', { label: 'Filler wire', layer: 'drive', explode: at(tipOpen) }),
    sideHose(mats, new THREE.Vector3(s * 0.6, s * 0.45, 0), s, 'Torch cable', at(sensorOpen, 1.2)),
    hullCylinder(s * 0.62, s * 0.14, s * 0.9),
    hullCylinder(s * 0.38, s * 0.9, reach),
  );
  adapterPlate(g, mats, s);
  return { group: g, grip: null, reach, payload: null };
};
