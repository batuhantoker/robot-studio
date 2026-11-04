/** Click-to-isolate picking and the tour's camera orbit. */
import * as THREE from 'three';
import type { Viewport } from '../../scene/viewport/viewport';
import type { Store } from '../state/store';
import type { StudioState } from '../state/types';

export function bindPicking(host: HTMLElement, viewport: Viewport, store: Store<StudioState>): void {
  let down: [number, number] | null = null;
  // A pinch lifts its fingers one at a time; neither lift is a tap.
  const pointers = new Set<number>();
  let multi = false;
  // A click on another robot hands it control (the Robots panel does that); it must not isolate a part of it too.
  let onOther = false;
  host.addEventListener('pointerdown', (e) => {
    if (!pointers.size) multi = false;
    pointers.add(e.pointerId);
    if (pointers.size > 1) multi = true;
    down = [e.clientX, e.clientY];
    const key = viewport.bystanderKeys().length ? viewport.robotAt(e.clientX, e.clientY) : null;
    onOther = key !== null && key !== viewport.activeKey;
  });
  const lift = (e: PointerEvent) => pointers.delete(e.pointerId);
  host.addEventListener('pointercancel', lift);
  host.addEventListener('pointerup', (e) => {
    lift(e);
    const slop = e.pointerType === 'touch' ? 10 : 4;
    if (multi || !down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > slop || (e.target as HTMLElement).tagName !== 'CANVAS') return;
    // Driving, a click takes the mouse for looking around; it does not isolate a part.
    if (store.state.mode === 'pilot' || onOther) return;
    const id = viewport.pick(e.clientX, e.clientY);
    store.set({ isolate: id && id !== store.state.isolate ? id : null });
  });
}

/** Turn the camera about the vertical through the orbit target. */
export function orbit(viewport: Viewport, radians: number): void {
  const { camera, controls } = viewport.stage;
  camera.position.sub(controls.target).applyAxisAngle(new THREE.Vector3(0, 0, 1), radians).add(controls.target);
}
