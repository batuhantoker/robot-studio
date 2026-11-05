/**
 * Any model as a torque-driven plant. Most library models have no motors of their own, so the
 * model's actuators go off and joint torque enters through qfrc_applied instead.
 */
import type { Limb } from '../../core/chain/limbs/types';
import type { ModelHandle } from '../model/handle';
import { JOINT, arrays, state } from '../runtime/arrays';

// Rotor inertia URDFs omit, as a share of the limb's heaviest joint; near-massless wrists diverge under explicit PD without it.
const ARMATURE = 0.02;
const EQ_JOINT = 2;
const HOLD_WN = 30;
/** Peak torque of a real joint against its worst gravity moment, and the acceleration it can reach (rad/s²). */
const GRAVITY_MARGIN = 3;
const MIN_ACCEL = 60;
/** No joint is far weaker than its limb's strongest: a fingertip's few grams say little about the tendon driving it. */
const LIMB_SHARE = 0.05;
/** Overlap at home deeper than this is how the model was drawn, not a collision (m). */
const DRAWN_OVERLAP = 1e-3;

export interface PlantRobot {
  handle: ModelHandle;
  qposAdr: number[];
  dofAdr: number[];
  rest: Float64Array;
  home: number[];
  torqueLimits: number[];
  limbs: Pick<Limb, 'index'>[];
  /** Stands on a floor: joints carry the whole robot, and contact has to stay on for the floor to hold it. */
  onFloor?: boolean;
}

/** One joint a tendon crosses, and how much of the tendon's pull it takes. */
export interface Route {
  dof: number;
  scale: number;
}

/** A joint on no limb, held at its rest angle so it doesn't flop while the limbs move. */
export interface HeldJoint {
  qpos: number;
  dof: number;
  ref: number;
  kp: number;
  kd: number;
  limit: number;
}

export class Plant {
  /** Per robot joint: inertia about the axis at rest, armature included (kg·m²). */
  readonly inertia: number[];
  readonly limits: number[];
  /** Per robot joint: the model states no limit, so `limits` is our estimate. */
  readonly estimated: boolean[];
  /** Torque each joint needs just to hold the home pose: above its limit, the robot can't hold itself up. */
  readonly holding: number[];
  /** False where an equality constraint moves the joint, so a controller must leave it alone. */
  readonly driven: boolean[];
  /** Soft hands: the joint standing in for their one motor, and every joint that motor's tendon pulls on. */
  readonly routes = new Map<number, Route[]>();
  readonly held: HeldJoint[] = [];
  /** False when the model overlaps itself at home and contact forces would throw it apart. */
  readonly contact: boolean;
  private readonly armature = new Map<number, number>();
  private savedFlags: number | null = null;
  private savedArmature = new Map<number, number>();

  constructor(private readonly robot: PlantRobot) {
    const { handle: h, dofAdr, qposAdr, limbs } = robot;
    const m = arrays(h.model);
    const stride = m.neq ? m.eq_data.length / m.neq : 0;
    const followers = new Set<number>();
    const lead = new Map<number, { joint: number; ratio: number }>();
    for (let e = 0; e < m.neq; e++) {
      if (m.eq_type[e] !== EQ_JOINT) continue;
      followers.add(m.eq_obj1id[e]);
      if (m.eq_obj2id[e] >= 0) lead.set(m.eq_obj1id[e], { joint: m.eq_obj2id[e], ratio: m.eq_data[stride * e + 1] });
    }

    const limbScale = new Map<number, number>();
    for (const limb of limbs) {
      const dofs = limb.index.map((k) => dofAdr[k]);
      const top = Math.max(0, ...dofs.map((v) => m.dof_M0[v]));
      for (const v of dofs) limbScale.set(v, Math.max(limbScale.get(v) ?? 0, top));
    }
    const massOf = (v: number) => {
      const floor = ARMATURE * (limbScale.get(v) ?? m.dof_M0[v]);
      if (m.dof_armature[v] < floor) this.armature.set(v, floor);
      return m.dof_M0[v] - m.dof_armature[v] + Math.max(m.dof_armature[v], floor);
    };
    this.inertia = dofAdr.map(massOf);
    this.driven = dofAdr.map((v) => !followers.has(m.dof_jntid[v]));
    const routed = this.routeTendons(lead, followers);

    const probe = new h.mj.MjData(h.model);
    try {
      const d = state(probe);
      d.qpos.set(robot.rest);
      qposAdr.forEach((adr, k) => (d.qpos[adr] = robot.home[k]));
      h.mj.mj_forward(h.model, probe);
      const worstGravity = (v: number) => {
        const j = m.dof_jntid[v], b = m.jnt_bodyid[j];
        const arm = Math.hypot(...[0, 1, 2].map((i) => d.subtree_com[3 * b + i] - d.xanchor[3 * j + i]));
        return (robot.onFloor ? m.body_subtreemass[1] : m.body_subtreemass[b]) * 9.81 * arm;
      };
      const limitOf = (v: number, mass: number) => Math.max(GRAVITY_MARGIN * worstGravity(v), MIN_ACCEL * mass);
      this.estimated = robot.torqueLimits.map((l) => !(l > 0));
      this.limits = dofAdr.map((v, k) => (robot.torqueLimits[k] > 0 ? robot.torqueLimits[k] : limitOf(v, this.inertia[k])));
      for (const limb of limbs) {
        const top = Math.max(0, ...limb.index.map((k) => this.limits[k]));
        for (const k of limb.index) if (this.estimated[k]) this.limits[k] = Math.max(this.limits[k], LIMB_SHARE * top);
      }

      const onLimb = new Set(dofAdr);
      for (let j = 0; j < m.njnt; j++) {
        const v = m.jnt_dofadr[j];
        if ((m.jnt_type[j] !== JOINT.hinge && m.jnt_type[j] !== JOINT.slide) || onLimb.has(v) || followers.has(j) || routed.has(j)) continue;
        const a = m.jnt_qposadr[j];
        const ref = m.jnt_limited[j] ? Math.min(Math.max(robot.rest[a], m.jnt_range[2 * j]), m.jnt_range[2 * j + 1]) : robot.rest[a];
        const mass = massOf(v);
        this.held.push({ qpos: a, dof: v, ref, kp: mass * HOLD_WN ** 2, kd: 2 * mass * HOLD_WN, limit: limitOf(v, mass) });
      }
      this.holding = dofAdr.map((v) => Math.abs(d.qfrc_bias[v]));
      this.contact = !!robot.onFloor || !overlapsAtHome(probe);
    } finally {
      probe.delete();
    }
  }

