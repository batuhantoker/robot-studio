/**
 * Keeps an opening robot in frame with the lens alone. The camera and its orbit target stay the user's,
 * so closing it restores the view exactly, and nothing here can fight an orbit, a tour or the idle drift.
 */
import * as THREE from 'three';

export interface Lens {
  zoom: number;
  /** How far the scene is raised on screen, in halves of its height. */
  lift: number;
}

export const OPEN_LENS: Lens = { zoom: 1, lift: 0 };

/** Share of the uncovered view an opened robot may fill. */
const FILL = 0.86;
/** Measured all the way round, so an orbit or a tour's slow turn cannot carry it out of frame. */
const TURNS = 8;

interface Span {
  across: number;
  high: number;
  /** Height of its middle on screen, as seen now. */
  middle: number;
}

function spanOf(box: THREE.Box3, camera: THREE.PerspectiveCamera, pivot: THREE.Vector3, turns: number): Span {
  const tanY = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const tanX = tanY * camera.aspect;
  const p = new THREE.Vector3();
  const up = new THREE.Vector3(0, 0, 1);
  let across = 0, high = 0, middle = 0;
  for (let k = 0; k < turns; k++) {
    let lo = Infinity, hi = -Infinity;
    for (let c = 0; c < 8; c++) {
      p.set(c & 1 ? box.max.x : box.min.x, c & 2 ? box.max.y : box.min.y, c & 4 ? box.max.z : box.min.z);
      p.sub(pivot).applyAxisAngle(up, (k / turns) * Math.PI * 2).add(pivot).applyMatrix4(camera.matrixWorldInverse);
      const depth = Math.max(-p.z, camera.near);
      across = Math.max(across, Math.abs(p.x / (depth * tanX)));
      const y = p.y / (depth * tanY);
      lo = Math.min(lo, y);
      hi = Math.max(hi, y);
    }
    high = Math.max(high, (hi - lo) / 2);
    if (k === 0) middle = (hi + lo) / 2;
  }
  return { across, high, middle };
}

/**
 * The lens for a robot opened out to `now`, with the camera's lens at rest. `rest` is what it filled before opening:
 * a user zoomed in on a detail stays as close as they were, and it never zooms in past where they left it.
 */
export function fitLens(rest: THREE.Box3 | null, now: THREE.Box3, camera: THREE.PerspectiveCamera, pivot: THREE.Vector3, room: { x: number; y: number }): Lens {
  const fill = (s: Span) => Math.max(s.across / room.x, s.high / room.y);
  const was = rest && spanOf(rest, camera, pivot, 1);
  const closeUp = !!was && fill(was) > FILL;
  const a = spanOf(now, camera, pivot, closeUp ? 1 : TURNS);
  const zoom = Math.min(1, (closeUp ? fill(was) : FILL) / fill(a));
  return { zoom, lift: (was?.middle ?? 0) - spanOf(now, camera, pivot, 1).middle * zoom };
}
