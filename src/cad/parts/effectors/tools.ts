/** Tools that work on the part instead of holding it: a welding torch, a milling spindle, a bare flange. */
import * as THREE from 'three';
import { hullCylinder } from '../../common/hull';
import { finnedShell, hollowCylinder, lathe, solidCylinder } from '../../common/lathe';
import { part } from '../../common/part';
import { pin } from '../shapes/blocks';
import { away, mountPlate, sideHose, toolFrame } from './mount';
import type { EffectorBuilder } from './types';

export const weldingTorch: EffectorBuilder = (o) => {
  const { g, s, reach } = toolFrame(o, 3);
  const { mats } = o;
  const [body0, nozzle0, tip0] = [s * 1.0, reach - s * 0.85, reach - s * 0.14];
  mountPlate(g, mats, s);
  g.add(
    part(lathe(solidCylinder(s * 0.62, s * 0.18, body0, s * 0.06)), mats, 'shell', { label: 'Collision sensor', layer: 'housing', explode: away(s * 0.9) }),
    part(lathe(solidCylinder(s * 0.34, body0, nozzle0, s * 0.04)), mats, 'cap', { label: 'Insulated neck', layer: 'structure', explode: away(s * 1.3) }),
    part(lathe([[s * 0.2, nozzle0], [s * 0.38, nozzle0], [s * 0.3, tip0], [s * 0.2, tip0], [s * 0.2, nozzle0]]), mats, 'copper', { label: 'Gas nozzle', layer: 'housing', explode: away(s * 1.8) }),
    part(lathe(solidCylinder(s * 0.09, nozzle0 + s * 0.2, reach - s * 0.03)), mats, 'brass', { label: 'Contact tip', layer: 'drive', explode: away(s * 2.2) }),
    part(pin(s * 0.025, s * 0.06, 'y').translate(0, reach - s * 0.03, 0), mats, 'steel', { label: 'Filler wire', layer: 'drive', explode: away(s * 2.4) }),
    sideHose(mats, new THREE.Vector3(s * 0.62, s * 0.6, 0), s, 'Torch cable'),
    hullCylinder(s * 0.62, s * 0.18, body0),
    hullCylinder(s * 0.38, body0, reach),
  );
  return { group: g, grip: null, reach, payload: null };
};

export const millingSpindle: EffectorBuilder = (o) => {
  const { g, s, reach } = toolFrame(o, 3.2);
  const { mats } = o;
  const [motor1, nut1] = [s * 1.5, s * 1.78];
  mountPlate(g, mats, s);
  g.add(
    part(lathe(finnedShell(s * 0.7, s * 0.1, s * 0.18, motor1, 5)), mats, 'shell', { label: 'Spindle motor', layer: 'housing', explode: away(s * 1.0) }),
    part(lathe(hollowCylinder(s * 0.6, s * 0.2, s * 0.3, motor1 - s * 0.1)), mats, 'copper', { label: 'Motor windings', layer: 'drive', explode: away(s * 0.6) }),
    part(lathe(solidCylinder(s * 0.42, motor1, nut1, s * 0.05)), mats, 'steel', { label: 'Collet nut', layer: 'drive', explode: away(s * 1.6) }),
    part(lathe([[0, nut1], [s * 0.12, nut1], [s * 0.12, reach - s * 0.12], [0, reach]]), mats, 'steel', { label: 'End mill', layer: 'drive', explode: away(s * 2.2) }),
    sideHose(mats, new THREE.Vector3(s * 0.7, s * 0.7, 0), s, 'Power cable'),
    hullCylinder(s * 0.7, s * 0.18, motor1),
    hullCylinder(s * 0.42, motor1, nut1),
    hullCylinder(s * 0.12, nut1, reach),
  );
  return { group: g, grip: null, reach, payload: null };
};

/** A bare flange; when the tool point sits off it, a calibration pointer marks where. */
export const toolFlange: EffectorBuilder = (o) => {
  const { g, s, along } = toolFrame(o, 0);
  const { mats } = o;
  mountPlate(g, mats, s);
  g.add(part(pin(s * 0.08, s * 0.25, 'y').translate(s * 0.4, s * 0.3, 0), mats, 'steel', { label: 'Dowel pin', layer: 'fastener', explode: away(s * 1.2) }));
  if (along > s * 0.4) {
    g.add(
      part(lathe([[0, s * 0.18], [s * 0.1, s * 0.18], [s * 0.1, along - s * 0.25], [0, along]]), mats, 'steel', { label: 'TCP pointer', layer: 'structure', explode: away(s * 1.5) }),
      hullCylinder(s * 0.1, s * 0.18, along),
    );
  }
  return { group: g, grip: null, reach: Math.max(along, s * 0.18), payload: null };
};
