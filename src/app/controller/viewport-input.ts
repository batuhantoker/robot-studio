/** Click-to-isolate picking and the tour's camera orbit. */
import * as THREE from 'three';
import type { Viewport } from '../../scene/viewport/viewport';
import type { Store } from '../state/store';
import type { StudioState } from '../state/types';

export function bindPicking(host: HTMLElement, viewport: Viewport, store: Store<StudioState>): void {
  let down: [number, number] | null = null;
  host.addEventListener('pointerdown', (e) => (down = [e.clientX, e.clientY]));
  host.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4 || (e.target as HTMLElement).tagName !== 'CANVAS') return;
    const id = viewport.pick(e.clientX, e.clientY);
    store.set({ isolate: id && id !== store.state.isolate ? id : null });
  });
}

/** Turn the camera about the vertical through the orbit target. */
export function orbit(viewport: Viewport, radians: number): void {
  const { camera, controls } = viewport.stage;
  camera.position.sub(controls.target).applyAxisAngle(new THREE.Vector3(0, 0, 1), radians).add(controls.target);
}
