/**
 * Spherical joint: ball and socket. Its three intersecting hinges appear as gimbal rings in the
 * kinematic layer, which makes the Euler-angle singularity (gimbal lock) visible.
 */
import * as THREE from 'three';
import { lathe } from '../../../common/lathe';
import { axisFrame, v3 } from '../../../common/orient';
import { part } from '../../../common/part';
import { pin } from '../../shapes/blocks';
import { type JointModuleBuilder, moduleRadius } from '../../types';

function socketProfile(R: number): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i <= 12; i++) {
    const t = (i / 12) * (Math.PI * 0.62);
    pts.push([Math.sin(t) * R * 1.18, -Math.cos(t) * R * 1.18]);
  }
  for (let i = 12; i >= 0; i--) {
    const t = (i / 12) * (Math.PI * 0.62);
    pts.push([Math.sin(t) * R * 1.02, -Math.cos(t) * R * 1.02]);
  }
  return pts;
}

const ringMaterial = (color: string) =>
  new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false });

export const sphericalModule: JointModuleBuilder = ({ mats, link }) => {
  const R = moduleRadius(link) * 0.85;
  const out = v3(link.offset).lengthSq() > 0 ? v3(link.offset).normalize() : v3(link.axis);
  const up = (y: number) => new THREE.Vector3(0, y, 0);
  const socket = axisFrame(out);
  socket.add(
    part(lathe(socketProfile(R), 48), mats, 'shell', { label: 'Socket', layer: 'housing', explode: up(-R * 1.6) }),
    part(pin(R * 0.45, R * 1.2, 'y').translate(0, -R * 1.65, 0), mats, 'alu', { label: 'Socket stem', layer: 'structure', explode: up(-R * 1.6) }),
  );
  const axes = [link.dofs[0].axis, link.dofs[1].axis, link.dofs[2].axis].map(v3);
  const colors = ['#3d8fe0', '#f05a23', '#2e9d6a'];
  const gimbals = axes.map((axis, i) => {
    const g = axisFrame(axis);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(R * (1.7 - i * 0.18), R * 0.03, 8, 72).rotateX(Math.PI / 2), ringMaterial(colors[i]));
    ring.userData.part = { label: `Gimbal ${'abc'[i]} (Euler DOF)`, layer: 'kinematic', explode: new THREE.Vector3(), rest: new THREE.Vector3() };
    g.add(ring);
    return g;
  });
  const glow = part(new THREE.SphereGeometry(R * 0.35, 24, 16), mats, 'accent', { label: 'Contact patch', layer: 'sensor' });
  glow.material = mats.get('accent').clone();
  const ball = axisFrame(out);
  ball.add(
    part(new THREE.SphereGeometry(R * 0.98, 40, 28), mats, 'steel', { label: 'Ball', layer: 'drive', explode: up(R * 0.9) }),
    part(pin(R * 0.42, R * 1.4, 'y').translate(0, R * 1.3, 0), mats, 'alu', { label: 'Neck', layer: 'structure', explode: up(R * 1.3) }),
    glow,
  );
  glow.position.set(0, -R * 0.75, 0);
  const stages = [new THREE.Group(), new THREE.Group(), new THREE.Group(), new THREE.Group()];
  stages[0].add(socket);
  gimbals.forEach((g, i) => stages[i + 1].add(g));
  stages[3].add(ball);
  return { stages, exit: () => R * 1.2, indicators: [glow, glow, glow], size: R * 3 };
};
