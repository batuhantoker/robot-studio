/** Shared parts for the settings around the robot: textures, materials, boxes, a stack light, and motion curves. */
import * as THREE from 'three';

export const YELLOW = '#f2b51d';

/**
 * How the robot meets its setting. A standing robot (a humanoid) works at a bench in front of it rather
 * than being bolted on top: `hand` is the work-surface height above the floor (m), `front` how far ahead
 * of the base the bench edge sits (m), and `facing` the heading the robot faces (rad, +x is 0).
 */
export interface Stance {
  standing: boolean;
  hand: number;
  front?: number;
  facing?: number;
}

/** A setting as built for one robot size; every length is a multiple of the robot's radius `s`. */
export interface Scenery {
  group: THREE.Group;
  /** Wire mesh and glass: ambient occlusion would shade what is seen through them as if they were solid. */
  seeThrough?: THREE.Object3D[];
  /** Poses the moving parts at scenery time `t` (s). A pure function of `t`, so rebuilds and video frames agree. */
  pose?(t: number): void;
}

/**
 * A bench built around a bolted robot (top at z = 0, front edge along y = `edge`), turned to face a
 * standing robot instead: the front edge `stance.front` ahead of it and the top at `stance.hand`.
 */
export function standBefore(sc: Scenery, edge: number, stance: Stance | undefined): Scenery {
  if (!stance?.standing) return sc;
  const place = <T extends THREE.Object3D>(o: T): T => {
    o.rotation.z = -Math.PI / 2;
    o.position.set((stance.front ?? 0) - edge, 0, stance.hand);
    return o;
  };
  const group = new THREE.Group();
  group.add(place(sc.group));
  const seeThrough = sc.seeThrough?.length ? [place(new THREE.Group().add(...sc.seeThrough))] : undefined;
  return { ...sc, group, seeThrough };
}

export function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, color = false): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export const paint = (color: string, roughness = 0.6, metalness = 0, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });

export const glass = (tint = '#d7e7ef', opacity = 0.16) =>
  new THREE.MeshStandardMaterial({ color: tint, roughness: 0.04, metalness: 0, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });

const shade = <T extends THREE.Mesh>(m: T): T => {
  m.castShadow = m.receiveShadow = true;
  return m;
};

/** A box centred on the origin. */
export const box = (w: number, d: number, h: number, m: THREE.Material) => shade(new THREE.Mesh(new THREE.BoxGeometry(w, d, h), m));

/** A box standing with its base centred on (x, y, z), added to `parent`. */
export function block(parent: THREE.Object3D, w: number, d: number, h: number, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const b = box(w, d, h, m);
  b.position.set(x, y, z + h / 2);
  parent.add(b);
  return b;
}

/** A cylinder along z, centred on the origin. */
export const cylinder = (r: number, h: number, m: THREE.Material, segments = 32, top = r) =>
  shade(new THREE.Mesh(new THREE.CylinderGeometry(top, r, h, segments).rotateX(Math.PI / 2), m));

/** Scenery that moves: a click on it does not set a pick or place spot. */
export const moving = <T extends THREE.Object3D>(o: T): T => ((o.userData.moving = true), o);

/** A loose object a hand or gripper can take away; `size` is its full extent (m). */
export const prop = <T extends THREE.Object3D>(o: T, label: string, size: [number, number, number]): T =>
  ((o.userData.prop = { label, size }), o);

export type PartKind = 'carton' | 'block' | 'can';

/** A loose part to pick up, standing on `z` at (x, y) of `parent`: a carton, a machined block or a can, sized from `s`. */
export function loosePart(parent: THREE.Object3D, s: number, kind: PartKind, color: string, x: number, y: number, z: number, yaw = 0): THREE.Mesh {
  const size: [number, number, number] = kind === 'carton' ? [0.16 * s, 0.12 * s, 0.1 * s] : kind === 'block' ? [0.09 * s, 0.09 * s, 0.09 * s] : [0.075 * s, 0.075 * s, 0.11 * s];
  const m = kind === 'can'
    ? cylinder(size[0] / 2, size[2], paint(color, 0.3, 0.6), 28)
    : box(size[0], size[1], size[2], paint(color, kind === 'carton' ? 0.85 : 0.45, kind === 'block' ? 0.1 : 0));
  m.position.set(x, y, z + size[2] / 2);
  m.rotation.z = yaw;
  parent.add(m);
  return prop(m, kind === 'carton' ? 'Carton' : kind === 'block' ? 'Block' : 'Can', size);
}

