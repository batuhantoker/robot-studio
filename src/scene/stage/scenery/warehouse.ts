/**
 * A warehouse aisle: pallet racking on the two far sides and two mobile robots shuttling totes along
 * painted lanes, turning in place at each end.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { type Scenery, type Stance, YELLOW, block, blink, cycle, cylinder, ease, floorStrip, hazardTexture, moving, paint, seeded, tapeMaterial } from './kit';

const Z = new THREE.Vector3(0, 0, 1);
const X = new THREE.Vector3(1, 0, 0);

/** Many boxes as one draw call. */
class Boxes {
  private readonly items: { m: THREE.Matrix4; c?: THREE.Color }[] = [];

  /** A box with its base centred on (x, y, z). */
  add(w: number, d: number, h: number, x: number, y: number, z: number, c?: THREE.Color, yaw = 0): void {
    this.matrix(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z + h / 2), new THREE.Quaternion().setFromAxisAngle(Z, yaw), new THREE.Vector3(w, d, h)), c);
  }

  matrix(m: THREE.Matrix4, c?: THREE.Color): void {
    this.items.push({ m, c });
  }

  build(material: THREE.Material): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, this.items.length);
    this.items.forEach(({ m, c }, i) => {
      mesh.setMatrixAt(i, m);
      if (c) mesh.setColorAt(i, c);
    });
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    return mesh;
  }
}

