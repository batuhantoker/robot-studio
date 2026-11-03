/**
 * What stands around the robot: nothing, a desk it is bolted to, or a small production cell (safety fence,
 * light curtain, conveyor with parcels, hazard tape). Everything is sized from the robot's own radius.
 */
import * as THREE from 'three';

export type EnvironmentId = 'open' | 'desk' | 'cell';

export const ENVIRONMENTS: [EnvironmentId, string][] = [['open', 'Open'], ['desk', 'Desk'], ['cell', 'Work cell']];

const YELLOW = '#f2b51d';

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

// Welded wire mesh: opaque wires, open cells.
const meshAlpha = () => canvasTexture(64, 64, (g) => {
  g.fillStyle = '#000';
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#fff';
  g.fillRect(0, 0, 64, 5);
  g.fillRect(0, 0, 5, 64);
});

const hazard = () => {
  const t = canvasTexture(64, 16, (g) => {
    g.fillStyle = YELLOW;
    g.fillRect(0, 0, 64, 16);
    g.fillStyle = '#17191c';
    for (let x = -16; x < 64; x += 16) {
      g.beginPath();
      g.moveTo(x, 16);
      g.lineTo(x + 8, 16);
      g.lineTo(x + 16, 0);
      g.lineTo(x + 8, 0);
      g.closePath();
      g.fill();
    }
  });
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};

const box = (w: number, d: number, h: number, m: THREE.Material) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, d, h), m);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
};

/** Built once per size; `s` is the robot's bounding radius. */
function buildDesk(s: number, height: number): THREE.Group {
  const g = new THREE.Group();
  const top = new THREE.MeshStandardMaterial({ color: '#d9c4a3', roughness: 0.55, metalness: 0 });
  const steel = new THREE.MeshStandardMaterial({ color: '#4a4f56', roughness: 0.4, metalness: 0.75 });
  const w = 2.9 * s, d = 1.7 * s, t = Math.max(0.025, 0.06 * s);
  const cx = 0.55 * s;
  const slab = box(w, d, t, top);
  slab.position.set(cx, 0, -t / 2);
  g.add(slab);
  const leg = Math.max(0.03, 0.07 * s);
  for (const [x, y] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
    const l = box(leg, leg, height - t, steel);
    l.position.set(cx + x * (w / 2 - leg), y * (d / 2 - leg), -t - (height - t) / 2);
    g.add(l);
  }
  // A rail along the back stiffens the frame and reads as furniture rather than a plank.
  const rail = box(w - 2 * leg, leg * 0.6, leg * 1.4, steel);
  rail.position.set(cx, d / 2 - leg, -t - leg);
  g.add(rail);
  return g;
}

