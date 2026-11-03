/**
 * Port of `SerialArm.to_mjcf()`: primitive capsules/spheres, ALL contacts disabled, unit-gear
 * torque motors. Multi-DOF studio joints become several joints in one body.
 */
import { add } from '../../math/linear/vec';
import type { RobotSpec } from '../../robot/schema/types';
import { g17List, pythonFloat } from '../format/numbers';
import { child, node, serialize } from '../format/xml';

const COLORS = ['0.20 0.48 0.70 1', '0.90 0.55 0.20 1', '0.25 0.65 0.48 1'];

export function toMjcf(spec: RobotSpec, timestep = 0.002): string {
  if (!(timestep > 0) || !Number.isFinite(timestep)) throw new Error('timestep must be positive');
  const root = node('mujoco', { model: spec.name });
  child(root, 'compiler', { angle: 'radian', autolimits: 'true', inertiafromgeom: 'true' });
  child(root, 'option', { timestep: pythonFloat(timestep), gravity: '0 0 -9.81', integrator: 'implicitfast' });
  child(child(root, 'default'), 'geom', { contype: '0', conaffinity: '0' });
  let body = child(root, 'worldbody');
  const actuators = child(root, 'actuator');
  let motor = 0;
  spec.links.forEach((link, index) => {
    const origin = index === 0 ? spec.base : spec.links[index - 1].offset;
    body = child(body, 'body', { name: `body_${index}`, pos: g17List(origin) });
    // MuJoCo composes several joints in one body in order, matching the chain's DOF stack.
    for (const dof of link.dofs) {
      child(body, 'joint', {
        name: dof.name,
        type: dof.type,
        axis: g17List(dof.axis),
        range: g17List(dof.limits),
        limited: 'true',
        damping: pythonFloat(link.damping),
        armature: pythonFloat(link.armature),
      });
    }
    const geom: Record<string, string> = {
      name: `geom_${index}`,
      size: pythonFloat(link.radius),
      mass: pythonFloat(link.mass),
      rgba: COLORS[index % COLORS.length],
    };
    if (link.offset.some((v) => v !== 0)) Object.assign(geom, { type: 'capsule', fromto: g17List([0, 0, 0, ...link.offset]) });
    else Object.assign(geom, { type: 'sphere', pos: '0 0 0' });
    child(body, 'geom', geom);
    for (const dof of link.dofs) {
      child(actuators, 'motor', {
        name: `motor_${motor++}`,
        joint: dof.name,
        gear: '1',
        ctrllimited: 'true',
        ctrlrange: g17List([-link.torque_limit, link.torque_limit]),
      });
    }
  });
  const last = spec.links[spec.links.length - 1];
  const tip = add(last.offset, spec.tool);
  child(body, 'site', { name: 'end_effector', pos: g17List(tip), size: '0.008', rgba: '0.9 0.2 0.2 1' });
  if (spec.payload_mass > 0) {
    child(body, 'geom', {
      name: 'payload', type: 'sphere', pos: g17List(tip), size: pythonFloat(last.radius),
      mass: pythonFloat(spec.payload_mass), rgba: '0.3 0.3 0.3 1',
    });
  }
  return serialize(root);
}

