/** What the analysis panels can ask of the app controller. */
import type { WorkspaceStudy } from '../../app/controller/workspace/study';
import type { WorkspaceMetric } from '../../scene/overlays/workspace';
import type { ControlLab } from '../../app/controller/learn/lab';
import type { Method } from '../../app/controller/learn/run';
import type { PhysicsHistory } from '../../app/controller/modes/physics';
import type { RunStats } from '../../core/control/score';
import type { PathProfile } from '../../app/controller/modes/trajectory';
import type { Vec3 } from '../../core/math/linear/vec';
import type { IkResult } from '../../core/solvers/ik/types';

export interface AnalysisContext {
  ik(): IkResult | null;
  /** What stopped the IK replay short of the solution. */
  ikBlocked(): string | null;
  profile(): PathProfile | null;
  /** Focused limb's tool point at each trajectory stop. */
  stopTips(): Vec3[];
  /** Move a stop so the focused tool point reaches `point` (IK from the stop's own pose). */
  moveStop(i: number, point: Vec3, maxIter?: number): void;
  physics(): { history: PhysicsHistory; reason: string | null; limits: number[]; lab: ControlLab | null; current: RunStats | null; ownMotion: boolean; onFloor: boolean; floorBlock: string | null | undefined } | null;
  runWorkspace(samples: number, metric?: WorkspaceMetric): WorkspaceStudy | null;
  recolorWorkspace(metric: WorkspaceMetric): void;
  workspace(): WorkspaceStudy | null;
  onWorkspace(fn: (s: WorkspaceStudy | null) => void): void;
  restartPhysics(): void;
  /** Hand the focused limb's gains to a learner. */
  teach(method: Method): void;
  /** Put the robot on the floor or its stand; resolves with why not, if it can't. */
  setFloor(on: boolean): Promise<string | null>;
  shove(): void;
}
