/**
 * Vacuum cup: a venturi ejector with silencer and vacuum switch, a spring-loaded level compensator, and a
 * bellows cup. The bellows draw in and the switch lamp lights when suction is on.
 */
import * as THREE from 'three';
import { hullBox, hullCylinder } from '../../common/hull';
import { type Profile, finnedShell, hollowCylinder, lathe, solidCylinder } from '../../common/lathe';
import { part } from '../../common/part';
import { block } from '../shapes/blocks';
import { coil, hexNut } from '../shapes/mechanical';
import { adapterPlate, opening, PLATE_FACE, SCREWS_OPEN, sideHose, stackOpen, toolFrame } from './mount';
import type { EffectorBuilder } from './types';

function bellows(s: number, y0: number, y1: number): Profile {
  const h = (y1 - y0) / 6;
  const zig: Profile = Array.from({ length: 7 }, (_, i) => [i % 2 ? s * 0.5 : s * 0.32, y0 + i * h]);
  return [[s * 0.16, y0], ...zig, [s * 0.16, y1], [s * 0.16, y0]];
}

const cup = (s: number, y0: number, y1: number): Profile =>
  [[s * 0.16, y0], [s * 0.34, y0], [s * 0.78, y1 - s * 0.05], [s * 0.78, y1], [s * 0.66, y1], [s * 0.3, y0 + s * 0.12], [s * 0.16, y0 + s * 0.12], [s * 0.16, y0]];

/** Converging-diverging nozzle along local X, centred on x = 0. */
const venturi = (s: number): Profile =>
  ([[0, -0.5], [0.11, -0.5], [0.11, -0.32], [0.05, -0.06], [0.05, 0.04], [0.09, 0.44], [0.09, 0.5], [0, 0.5]] as Profile).map(([r, y]) => [r * s, y * s]);

export const suctionCup: EffectorBuilder = (o) => {
  const { g, s, reach } = toolFrame(o, 2.2);
  const { mats } = o;
  const at = opening(s);
  const R = reach / s;
  const [flex0, cup0] = [R - 0.84, R - 0.32];
  const sleeveEnd = 0.66 + 0.55 * (flex0 - 0.66);
  const [venturiOpen, bodyOpen] = stackOpen([[0.28, 0.52], [0.14, 0.66]], PLATE_FACE + 0.05 + SCREWS_OPEN);
  const [nutOpen, sleeveOpen, springOpen, plungerOpen, fittingOpen, bellowsOpen, cupOpen] = stackOpen(
    [[0.66, 0.74], [0.66, sleeveEnd], [0.7, sleeveEnd - 0.03], [0.68, flex0 - 0.08], [flex0 - 0.12, flex0], [flex0, cup0], [cup0, R]],
    0.66 + bodyOpen,
  );
  const lamp = part(block(s * 0.1, s * 0.06, s * 0.04).translate(s * 0.3, s * 0.46, s * 0.575), mats, 'accent', { label: 'Status LED', layer: 'sensor', explode: at(bodyOpen, 0, 0.5) });
  lamp.material = mats.get('accent').clone();
  // The flexible tip compresses towards the plunger when the vacuum pulls.
  const tipGroup = new THREE.Group();
  tipGroup.position.y = flex0 * s;
  tipGroup.add(
    part(lathe(cup(s, (cup0 - flex0) * s, (R - flex0) * s)), mats, 'rubber', { label: 'Suction cup', layer: 'structure', explode: at(cupOpen) }),
    part(lathe(bellows(s, 0, (cup0 - flex0) * s)), mats, 'rubber', { label: 'Bellows', layer: 'structure', explode: at(bellowsOpen) }),
  );
  const plunger: Profile = [[0, 0.68], [0.1, 0.68], [0.1, 0.72], [0.07, 0.72], [0.07, flex0 - 0.08], [0, flex0 - 0.08]];
  g.add(
    part(block(s * 1.2, s * 0.52, s * 0.84).translate(0, s * 0.4, 0), mats, 'shell', { label: 'Ejector body', layer: 'housing', explode: at(bodyOpen) }),
    part(lathe(venturi(s), 32).rotateZ(-Math.PI / 2).translate(0, s * 0.4, 0), mats, 'brass', { label: 'Venturi nozzle', layer: 'drive', explode: at(venturiOpen) }),
    part(block(s * 0.42, s * 0.28, s * 0.14).translate(s * 0.18, s * 0.4, s * 0.49), mats, 'cap', { label: 'Vacuum switch', layer: 'sensor', explode: at(bodyOpen, 0, 0.5) }),
    part(lathe(hollowCylinder(s * 0.17, s * 0.11, s * 0.66, s * sleeveEnd, s * 0.02)), mats, 'alu', { label: 'Guide sleeve', layer: 'housing', explode: at(sleeveOpen) }),
    part(coil(s * 0.08, s * 0.016, s * 0.7, s * (sleeveEnd - 0.03), Math.max(3, (sleeveEnd - 0.73) / 0.05)), mats, 'steel', { label: 'Spring', layer: 'drive', explode: at(springOpen) }),
    part(lathe(plunger.map(([r, y]) => [r * s, y * s]), 24), mats, 'steel', { label: 'Plunger', layer: 'drive', explode: at(plungerOpen) }),
    tipGroup,
    lamp,
    part(lathe(finnedShell(s * 0.16, s * 0.16, 0, s * 0.34, 3), 32).rotateZ(-Math.PI / 2).translate(s * 0.6, s * 0.4, 0), mats, 'cap', { label: 'Silencer', layer: 'structure', explode: at(bodyOpen, 0.6) }),
    part(lathe([[0, 0], [s * 0.12, 0], [s * 0.12, s * 0.08], [s * 0.09, s * 0.1], [s * 0.09, s * 0.22], [0, s * 0.22]], 24).rotateZ(Math.PI / 2).translate(-s * 0.6, s * 0.4, 0), mats, 'brass', { label: 'Air fitting', layer: 'structure', explode: at(bodyOpen, -0.5) }),
    sideHose(mats, new THREE.Vector3(-s * 0.82, s * 0.4, 0), s, 'Air line', at(bodyOpen, -1.2), -1),
    part(hexNut(s * 0.36, s * 0.08, s * 0.17, s * 0.7), mats, 'steel', { label: 'Lock nut', layer: 'fastener', explode: at(nutOpen) }),
    part(lathe(solidCylinder(s * 0.15, s * (flex0 - 0.12), s * flex0, s * 0.02), 24), mats, 'brass', { label: 'Cup fitting', layer: 'structure', explode: at(fittingOpen) }),
    hullBox(s * 1.2, s * 0.52, s * 0.84, new THREE.Vector3(0, s * 0.4, 0)),
    hullCylinder(s * 0.17, s * 0.66, s * flex0),
    hullCylinder(s * 0.78, s * flex0, reach),
  );
  adapterPlate(g, mats, s);
  const light = lamp.material as THREE.MeshPhysicalMaterial;
  const set = (gap: number) => {
    const on = gap <= 0;
    tipGroup.scale.y = on ? 0.86 : 1;
    light.emissiveIntensity = on ? 1.4 : 0.15;
  };
  const grip = { min: 0, max: s, rest: s, set };
  set(grip.rest);
  return { group: g, grip, reach, payload: null };
};
