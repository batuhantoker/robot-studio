/** Each frame: choose q from the active mode, pose every limb, compute live analysis, publish. */
import { dexterity } from '../../core/analysis/dexterity/report';
import { gravityLoad } from '../../core/analysis/statics/gravity';
import { enforceLimits } from '../../core/chain/limbs/limits';
import { limbQ } from '../../core/chain/limbs/types';
import type { OverlaySet } from '../../scene/overlays';
import type { LiveBus } from '../live/bus';
import { bodyFor } from '../robots/body';
import { focusLimb, jointLimits } from '../robots/focus';
import { type RobotSession, mujocoBias, pose } from '../robots/session';
import type { Store } from '../state/store';
import type { StudioState } from '../state/types';
import { playbackGuard } from '../collision/playback';
import { updateIndicators } from './indicators';
import type { MotionClip } from '../../core/motion/types';
import type { TaskClip } from '../../core/task/types';
import type { IkMode } from './modes/ik';
import type { PhysicsMode } from './modes/physics';
import { planOf, player } from './modes/trajectory';

export interface LoopDeps {
  store: Store<StudioState>;
  bus: LiveBus;
  overlays: OverlaySet;
  session: () => RobotSession | null;
  physics: () => PhysicsMode | null;
  ik: IkMode;
  motion: () => MotionClip | null;
  task: () => TaskClip | null;
  /** Pilot's pose for this frame, null until it has a rig for this robot. */
  pilot: (s: RobotSession, dt: number) => number[] | null;
  focusJoint: () => number;
}

function chooseQ(d: LoopDeps, s: RobotSession, st: StudioState, dt: number) {
  const physics = d.physics();
  const simulating = st.mode === 'physics' && !!physics?.sim;
  let q = st.q;
  let time = st.time;
  if (st.mode === 'trajectory' && st.waypoints[0]?.length === s.joints.length) {
    if (st.playing) d.store.set({ time: (time = st.rendering ? Math.min(st.time + dt, st.duration) : (st.time + dt) % st.duration) });
    q = player(jointLimits(s), planOf(st))(time).q;
  } else if (st.mode === 'motion') {
    const clip = d.motion();
    if (clip) {
      if (st.playing) d.store.set({ time: (time = st.time + dt * st.motion.speed) });
      q = clip.at(time);
    }
  } else if (st.mode === 'task') {
    const clip = d.task();
    if (clip) {
      if (st.playing) d.store.set({ time: (time = (st.time + dt * st.motion.speed) % clip.period) });
      q = clip.at(time).q;
    }
  } else if (st.mode === 'pilot') {
    q = d.pilot(s, dt) ?? q;
  } else if (simulating) {
    q = st.playing ? physics!.advance(dt, planOf(st)) ?? q : physics!.sim!.q();
    time = physics!.sim!.time % st.duration;
  } else if (st.mode === 'ik') {
    const replay = d.ik.next();
    if (replay) q = replay.q;
    if (replay?.done) d.store.set({ q: replay.q, contact: d.ik.blocked });
  }
  return { q, time, simulating };
}

export function frameLoop(d: LoopDeps): (dt: number) => void {
  const guard = playbackGuard();
  return (dt) => {
    const s = d.session();
    if (!s || d.store.state.q.length !== s.joints.length) return;
    const st = d.store.state;
    const chosen = chooseQ(d, s, st, dt);
    const { simulating } = chosen;
    let time = chosen.time;
    // MuJoCo's own state is shown as is while simulating; every other source is held to the ranges.
    let q = simulating ? chosen.q : enforceLimits(s.joints, chosen.q);
    const stop = simulating ? null : guard(s, st.mode, q, time, st.playing);
    if (stop) {
      d.store.set({ playing: false, time: stop.time, contact: stop.contact });
      ({ q, time } = stop);
    }
    const posed = pose(s, q, st.explode, st.focus, !simulating);
    const limb = focusLimb(s, st.focus);
    const parts = s.limbs.length > 1 ? bodyFor(s).partOf : [];
    const limbs = s.limbs.map((l, i) => {
      const report = dexterity(l.chain, limbQ(l, q));
      // A wheel has no workspace to condition; its rank-1 Jacobian is not a singularity worth flagging.
      if (!l.chain.joints.length || parts[i]?.kind === 'wheel') report.nearSingular = false;
      return report;
    });
    const sim = st.mode === 'physics' ? d.physics()?.last ?? null : null;
    const snap = {
      session: s, q, focus: st.focus, posed, time, sim,
      gravity: gravityLoad(limb.chain, limbQ(limb, q)),
      bias: mujocoBias(s),
      dexterity: limbs[s.limbs.indexOf(limb)],
      limbs,
    };
    d.overlays.update(snap, st.overlays, d.focusJoint(), st.mode);
    if (st.mode === 'physics' && st.playing) d.overlays.trail.push(posed.frames.tip.p);
    updateIndicators(s.assembly.indicators, sim?.applied ?? snap.bias, s.torqueLimits);
    d.bus.publish(snap);
  };
}
