/**
 * On robots with several limbs, each unfocused limb's end-effector marker is a handle: a press focuses
 * that limb, and a drag moves it on the camera-facing plane (its IK target, or the selected stop).
 */
import * as THREE from 'three';
import type { Vec3 } from '../../core/math/linear/vec';
import type { OverlaySet } from '../../scene/overlays';
import type { Viewport } from '../../scene/viewport/viewport';
import type { Store } from '../state/store';
import type { StudioState } from '../state/types';

const SLOP = 3;

interface Press {
  id: number;
  x: number;
  y: number;
  limb: number;
  drag: { plane: THREE.Plane; offset: THREE.Vector3 } | null;
}

export function bindLimbDrag(viewport: Viewport, overlays: OverlaySet, store: Store<StudioState>, move: (limb: number, p: Vec3) => void): void {
  const canvas = viewport.stage.renderer.domElement;
  let press: Press | null = null;
  const hit = (x: number, y: number) => {
    const { mode } = store.state;
    return mode === 'ik' || mode === 'trajectory' ? overlays.effectors.hit(viewport.ray(x, y)) : null;
  };

  // Registered after the stop badges' handler, so a badge on top of a marker still wins.
  canvas.addEventListener('pointerdown', (e) => {
    const limb = e.button === 0 ? hit(e.clientX, e.clientY) : null;
    if (limb === null) return;
    e.stopImmediatePropagation();
    canvas.setPointerCapture(e.pointerId);
    press = { id: e.pointerId, x: e.clientX, y: e.clientY, limb, drag: null };
  }, { capture: true });

  canvas.addEventListener('pointermove', (e) => {
    if (!press) {
      if (hit(e.clientX, e.clientY) !== null) canvas.style.cursor = 'grab';
      return;
    }
    canvas.style.cursor = 'grabbing';
    if (!press.drag) {
      if (Math.hypot(e.clientX - press.x, e.clientY - press.y) < SLOP) return;
      const at = overlays.effectors.at(press.limb);
      store.set({ focus: press.limb });
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(viewport.stage.camera.getWorldDirection(new THREE.Vector3()), at);
      const grab = viewport.ray(press.x, press.y).ray.intersectPlane(plane, new THREE.Vector3()) ?? at.clone();
      press.drag = { plane, offset: at.sub(grab) };
    }
    const p = viewport.ray(e.clientX, e.clientY).ray.intersectPlane(press.drag.plane, new THREE.Vector3());
    if (!p) return;
    const local = overlays.group.worldToLocal(p.add(press.drag.offset));
    move(press.limb, [local.x, local.y, local.z]);
  });

  const release = (e: PointerEvent) => {
    if (!press || e.pointerId !== press.id) return;
    e.stopImmediatePropagation();
    if (!press.drag) store.set({ focus: press.limb });
    canvas.style.cursor = hit(e.clientX, e.clientY) !== null ? 'grab' : '';
    press = null;
  };
  canvas.addEventListener('pointerup', release, { capture: true });
  canvas.addEventListener('pointercancel', release, { capture: true });
}
