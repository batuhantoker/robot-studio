/**
 * Try carry clearances until a cycle plans and no sample of it touches the robot or the floor: more
 * clearance first (to clear contacts), then less (for arms that cannot lift far above the work, like a SCARA quill).
 */
import type { PlanProblem, TaskClip } from '../types';
import { type CycleInput, planCycle } from './cycle';

export const isClip = (p: TaskClip | PlanProblem): p is TaskClip => 'period' in p;

function firstContact(clip: TaskClip, probe: (q: number[]) => string | null, step = 0.04): string | null {
  for (let t = 0; t < clip.period; t += step) {
    const hit = probe(clip.at(t).q);
    if (hit) return hit;
  }
  return null;
}

export function planTask(c: CycleInput, probe: (q: number[]) => string | null): TaskClip | PlanProblem {
  let problem: PlanProblem | null = null;
  for (const k of [1, 1.8, 2.8, 0.5, 0.2]) {
    const plan = planCycle({ ...c, lift: c.lift * k });
    if (!isClip(plan)) {
      problem ??= plan;
      continue;
    }
    const hit = firstContact(plan, probe);
    if (!hit) return plan;
    if (!problem || problem.where !== 'path') problem = { where: 'path', message: `The path would touch ${hit}` };
  }
  return problem!;
}