function buildCell(s: number, seeThrough: THREE.Group): THREE.Group {
  const g = new THREE.Group();
  const yellow = new THREE.MeshStandardMaterial({ color: YELLOW, roughness: 0.45, metalness: 0.2 });
  const wire = new THREE.MeshStandardMaterial({
    color: '#2f3338', roughness: 0.5, metalness: 0.6, alphaMap: meshAlpha(), alphaTest: 0.5, side: THREE.DoubleSide,
  });
  const alu = new THREE.MeshStandardMaterial({ color: '#b9bec4', roughness: 0.35, metalness: 0.8 });
  const rubber = new THREE.MeshStandardMaterial({ color: '#25282c', roughness: 0.92, metalness: 0 });
  const card = new THREE.MeshStandardMaterial({ color: '#c39a6b', roughness: 0.85, metalness: 0 });

  const a = 2.3 * s; // half-size of the fenced square
  const h = 2.4 * s; // fence height
  const post = Math.max(0.02, 0.055 * s);
  const cw = 0.5 * s; // conveyor width
  const cy = 1.3 * s; // conveyor centre line (y): behind the robot from the default view, within reach
  const ch = 0.5 * s; // belt height
  const gap = [cy - cw / 2 - post, cy + cw / 2 + post];

  const panel = (x0: number, y0: number, x1: number, y1: number) => {
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len < post * 2) return;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len, h * 0.86), wire);
    const uv = m.geometry.attributes.uv as THREE.BufferAttribute;
    const cells = (len / (h * 0.86)) * 18;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * cells, uv.getY(i) * 18);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, h * 0.07 + (h * 0.86) / 2);
    m.rotation.set(Math.PI / 2, Math.atan2(y1 - y0, x1 - x0), 0, 'ZXY');
    seeThrough.add(m);
    for (const z of [h * 0.07, h * 0.93]) {
      const r = box(len, post * 0.5, post * 0.5, yellow);
      r.position.set((x0 + x1) / 2, (y0 + y1) / 2, z);
      r.rotation.z = Math.atan2(y1 - y0, x1 - x0);
      g.add(r);
    }
  };
  const upright = (x: number, y: number, tall = h) => {
    const p = box(post, post, tall, yellow);
    p.position.set(x, y, tall / 2);
    g.add(p);
  };

  // Fence on the two far sides (-x, +y); the near sides stay open to the camera, as a cutaway would,
  // marked only by tape (a post at the near corner would stand in the default line of sight).
  // The conveyor leaves through a gap in the -x side.
  panel(-a, -a, -a, gap[0]);
  panel(-a, gap[1], -a, a);
  panel(-a, a, a, a);
  for (const [x, y] of [[-a, -a], [-a, gap[0]], [-a, gap[1]], [-a, a], [a, a]]) upright(x, y);

  // Conveyor along x: from outside the fence, past the robot, out of the open side.
  const x0 = -a - 1.3 * s, x1 = a + 0.9 * s;
  const len = x1 - x0, mid = (x0 + x1) / 2;
  const belt = box(len, cw, 0.035 * s, rubber);
  belt.position.set(mid, cy, ch);
  g.add(belt);
  for (const side of [-1, 1]) {
    const rail = box(len, 0.04 * s, 0.13 * s, alu);
    rail.position.set(mid, cy + side * (cw / 2 + 0.02 * s), ch - 0.025 * s);
    g.add(rail);
    for (let i = 0; i <= 4; i++) {
      const leg = box(0.04 * s, 0.04 * s, ch - 0.08 * s, alu);
      leg.position.set(x0 + 0.15 * s + ((len - 0.3 * s) * i) / 4, cy + side * (cw / 2), (ch - 0.08 * s) / 2);
      g.add(leg);
    }
  }
  for (const x of [x0, x1]) {
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * s, 0.05 * s, cw, 24), alu);
    drum.position.set(x, cy, ch - 0.015 * s);
    drum.castShadow = true;
    g.add(drum);
  }
  for (const [x, w, d, t] of [[-2.9, 0.24, 0.22, 0.17], [-1.1, 0.2, 0.26, 0.14], [0.8, 0.26, 0.2, 0.18], [2.6, 0.22, 0.24, 0.15]]) {
    const p = box(w * s, d * s, t * s, card);
    p.position.set(x * s, cy + (x > 0 ? 0.03 : -0.04) * s, ch + 0.018 * s + (t * s) / 2);
    p.rotation.z = x * 0.06;
    g.add(p);
  }

  // Hazard tape around the cell.
  const tape = new THREE.MeshStandardMaterial({ map: hazard(), roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -4 });
  const tw = 0.1 * s;
  for (const [x, y, l, rot] of [[0, -a - tw, 2 * a + 2 * tw, 0], [0, a + tw, 2 * a + 2 * tw, 0], [-a - tw, 0, 2 * a, Math.PI / 2], [a + tw, 0, 2 * a, Math.PI / 2]] as const) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(l, tw), tape.clone());
    const map = (m.material as THREE.MeshStandardMaterial).map!.clone();
    map.repeat.set(l / (tw * 4), 1);
    (m.material as THREE.MeshStandardMaterial).map = map;
    m.position.set(x, y, 0.0005);
    m.rotation.z = rot;
    m.receiveShadow = true;
    g.add(m);
  }
  return g;
}

export interface Environment {
  group: THREE.Group;
  /** Wire mesh: AO would treat it as a solid wall and shade what is seen through it. */
  seeThrough: THREE.Group;
  id: EnvironmentId;
  /** How far below the robot's base the floor sits (a desk's height). */
  drop: number;
  /** Half-width of the ground the setting covers, for the shadow frustum. */
  extent: number;
  fit(radius: number, floorZ: number): void;
  apply(id: EnvironmentId): void;
}

export function createEnvironment(): Environment {
  const group = new THREE.Group();
  const seeThrough = new THREE.Group();
  let id: EnvironmentId = 'open';
  let radius = 0.5;
  let floorZ = 0;
  const env: Environment = {
    group,
    seeThrough,
    id,
    drop: 0,
    extent: 0,
    fit(r, z) {
      radius = Math.max(r, 0.05);
      floorZ = z;
      rebuild();
    },
    apply(next) {
      id = env.id = next;
      rebuild();
    },
  };
  const rebuild = () => {
    for (const c of [...group.children, ...seeThrough.children]) {
      c.removeFromParent();
      c.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    }
    env.drop = id === 'desk' ? Math.min(Math.max(1.6 * radius, 0.45), 0.78) : 0;
    env.extent = id === 'cell' ? 3.7 * radius : id === 'desk' ? 2.2 * radius : 0;
    const built = id === 'desk' ? buildDesk(radius, env.drop) : id === 'cell' ? buildCell(radius, seeThrough) : null;
    if (built) group.add(built);
    group.position.z = seeThrough.position.z = floorZ;
  };
  return env;
}
