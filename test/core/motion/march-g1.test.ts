import fs from 'node:fs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { footingOf } from '@/app/controller/motion/footing';
import { sessionFromCatalog } from '@/app/robots/from-catalog';
import type { RobotSession } from '@/app/robots/session';
import { chainFrames } from '@/core/chain/kinematics/frames';
import { limbQ } from '@/core/chain/limbs/types';
import { applyTransform, compose } from '@/core/math/linear/transform';
import { bodyOf } from '@/core/motion/body';
import { zmpOf } from '@/core/motion/stepping/balance';
import { marchClip, marchGait } from '@/core/motion/stepping/march';
import { massModel, massPoints } from '@/core/motion/stepping/mass';
import { margin, supportPolygon } from '@/core/motion/stepping/support';
import type { Footing, MotionClip } from '@/core/motion/types';

const PACK = 'public/robots/';
const fetched = fs.existsSync(`${PACK}armor/unitree-g1/robot.xml`);

// public/robots is fetched locally and never committed, so this only runs where the robot is.
describe.skipIf(!fetched)('the Unitree G1 marching at full size', () => {
  let s: RobotSession, footing: Footing, clip: MotionClip, air: (i: number, ph: number) => boolean;
  const legs = () => bodyOf(s, s.home, s.category).parts.filter((p) => p.kind === 'leg');
  const sole = (i: number, t: number) => {
    const p = legs()[i], l = s.limbs[p.limb];
    const T = compose(clip.body!(t), chainFrames(l.chain, limbQ(l, clip.at(t))).tip);
    return { T, points: footing.feet.get(p.limb)!.sole.map((v) => applyTransform(T, v)) };
  };

  beforeAll(async () => {
    const robot = JSON.parse(fs.readFileSync(`${PACK}index.json`, 'utf8')).robots.find((r: { id: string }) => r.id === 'armor-unitree-g1');
    vi.stubGlobal('fetch', async (url: string) => new Response(fs.readFileSync(PACK + String(url).replace(/^.*robots\//, ''))));
    s = await sessionFromCatalog(robot);
    footing = footingOf(s);
    const body = bodyOf(s, s.home, s.category), gait = marchGait(s, s.home, body, footing, 1);
    clip = marchClip(s, s.home, footing, body, 1)!;
    air = (i, ph) => (((ph - gait.lifts[i]) % 1) + 1) % 1 < gait.air;
  });

  afterAll(() => {
    s?.dispose();
    vi.unstubAllGlobals();
  });

  it('matches MuJoCo on the whole robot\'s centre of mass', () => {
    const q = s.home.map((v, i) => Math.min(Math.max(v + 0.4 * Math.sin(1.3 * i), s.joints[i].limits[0]), s.joints[i].limits[1]));
    const h = s.handle, d = h.data as unknown as { qpos: Float64Array; xipos: Float64Array };
    const m = h.model as unknown as { nbody: number; body_mass: ArrayLike<number> };
    d.qpos.set(s.rest);
    s.qposAdr.forEach((a, k) => (d.qpos[a] = q[k]));
    h.mj.mj_kinematics(h.model, h.data);
    const sum = [0, 0, 0, 0];
    for (let b = 1; b < m.nbody; b++) {
      sum[3] += m.body_mass[b];
      for (let k = 0; k < 3; k++) sum[k] += m.body_mass[b] * d.xipos[3 * b + k];
    }
    massModel(s)(q).forEach((v, k) => expect(v).toBeCloseTo(sum[k] / sum[3], 6));
  });

  it('plants its feet: under 1 mm of slip, no tilt, no floor penetration', () => {
    const lead = clip.lead!, N = 480;
    legs().forEach((_, i) => {
      const down = Array.from({ length: N }, (__, k) => k / N).filter((ph) => !air(i, ph));
      const first = sole(i, lead + down[0] * clip.period).points;
      for (const ph of down) {
        const { T, points } = sole(i, lead + ph * clip.period);
        points.forEach((p, j) => expect(Math.hypot(p[0] - first[j][0], p[1] - first[j][1], p[2] - first[j][2])).toBeLessThan(1e-3));
        expect(Math.acos(Math.min(1, T.R[8]))).toBeLessThan(0.002);
      }
      for (let k = 0; k < N; k++) expect(Math.min(...sole(i, lead + (k / N) * clip.period).points.map((p) => p[2]))).toBeGreaterThan(footing.floor - 2e-4);
    });
  });

  it('keeps its zero-moment point under the feet on the ground', () => {
    const points = massPoints(s), lead = clip.lead!, N = 240;
    const bodies = Array.from({ length: N }, (_, k) => {
      const t = lead + (k / N) * clip.period;
      return points(clip.at(t)).map((b) => ({ m: b.m, p: applyTransform(clip.body!(t), b.p) }));
    });
    const zmp = zmpOf(bodies, clip.period / N, 9.81, footing.floor);
    for (let k = 0; k < N; k++) {
      const t = lead + (k / N) * clip.period;
      const touching = legs().flatMap((_, i) => sole(i, t).points.filter((p) => p[2] < footing.floor + 2e-3).map((p): [number, number] => [p[0], p[1]]));
      expect(margin(supportPolygon(touching), zmp[k] as [number, number])).toBeGreaterThan(0);
    }
  });

  it('marches at about 100 steps a minute with the body swaying a few centimetres', () => {
    expect(120 / clip.period).toBeGreaterThan(95);
    const com = massModel(s), lead = clip.lead!;
    const ys = Array.from({ length: 96 }, (_, k) => {
      const t = lead + (k / 96) * clip.period;
      return applyTransform(clip.body!(t), com(clip.at(t)))[1];
    });
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(0.07);
  });

  it('stands tall on feet under its hips, the pelvis nearly still fore and aft', () => {
    const lead = clip.lead!, body = bodyOf(s, s.home, s.category);
    const parts = legs();
    const hips = parts.reduce((sum, p) => sum + Math.abs(p.role.base[1]), 0) / parts.length;
    expect(Math.abs(sole(0, lead).T.p[1])).toBeLessThan(1.2 * hips);
    const centre: [number, number, number] = [0, 0, parts[0].role.base[2]];
    const xs = Array.from({ length: 96 }, (_, k) => applyTransform(clip.body!(lead + (k / 96) * clip.period), centre)[0]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(0.025);
    expect(body.forward[0]).toBe(1);
  });
});