/** A small stand-alone table with its top at `top`, for parts to wait on. */
export function sideTable(parent: THREE.Object3D, s: number, x: number, y: number, top: number): void {
  const w = 0.5 * s, d = 0.42 * s, t = 0.025 * s, leg = 0.03 * s;
  const frame = paint('#59626e', 0.45, 0.5);
  block(parent, w, d, t, paint('#d9dde2', 0.35, 0.2), x, y, top - t);
  for (const [a, b] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) block(parent, leg, leg, top - t, frame, x + a * (w / 2 - leg), y + b * (d / 2 - leg));
}

/** Paint on the floor: not a surface a spot stands on. */
const marking = <T extends THREE.Object3D>(o: T): T => ((o.userData.marking = true), o);

/** Diagonal yellow and black stripes, four tape widths per repeat. */
export const hazardTexture = () => canvasTexture(64, 16, (g) => {
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
}, true);

/** A strip of floor marking from (x0, y0) to (x1, y1); its UVs repeat the texture once per four widths. */
export function floorStrip(parent: THREE.Object3D, m: THREE.Material, x0: number, y0: number, x1: number, y1: number, width: number): THREE.Mesh {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const geo = new THREE.PlaneGeometry(len, width);
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setX(i, (uv.getX(i) * len) / (width * 4));
  const strip = marking(new THREE.Mesh(geo, m));
  strip.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0.0005);
  strip.rotation.z = Math.atan2(y1 - y0, x1 - x0);
  strip.receiveShadow = true;
  parent.add(strip);
  return strip;
}

export const tapeMaterial = (map: THREE.Texture | null, color = '#ffffff') =>
  new THREE.MeshStandardMaterial({ map, color, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -4 });

export const clamp01 = (u: number) => Math.min(Math.max(u, 0), 1);
/** Smoothstep: starts and stops at rest. */
export const ease = (u: number) => {
  const x = clamp01(u);
  return x * x * (3 - 2 * x);
};
/** Time into a repeating cycle of `period` seconds. */
export const cycle = (t: number, period: number) => ((t % period) + period) % period;

/** Angle turned by a rotor that ramps up over `up` s, runs `run` s at `peak` rad/s, ramps down over `down` s, then rests `rest` s. */
export function spin(t: number, peak: number, up: number, run: number, down: number, rest: number): number {
  const period = up + run + down + rest;
  const turn = peak * (up / 2 + run + down / 2);
  const x = cycle(t, period);
  let a: number;
  if (x < up) a = (peak * x * x) / (2 * up);
  else if (x < up + run) a = peak * (up / 2 + x - up);
  else if (x < up + run + down) {
    const u = x - up - run;
    a = peak * (up / 2 + run + u - (u * u) / (2 * down));
  } else a = turn;
  return Math.floor(t / period) * turn + a;
}

export interface StackLight {
  group: THREE.Group;
  /** Brightness of each lamp, 0..1. */
  set(red: number, amber: number, green: number): void;
}

/** An andon tower: green, amber, red from the bottom up, on a short pole. Base at the origin. */
export function stackLight(s: number): StackLight {
  const group = new THREE.Group();
  const r = 0.04 * s, seg = 0.07 * s, pole = 0.1 * s;
  const dark = paint('#26292d', 0.5, 0.5);
  const stem = cylinder(r * 0.32, pole, dark, 12);
  stem.position.z = pole / 2;
  group.add(stem);
  const lamps = (['#2fb35a', '#f4a51c', '#e5352b'] as const).map((c, i) => {
    const m = paint(c, 0.3, 0, { emissive: c, emissiveIntensity: 0 });
    const lamp = cylinder(r, seg * 0.94, m, 24);
    lamp.position.z = pole + seg * (i + 0.5);
    group.add(lamp);
    return { m, on: new THREE.Color(c), off: new THREE.Color(c).multiplyScalar(0.32) };
  });
  const cap = cylinder(r, seg * 0.35, dark, 24);
  cap.position.z = pole + seg * 3 + seg * 0.175;
  group.add(cap);
  return {
    group,
    set(red, amber, green) {
      [green, amber, red].forEach((v, i) => {
        const l = lamps[i];
        l.m.color.copy(l.off).lerp(l.on, v);
        l.m.emissiveIntensity = 1.6 * v;
      });
    },
  };
}

/** A blink that is on for `duty` of each `period`. */
export const blink = (t: number, period: number, duty = 0.5) => (cycle(t, period) < period * duty ? 1 : 0);

/** Seeded random numbers, so a setting looks the same every time it is built. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** Frees what a built setting holds on the GPU. */
export function dispose(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    mesh.geometry?.dispose();
    const mats = mesh.material ? ([] as THREE.Material[]).concat(mesh.material) : [];
    for (const m of mats) {
      for (const v of Object.values(m)) if (v instanceof THREE.Texture) v.dispose();
      m.dispose();
    }
    if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
  });
}
