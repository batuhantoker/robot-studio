import fs from 'node:fs';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { footingOf } from '@/app/controller/motion/footing';
import { sessionFromCatalog } from '@/app/robots/from-catalog';
import type { RobotSession } from '@/app/robots/session';
import { chainFrames } from '@/core/chain/kinematics/frames';
import { limbQ } from '@/core/chain/limbs/types';
import { applyTransform } from '@/core/math/linear/transform';
import { bodyOf } from '@/core/motion/body';
import { armSwings } from '@/core/motion/stepping/arms';
import type { SteppingClip } from '@/core/motion/stepping/clip';
import { standingStops } from '@/core/motion/stand-stops';
import { bowAt, waveAt } from '@/core/motion/stepping/gesture';
import { leggedAt, leggedGait } from '@/core/motion/stepping/legged';
import { marchAt } from '@/core/motion/stepping/march';
import { squatAt } from '@/core/motion/stepping/squat';

const PACK = 'public/robots/';

async function open(id: string): Promise<RobotSession> {
  const robot = JSON.parse(fs.readFileSync(`${PACK}index.json`, 'utf8')).robots.find((r: { id: string }) => r.id === id);
  return sessionFromCatalog(robot);
}

/** Where a leg's contact point is on the stage at time t. */
function contact(s: RobotSession, clip: SteppingClip, limb: number, t: number) {
  const l = s.limbs[limb], sole = footingOf(s).feet.get(limb)!.sole;
  const point = sole.reduce((a, p) => [a[0] + p[0] / sole.length, a[1] + p[1] / sole.length, a[2] + p[2] / sole.length], [0, 0, 0]);
  return applyTransform(clip.body!(t), applyTransform(chainFrames(l.chain, limbQ(l, clip.at(t))).tip, point as [number, number, number]));
}

