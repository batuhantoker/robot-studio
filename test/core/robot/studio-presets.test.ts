import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { gravityLoad } from '@/core/analysis/statics/gravity';
import { forwardKinematics } from '@/core/chain/kinematics/frames';
import { chainFromSpec } from '@/core/chain/model/from-spec';
import { rng, uniform } from '@/core/math/random/rng';
import { toMjcf } from '@/core/mjcf/writer/serial-arm';
import { specDofs } from '@/core/robot/config/pose';
import { parseRobot } from '@/core/robot/schema/parse';
import type { RobotSpec } from '@/core/robot/schema/types';
import { ModelHandle } from '@/physics/model/handle';
import { OBJ, state } from '@/physics/runtime/arrays';
import { expectClose } from '../../support/fixtures';

const DIR = new URL('../../../presets/studio/', import.meta.url);
const spec = (id: string): RobotSpec => parseRobot(JSON.parse(fs.readFileSync(new URL(`${id}.json`, DIR), 'utf8')));
const ids = fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).map((f) => f.replace('.json', ''));

type M = number[][];
const mul = (a: M, b: M): M => a.map((r) => b[0].map((_, j) => r.reduce((s, v, k) => s + v * b[k][j], 0)));
const rz = (t: number): M => [[Math.cos(t), -Math.sin(t), 0, 0], [Math.sin(t), Math.cos(t), 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
const rx = (t: number): M => [[1, 0, 0, 0], [0, Math.cos(t), -Math.sin(t), 0], [0, Math.sin(t), Math.cos(t), 0], [0, 0, 0, 1]];
const tr = (x: number, y: number, z: number): M => [[1, 0, 0, x], [0, 1, 0, y], [0, 0, 1, z], [0, 0, 0, 1]];

/** Published DH tables as [theta offset, d, a, alpha]; `mod` rows are Craig's (alpha, a before the joint). */
interface Dh { conv: 'std' | 'mod'; rows: number[][]; flange: number[]; pre: M }
const PI = Math.PI;
const DH: Record<string, Dh> = {
  ur5e: { conv: 'std', pre: rz(PI), flange: [0], rows: [
    [0, 0.1625, 0, PI / 2], [0, 0, -0.425, 0], [0, 0, -0.3922, 0], [0, 0.1333, 0, PI / 2], [0, 0.0997, 0, -PI / 2], [0, 0.0996, 0, 0]] },
  panda: { conv: 'mod', pre: tr(0, 0, 0), flange: [0.107, 0, 0], rows: [
    [0, 0.333, 0, 0], [0, 0, 0, -PI / 2], [0, 0.316, 0, PI / 2], [0, 0, 0.0825, PI / 2],
    [0, 0.384, -0.0825, -PI / 2], [0, 0, 0, PI / 2], [0, 0, 0.088, PI / 2]] },
  iiwa14: { conv: 'std', pre: tr(0, 0, 0), flange: [0], rows: [
    [0, 0.36, 0, -PI / 2], [0, 0, 0, PI / 2], [0, 0.42, 0, PI / 2], [0, 0, 0, -PI / 2],
    [0, 0.4, 0, -PI / 2], [0, 0, 0, PI / 2], [0, 0.126, 0, 0]] },
  puma560: { conv: 'std', pre: tr(0, 0, 0.66), flange: [0], rows: [
    [0, 0, 0, PI / 2], [0, 0, 0.4318, 0], [0, 0.15005, 0.0203, -PI / 2], [0, 0.4318, 0, PI / 2], [0, 0, 0, -PI / 2], [0, 0.056, 0, 0]] },
  irb120: { conv: 'std', pre: tr(0, 0, 0), flange: [0], rows: [
    [0, 0.29, 0, -PI / 2], [-PI / 2, 0, 0.27, 0], [0, 0, 0.07, -PI / 2], [0, 0.302, 0, PI / 2], [0, 0, 0, -PI / 2], [PI, 0.072, 0, 0]] },
};

function dhTip({ conv, rows, flange, pre }: Dh, q: number[]): number[] {
  let T = pre;
  rows.forEach(([th, d, a, al], i) => {
    T = conv === 'std'
      ? mul(T, mul(mul(rz(th + q[i]), tr(0, 0, d)), mul(tr(a, 0, 0), rx(al))))
      : mul(T, mul(mul(rx(al), tr(a, 0, 0)), mul(rz(th + q[i]), tr(0, 0, d))));
  });
  if (conv === 'mod') T = mul(T, mul(mul(rx(flange[2]), tr(flange[1], 0, 0)), tr(0, 0, flange[0])));
  return [T[0][3], T[1][3], T[2][3]];
}

describe('studio presets', () => {
  it('every file parses as a robot', () => {
    expect(ids.length).toBeGreaterThanOrEqual(10);
    for (const id of ids) expect(spec(id).name).toBe(id);
  });

  for (const [id, table] of Object.entries(DH)) {
    it(`${id} matches its published DH table`, () => {
      const s = spec(id);
      const chain = chainFromSpec(s);
      const next = rng(7);
      for (let k = 0; k < 20; k++) {
        const q = specDofs(s).map((d) => uniform(next, d.limits[0], d.limits[1]));
        expectClose(forwardKinematics(chain, q).p, dhTip(table, q), 1e-9);
      }
    });
  }

  for (const id of ids) {
    it(`${id}: FK and gravity torque agree with MuJoCo`, async () => {
      const s = spec(id);
      const h = await ModelHandle.fromXml(toMjcf(s));
      try {
        const dofs = specDofs(s);
        const chain = chainFromSpec(s);
        const site = h.id(OBJ.site, 'end_effector');
        const d = state(h.data);
        const next = rng(5);
        for (let k = 0; k < 6; k++) {
          const q = dofs.map((dof) => uniform(next, dof.limits[0], dof.limits[1]));
          d.qpos.set(q);
          d.qvel.fill(0);
          h.mj.mj_forward(h.model, h.data);
          expectClose(forwardKinematics(chain, q).p, Array.from(d.site_xpos.slice(3 * site, 3 * site + 3)), 1e-12);
          expectClose(gravityLoad(chain, q).torque, Array.from(d.qfrc_bias), 1e-9);
        }
      } finally {
        h.dispose();
      }
    });
  }
});
