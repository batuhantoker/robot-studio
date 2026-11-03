/**
 * A multi-limb robot read as a body: one part per real end effector (a hand's fingertips, an ankle's
 * linkage rods and a gripper's mimic links collapse into it), each named by side, plus the way it faces.
 */
import { chainFrames } from '../chain/kinematics/frames';
import { limbQ } from '../chain/limbs/types';
import { type Vec3, cross, dot, norm, normalize, sub } from '../math/linear/vec';
import { HEAD_NAME, type LimbRole, limbRoles } from './roles';
import type { MotionRobot } from './types';

export type PartKind = 'leg' | 'arm' | 'head' | 'wheel' | 'other';
export type Side = 'left' | 'right' | 'centre';

export interface BodyPart {
  kind: PartKind;
  /** The chain that stands for the part; `limbs` also holds the branches merged into it. */
  limb: number;
  limbs: number[];
  side: Side;
  front: boolean;
  label: string;
  role: LimbRole;
  /** Arms only: the first joint no other arm shares (past a shared waist), and the reach from it. */
  shoulder?: Vec3;
  reach?: number;
}

export interface Body {
  parts: BodyPart[];
  /** The part each limb belongs to, and its own label (a merged branch says which). */
  partOf: BodyPart[];
  labels: string[];
  /** Horizontal unit vectors the robot faces and has on its left. */
  forward: Vec3;
  left: Vec3;
  /** Lowest tool point (the soles, near enough) and the hips. */
  ground: number;
  hip: number;
}

const UP: Vec3 = [0, 0, 1];

const WHEEL_NAME = /wheel/i;

export function nameSide(name: string): Side | null {
  if (/left/i.test(name) || /(^|_)l(_|$)/i.test(name)) return 'left';
  if (/right/i.test(name) || /(^|_)r(_|$)/i.test(name)) return 'right';
  return null;
}

const pretty = (name: string) => {
  const all = name.replace(/([a-z])([A-Z])/g, '$1 $2').split(/[_\s./-]+/).filter(Boolean);
  const words = all.filter((w) => !/^(link|frame|joint|tip)$/i.test(w));
  const s = (words.some((w) => /[a-z]/i.test(w)) ? words : all).join(' ').toLowerCase();
  return s ? s[0].toUpperCase() + s.slice(1) : name;
};

const flat = (v: Vec3): Vec3 => [v[0], v[1], 0];

/** Snap a horizontal direction onto the nearest model axis: CAD frames face along one. */
function snapAxis(v: Vec3): Vec3 {
  const [x, y] = v;
  return Math.abs(x) >= Math.abs(y) ? [Math.sign(x) || 1, 0, 0] : [0, Math.sign(y), 0];
}

/** Chains that branch off another near its end (fingers, rods, mimic links) join one group. */
function groups(robot: MotionRobot, roles: LimbRole[]): number[][] {
  const parent = roles.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let a = 0; a < roles.length; a++) {
    for (let b = a + 1; b < roles.length; b++) {
      const [ra, rb] = [roles[a], roles[b]];
      if (ra.role !== rb.role || ra.role === 'other') continue;
      const ia = robot.limbs[a].index, ib = new Set(robot.limbs[b].index);
      const shared = ia.filter((i) => ib.has(i)).length;
      const close = Math.hypot(...sub(ra.tip, rb.tip)) < 0.35 * Math.max(ra.length, rb.length);
      if (close && shared >= 0.6 * Math.min(ia.length, ib.size)) parent[find(a)] = find(b);
    }
  }
  const out = new Map<number, number[]>();
  roles.forEach((_, i) => out.set(find(i), [...(out.get(find(i)) ?? []), i]));
  return [...out.values()];
}

