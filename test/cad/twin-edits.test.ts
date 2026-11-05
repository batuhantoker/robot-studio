import { existsSync, readFileSync } from 'node:fs';
import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Assembly } from '@/cad/assembly/types';
import { cadPlan } from '@/cad/assembly/hybrid/match';
import type { CatalogRobot } from '@/app/robots/catalog';
import { sessionFromCatalog } from '@/app/robots/from-catalog';
import { sessionFromTwin } from '@/app/robots/from-twin';
import { pose } from '@/app/robots/session';
import { restTwin } from '@/app/robots/twin-rest';
import { chainFrames } from '@/core/chain/kinematics/frames';
import { limbQ } from '@/core/chain/limbs/types';
import { homePose } from '@/core/robot/config/pose';
import { toStudioDict } from '@/core/robot/io/export';
import { parseRobot } from '@/core/robot/schema/parse';
import type { RobotSpec } from '@/core/robot/schema/types';

// public/robots is fetched locally, never committed, so these only run where the pack is.
const ROOT = 'public/robots/';
const pack = existsSync(`${ROOT}index.json`);

describe.skipIf(!pack)('a twin of a CAD arm', () => {
  const robots: CatalogRobot[] = pack ? JSON.parse(readFileSync(`${ROOT}index.json`, 'utf8')).robots : [];
  const ur5e = robots.find((r) => r.id === 'ur5e')!;
  const ref = { catalogId: 'ur5e', chainIndex: 0 };

  beforeAll(() => {
    globalThis.fetch = (async (u: string) => new Response(readFileSync(ROOT + String(u).replace(/^.*?robots\//, '')))) as typeof fetch;
  });

  async function twin() {
    const s = await sessionFromCatalog(ur5e, undefined, null);
    const l = s.limbs[0];
    const made = restTwin(l.chain, 'ur5e_twin', l.index.map((i) => s.torqueLimits[i]), limbQ(l, s.home));
    return { s, l, made, raw: toStudioDict(made.spec) as { links: Record<string, unknown>[] } };
  }

  const edited = (raw: { links: Record<string, unknown>[] }, patch: Record<string, unknown>) =>
    parseRobot({ ...raw, links: raw.links.map((l, i) => (i === 0 ? { ...l, ...patch } : l)) });

  /** Every drawn vertex of a module, as posed at rest. */
  function meshOf(a: Assembly, module: string): number[] {
    const out: number[] = [];
    a.root.traverse((o) => {
      const m = o as THREE.Mesh;
      let owner: THREE.Object3D | null = m;
      while (owner && owner.userData.module === undefined) owner = owner.parent;
      if (m.isMesh && owner?.userData.module === module && m.geometry.attributes.position) out.push(...(m.geometry.attributes.position.array as Float32Array).slice(0, 600));
    });
    return out;
  }

  const kinds = (a: Assembly) => a.modules.map((m) => m.kind);
  const open = (spec: RobotSpec) => sessionFromTwin('t', spec, ref, ur5e);

  it('opens standing as the robot stands, with gains sized to the arm', async () => {
    const { s, l, made } = await twin();
    const t = await open(made.spec);
    const robot = chainFrames(l.chain, limbQ(l, s.home)).tip.p;
    const tip = chainFrames(t.limbs[0].chain, homePose(made.spec)).tip.p;
    expect(Math.hypot(...robot.map((v, k) => v - tip[k]))).toBeLessThan(1e-6);
    expect(made.spec.links[1].kp).toBeGreaterThan(500);
    expect(made.spec.links[1].kd).toBeGreaterThan(30);
    // Light wrists get less than heavy shoulders: per joint, not one number.
    expect(made.spec.links[5].kp).toBeLessThan(made.spec.links[1].kp / 5);
    t.dispose();
    s.dispose();
  });

  it('agrees with MuJoCo at its home', async () => {
    const { s, made } = await twin();
    const t = await open(made.spec);
    expect(pose(t, t.home, 0).agreement).toBeLessThan(1e-6);
    t.dispose();
    s.dispose();
  });

  it('keeps its real CAD and the same mesh through a mass edit', async () => {
    const { s, made, raw } = await twin();
    const [a, b] = [await open(made.spec), await open(edited(raw, { mass: 9 }))];
    expect(kinds(b.assembly)).toEqual(kinds(a.assembly));
    expect(kinds(b.assembly).some((k) => k.includes('procedural'))).toBe(false);
    expect(meshOf(b.assembly, 'joint:shoulder_pan_joint')).toEqual(meshOf(a.assembly, 'joint:shoulder_pan_joint'));
    [a, b, s].forEach((x) => x.dispose());
  });

  it('keeps the same mesh through a radius edit', async () => {
    const { s, made, raw } = await twin();
    const [a, b] = [await open(made.spec), await open(edited(raw, { radius: 0.08 }))];
    expect(kinds(b.assembly)).toEqual(kinds(a.assembly));
    expect(meshOf(b.assembly, 'joint:shoulder_pan_joint')).toEqual(meshOf(a.assembly, 'joint:shoulder_pan_joint'));
    [a, b, s].forEach((x) => x.dispose());
  });

  it.each([['along the link', [0, -0.16, 0]], ['sideways', [0.02, -0.138, 0]], ['up', [0, -0.138, 0.03]]])('reshapes the real mesh for an offset edit %s', async (_, offset) => {
    const { s, made, raw } = await twin();
    const [a, b] = [await open(made.spec), await open(edited(raw, { offset }))];
    expect(b.assembly.modules.find((m) => m.label === 'shoulder_pan_joint')?.kind).toBe('CAD · stretched');
    expect(kinds(b.assembly).some((k) => k.includes('procedural'))).toBe(false);
    expect(meshOf(b.assembly, 'joint:shoulder_pan_joint')).not.toEqual(meshOf(a.assembly, 'joint:shoulder_pan_joint'));
    [a, b, s].forEach((x) => x.dispose());
  });

  it('still goes procedural when the joint itself changes', async () => {
    const { s, made } = await twin();
    const link = { ...made.spec.links[0], joint: 'prismatic' as const };
    expect(cadPlan(link, 0, made)).toBeNull();
    s.dispose();
  });

  it('is cut from the bare arm, so a fitted tool does not stretch its last link', async () => {
    const s = await sessionFromCatalog(ur5e, undefined, 'spindle');
    const l = s.limbs[0];
    const made = restTwin(s.bareChains![0], 'ur5e_twin', l.index.map((i) => s.torqueLimits[i]), limbQ(l, s.home));
    const t = await open(made.spec);
    expect(kinds(t.assembly)).not.toContain('CAD · stretched');
    [t, s].forEach((x) => x.dispose());
  });

  describe('with a tool', () => {
    const arm = () => robots.find((r) => r.id === 'armor-motoman-mh5')!;
    const seat = { catalogId: 'armor-motoman-mh5', chainIndex: 0 };

    async function bare() {
      const s = await sessionFromCatalog(arm(), undefined, null);
      const l = s.limbs[0];
      return { s, l, spec: restTwin(l.chain, 'mh5_twin', l.index.map((i) => s.torqueLimits[i]), limbQ(l, s.home)).spec };
    }

    it('draws nothing past the CAD on a bare flange', async () => {
      const { s, spec } = await bare();
      const t = await sessionFromTwin('t', spec, seat, arm());
      expect(spec.effector).toBe('flange');
      expect(t.assembly.effector).toBeUndefined();
      expect(t.rigs).toEqual([null]);
      expect(t.grips).toBe(false);
      t.dispose();
      s.dispose();
    });

    it('wears a gripper where the arm itself wears it, and grips with it', async () => {
      const { s, spec } = await bare();
      const fitted = await sessionFromCatalog(arm(), undefined, 'parallel');
      const t = await sessionFromTwin('t', { ...spec, effector: 'parallel' }, seat, arm());
      const rig = t.rigs[0]!;
      expect(t.grips).toBe(true);
      expect(rig.kind).toBe('parallel');
      expect(t.assembly.modules.some((m) => m.id === 'tool')).toBe(true);
      expect(t.assembly.hull!.some((v) => v.module === 'tool')).toBe(true);
      const f = chainFrames(t.limbs[0].chain, t.home).tip;
      const out = f.R.length ? [0, 1, 2].map((r) => f.R[3 * r] * rig.tool.approach[0] + f.R[3 * r + 1] * rig.tool.approach[1] + f.R[3 * r + 2] * rig.tool.approach[2]) : [];
      const end = f.p.map((v, k) => v + out[k] * rig.tool.beyond);
      const real = chainFrames(fitted.limbs[0].chain, limbQ(fitted.limbs[0], fitted.home)).tip.p;
      expect(Math.hypot(...end.map((v, k) => v - real[k]))).toBeLessThan(1e-3);
      t.dispose();
      fitted.dispose();
      s.dispose();
    });

    it('gives the tool the room at home the catalog arm gives it, so no contact there passes as designed', async () => {
      const robot = robots.find((r) => r.id === 'armor-mitsubishi-rh6crh6020')!;
      const s = await sessionFromCatalog(robot, undefined, null);
      const l = s.limbs[0], spec = restTwin(l.chain, 'rh6_twin', l.index.map((i) => s.torqueLimits[i]), limbQ(l, s.home)).spec;
      const fit = { catalogId: robot.id, chainIndex: 0 };
      const at = (t: { joints: { name: string }[]; home: number[] }) => t.home[t.joints.findIndex((j) => j.name === 'rh6crh6020_joint_3')];
      const fitted = await sessionFromCatalog(robot, undefined, 'parallel');
      const t = await sessionFromTwin('t', { ...spec, effector: 'parallel' }, fit, robot);
      expect(at(t)).toBeCloseTo(at(fitted), 6);
      t.dispose();
      const none = await sessionFromTwin('t', spec, fit, robot);
      expect(at(none)).toBeCloseTo(at(s), 6);
      none.dispose();
      fitted.dispose();
      s.dispose();
    });

    it('does not lift the floor for it', async () => {
      const { s, spec } = await bare();
      const [a, b] = [await sessionFromTwin('a', spec, seat, arm()), await sessionFromTwin('b', { ...spec, effector: 'suction' }, seat, arm())];
      expect(b.assembly.floorZ).toBeCloseTo(a.assembly.floorZ, 9);
      a.dispose();
      b.dispose();
      s.dispose();
    });

    it('draws a joint with an edited axis inside the real link it replaces', async () => {
      const { s, spec } = await bare();
      const raw = toStudioDict(spec) as { links: { axis: number[] }[] };
      const last = raw.links.length - 1, swapped = raw.links[last].axis.map((_, k) => (k === 1 ? 1 : 0));
      const moved = parseRobot({ ...raw, links: raw.links.map((l, i) => (i === last ? { ...l, axis: swapped } : l)) });
      const [a, b] = [await sessionFromTwin('a', spec, seat, arm()), await sessionFromTwin('b', moved, seat, arm())];
      const width = (t: typeof a) => {
        const box = new THREE.Box3();
        t.assembly.root.traverse((o) => {
          if (o.userData.module === `joint:${spec.links[last].name}`) box.expandByObject(o);
        });
        return box.getSize(new THREE.Vector3()).toArray().sort((x, y) => x - y)[1];
      };
      expect(b.assembly.modules.at(-1)!.kind).toMatch(/procedural/);
      expect(width(b)).toBeLessThan(1.3 * width(a));
      a.dispose();
      b.dispose();
      s.dispose();
    });

    it('moves with the last link when its length is edited', async () => {
      const { s, spec } = await bare();
      const raw = toStudioDict({ ...spec, effector: 'parallel' }) as { links: { offset: number[] }[] };
      const links = raw.links.map((l, i) => (i === raw.links.length - 1 ? { ...l, offset: l.offset.map((v, k) => v + (k === 0 ? 0.05 : 0)) } : l));
      const [a, b] = [await sessionFromTwin('a', { ...spec, effector: 'parallel' }, seat, arm()), await sessionFromTwin('b', parseRobot({ ...raw, links }), seat, arm())];
      const x = (t: typeof a) => t.assembly.effector!.group.position.x;
      expect(x(b) - x(a)).toBeCloseTo(0.05, 6);
      a.dispose();
      b.dispose();
      s.dispose();
    });
  });
});
