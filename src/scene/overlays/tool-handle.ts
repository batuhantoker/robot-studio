/** The grab point of an arm in Pilot: a ring round the tool that stays one size on screen, and a dot where the tool is asked to go. */
import * as THREE from 'three';
import { PALETTE } from '../stage/palette';

const RING_PX = 20;
const DOT_PX = 5;

const flat = (color: string, opacity: number) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthTest: false, depthWrite: false, side: THREE.DoubleSide });

export class ToolHandle {
  readonly group = new THREE.Group();
  private readonly ring = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 48), flat(PALETTE.ink, 0.75));
  private readonly dot = new THREE.Mesh(new THREE.CircleGeometry(1, 24), flat(PALETTE.accent, 0.9));
  private readonly facing = new THREE.Quaternion();
  private readonly world = new THREE.Vector3();

  constructor() {
    this.ring.renderOrder = this.dot.renderOrder = 22;
    this.group.add(this.ring, this.dot);
  }

  /** Both points in the parent's frame; `hot` when grabbed or stopped. */
  place(tool: THREE.Vector3, goal: THREE.Vector3 | null, camera: THREE.PerspectiveCamera, height: number, hot: boolean): void {
    const parent = this.group.parent;
    if (!parent) return;
    const perPixel = (p: THREE.Vector3) => (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * parent.localToWorld(this.world.copy(p)).distanceTo(camera.position)) / Math.max(height, 1);
    this.facing.copy(parent.getWorldQuaternion(new THREE.Quaternion())).invert().multiply(camera.quaternion);
    this.ring.position.copy(tool);
    this.ring.quaternion.copy(this.facing);
    this.ring.scale.setScalar(RING_PX * perPixel(tool));
    (this.ring.material as THREE.MeshBasicMaterial).color.set(hot ? PALETTE.accent : PALETTE.ink);
    this.dot.visible = !!goal;
    if (goal) {
      this.dot.position.copy(goal);
      this.dot.quaternion.copy(this.facing);
      this.dot.scale.setScalar(DOT_PX * perPixel(goal));
    }
  }
}