  /**
   * A lead joint off every limb is a soft hand's motor. Pushed alone it tears free of its fingers and spins away: equalities
   * are soft and scale with mass, and it weighs next to nothing. So torque goes where a tendon puts it, on every joint by its gearing.
   * Returns the leads, which must be left free to follow.
   */
  private routeTendons(lead: Map<number, { joint: number; ratio: number }>, followers: Set<number>): Set<number> {
    const { dofAdr } = this.robot;
    const m = arrays(this.robot.handle.model);
    const slot = new Map(dofAdr.map((v, k) => [m.dof_jntid[v], k]));
    const rootOf = (j: number): { joint: number; gear: number } => {
      const up = lead.get(j);
      if (!up) return { joint: j, gear: 1 };
      const root = rootOf(up.joint);
      return { joint: root.joint, gear: root.gear * up.ratio };
    };
    const groups = new Map<number, { joint: number; gear: number }[]>();
    for (const j of lead.keys()) {
      const { joint: root, gear } = rootOf(j);
      if (!slot.has(root) && !followers.has(root) && gear !== 0) groups.set(root, [...(groups.get(root) ?? []), { joint: j, gear }]);
    }
    const routed = new Set<number>();
    for (const [root, tied] of groups) {
      const onLimb = tied.filter((t) => slot.has(t.joint));
      if (!onLimb.length) continue;
      const stand = onLimb.reduce((a, b) => (Math.abs(b.gear) > Math.abs(a.gear) ? b : a));
      const k = slot.get(stand.joint)!;
      const route = tied.map((t) => ({ dof: m.jnt_dofadr[t.joint], scale: t.gear / stand.gear }));
      const weight = route.reduce((sum, r) => sum + r.scale ** 2, 0);
      const massOn = (t: { joint: number }) => this.inertia[slot.get(t.joint) ?? k];
      this.inertia[k] = tied.reduce((sum, t, i) => sum + route[i].scale ** 2 * massOn(t), 0) / weight;
      this.driven[k] = true;
      this.routes.set(k, route);
      routed.add(root);
    }
    return routed;
  }

  /** Hand the shared model over to dynamics; other modes never see these settings. */
  enter(): void {
    if (this.savedFlags !== null) return;
    const { handle: h } = this.robot;
    const opt = h.model.opt as unknown as { disableflags: number };
    const off = h.mj.mjtDisableBit;
    this.savedFlags = opt.disableflags;
    opt.disableflags |= off.mjDSBL_ACTUATION.value | (this.contact ? 0 : off.mjDSBL_CONTACT.value);
    const m = arrays(h.model);
    for (const [v, a] of this.armature) {
      this.savedArmature.set(v, m.dof_armature[v]);
      m.dof_armature[v] = a;
    }
  }

  leave(): void {
    if (this.savedFlags === null) return;
    const { handle: h } = this.robot;
    (h.model.opt as unknown as { disableflags: number }).disableflags = this.savedFlags;
    this.savedFlags = null;
    const m = arrays(h.model);
    for (const [v, a] of this.savedArmature) m.dof_armature[v] = a;
    this.savedArmature.clear();
    state(h.data).qfrc_applied.fill(0);
  }
}

function overlapsAtHome(data: import('@mujoco/mujoco').MjData): boolean {
  if (!data.ncon) return false;
  const all = data.contact;
  let deep = false;
  try {
    for (let i = 0; i < all.size(); i++) {
      const c = all.get(i);
      if (!c) continue;
      deep ||= c.dist < -DRAWN_OVERLAP;
      c.delete();
    }
  } finally {
    all.delete();
  }
  return deep;
}
