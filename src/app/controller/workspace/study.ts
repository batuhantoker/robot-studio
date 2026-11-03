/** The robot's workspace study: every limb sampled, merged, summarized; recomputed only when stale. */
import { mergeSamples } from '../../../core/analysis/workspace/merge';
import { type WorkspaceSamples, sampleWorkspace } from '../../../core/analysis/workspace/sample';
import { type WorkspaceSummary, summarize } from '../../../core/analysis/workspace/summary';
import { type SurfaceMesh, occupancy, surfaceMesh, sweptCloud } from '../../../core/analysis/workspace/volume';
import type { RobotSession } from '../../robots/session';

export interface WorkspaceStudy {
  key: string;
  samples: WorkspaceSamples;
  summary: WorkspaceSummary;
  /** Boundary of the reachable volume. */
  shell: SurfaceMesh;
  limbs: number;
}

export const studyKey = (s: RobotSession, count: number) => `${s.id}#${s.limbs.length}#${count}`;

export function runStudy(s: RobotSession, count: number): WorkspaceStudy | null {
  const limbs = s.limbs.filter((l) => l.chain.joints.length);
  if (!limbs.length) return null;
  const per = Math.max(600, Math.round(count / limbs.length));
  const parts = limbs.map((l, i) => {
    const limits = l.index.map((j) => s.torqueLimits[j]);
    return sampleWorkspace(l.chain, per, limits.some((x) => x > 0) ? limits : null, 1 + i);
  });
  const samples = mergeSamples(parts);
  // A fixed budget: the voxel grid, not the analysis sample count, limits the shell's detail.
  const shellPer = Math.max(1500, Math.round(6000 / limbs.length));
  const cloud = limbs.flatMap((l, i) => sweptCloud(l.chain, shellPer, 32, 101 + i));
  const shell = surfaceMesh(occupancy(cloud));
  return { key: studyKey(s, count), samples, summary: summarize(samples), shell, limbs: limbs.length };
}
