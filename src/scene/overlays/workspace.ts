/** Workspace of the whole robot: sample points plus the boundary of the reachable volume. */
import * as THREE from 'three';
import type { WorkspaceSamples } from '../../core/analysis/workspace/sample';
import { sideEnvelope } from '../../core/analysis/workspace/envelope';
import type { Vec3 } from '../../core/math/linear/vec';
import { envelopeObject, faceCamera } from './workspace-envelope';

export type WorkspaceMetric = 'manipulability' | 'torque' | 'limits' | 'reach';

const LOW = new THREE.Color('#7d8794');
const MID = new THREE.Color('#3d8fe0');
const HIGH = new THREE.Color('#d6182b');

function colorFor(metric: WorkspaceMetric, s: WorkspaceSamples, i: number, best: number): THREE.Color {
  const c = new THREE.Color();
  if (metric === 'torque') {
    const r = s.torqueRatio[i];
    return r > 1 ? HIGH.clone() : c.lerpColors(LOW, MID, r);
  }
  if (metric === 'limits') return c.lerpColors(HIGH, LOW, Math.min(s.limitMargin[i] / 0.25, 1));
  if (metric === 'reach') return c.lerpColors(LOW, MID, s.reach[i] / best);
  const w = s.manipulability[i] / best;
  return w < 0.05 ? HIGH.clone() : c.lerpColors(LOW, MID, Math.sqrt(w));
}

export class WorkspaceOverlay {
  readonly group = new THREE.Group();
  private envelope: THREE.Object3D | null = null;

  /** Bounds of what is shown, for framing the camera. */
  bounds(): THREE.Box3 {
    return new THREE.Box3().setFromObject(this.group);
  }

  face(camera: THREE.Camera): void {
    if (this.envelope) faceCamera(this.envelope, camera);
  }

  show(samples: WorkspaceSamples, metric: WorkspaceMetric, size: number, axis: Vec3): void {
    this.clear();
    const best = Math.max(...(metric === 'reach' ? samples.reach : samples.manipulability), 1e-300);
    const colors = samples.points.map((_, i) => colorFor(metric, samples, i, best));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(samples.points.flat()), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors.flatMap((c) => c.toArray())), 3));
    const points = new THREE.Points(g, new THREE.PointsMaterial({ size, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false }));
    points.raycast = () => {};
    this.envelope = envelopeObject(sideEnvelope(samples.points, axis), axis);
    this.group.add(this.envelope, points);
  }

  clear(): void {
    this.envelope = null;
    for (const o of [...this.group.children]) {
      this.group.remove(o);
      o.traverse((c) => {
        const m = c as THREE.Mesh;
        m.geometry?.dispose();
        const mat = m.material as THREE.MeshBasicMaterial | undefined;
        mat?.map?.dispose();
        mat?.dispose();
      });
    }
  }
}
