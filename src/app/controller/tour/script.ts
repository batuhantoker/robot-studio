/** The auto tour as a list of beats: each patches the studio state for a while. */
import type { StudioState } from '../../state/types';

export interface Beat {
  caption: string;
  seconds: number;
  patch: (s: StudioState, modules: string[]) => Partial<StudioState>;
  /** Run once when the beat starts (e.g. the workspace study). */
  enter?: 'workspace';
  explodeTo?: number;
}

const calm = { frames: false, com: false, ellipsoid: false, trail: true, workspace: false, labels: true };

export const BEATS: Beat[] = [
  { caption: 'The machine in motion', seconds: 5, patch: () => ({ mode: 'trajectory', playing: true, cut: 'solid', explode: 0, isolate: null, overlays: calm }) },
  { caption: 'Glass housings: the drives inside', seconds: 3.5, patch: () => ({ cut: 'glass', playing: false }) },
  { caption: 'Every joint opens along its own axis', seconds: 4, patch: () => ({ cut: 'glass' }), explodeTo: 1 },
  { caption: 'Isolate a joint: its bill of parts', seconds: 7, patch: (_, m) => ({ isolate: m[Math.min(2, m.length - 1)] ?? null, cut: 'solid' }) },
  { caption: 'Section through the arm', seconds: 4, patch: () => ({ isolate: null, cut: 'section' }), explodeTo: 0 },
  { caption: 'Joint axes and the velocity ellipsoid (Jacobian SVD)', seconds: 4.5, patch: (s) => ({ cut: 'solid', mode: 'pose', overlays: { ...s.overlays, frames: true, ellipsoid: true, com: true } }) },
  { caption: 'Where it is limited: dexterity across the workspace', seconds: 5, patch: (s) => ({ overlays: { ...s.overlays, frames: false, ellipsoid: false, com: false, workspace: true } }), enter: 'workspace' },
];
