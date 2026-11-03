/** Velocity manipulability ellipsoid at the tool: axes U, radii σ (normalised for display). */
import * as THREE from 'three';
import type { JacobianSVD } from '../../core/math/decompose/svd';
import type { Vec3 } from '../../core/math/linear/vec';
import { PALETTE } from '../stage/palette';

export class EllipsoidOverlay {
  readonly group = new THREE.Group();
  private mesh = new THREE.Mesh(
    new THREE.SphereGeometry(1, 40, 24),
    new THREE.MeshBasicMaterial({ color: PALETTE.accent, transparent: true, opacity: 0.16, depthWrite: false }),
  );
  private wire = new THREE.LineSegments(
    new THREE.WireframeGeometry(new THREE.SphereGeometry(1, 16, 8)),
    new THREE.LineBasicMaterial({ color: PALETTE.accent, transparent: true, opacity: 0.35 }),
  );
  private scale = 0.1;

  constructor() {
    this.group.add(this.mesh, this.wire);
  }

  setScale(reach: number): void {
    this.scale = reach * 0.22;
  }

  update(at: Vec3, svd: JacobianSVD): void {
    const U = svd.U;
    const m = new THREE.Matrix4().makeBasis(
      new THREE.Vector3(U[0], U[3], U[6]), new THREE.Vector3(U[1], U[4], U[7]), new THREE.Vector3(U[2], U[5], U[8]),
    );
    const top = Math.max(svd.sigma[0], 1e-9);
    const radii = svd.sigma.map((s) => Math.max((s / top) * this.scale, this.scale * 0.01));
    for (const o of [this.mesh, this.wire]) {
      o.position.set(...at);
      o.quaternion.setFromRotationMatrix(m);
      o.scale.set(radii[0], radii[1], radii[2]);
    }
  }
}
