import { existsSync, readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { armFit } from '@/cad/assembly/mjcf/mounts';
import { type DrivenRig, fixedTool, ownTool } from '@/cad/assembly/mjcf/own-tools';
import { MotionPlayer } from '@/app/controller/motion/player';
import { presetsFor as trajectoryPresets } from '@/app/controller/trajectory-presets';
import { arrange, taskSetup } from '@/app/controller/task/setup';
import type { CatalogRobot } from '@/app/robots/catalog';
import { sessionFromCatalog } from '@/app/robots/from-catalog';
import { type RobotSession, pose } from '@/app/robots/session';
import { chainFrames } from '@/core/chain/kinematics/frames';
import { limbQ } from '@/core/chain/limbs/types';
import { type Vec3, cross, dot, norm, sub } from '@/core/math/linear/vec';
import { isClip, planTask } from '@/core/task/plan/check';
import type { EffectorKind } from '@/core/robot/schema/types';
import { readGeoms, visibleGeom } from '@/physics/extract/geoms';
import { OBJ, arrays } from '@/physics/runtime/arrays';

// public/robots is fetched locally, never committed, so these only run where the pack is.
const ROOT = 'public/robots/';
const pack = existsSync(`${ROOT}index.json`);

describe.skipIf(!pack)('catalog arms and their tools', () => {
  const robots: CatalogRobot[] = pack ? JSON.parse(readFileSync(`${ROOT}index.json`, 'utf8')).robots : [];
  const open = (id: string, kind: EffectorKind | null) => sessionFromCatalog(robots.find((r) => r.id === id)!, undefined, kind);

  beforeAll(() => {
    globalThis.fetch = (async (u: string) => new Response(readFileSync(ROOT + String(u).replace(/^.*?robots\//, '')))) as typeof fetch;
  });

  function plans(s: RobotSession) {
    const found = taskSetup(s, s.defaultFocus);
    expect(found).not.toBeNull();
    const { setup: t, spots } = arrange(found!);
    expect(spots).not.toBeNull();
    return planTask({ ctx: t.ctx, home: t.home, pick: spots![0], place: spots![1], object: t.object, lift: t.lift, base: t.base }, t.probe);
  }

  it('knows every arm: a mount, its own gripper, or a tool that stays', () => {
    const arms = robots.filter((r) => !r.prosthesis && (r.category ?? 'arm') === 'arm');
    expect(arms.filter((r) => !armFit(r.id) && !ownTool(r.id) && !fixedTool(r.id)).map((r) => r.id)).toEqual([]);
  });

  it('a bare arm cannot hold anything, and does not pretend', async () => {
    const s = await open('armor-ur5e', null);
    expect(s.grips).toBe(false);
    expect(taskSetup(s, s.defaultFocus)).toBeNull();
    s.dispose();
  });

  it('a torch, spindle or flange does not grip either, but its tool point still moves', async () => {
    const bare = await open('armor-ur5e', null);
    for (const kind of ['torch', 'spindle', 'flange'] as const) {
      const s = await open('armor-ur5e', kind);
      expect(s.grips).toBe(false);
      expect(s.fitted).toBe(kind);
      expect(taskSetup(s, s.defaultFocus)).toBeNull();
      expect(pose(s, s.home, 0).agreement).toBeLessThan(1e-9);
      s.dispose();
    }
    bare.dispose();
  });

  it.each(['armor-ur5e', 'armor-epson-gx8-c452s', 'armor-jaka-k1', 'armor-kuka-kr16'])('%s plans a gripper cycle, with FK and MuJoCo agreeing at the tool', async (id) => {
    const s = await open(id, 'parallel');
    expect(s.grips).toBe(true);
    expect(pose(s, s.home, 0).agreement).toBeLessThan(1e-9);
    expect(isClip(plans(s))).toBe(true);
    s.dispose();
  });

  it.each(['ur5e', 'armor-abb-irb6640', 'armor-fanuc-crx10ia', 'armor-kuka-kr16', 'armor-mitsubishi-rh6frh5520', 'armor-dobot-cr5'])('%s: the tool runs along the last joint, on its axis, leaving the wrist', async (id) => {
    const s = await open(id, 'spindle');
    const { limb } = armFit(id)!.mounts[0];
    const l = s.limbs[limb], f = chainFrames(l.chain, limbQ(l, s.home));
    const last = f.axes.length - 1, a = f.axes[last], R = f.tip.R, z = [R[2], R[5], R[8]] as Vec3;
    expect(Math.abs(dot(a, z))).toBeCloseTo(1, 6);
    const rel = sub(f.tip.p, f.origins[last]);
    expect(norm(cross(a, rel))).toBeLessThan(1e-5);
    expect(dot(rel, z)).toBeGreaterThan(0);
    s.dispose();
  });

  it('gives each arm of a pair its own tool', async () => {
    const s = await open('armor-abb-yumi', 'parallel');
    expect(s.rigs.filter(Boolean)).toHaveLength(2);
    s.dispose();
  });

  it('keeps an arm’s own gripper and drives its finger joints, off the chain or on it', async () => {
    const panda = await open('franka_panda', 'three_finger');
    expect(panda.fitted).toBeNull();
    const rig = panda.rigs[0]!;
    rig.grip!.set(0.02);
    expect(rig.fingers!.map((f) => panda.rest[f.adr])).toEqual([0.01, 0.01]);
    panda.dispose();
    const piper = await open('armor-agilex-piper', null);
    const t = taskSetup(piper, piper.defaultFocus)!;
    const q = t.expand!(t.home, 0.04);
    expect(piper.rigs[0]!.fingers!.map((f) => q[piper.qposAdr.indexOf(f.adr)])).toEqual([0.02, -0.02]);
    piper.dispose();
  });

  it('opens every own gripper inside its joints’ ranges, on each arm', async () => {
    for (const id of ['franka_panda', 'armor-franka', 'trossen_vx300s', 'aloha', 'armor-agilex-piper', 'armor-openarm', 'google_robot', 'unitree_z1', 'so101',
      'armor-hello-robot-stretch-3', 'armor-nori-a3', 'armor-reachy2', 'armor-unitree-r1d', 'armor-star1', 'armor-unitree-h2-plus']) {
      const s = await open(id, null);
      const a = arrays(s.handle.model);
      const own = ownTool(id)!;
      for (const m of own.mounts) {
        for (const f of m.fingers) {
          const j = s.handle.id(OBJ.joint, f.joint);
          // An unlimited joint reads as an empty range.
          const [lo, hi] = a.jnt_limited[j] ? [a.jnt_range[2 * j], a.jnt_range[2 * j + 1]] : [-Infinity, Infinity];
          const hold = f.shut + f.per * 0.75 * own.size;
          expect(hold, `${id} ${f.joint}`).toBeGreaterThanOrEqual(lo - 1e-9);
          expect(hold, `${id} ${f.joint}`).toBeLessThanOrEqual(hi + 1e-9);
        }
      }
      s.dispose();
    }
  });

  it.each(['armor-unitree-g1', 'apptronik_apollo'])('%s has no hand, so it holds nothing', async (id) => {
    const s = await open(id, null);
    expect(s.grips).toBe(false);
    expect(taskSetup(s, s.defaultFocus)).toBeNull();
    s.dispose();
  });

  it('offers Pick & place and Palletize only with something that holds; other paths stay for any tool', async () => {
    const offers = async (kind: EffectorKind | null) => {
      const s = await open('armor-ur5e', kind);
      const player = new MotionPlayer();
      player.load(s, s.home);
      const list = { motion: player.presets.map((p) => p.id), path: trajectoryPresets(s, s.defaultFocus).map((p) => p.id) };
      s.dispose();
      return list;
    };
    for (const kind of [null, 'torch', 'spindle', 'flange'] as const) {
      const { motion, path } = await offers(kind);
      expect(motion).not.toContain('pick');
      expect(path).not.toContain('pick');
      expect(path).not.toContain('pallet');
      expect(path).toContain('weave');
    }
    // A gripper's real Pick & place is Task mode; the Motion list never fakes one.
    const { motion, path } = await offers('parallel');
    expect(motion).not.toContain('pick');
    expect(path).toEqual(expect.arrayContaining(['pick', 'pallet', 'weave']));
  });

  it.each(['armor-hello-robot-stretch-3', 'armor-nori-a3', 'armor-reachy2', 'armor-unitree-r1d', 'armor-star1', 'armor-unitree-h2-plus'])('%s holds with its own fingers, driven', async (id) => {
    const s = await open(id, null);
    expect(s.grips).toBe(true);
    const t = taskSetup(s, s.defaultFocus)!;
    const q = t.expand!(t.home, 0.75 * t.rig.size);
    const open_ = t.expand!(t.home, t.object.open);
    const fingers = (t.rig as DrivenRig).fingers!.map((f) => s.qposAdr.indexOf(f.adr));
    expect(fingers.some((i) => i >= 0 && q[i] !== open_[i])).toBe(true);
    expect(isClip(plans(s))).toBe(true);
    s.dispose();
  });

  it.each(['apptronik_apollo', 'armor-agibot-x2', 'armor-deeprobotics-dr02', 'armor-fourier-gr1', 'armor-icub', 'armor-unitree-h1-2', 'armor-unitree-h2'])('%s takes a gripper on each wrist, and it plans with the legs planted', async (id) => {
    const s = await open(id, 'parallel');
    expect(s.rigs.filter(Boolean)).toHaveLength(2);
    expect(pose(s, s.home, 0).agreement).toBeLessThan(1e-9);
    const t = taskSetup(s, s.defaultFocus)!;
    const { setup, spots } = arrange(t);
    expect(spots).not.toBeNull();
    const plan = planTask({ ctx: setup.ctx, home: setup.home, pick: spots![0], place: spots![1], object: setup.object, lift: setup.lift, base: setup.base }, setup.probe);
    expect(isClip(plan)).toBe(true);
    const whole = setup.expand!(setup.home);
    s.joints.forEach((j, i) => /hip|knee|ankle/.test(j.name) && expect(whole[i]).toBe(s.home[i]));
    s.dispose();
  });

  it('a fitted tool replaces the hand: not drawn, no longer colliding, back when the tool comes off', async () => {
    const drawn = (x: RobotSession) => readGeoms(x.handle).filter((g) => visibleGeom(g) && /hand_link/.test(x.handle.name(OBJ.body, g.body)));
    const solid = (x: RobotSession) => readGeoms(x.handle).filter((g) => /hand_link/.test(x.handle.name(OBJ.body, g.body)) && arrays(x.handle.model).geom_contype[g.id]);
    const bare = await open('armor-deeprobotics-dr02', null);
    expect(drawn(bare).length).toBeGreaterThan(0);
    expect(solid(bare).length).toBeGreaterThan(0);
    bare.dispose();
    const s = await open('armor-deeprobotics-dr02', 'parallel');
    expect(drawn(s)).toHaveLength(0);
    expect(solid(s)).toHaveLength(0);
    s.dispose();
  });

  it('opens on the limb with the tool, so the readout sits on the working end', async () => {
    const s = await open('armor-mr3-mini', 'parallel');
    expect(s.rigs[s.defaultFocus]).not.toBeNull();
    s.dispose();
  });

  it('a tool leaves the floor where the bare arm stood', async () => {
    const [bare, fitted] = [await open('armor-ur5e', null), await open('armor-ur5e', 'spindle')];
    expect(fitted.assembly.floorZ).toBeCloseTo(bare.assembly.floorZ, 9);
    bare.dispose();
    fitted.dispose();
  });
});
