/** What the analysis panels can ask of the app controller. */
import type { WorkspaceStudy } from '../../app/controller/workspace/study';
import type { WorkspaceMetric } from '../../scene/overlays/workspace';
import type { PhysicsHistory } from '../../app/controller/modes/physics';
import type { PathProfile } from '../../app/controller/modes/trajectory';
import type { IkResult } from '../../core/solvers/ik/types';

export interface AnalysisContext {
  ik(): IkResult | null;
  profile(): PathProfile | null;
  physics(): { history: PhysicsHistory; reason: string | null; limits: number[] } | null;
  runWorkspace(samples: number, metric?: WorkspaceMetric): WorkspaceStudy | null;
  recolorWorkspace(metric: WorkspaceMetric): void;
  workspace(): WorkspaceStudy | null;
  onWorkspace(fn: (s: WorkspaceStudy | null) => void): void;
  restartPhysics(): void;
}
