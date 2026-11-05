/** Hardware seated in a casting's hollow, for section and explode to find: motors, belts, and blocks such as batteries. */
import * as THREE from 'three';
import type { InsideDesign, PaintDesign } from '../../../core/robot/schema/design';
import { hollowCylinder, lathe, solidCylinder } from '../../common/lathe';
import { axisFrame, v3 } from '../../common/orient';
import { part, partOf } from '../../common/part';
import type { MaterialSet } from '../../materials/library';
import { buildRotor } from '../actuators/rotary/rotor';
import { buildStator } from '../actuators/rotary/stator';
import { block } from '../shapes/blocks';
import { coat } from './casting';

/** A loop round two pulleys, in the plane z = 0 from the origin to `span` along x, `t` thick. */
function beltLoop(span: number, r1: number, r2: number, t: number, width: number): THREE.BufferGeometry {
  const lean = Math.asin(Math.min(1, Math.max(-1, (r1 - r2) / span)));
  const outline = (grow: number): THREE.Vector2[] => {
    const pts: THREE.Vector2[] = [];
    const arc = (cx: number, r: number, from: number, to: number) => {
      for (let i = 0; i <= 16; i++) {
        const a = from + ((to - from) * i) / 16;
        pts.push(new THREE.Vector2(cx + r * Math.cos(a), r * Math.sin(a)));
      }
    };
    arc(span, r2 + grow, -Math.PI / 2 + lean, Math.PI / 2 - lean);
    arc(0, r1 + grow, Math.PI / 2 - lean, (3 * Math.PI) / 2 + lean);
    return pts;
  };
  const shape = new THREE.Shape(outline(t));
  shape.holes.push(new THREE.Path(outline(0)));
  return new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false, curveSegments: 1 }).translate(0, 0, -width / 2);
}

function motor(mats: MaterialSet, d: Extract<InsideDesign, { motor: unknown }>): THREE.Group {
  const g = axisFrame(v3(d.axis).normalize());
  g.position.set(...d.motor);
  const label = d.label ?? 'Motor';
  g.add(buildStator(mats, d.r, d.length), buildRotor(mats, d.r, d.length, false));
  if (d.gear) g.add(part(lathe(solidCylinder(d.r * 0.92, d.length * 0.13, d.length * 0.13 + d.gear, d.r * 0.08), 40), mats, 'alu', { label: `${label} gearhead`, layer: 'drive' }));
  return g;
}

function belt(mats: MaterialSet, d: Extract<InsideDesign, { belt: unknown }>): THREE.Group {
  const [a, b] = d.belt.map(v3);
  const along = b.clone().sub(a);
  const n = v3(d.axis).normalize();
  const x = along.clone().addScaledVector(n, -along.dot(n)).normalize();
  const g = new THREE.Group();
  g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, new THREE.Vector3().crossVectors(n, x), n));
  g.position.copy(a);
  const [r1, r2] = d.r;
  const span = along.length();
  const pulley = (r: number, inner: number, at: number) => {
    const m = part(lathe(inner ? hollowCylinder(r, inner, -d.width * 0.7, d.width * 0.7) : solidCylinder(r, -d.width * 0.7, d.width * 0.7), 40), mats, 'alu', { label: 'Pulley', layer: 'drive' });
    m.rotation.x = Math.PI / 2;
    m.position.x = at;
    return m;
  };
  g.add(
    part(beltLoop(span, r1, r2, Math.max(r2 * 0.06, 0.0012), d.width), mats, 'rubber', { label: d.label ?? 'Timing belt', layer: 'drive' }),
    pulley(r1, 0, 0),
    pulley(r2, d.bore ?? 0, span),
  );
  return g;
}

/** All of it in the frame of the body that holds it. Each item comes out as one unit, along its `opens`. */
export function insideParts(mats: MaterialSet, items: InsideDesign[], named: Record<string, PaintDesign>): THREE.Group {
  const g = new THREE.Group();
  for (const d of items) {
    let unit: THREE.Object3D;
    if ('motor' in d) unit = motor(mats, d);
    else if ('belt' in d) unit = belt(mats, d);
    else {
      const m = part(block(d.size[0] * 2, d.size[1] * 2, d.size[2] * 2, Math.min(...d.size) * 0.12), mats, 'cap', { label: d.label, layer: 'drive' });
      m.position.set(...d.block);
      if (d.paint) coat(m, mats, named[d.paint]);
      unit = m;
    }
    const by = v3(d.opens ?? [0, 0, 0]);
    const toLocal = unit.quaternion.clone().invert();
    unit.traverse((o) => {
      const meta = partOf(o);
      if (meta) meta.explode.copy(o === unit ? by : by.clone().applyQuaternion(toLocal));
    });
    g.add(unit);
  }
  return g;
}
