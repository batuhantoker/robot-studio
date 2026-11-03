/** Each frame: choose q from the active mode, pose every limb, compute live analysis, publish. */
import { dexterity } from '../../core/analysis/dexterity/report';
import { gravityLoad } from '../../core/analysis/statics/gravity';
import { enforceLimits } from '../../core/chain/limbs/limits';
import { limbQ } from '../../core/chain/limbs/types';
import type { OverlaySet } from '../../scene/overlays';
import type { LiveBus } from '../live/bus';
import { focusLimb, jointLimits } from '../robots/focus';
import { type RobotSession, mujocoBias, pose } from '../robots/session';
import type { Store } from '../state/store';
import type { StudioState } from '../state/types';
import { updateIndicators } from './indicators';
import type { MotionClip } from '../../core/motion/types';
import type { IkMode } from './modes/ik';
import type { PhysicsMode } from './modes/physics';
import { stateAt } from './modes/trajectory';

export interface LoopDeps {
  store: Store<StudioState>;
  bus: LiveBus;
  overlays: OverlaySet;
  session: () => RobotSession | null;
  physics: () => PhysicsMode | null;
  ik: IkMode;
  motion: () => MotionClip | null;
  focusJoint: () => number;
}

function chooseQ(d: LoopDeps, s: RobotSession, st: StudioState, dt: number) {
  const physics = d.physics();
  const simulating = st.mode === 'physics' && !!physics?.sim;
  let q = st.q;
  let time = st.time;
  if (st.mode === 'trajectory' && st.waypoints[0]?.length === s.joints.length) {
    if (st.playing) d.store.set({ time: (time = (st.time + dt) % st.duration) });
    q = stateAt(jointLimits(s), st.waypoints, st.duration, time).q;
  } else if (st.mode === 'motion') {
    const clip = d.motion();
    if (clip) {
      if (st.playing) d.store.set({ time: (time = st.time + dt * st.motion.speed) });
      q = clip.at(time);
    }
  } else if (simulating) {
    q = st.playing ? physics!.advance(dt, st.waypoints, st.duration) ?? q : physics!.sim!.q();
    time = physics!.sim!.time % st.duration;
  } else if (st.mode === 'ik') {
    const replay = d.ik.next();
    if (replay) q = replay.q;
    if (replay?.done) d.store.set({ q: replay.q });
  }
  return { q, time, simulating };
}

export function frameLoop(d: LoopDeps): (dt: number) => void {
  return (dt) => {
    const s = d.session();
    if (!s || d.store.state.q.length !== s.joints.length) return;
    const st = d.store.state;
    const chosen = chooseQ(d, s, st, dt);
    const { time, simulating } = chosen;
    // MuJoCo's own state is shown as is while simulating; every other source is held to the ranges.
    const q = simulating ? chosen.q : enforceLimits(s.joints, chosen.q);
    const posed = pose(s, q, st.explode, st.focus, !simulating);
    const limb = focusLimb(s, st.focus);
    const limbs = s.limbs.map((l) => {
      const report = dexterity(l.chain, limbQ(l, q));
      if (!l.chain.joints.length) report.nearSingular = false;
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
    d.overlays.update(snap, st.overlays, d.focusJoint(), st.mode === 'ik');
    if (st.mode === 'physics' && st.playing) d.overlays.trail.push(posed.frames.tip.p);
    updateIndicators(s.assembly.indicators, sim?.applied ?? snap.bias, s.torqueLimits);
    d.bus.publish(snap);
  };
}