/** A run of racking along +x from the origin, `bays` wide, front face at y = 0 and depth toward +y. */
function racking(s: number, bays: number, rand: () => number): THREE.Group {
  const bay = 1.7 * s, depth = 0.55 * s, tall = 2.45 * s, post = 0.06 * s;
  const levels = [0, 0.8 * s, 1.6 * s];
  const posts = new Boxes(), beams = new Boxes(), braces = new Boxes(), pallets = new Boxes(), cartons = new Boxes(), totes = new Boxes();
  for (let i = 0; i <= bays; i++) {
    const x = i * bay;
    for (const y of [post / 2, depth - post / 2]) posts.add(post, post, tall, x, y, 0);
    const run = depth - post, rise = 0.44 * s, l = Math.hypot(run, rise);
    for (let k = 0; k < 5; k++) {
      const tilt = (k % 2 ? -1 : 1) * Math.atan2(rise, run);
      braces.matrix(new THREE.Matrix4().compose(
        new THREE.Vector3(x, depth / 2, 0.15 * s + (k + 0.5) * rise),
        new THREE.Quaternion().setFromAxisAngle(X, tilt),
        new THREE.Vector3(post * 0.35, l, post * 0.35)));
    }
  }
  for (let b = 0; b < bays; b++) {
    const cx = (b + 0.5) * bay;
    for (const z of [...levels.slice(1), tall]) {
      for (const y of [post * 0.6, depth - post * 0.6]) beams.add(bay - post, post * 0.6, 0.1 * s, cx, y, z - 0.1 * s);
    }
    for (const z of levels) {
      for (const side of [-1, 1]) {
        if (rand() < 0.12) continue;
        const px = cx + side * 0.41 * s, py = depth / 2;
        pallets.add(0.7 * s, 0.5 * s, 0.022 * s, px, py, z + 0.048 * s);
        for (const ry of [-0.21, 0, 0.21]) pallets.add(0.7 * s, 0.06 * s, 0.048 * s, px, py + ry * s, z);
        const top = z + 0.07 * s;
        if (rand() < 0.62) {
          const high = rand() < 0.5 ? 2 : 1;
          for (let k = 0; k < high; k++) {
            for (const [ox, oy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
              if (k === 1 && rand() < 0.3) continue;
              const tone = new THREE.Color().setHSL(0.08 + rand() * 0.02, 0.36 + rand() * 0.1, 0.52 + rand() * 0.1);
              cartons.add(0.32 * s, 0.22 * s, 0.24 * s, px + ox * 0.17 * s, py + oy * 0.12 * s, top + k * 0.245 * s, tone, (rand() - 0.5) * 0.05);
            }
          }
        } else {
          const tone = new THREE.Color(rand() < 0.5 ? '#2f6fd0' : '#59626e');
          for (let k = 0; k < 3; k++) totes.add(0.6 * s, 0.4 * s, 0.17 * s, px, py, top + k * 0.175 * s, tone);
        }
      }
    }
  }
  const blue = paint('#2c5aa0', 0.45, 0.35);
  const g = new THREE.Group();
  g.add(posts.build(blue), beams.build(paint('#e8742c', 0.45, 0.25)), braces.build(blue), pallets.build(paint('#b8895a', 0.8)),
    cartons.build(paint('#ffffff', 0.85)), totes.build(paint('#ffffff', 0.55)));
  return g;
}

interface Amr {
  group: THREE.Group;
  /** `turning` 0..1 while it pivots, for the light ring. */
  pose(x: number, y: number, heading: number, t: number, state: 'drive' | 'dwell' | 'turn'): void;
}

/** A low mobile robot with a light ring, a spinning lidar at the front, and a tote on its lift deck. */
function amr(s: number, tote: string): Amr {
  const group = moving(new THREE.Group());
  const L = 0.62 * s, W = 0.44 * s, H = 0.13 * s, clear = 0.022 * s;
  const body = new THREE.Mesh(new RoundedBoxGeometry(L, W, H, 3, 0.03 * s), paint('#3a3f46', 0.5, 0.3));
  body.position.z = clear + H / 2;
  body.castShadow = body.receiveShadow = true;
  const ringMat = paint('#7fe3ff', 0.4, 0, { emissive: '#7fe3ff', emissiveIntensity: 1 });
  const ring = new THREE.Mesh(new RoundedBoxGeometry(L * 1.012, W * 1.016, 0.014 * s, 3, 0.03 * s), ringMat);
  ring.position.z = clear + 0.03 * s;
  const deck = block(group, L * 0.8, W * 0.86, 0.016 * s, paint('#c9ced5', 0.35, 0.7), -0.02 * s, 0, clear + H);
  for (const [x, y] of [[0.19, 0.2], [-0.19, 0.2], [0.19, -0.2], [-0.19, -0.2]]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.035 * s, 0.035 * s, 0.03 * s, 20), paint('#1b1d20', 0.9));
    wheel.position.set(x * s, y * s, 0.035 * s);
    group.add(wheel);
  }
  group.add(body, ring, deck);
  const lidarBase = cylinder(0.035 * s, 0.03 * s, paint('#1f2226', 0.5, 0.4), 24);
  lidarBase.position.set(L * 0.36, 0, clear + H + 0.015 * s);
  const head = new THREE.Group();
  head.position.set(L * 0.36, 0, clear + H + 0.03 * s);
  const dome = cylinder(0.03 * s, 0.028 * s, paint('#2a2e33', 0.3, 0.5), 24);
  dome.position.z = 0.014 * s;
  const slot = block(head, 0.012 * s, 0.03 * s, 0.012 * s, paint('#6b0f16', 0.15, 0, { emissive: '#d6182b', emissiveIntensity: 0.6 }), 0.026 * s, 0, 0.007 * s);
  head.add(dome, slot);
  group.add(lidarBase, head);
  openTote(group, s, tote, -0.04 * s, 0, clear + H + 0.016 * s);

  const cyan = new THREE.Color('#7fe3ff'), amber = new THREE.Color('#ffb02e'), green = new THREE.Color('#5fe08a');
  return {
    group,
    pose(x, y, heading, t, state) {
      group.position.set(x, y, 0);
      group.rotation.z = heading;
      head.rotation.z = t * 2 * Math.PI * 1.6;
      const c = state === 'turn' ? amber : state === 'dwell' ? green : cyan;
      ringMat.color.copy(c);
      ringMat.emissive.copy(c);
      ringMat.emissiveIntensity = state === 'turn' ? 0.5 + 0.9 * blink(t, 0.5) : 1;
    },
  };
}

/** An open plastic tote with a carton inside, its base centred on (x, y, z). */
function openTote(parent: THREE.Object3D, s: number, color: string, x: number, y: number, z: number, yaw = 0): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.z = yaw;
  parent.add(g);
  const m = paint(color, 0.55);
  block(g, 0.42 * s, 0.32 * s, 0.012 * s, m);
  for (const [w, d, wx, wy] of [[0.42, 0.012, 0, 0.154], [0.42, 0.012, 0, -0.154], [0.012, 0.32, 0.204, 0], [0.012, 0.32, -0.204, 0]]) {
    block(g, w * s, d * s, 0.15 * s, m, wx * s, wy * s);
  }
  block(g, 0.3 * s, 0.22 * s, 0.11 * s, paint('#c39a6b', 0.85), -0.01 * s, 0.01 * s, 0.012 * s);
  return g;
}

