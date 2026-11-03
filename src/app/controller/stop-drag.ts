/**
 * Stop badges are handles: press one and drag, and the stop's tool point follows the pointer on the
 * camera-facing plane through it. A press without a drag selects (on a shared badge, the next stop).
 */
import * as THREE from 'three';
import type { Vec3 } from '../../core/math/linear/vec';
import type { OverlaySet } from '../../scene/overlays';
import type { Viewport } from '../../scene/viewport/viewport';
import type { Store } from '../state/store';
import type { StudioState } from '../state/types';
import { selectStop } from './stops';

const SLOP = 3;
/** How far from a badge a fingertip may land and still grab it, px. */
const FINGER = 24;

interface Press {
  id: number;
  x: number;
  y: number;
  stops: number[];
  drag: { i: number; plane: THREE.Plane; offset: THREE.Vector3 } | null;
}

export function bindStopDrag(viewport: Viewport, overlays: OverlaySet, store: Store<StudioState>, tips: () => Vec3[], move: (i: number, p: Vec3) => void): void {
  const canvas = viewport.stage.renderer.domElement;
  let press: Press | null = null;
  const toScreen = (local: THREE.Vector3): [number, number] | null => {
    const v = overlays.group.localToWorld(local.clone()).project(viewport.stage.camera);
    if (v.z > 1) return null;
    const r = canvas.getBoundingClientRect();
    return [r.left + ((v.x + 1) / 2) * r.width, r.top + ((1 - v.y) / 2) * r.height];
  };
  const hit = (x: number, y: number, finger = false) => {
    if (store.state.mode !== 'trajectory') return null;
    return overlays.stops.hit(viewport.ray(x, y)) ?? (finger ? overlays.stops.near(toScreen, x, y, FINGER) : null);
  };

  canvas.addEventListener('pointerdown', (e) => {
    const stops = e.button === 0 ? hit(e.clientX, e.clientY, e.pointerType === 'touch') : null;
    if (!stops) return;
    // A press on a badge is ours alone: orbit, the gizmo and click-to-isolate must not see it.
    e.stopImmediatePropagation();
    canvas.setPointerCapture(e.pointerId);
    press = { id: e.pointerId, x: e.clientX, y: e.clientY, stops, drag: null };
  }, { capture: true });

  canvas.addEventListener('pointermove', (e) => {
    if (!press) {
      canvas.style.cursor = hit(e.clientX, e.clientY) ? 'grab' : '';
      return;
    }
    if (!press.drag) {
      if (Math.hypot(e.clientX - press.x, e.clientY - press.y) < SLOP) return;
      const sel = store.state.selectedStop;
      const i = sel !== null && press.stops.includes(sel) ? sel : press.stops[0];
      selectStop(store, i);
      const at = overlays.group.localToWorld(new THREE.Vector3(...tips()[i]));
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(viewport.stage.camera.getWorldDirection(new THREE.Vector3()), at);
      const grab = viewport.ray(press.x, press.y).ray.intersectPlane(plane, new THREE.Vector3()) ?? at.clone();
      press.drag = { i, plane, offset: at.sub(grab) };
      canvas.style.cursor = 'grabbing';
    }
    // Esc or Delete mid-drag lets go; keep driving only the stop that was grabbed.
    if (store.state.selectedStop !== press.drag.i) return;
    const p = viewport.ray(e.clientX, e.clientY).ray.intersectPlane(press.drag.plane, new THREE.Vector3());
    if (!p) return;
    const local = overlays.group.worldToLocal(p.add(press.drag.offset));
    move(press.drag.i, [local.x, local.y, local.z]);
  });

  const release = (e: PointerEvent) => {
    if (!press || e.pointerId !== press.id) return;
    e.stopImmediatePropagation();
    if (!press.drag) {
      const sel = store.state.selectedStop;
      const at = sel === null ? -1 : press.stops.indexOf(sel);
      selectStop(store, press.stops[(at + 1) % press.stops.length]);
    }
    canvas.style.cursor = hit(e.clientX, e.clientY) ? 'grab' : '';
    press = null;
  };
  canvas.addEventListener('pointerup', release, { capture: true });
  canvas.addEventListener('pointercancel', release, { capture: true });
}
