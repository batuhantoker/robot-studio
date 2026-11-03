/** Download the trajectory's samples; the tool path follows the focused limb, as in the profiles. */
import { chainFrames } from '../../../core/chain/kinematics/frames';
import { limbQ } from '../../../core/chain/limbs/types';
import { trajectoryCsv, trajectoryJson, trajectoryRecord } from '../../../core/trajectory/export';
import { download, fileStem } from '../../../ui/dom/download';
import { focusLimb, jointLimits } from '../../robots/focus';
import type { RobotSession } from '../../robots/session';
import type { StudioState } from '../../state/types';

export type DataFormat = 'csv' | 'json';

/** Returns why nothing was exported, or null. */
export function exportTrajectory(s: RobotSession | null, st: StudioState, format: DataFormat, rate: number): string | null {
  if (!s || !s.joints.length || st.waypoints[0]?.length !== s.joints.length) return 'No trajectory for this robot yet.';
  if (!(rate > 0)) return 'Sample rate must be above 0 Hz.';
  const limb = focusLimb(s, st.focus);
  let record;
  try {
    record = trajectoryRecord({
      robot: s.title,
      joints: s.joints.map((j) => j.name),
      limits: jointLimits(s),
      waypoints: st.waypoints,
      duration: st.duration,
      opts: st.stopOpts,
      pace: st.pace,
      timestep: 1 / rate,
      tool: { limb: limb.name, at: (q) => chainFrames(limb.chain, limbQ(limb, q)).tip.p },
    });
  } catch (e) {
    return (e as Error).message;
  }
  const name = `${fileStem(s.title)}-trajectory.${format}`;
  if (format === 'csv') download(name, trajectoryCsv(record), 'text/csv');
  else download(name, trajectoryJson(record));
  return null;
}