/** A packing table whose top is at `hand`, its near edge `front` ahead of a standing robot, with totes to pick from. */
function station(parent: THREE.Object3D, s: number, hand: number, front: number): void {
  const depth = 0.62 * s, width = 1.15 * s, t = 0.03 * s;
  const frame = paint('#59626e', 0.45, 0.5);
  const cx = front + depth / 2;
  block(parent, depth, width, t, paint('#d9dde2', 0.35, 0.2), cx, 0, hand - t);
  block(parent, depth * 0.9, width * 0.94, 0.015 * s, frame, cx, 0, 0.18 * s);
  for (const [x, y] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
    block(parent, 0.035 * s, 0.035 * s, hand - t, frame, cx + x * (depth / 2 - 0.03 * s), y * (width / 2 - 0.03 * s));
  }
  // One tote at the far left end keeps the rest of the top free to work on; spares wait on the shelf below.
  openTote(parent, s, '#59626e', front + depth - 0.18 * s, width / 2 - 0.23 * s, hand, Math.PI / 2);
  openTote(parent, s, '#2f6fd0', cx, -0.27 * s, 0.195 * s, Math.PI / 2);
  openTote(parent, s, '#2f6fd0', cx, 0.27 * s, 0.195 * s, Math.PI / 2);
}

/** Back and forth along a lane of `length`: drive, dwell, pivot half a turn, and back. */
function shuttle(t: number, length: number, speed: number, dwell: number, turn: number) {
  const drive = (1.5 * length) / speed;
  const leg = drive + dwell + turn;
  const x = cycle(t, 2 * leg);
  const back = x >= leg;
  const u = back ? x - leg : x;
  const s = u < drive ? ease(u / drive) : 1;
  const state: 'drive' | 'dwell' | 'turn' = u < drive ? 'drive' : u < drive + dwell ? 'dwell' : 'turn';
  const pivot = state === 'turn' ? ease((u - drive - dwell) / turn) : 0;
  return { along: back ? length * (1 - s) : length * s, heading: (back ? Math.PI : 0) + Math.PI * pivot, state };
}

export function buildWarehouse(s: number, _drop = 0, stance?: Stance): Scenery {
  const group = new THREE.Group();
  const rand = seeded(11);

  // Back run along +y and a side run along -x, leaving a cross aisle at the corner.
  const back = racking(s, 3, rand);
  back.position.set(-2.95 * s, 2.3 * s, 0);
  const side = racking(s, 2, rand);
  side.rotation.z = Math.PI / 2;
  side.position.set(-2.95 * s, -1.5 * s, 0);
  group.add(back, side);

  const line = paint(YELLOW, 0.7, 0, { polygonOffset: true, polygonOffsetFactor: -4 });
  const lw = 0.035 * s;
  const laneA = { y: 1.68 * s, x0: -2.3 * s, x1: 2.3 * s };
  const laneB = { x: -2.32 * s, y0: -1.45 * s, y1: 0.8 * s };
  for (const o of [-1, 1]) {
    floorStrip(group, line, laneA.x0 - 0.5 * s, laneA.y + o * 0.32 * s, laneA.x1 + 0.5 * s, laneA.y + o * 0.32 * s, lw);
    floorStrip(group, line, laneB.x + o * 0.32 * s, laneB.y0 - 0.5 * s, laneB.x + o * 0.32 * s, Math.min(laneB.y1 + 0.5 * s, laneA.y - 0.36 * s), lw);
  }
  const hatch = tapeMaterial(hazardTexture());
  floorStrip(group, hatch, laneA.x1 + 0.2 * s, laneA.y - 0.28 * s, laneA.x1 + 0.2 * s, laneA.y + 0.28 * s, 0.1 * s);
  floorStrip(group, hatch, laneB.x - 0.28 * s, laneB.y0 - 0.2 * s, laneB.x + 0.28 * s, laneB.y0 - 0.2 * s, 0.1 * s);

  const a = amr(s, '#2f6fd0'), b = amr(s, '#e0782e');
  group.add(a.group, b.group);
  // A standing robot picks at a station in front of it; a bolted arm works the floor around it.
  if (stance?.standing) station(group, s, stance.hand, stance.front ?? 0.3 * s);

  return {
    group,
    pose(t) {
      const ra = shuttle(t, laneA.x1 - laneA.x0, 0.42 * s, 1.6, 1.4);
      a.pose(laneA.x0 + ra.along, laneA.y, ra.heading, t, ra.state);
      const rb = shuttle(t + 3.1, laneB.y1 - laneB.y0, 0.36 * s, 2.2, 1.4);
      b.pose(laneB.x, laneB.y0 + rb.along, Math.PI / 2 + rb.heading, t, rb.state);
    },
  };
}