export function bodyOf(robot: MotionRobot, q: number[], category = ''): Body {
  const roles = limbRoles(robot, q);
  const names = robot.limbs.map((l) => l.name);
  const named = roles.map((r, i) => ({ r, side: nameSide(names[i]) }));
  const mean = (pts: Vec3[]): Vec3 => pts.reduce((s, p) => [s[0] + p[0] / pts.length, s[1] + p[1] / pts.length, s[2] + p[2] / pts.length], [0, 0, 0]);
  const lefts = named.filter((n) => n.side === 'left').map((n) => n.r.tip), rights = named.filter((n) => n.side === 'right').map((n) => n.r.tip);
  const lateral = lefts.length && rights.length ? flat(sub(mean(lefts), mean(rights))) : ([0, 0, 0] as Vec3);
  const forward = Math.hypot(...lateral) > 1e-3 ? snapAxis(cross(normalize(lateral), UP)) : ([1, 0, 0] as Vec3);
  const left = cross(UP, forward);
  const centre = mean(roles.map((r) => r.tip));

  const legs = roles.filter((r) => r.role === 'leg');
  const ground = Math.min(...(legs.length ? legs : roles).map((r) => r.tip[2]));
  const hip = legs.length ? legs.reduce((s, r) => s + r.base[2], 0) / legs.length : Math.max(...roles.map((r) => r.base[2]));

  const parts: BodyPart[] = groups(robot, roles).map((members) => {
    const rs = members.map((i) => roles[i]);
    // Feet are the lowest tip; elsewhere the branch with fewest joints of its own (a wrist over a fingertip).
    const lead = rs[0].role === 'leg'
      ? rs.reduce((a, b) => (b.tip[2] < a.tip[2] - 1e-3 || (Math.abs(b.tip[2] - a.tip[2]) <= 1e-3 && robot.limbs[b.limb].index.length < robot.limbs[a.limb].index.length) ? b : a))
      : rs.reduce((a, b) => {
        const [na, nb] = [robot.limbs[a.limb].index.length, robot.limbs[b.limb].index.length];
        const mid = mean(rs.map((r) => r.tip));
        return nb < na || (nb === na && Math.hypot(...sub(b.tip, mid)) < Math.hypot(...sub(a.tip, mid))) ? b : a;
      });
    const name = names[lead.limb];
    const last = robot.limbs[lead.limb].chain.joints.at(-1);
    const spins = !!last?.continuous && last.type === 'hinge' && robot.limbs[lead.limb].index.length <= 2;
    const wheelish = WHEEL_NAME.test(name) || (spins && (category === 'mobile' || category === 'aerial'));
    // A fixed dual arm hanging its tools low still has arms, not legs.
    const kind: PartKind = wheelish && (lead.role !== 'leg' || category === 'mobile') ? 'wheel'
      : HEAD_NAME.test(name) ? 'head' : lead.role === 'leg' && category !== 'arm' ? 'leg' : lead.role !== 'other' ? 'arm' : 'other';
    const lat = dot(sub(lead.tip, centre), left);
    const side = nameSide(name) ?? (Math.abs(lat) < 0.15 * Math.max(lead.length, 1e-3) ? 'centre' : lat > 0 ? 'left' : 'right');
    return { kind, limb: lead.limb, limbs: members, side, front: dot(sub(lead.tip, centre), forward) > 0, label: '', role: lead };
  });

  const arms = parts.filter((p) => p.kind === 'arm');
  for (const p of arms) {
    const l = robot.limbs[p.limb], f = chainFrames(l.chain, limbQ(l, q));
    const others = new Set(arms.filter((o) => o !== p).flatMap((o) => robot.limbs[o.limb].index));
    const k = Math.max(0, l.index.findIndex((i) => !others.has(i)));
    const pts = [...f.origins.slice(k), f.tip.p];
    p.shoulder = pts[0];
    p.reach = pts.slice(1).reduce((s, x, i) => s + norm(sub(x, pts[i])), 0);
  }

  // Hexapods often stand with their feet barely below the hips, so their legs read as arms.
  if (category === 'legged' && !parts.some((p) => p.kind === 'leg') && parts.filter((p) => p.kind === 'arm').length >= 4) {
    for (const p of parts) if (p.kind === 'arm') p.kind = 'leg';
  }
  for (const kind of ['leg', 'arm', 'head', 'wheel', 'other'] as PartKind[]) {
    const same = parts.filter((p) => p.kind === kind);
    const along = (p: BodyPart) => dot(p.role.tip, forward);
    for (const p of same) {
      const side = p.side === 'centre' ? '' : p.side;
      const peers = same.filter((o) => o.side === p.side).sort((a, b) => along(b) - along(a));
      const rank = peers.length > 1 ? (peers.length === 2 ? ['front', 'rear'] : ['front', 'middle', 'rear'])[Math.min(peers.indexOf(p), 2)] : '';
      const where = kind === 'leg' && rank === 'rear' ? 'hind' : rank;
      const noun = kind === 'wheel' && category === 'aerial' ? 'rotor' : kind === 'head' && side ? 'sensor' : kind;
      const base = kind === 'other' ? pretty(names[p.limb]) : [where, side, noun].filter(Boolean).join(' ');
      p.label = base[0].toUpperCase() + base.slice(1);
    }
    if (same.length === 1 && kind === 'arm' && same[0].side === 'centre') same[0].label = 'Arm';
  }
  const seen = new Map<string, number>();
  for (const p of parts) {
    const n = (seen.get(p.label) ?? 0) + 1;
    seen.set(p.label, n);
    if (n > 1) p.label = `${p.label} ${n}`;
  }

  const partOf: BodyPart[] = [], labels: string[] = [];
  for (const p of parts) {
    for (const i of p.limbs) {
      partOf[i] = p;
      labels[i] = i === p.limb ? p.label : `${p.label} · ${pretty(names[i])}`;
    }
  }
  return { parts, partOf, labels, forward, left, ground, hip };
}

