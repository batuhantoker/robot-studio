/** Every reviewed grip on its real hand model. The robot pack is not in the repo, so this runs where it has been fetched. */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { handSurface } from '@/app/controller/grasp/surface';
import { sessionFromCatalog } from '@/app/robots/from-catalog';
import type { RobotSession } from '@/app/robots/session';
import { CONTACT, linkGap } from '@/core/prosthesis/closure';
import { graspClip, openMotors, solveGrasp } from '@/core/prosthesis/grasp';
import { GRASPS } from '@/core/prosthesis/grasps';
import { jointsFor, onLinkage } from '@/core/prosthesis/motors';

const PACK = path.resolve('public/robots');
const hasPack = fs.existsSync(path.join(PACK, 'index.json'));

async function load(id: string): Promise<RobotSession> {
  const index = JSON.parse(fs.readFileSync(path.join(PACK, 'index.json'), 'utf8'));
  globalThis.fetch = (async (u: string) => new Response(fs.readFileSync(path.join(PACK, String(u).replace(/^.*robots\//, ''))))) as typeof fetch;
  return sessionFromCatalog(index.robots.find((r: { id: string }) => r.id === id));
}

describe.skipIf(!hasPack)('grips on the real hands', () => {
  for (const id of Object.keys(GRASPS)) {
    it(`${id}: fingers end on the surface, nothing passes through it, and every pose is on the linkage`, async () => {
      const s = await load(id);
      const map = s.prosthesis!, surface = handSurface(s);
      const near = surface.links.flatMap((l, i) => (l.finger || /palm|hand/.test(l.name) ? [i] : []));
      const gaps = (q: number[], held: Parameters<typeof linkGap>[2]) => {
        const f = surface.frames(q);
        return near.map((i) => ({ finger: surface.links[i].finger, gap: linkGap(surface.links[i], f[i], held) }));
      };
      try {
        for (const g of GRASPS[id]) {
          const open = openMotors(map, g.open), q = jointsFor(map, open, s.home);
          const plan = solveGrasp(g, map, surface, q, (v) => !!s.collision?.hit(v));
          const clip = graspClip(plan, map, q, open);
          const hold = gaps(jointsFor(map, plan.shut, q), plan.held);
          for (const f of g.touch ?? g.order.flat().filter((d) => d !== 'hand')) {
            expect(Math.min(...hold.filter((h) => h.finger === f).map((h) => h.gap)), `${g.name} ${f}`).toBeLessThan(CONTACT * 2.5);
          }
          for (let i = 0; i < 40; i++) {
            const t = (clip.period * i) / 40, qt = clip.at(t);
            expect(onLinkage(map, qt, 1e-4), `${g.name} @${t}`).toBe(true);
            expect(s.collision?.hit(qt) ?? null, `${g.name} @${t}`).toBeNull();
            expect(Math.min(...gaps(qt, { shape: clip.shape, pose: clip.held(t) }).map((h) => h.gap)), `${g.name} @${t}`).toBeGreaterThanOrEqual(0);
          }
        }
      } finally {
        surface.dispose();
      }
    }, 60000);
  }
});
