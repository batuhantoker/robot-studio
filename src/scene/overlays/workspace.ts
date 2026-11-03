/** Workspace of the whole robot: sample points inside a translucent shell of the reachable volume. */
import * as THREE from 'three';
import type { WorkspaceSamples } from '../../core/analysis/workspace/sample';
import type { SurfaceMesh } from '../../core/analysis/workspace/volume';
import { PALETTE } from '../stage/palette';

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

/** Back faces first, then front, so the far wall reads through the near one without sorting artefacts. */
function shellObject(shell: SurfaceMesh): THREE.Group {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(shell.positions, 3));
  g.setIndex(new THREE.BufferAttribute(shell.indices, 1));
  g.computeVertexNormals();
  const skin = (side: THREE.Side, opacity: number, order: number) => {
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
      color: PALETTE.blue, roughness: 0.55, metalness: 0, transparent: true, opacity, depthWrite: false, side,
    }));
    m.renderOrder = order;
    m.raycast = () => {};
    return m;
  };
  return new THREE.Group().add(skin(THREE.BackSide, 0.1, 1), skin(THREE.FrontSide, 0.2, 2));
}

export class WorkspaceOverlay {
  readonly group = new THREE.Group();

  /** Bounds of what is shown, for framing the camera. */
  bounds(): THREE.Box3 {
    return new THREE.Box3().setFromObject(this.group);
  }

  show(samples: WorkspaceSamples, shell: SurfaceMesh, metric: WorkspaceMetric, size: number): void {
    this.clear();
    const best = Math.max(...(metric === 'reach' ? samples.reach : samples.manipulability), 1e-300);
    const colors = samples.points.map((_, i) => colorFor(metric, samples, i, best));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(samples.points.flat()), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors.flatMap((c) => c.toArray())), 3));
    const points = new THREE.Points(g, new THREE.PointsMaterial({ size, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false }));
    points.raycast = () => {};
    points.renderOrder = 3;
    this.group.add(shellObject(shell), points);
  }

  clear(): void {
    for (const o of [...this.group.children]) {
      this.group.remove(o);
      o.traverse((c) => {
        const m = c as THREE.Mesh;
        m.geometry?.dispose();
        (m.material as THREE.Material | undefined)?.dispose();
      });
    }
  }
}