/** The left and right arms of a robot with a pair (a humanoid, a dual-arm cell), left first. */
export function armPair(b: Body): [BodyPart, BodyPart] | null {
  const arms = b.parts.filter((p) => p.kind === 'arm');
  const l = arms.find((p) => p.side === 'left'), r = arms.find((p) => p.side === 'right');
  return l && r ? [l, r] : null;
}

/**
 * Where a standing robot (a humanoid) works, in its own frame: a bench top a comfortable reach below the
 * shoulders (about elbow height, as a person's workbench is), its edge a short step ahead of the feet but
 * close enough for the hands to work past it. Without arms, the hips set the height.
 */
export function workStance(b: Body): { hand: number; front: number; facing: number } {
  const legs = b.parts.filter((p) => p.kind === 'leg'), arms = b.parts.filter((p) => p.kind === 'arm' && p.shoulder);
  const mean = (f: (p: BodyPart) => number) => arms.reduce((s, p) => s + f(p), 0) / arms.length;
  const toes = legs.length ? Math.max(...legs.map((p) => dot(p.role.tip, b.forward))) : 0;
  const step = 0.25 * Math.max(b.hip - b.ground, 0);
  if (!arms.length) return { hand: b.hip, front: toes + step, facing: Math.atan2(b.forward[1], b.forward[0]) };
  const reach = mean((p) => p.reach!), shoulderZ = mean((p) => p.shoulder![2]), shoulderAhead = mean((p) => dot(p.shoulder!, b.forward));
  // Long or lift-mounted arms would put the bench at the shins; keep it at least halfway up.
  const hand = Math.max(shoulderZ - 0.7 * reach, b.ground + 0.45 * (shoulderZ - b.ground));
  const front = legs.length ? Math.max(toes + 0.2 * step, Math.min(toes + step, shoulderAhead + 0.45 * reach)) : shoulderAhead + 0.25 * reach;
  return { hand, front, facing: Math.atan2(b.forward[1], b.forward[0]) };
}
