/** Where the section cuts: a plane fixed in the robot's frame, and the outline that marks it on the stage. */
import * as THREE from 'three';
import type { SectionDesign } from '../../core/robot/schema/design';
import { PALETTE } from '../stage/palette';

export type SectionAxis = 'x' | 'y' | 'z';

/** `offset` runs −1…1 across the robot's extent along the axis; 0 is through its middle. */
export interface Section {
  axis: SectionAxis;
  offset: number;
}

const UNIT: Record<SectionAxis, THREE.Vector3> = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1),
};
/** The two axes each plane spans, for the outline. */
const SPAN: Record<SectionAxis, [SectionAxis, SectionAxis]> = { x: ['y', 'z'], y: ['z', 'x'], z: ['x', 'y'] };
const MARGIN = 1.12;
/** Of the half extent: an arm's mid plane is where its hinge interfaces lie, so a cut there misses whole links. */
const OFF_CENTRE = 0.22;

export class SectionPlane {
  readonly group = new THREE.Group();
  /** The robot at rest, in its holder's frame: the plane stays put while the robot moves. */
  private readonly box = new THREE.Box3(new THREE.Vector3(-0.5, -0.5, 0), new THREE.Vector3(0.5, 0.5, 1));
  private readonly basis = new THREE.Matrix4();
  readonly plane = new THREE.Plane();
  /** Where a robot's own lengthwise cut lies, when its links sit off the middle plane. */
  private design: SectionDesign | null = null;

  constructor() {
    const corners = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]].map(([x, y]) => new THREE.Vector3(x, y, 0));
    const outline = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(corners),
      // No depth test: its bottom edge lies under the floor, and nothing else can stand in front of the cut.
      new THREE.LineBasicMaterial({ color: PALETTE.accent, transparent: true, opacity: 0.75, depthTest: false }),
    );
    // Outline only: a fill would tint the whole kept half, which always lies behind the plane.
    outline.raycast = () => {};
    this.group.add(outline);
    this.group.visible = false;
  }

  measure(root: THREE.Object3D, holder: THREE.Object3D): void {
    holder.updateMatrixWorld(true);
    this.box.setFromObject(root).applyMatrix4(holder.matrixWorld.clone().invert());
    this.design = (root.userData.section as SectionDesign | undefined) ?? null;
  }

  /** The lengthwise cut, across the thinner horizontal extent: an arm splits along its links. */
  defaultAxis(): SectionAxis {
    const size = this.box.getSize(new THREE.Vector3());
    return size.x < size.y ? 'x' : 'y';
  }

  /** The plane for `section`, cutting away the half the camera is on; the outline moves onto it. */
  place(section: Section, holder: THREE.Object3D, camera: THREE.Camera): THREE.Plane {
    const size = this.box.getSize(new THREE.Vector3());
    const local = this.box.getCenter(new THREE.Vector3());
    local.setComponent('xyz'.indexOf(section.axis), local[section.axis] + section.offset * size[section.axis] * 0.5);
    const point = holder.localToWorld(local);
    const turn = holder.getWorldQuaternion(new THREE.Quaternion());
    const normal = UNIT[section.axis].clone().applyQuaternion(turn);
    if (normal.dot(point.clone().sub(camera.position)) < 0) normal.negate();
    // Towards the camera, so the cut goes through the near knuckles and the far ones stay behind it.
    point.addScaledVector(normal, section.axis === 'y' && this.design ? -this.design.at : -OFF_CENTRE * size[section.axis] * 0.5);
    this.plane.setFromNormalAndCoplanarPoint(normal, point);

    const [u, v] = SPAN[section.axis];
    this.basis.makeBasis(UNIT[u], UNIT[v], UNIT[section.axis]);
    this.group.position.copy(point);
    this.group.quaternion.setFromRotationMatrix(this.basis).premultiply(turn);
    this.group.scale.set(size[u] * MARGIN, size[v] * MARGIN, 1);
    return this.plane;
  }

  dispose(): void {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      (m.material as THREE.Material | undefined)?.dispose();
    });
  }
}
