/** All math-in-3D overlays, sized to the robot and refreshed from each frame's snapshot. */
import * as THREE from 'three';
import type { Snapshot } from '../../app/live/bus';
import type { RobotSession } from '../../app/robots/session';
import type { Overlays as Flags } from '../../app/state/types';
import type { ChainFrames } from '../../core/chain/model/types';
import type { Vec3 } from '../../core/math/linear/vec';
import type { Stage } from '../stage/renderer';
import { AxesOverlay } from './axes';
import { ComOverlay } from './com';
import { EffectorsOverlay } from './effectors';
import { EllipsoidOverlay } from './ellipsoid';
import { TargetOverlay } from './target';
import { TrailOverlay } from './trail';
import { WorkspaceOverlay } from './workspace';

/** One origin/axis per robot joint, taken from the first limb that contains it. */
function jointFrames(session: RobotSession, limbs: ChainFrames[]): ChainFrames {
  const origins: Vec3[] = [], axes: Vec3[] = [], frames = [] as ChainFrames['frames'];
  session.limbs.forEach((l, i) => l.index.forEach((j, k) => {
    if (origins[j]) return;
    origins[j] = limbs[i].origins[k];
    axes[j] = limbs[i].axes[k];
    frames[j] = limbs[i].frames[k];
  }));
  return { origins, axes, frames, pre: [], tip: limbs[0].tip };
}

export class OverlaySet {
  readonly group = new THREE.Group();
  readonly axes = new AxesOverlay();
  readonly com = new ComOverlay();
  readonly effectors = new EffectorsOverlay();
  readonly ellipsoids = new THREE.Group();
  private ellipsoidList: EllipsoidOverlay[] = [];
  readonly trail = new TrailOverlay();
  readonly workspace = new WorkspaceOverlay();
  readonly target: TargetOverlay;
  reach = 0.5;
  private comCount = -1;

  private readonly camera: THREE.Camera;

  constructor(stage: Stage, onTarget: (p: Vec3) => void) {
    this.camera = stage.camera;
    this.target = new TargetOverlay(stage.camera, stage.renderer.domElement, stage.controls, onTarget);
    this.group.add(this.axes.group, this.com.group, this.effectors.group, this.ellipsoids, this.trail.group, this.workspace.group, this.target.group);
  }

  rebuild(session: RobotSession, reach: number): void {
    this.reach = reach;
    this.axes.rebuild(session.joints.length, reach);
    this.effectors.rebuild(session.limbs.length, reach);
    this.ellipsoids.clear();
    this.ellipsoidList = session.limbs.map(() => {
      const e = new EllipsoidOverlay();
      e.setScale(reach / Math.sqrt(session.limbs.length));
      this.ellipsoids.add(e.group);
      return e;
    });
    this.target.setScale(reach);
    this.comCount = -1;
    this.trail.clear();
    this.workspace.clear();
  }

  update(snap: Snapshot, flags: Flags, focusJoint: number, ikMode: boolean): void {
    this.axes.group.visible = flags.frames;
    this.com.group.visible = flags.com;
    this.ellipsoids.visible = flags.ellipsoid;
    this.trail.group.visible = flags.trail;
    this.workspace.group.visible = flags.workspace;
    if (flags.workspace) this.workspace.face(this.camera);
    this.target.group.visible = ikMode;
    const limbs = snap.posed.limbs;
    this.effectors.update(limbs, snap.focus);
    if (flags.frames) {
      const focusIndex = snap.session.limbs[snap.focus]?.index[focusJoint] ?? -1;
      this.axes.update(jointFrames(snap.session, limbs), focusIndex);
    }
    if (flags.com) {
      if (this.comCount !== snap.gravity.loads.length) {
        this.com.rebuild(snap.gravity.loads.map((l) => -l.force[2] / 9.81), this.reach);
        this.comCount = snap.gravity.loads.length;
      }
      this.com.update(snap.gravity);
    }
    if (flags.ellipsoid) limbs.forEach((f, i) => this.ellipsoidList[i]?.update(f.tip.p, snap.limbs[i].svd));
  }
}