// public/robots is fetched locally and never committed, so this only runs where the pack is.
describe.skipIf(!fs.existsSync(`${PACK}index.json`))('stepping on real bodies', () => {
  vi.stubGlobal('fetch', async (url: string) => new Response(fs.readFileSync(PACK + String(url).replace(/^.*robots\//, ''))));
  afterAll(() => vi.unstubAllGlobals());

  it('trots with a foot either planted exactly or clear of the floor, the ZMP under the standing pair', async () => {
    const s = await open('armor-unitree-go2');
    const body = bodyOf(s, s.home, s.category), footing = footingOf(s);
    const clip = leggedAt('trot', s, s.home, footing, body, 1, 0) as SteppingClip;
    expect(clip.balance).toBeGreaterThan(2e-3);
    const legs = body.parts.filter((p) => p.kind === 'leg'), n = 60;
    for (const leg of legs) {
      const path = Array.from({ length: n }, (_, k) => contact(s, clip, leg.limb, clip.lead! + (k / n) * clip.period));
      const floor = Math.min(...path.map((p) => p[2]));
      expect(floor).toBeGreaterThan(footing.floor - 1e-3);
      expect(Math.max(...path.map((p) => p[2])) - floor).toBeGreaterThan(0.05);
      const down = path.filter((p) => p[2] < floor + 1e-4);
      const slide = Math.max(...down.map((p) => Math.hypot(p[0] - down[0][0], p[1] - down[0][1])));
      expect(slide).toBeLessThan(5e-4);
    }
    s.dispose();
  });

  it('walks Jumper on the tripods its makers train: LF/RM/LR, then RF/LM/RR', async () => {
    const s = await open('armor-jumper');
    const body = bodyOf(s, s.home, s.category), legs = body.parts.filter((p) => p.kind === 'leg');
    expect(legs.length).toBe(6);
    const { lifts } = leggedGait(body, footingOf(s), 'tripod', 1);
    const group = (first: number) => legs.filter((_, i) => lifts[i] === first).map((p) => s.limbs[p.limb].name.slice(0, 2)).sort();
    expect(group(0)).toEqual(['LF', 'LR', 'RM']);
    expect(group(0.5)).toEqual(['LM', 'RF', 'RR']);
    s.dispose();
  });

  it('finds the elbow, not a wrist on the same axis, and reads a held-out arm from hanging', async () => {
    const h2 = await open('armor-unitree-h2');
    const a = armSwings(h2, h2.home, bodyOf(h2, h2.home, h2.category));
    expect(a.map((x) => h2.joints[x.elbow!].name).sort()).toEqual(['left_elbow_joint', 'right_elbow_joint']);
    h2.dispose();
    const jaka = await open('armor-jaka-pi');
    const b = armSwings(jaka, jaka.home, bodyOf(jaka, jaka.home, jaka.category));
    expect(b.map((x) => jaka.joints[x.elbow!].name).sort()).toEqual(['Left_elbow_joint', 'Right_elbow_joint']);
    jaka.dispose();
  });

  it('leaves the waist alone when a model runs its legs through it', async () => {
    const s = await open('armor-star1');
    const clip = marchAt(s, s.home, footingOf(s), bodyOf(s, s.home, s.category), 1, 0) as SteppingClip;
    expect(clip.balance).toBeGreaterThan(2e-3);
    const pitch = s.joints.findIndex((j) => j.name === 'waist_pitch_joint');
    for (let k = 0; k < 40; k++) expect(clip.at(clip.lead! + (k / 40) * clip.period)[pitch]).toBeCloseTo(s.home[pitch], 6);
    s.dispose();
  });

  it('squats with both feet where they stood, sinking and rising once a cycle', async () => {
    const s = await open('armor-unitree-g1');
    const body = bodyOf(s, s.home, s.category), legs = body.parts.filter((p) => p.kind === 'leg');
    const clip = squatAt(s, s.home, footingOf(s), body, 1, 0) as SteppingClip;
    expect(clip.balance).toBeGreaterThan(0.02);
    const times = Array.from({ length: 48 }, (_, k) => clip.lead! + (k / 48) * clip.period);
    const heights = times.map((t) => clip.body!(t).p[2]);
    expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(0.1);
    // A lead a round share of the span: the player's probes land on its last instant, where rounding once ran off the spline.
    const span = clip.period + clip.lead!;
    for (let i = 0; i < 120; i++) expect(clip.at((span * i) / 120).every(Number.isFinite)).toBe(true);
    for (const leg of legs) {
      const l = s.limbs[leg.limb], tip = (t: number) => applyTransform(clip.body!(t), chainFrames(l.chain, limbQ(l, clip.at(t))).tip.p);
      const from = tip(times[0]);
      expect(Math.max(...times.map((t) => Math.hypot(...tip(t).map((v, i) => v - from[i]))))).toBeLessThan(1e-3);
    }
    s.dispose();
  });

  it('waves with both feet where they stood, the hand up and the weight on the far foot', async () => {
    const s = await open('armor-unitree-g1');
    const body = bodyOf(s, s.home, s.category), legs = body.parts.filter((p) => p.kind === 'leg');
    const hand = body.parts.find((p) => p.kind === 'arm' && p.side === 'right')!;
    const clip = waveAt(s, s.home, footingOf(s), body, 1, 0) as SteppingClip;
    expect(clip.balance).toBeGreaterThan(0.02);
    const times = Array.from({ length: 60 }, (_, k) => clip.lead! + (k / 60) * clip.period);
    const onStage = (limb: number, t: number) => {
      const l = s.limbs[limb];
      return applyTransform(clip.body!(t), chainFrames(l.chain, limbQ(l, clip.at(t))).tip.p);
    };
    for (const leg of legs) {
      const from = onStage(leg.limb, times[0]);
      expect(Math.max(...times.map((t) => Math.hypot(...onStage(leg.limb, t).map((v, i) => v - from[i]))))).toBeLessThan(1e-3);
    }
    const shoulder = applyTransform(clip.body!(times[0]), hand.shoulder!);
    expect(Math.max(...times.map((t) => onStage(hand.limb, t)[2]))).toBeGreaterThan(shoulder[2] + 0.1);
    const across = times.map((t) => clip.body!(t).p[1]);
    expect(Math.max(...across) - Math.min(...across)).toBeGreaterThan(0.01);
    s.dispose();
  });

  it('keeps the soles level through its default crouch', async () => {
    const s = await open('armor-unitree-g1');
    const body = bodyOf(s, s.home, s.category), stops = standingStops(s, s.home, body)!;
    for (const leg of body.parts.filter((p) => p.kind === 'leg')) {
      const l = s.limbs[leg.limb], at = (q: number[]) => chainFrames(l.chain, limbQ(l, q)).tip;
      at(stops[1]).R.forEach((v, k) => expect(v).toBeCloseTo(at(s.home).R[k], 2));
      expect(at(stops[1]).p[2] - at(s.home).p[2]).toBeGreaterThan(0.05);
    }
    s.dispose();
  });

  it('bows from the hips with the weight kept over its feet', async () => {
    const s = await open('armor-unitree-g1');
    const body = bodyOf(s, s.home, s.category);
    const clip = bowAt(s, s.home, footingOf(s), body, 1, 0) as SteppingClip;
    expect(clip.balance).toBeGreaterThan(0.02);
    const pitch = (t: number) => Math.atan2(clip.body!(t).R[2], clip.body!(t).R[8]);
    const times = Array.from({ length: 60 }, (_, k) => clip.lead! + (k / 60) * clip.period);
    expect(Math.max(...times.map((t) => Math.abs(pitch(t))))).toBeGreaterThan(0.5);
    s.dispose();
  });
});
