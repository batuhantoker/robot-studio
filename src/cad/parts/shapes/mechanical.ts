/** Machine elements for tool detail: extruded plates, gears, racks, springs, nuts, finger links, fluted cutters. */
import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

// toCreasedNormals welds on a 1 cm grid and tool parts are millimetres: weld in millimetres instead.
export const creased = (g: THREE.BufferGeometry, angle = Math.PI / 5) =>
  toCreasedNormals(g.scale(1000, 1000, 1000), angle).scale(0.001, 0.001, 0.001);

const circle = (r: number, x = 0, y = 0) => new THREE.Path().absarc(x, y, r, 0, Math.PI * 2, false);

export const outline = (pts: [number, number][]) => new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));

/** An XY outline extruded `depth` thick, centred on z = 0, with chamfered edges. */
export function plate(shape: THREE.Shape, depth: number, chamfer = depth * 0.08, curve = 10): THREE.BufferGeometry {
  const c = Math.min(chamfer, depth / 3);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: depth - 2 * c, bevelEnabled: c > 0, bevelThickness: c, bevelSize: c, bevelOffset: -c, bevelSegments: 1, curveSegments: curve,
  });
  return creased(g.translate(0, 0, -(depth - 2 * c) / 2));
}

/** Turn an extrusion so its thickness runs along local Y (the outline's +y ends up on −z). */
export const thickAlongY = (g: THREE.BufferGeometry) => g.rotateX(-Math.PI / 2);

/** A spur gear about local Y, centred on y = 0. */
export function spurGear(r: number, teeth: number, thick: number, bore = r * 0.3): THREE.BufferGeometry {
  const s = new THREE.Shape();
  const root = r * (1 - 2.4 / teeth);
  const w = (Math.PI * 2) / teeth;
  for (let i = 0; i < teeth; i++) {
    const a = i * w;
    const pts: [number, number][] = [[root, a], [r, a + w * 0.3], [r, a + w * 0.5], [root, a + w * 0.8]];
    pts.forEach(([rad, ang], j) => {
      const [x, y] = [rad * Math.cos(ang), rad * Math.sin(ang)];
      if (i === 0 && j === 0) s.moveTo(x, y);
      else s.lineTo(x, y);
    });
  }
  s.closePath();
  if (bore > 0) s.holes.push(circle(bore));
  return thickAlongY(plate(s, thick, thick * 0.1, 16));
}

/** A rack along local X, teeth towards `facing` z, `thick` along Y, centred on its pitch line's middle. */
export function rack(length: number, body: number, tooth: number, pitch: number, thick: number, facing: 1 | -1): THREE.BufferGeometry {
  const s = new THREE.Shape();
  const n = Math.max(1, Math.floor(length / pitch));
  const x0 = -length / 2;
  s.moveTo(x0, -body);
  s.lineTo(-x0, -body);
  s.lineTo(-x0, 0);
  for (let i = n - 1; i >= 0; i--) {
    const x = x0 + (length - n * pitch) / 2 + i * pitch;
    s.lineTo(x + pitch * 0.85, 0);
    s.lineTo(x + pitch * 0.65, tooth);
    s.lineTo(x + pitch * 0.35, tooth);
    s.lineTo(x + pitch * 0.15, 0);
  }
  s.lineTo(x0, 0);
  s.closePath();
  return plate(s, thick, thick * 0.08).rotateX(facing * (Math.PI / 2));
}

class Helix extends THREE.Curve<THREE.Vector3> {
  constructor(private r: number, private y0: number, private y1: number, private turns: number) {
    super();
  }

  override getPoint(t: number, target = new THREE.Vector3()): THREE.Vector3 {
    const a = Math.PI * 2 * this.turns * t;
    return target.set(this.r * Math.cos(a), this.y0 + (this.y1 - this.y0) * t, this.r * Math.sin(a));
  }
}

/** A coil spring (or a screw thread) about local Y from y0 to y1. */
export const coil = (r: number, wire: number, y0: number, y1: number, turns: number) =>
  new THREE.TubeGeometry(new Helix(r, y0, y1, turns), Math.ceil(turns * 18), wire, 6);

/** A hex nut about local Y, `across` the flats, centred on y. */
export function hexNut(across: number, thick: number, bore: number, y: number): THREE.BufferGeometry {
  const R = across / Math.sqrt(3);
  const s = new THREE.Shape();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    if (i === 0) s.moveTo(R * Math.cos(a), R * Math.sin(a));
    else s.lineTo(R * Math.cos(a), R * Math.sin(a));
  }
  s.closePath();
  s.holes.push(circle(bore));
  return thickAlongY(plate(s, thick, thick * 0.15, 20)).translate(0, y, 0);
}

/**
 * A finger link in the XY plane from a pin at the origin to one at (0, length), tapering from
 * `root` to `tip` wide with rounded ends; `holes` bores both pin seats.
 */
export function fingerLink(length: number, root: number, tip: number, depth: number, holes = 0): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(root / 2, 0);
  s.lineTo(tip / 2, length);
  s.absarc(0, length, tip / 2, 0, Math.PI, false);
  s.lineTo(-root / 2, 0);
  s.absarc(0, 0, root / 2, Math.PI, Math.PI * 2, false);
  if (holes > 0) s.holes.push(circle(holes), circle(Math.min(holes, tip * 0.3), 0, length));
  return plate(s, depth, depth * 0.08, 14);
}

/** A cutter with `flutes` helical gullets about local Y from y0 to y1, end slightly chamfered. */
export function flutedCutter(r: number, y0: number, y1: number, flutes: number, turns: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  const n = 72;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const gullet = Math.max(0, Math.cos(flutes * a)) ** 3;
    const rad = r * (1 - 0.42 * gullet);
    if (i === 0) s.moveTo(rad * Math.cos(a), rad * Math.sin(a));
    else s.lineTo(rad * Math.cos(a), rad * Math.sin(a));
  }
  s.closePath();
  const len = y1 - y0;
  const c = r * 0.12;
  const g = new THREE.ExtrudeGeometry(s, { depth: len - 2 * c, steps: Math.ceil(turns * 24), bevelEnabled: true, bevelThickness: c, bevelSize: c, bevelOffset: -c, bevelSegments: 1 });
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = (Math.PI * 2 * turns * p.getZ(i)) / len;
    const [x, y] = [p.getX(i), p.getY(i)];
    p.setXY(i, x * Math.cos(t) - y * Math.sin(t), x * Math.sin(t) + y * Math.cos(t));
  }
  g.translate(0, 0, c);
  return creased(thickAlongY(g).translate(0, y0, 0), Math.PI / 4);
}
