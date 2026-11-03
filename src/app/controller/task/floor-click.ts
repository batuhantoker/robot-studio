/** A click on the floor or on top of the scenery (not a drag, not on the robot) moves the selected pick or place spot there. */
import * as THREE from 'three';
import type { Vec3 } from '../../../core/math/linear/vec';
import type { Stage } from '../../../scene/stage/renderer';
import type { TaskSetup } from './setup';

export function bindFloorClicks(stage: Stage, active: () => TaskSetup | null, robot: () => THREE.Object3D | null,
  sceneryHit: (ray: THREE.Ray) => { point: THREE.Vector3; top: boolean } | null, onPick: (p: Vec3) => void): void {
  const dom = stage.renderer.domElement;
  const ray = new THREE.Raycaster();
  let down: [number, number] | null = null;
  dom.addEventListener('pointerdown', (e) => (down = [e.clientX, e.clientY]));
  dom.addEventListener('pointerup', (e) => {
    const t = active();
    const click = down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 4;
    down = null;
    if (!t || !click) return;
    const r = dom.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), stage.camera);
    const floor = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -t.surfaceZ), new THREE.Vector3());
    const first = sceneryHit(ray.ray);
    const origin = ray.ray.origin;
    const blocking = !!first && (!floor || first.point.distanceTo(origin) < floor.distanceTo(origin));
    // The side of a belt or a machine hides the floor behind it: nothing to set a spot on there.
    if (blocking && !first.top) return;
    const onTop = blocking && first.point.z >= t.floorZ;
    const hit = onTop ? first.point : floor;
    // A deliberate click on a bench or belt a little out of reach still lands, so the plan can say why it fails.
    if (!hit || Math.hypot(hit.x - t.base[0], hit.y - t.base[1]) > t.radius * (onTop ? 2 : 1.2)) return;
    const body = robot();
    const onRobot = body ? ray.intersectObject(body, true)[0] : undefined;
    if (onRobot && onRobot.distance < ray.ray.origin.distanceTo(hit)) return;
    onPick([hit.x, hit.y, hit.z]);
  });
}
