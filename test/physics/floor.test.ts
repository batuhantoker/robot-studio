import { describe, expect, it } from 'vitest';
import { jointRole } from '@/core/control/gains';
import { compileFloorCopy, floorXml } from '@/physics/model/floor-copy';
import { floorRig, hasCollision } from '@/physics/control/rig';
import { BalancePolicy } from '@/physics/control/balance';
import { Rollout, sampleReference } from '@/physics/control/rollout';
import { STAND_SECONDS, StandTest } from '@/physics/control/stand';
import { ModelHandle } from '@/physics/model/handle';
import { OBJ, arrays } from '@/physics/runtime/arrays';

const leg = (name: string, x: number, y: number) => `<body name="${name}" pos="${x} ${y} -0.03">
  <joint name="${name}_knee_joint" axis="0 1 0" range="-1.5 1.5"/>
  <geom type="capsule" fromto="0 0 0 0.12 0 -0.25" size="0.02" mass="0.3"/></body>`;

const table = `<mujoco><compiler angle="radian"/><option timestep="0.002"/><worldbody>
  <body name="torso" pos="0 0 0.3"><geom type="box" size="0.15 0.1 0.03" mass="4"/>
  ${leg('FL', 0.15, 0.1)}${leg('FR', 0.15, -0.1)}${leg('RL', -0.15, 0.1)}${leg('RR', -0.15, -0.1)}</body>
</worldbody><keyframe><key name="home" qpos="0 0 0 0"/></keyframe></mujoco>`;

const bytes = (s: string) => new TextEncoder().encode(s);

async function open() {
  const files = new Map([['table.xml', bytes(table)]]);
  const h = await ModelHandle.fromFiles(files, 'table.xml');
  const m = arrays(h.model);
  const ids = ['FL', 'FR', 'RL', 'RR'].map((n) => h.id(OBJ.joint, `${n}_knee_joint`));
  const robot = {
    handle: h,
    qposAdr: ids.map((j) => m.jnt_qposadr[j]),
    dofAdr: ids.map((j) => m.jnt_dofadr[j]),
    rest: Float64Array.from(m.qpos0),
    home: ids.map(() => 0),
    torqueLimits: ids.map(() => 0),
    limbs: [{ index: [0, 1, 2, 3] }],
  };
  const copy = await compileFloorCopy(files, 'table.xml');
  const rig = floorRig(robot, copy);
  const dispose = () => {
    copy.dispose();
    h.dispose();
  };
  return { rig, dispose };
}

function runWith(rig: Awaited<ReturnType<typeof open>>['rig'], kp: number, kd: number) {
  rig.plant.enter();
  const hold = { q: rig.home, qd: rig.home.map(() => 0) };
  const dt = (rig.handle.model.opt as unknown as { timestep: number }).timestep;
  const ref = sampleReference(() => hold, STAND_SECONDS, dt);
  const gains = rig.home.map((_, k) => ({ kp, kd, limit: rig.plant.limits[k] }));
  const options = { driven: rig.plant.driven, held: rig.plant.held, routes: rig.plant.routes, compensate: false };
  const rollout = new Rollout({ handle: rig.handle, qposAdr: rig.qposAdr, dofAdr: rig.dofAdr, rest: rig.rest, options, joints: [0, 1, 2, 3], limits: rig.plant.limits, stand: rig.stand }, ref, gains);
  rollout.run(Infinity);
  const stats = rollout.stats();
  rollout.dispose();
  return stats;
}

describe('a robot on the floor', () => {
  it('wraps everything in one free body beside a plane, and drops the keyframes', () => {
    const xml = floorXml(table);
    expect(xml).toContain('<freejoint');
    expect(xml).not.toContain('<keyframe>');
    expect(xml.indexOf('name="torso"')).toBeGreaterThan(xml.indexOf('<freejoint'));
  });

  it('finds its joints by name, though the free joint moved every address', async () => {
    const { rig, dispose } = await open();
    try {
      const m = arrays(rig.handle.model);
      expect(m.nq).toBe(4 + 7);
      expect(rig.qposAdr).toEqual([7, 8, 9, 10]);
      expect(rig.dofAdr).toEqual([6, 7, 8, 9]);
    } finally {
      dispose();
    }
  });

  it('collapses on soft joints and stands on stiff ones, and the score says so', async () => {
    const { rig, dispose } = await open();
    try {
      const soft = runWith(rig, 0.5, 0.05);
      const stiff = runWith(rig, 200, 8);
      expect(soft.upright).toBeLessThan(1);
      expect(stiff.upright).toBe(1);
      expect(stiff.score).toBeGreaterThan(soft.score + 30);
    } finally {
      dispose();
    }
  });

  it('carries the whole robot in its torque limits, not just the leg below each joint', async () => {
    const { rig, dispose } = await open();
    try {
      const bodyWeightOnALeg = 5.2 * 9.81 * 0.1;
      expect(Math.min(...rig.plant.limits)).toBeGreaterThan(bodyWeightOnALeg);
    } finally {
      dispose();
    }
  });

  it('tells a model that could touch a floor from one that couldn’t', async () => {
    const solid = await ModelHandle.fromXml(table);
    const ghost = await ModelHandle.fromXml(table.replace('<worldbody>', '<default><geom contype="0" conaffinity="0"/></default><worldbody>'));
    try {
      expect(hasCollision(solid)).toBe(true);
      expect(hasCollision(ghost)).toBe(false);
    } finally {
      solid.dispose();
      ghost.dispose();
    }
  });

  it('shares gains across mirrored legs', () => {
    expect(new Set(['FL', 'FR', 'RL', 'RR'].map((n) => jointRole(`${n}_knee_joint`))).size).toBe(1);
  });
});

describe('the balance network', () => {
  const stand = new StandTest(0, 0, 0.5, 30, 0.002);
  const names = ['left_hip_roll_joint', 'right_hip_roll_joint', 'left_knee_joint', 'right_knee_joint', 'left_elbow_joint'];
  const tilted = { qpos: Float64Array.from([0, 0, 0, Math.cos(0.1), Math.sin(0.1), 0, 0]), qvel: new Float64Array(6) };

  it('drives legs only, one output per kind of joint', () => {
    const policy = new BalancePolicy(stand, names, names.map(() => true), [0, 0, 0, 0, 0], 0.002);
    expect(policy.shape).toEqual({ inputs: 5, outputs: 2 });
    expect(policy.size).toBe(12);
    expect(policy.every).toBe(10);
  });

  it('mirrors sideways joints across the body, and moves knees together', () => {
    const policy = new BalancePolicy(stand, names, names.map(() => true), [0, 0, 0, 0, 0], 0.002);
    const theta = new Array<number>(policy.size).fill(0);
    theta[10] = 1;
    theta[11] = 1;
    const target = new Float64Array(5);
    policy.update(tilted as never, theta, target);
    expect(target[0]).toBeCloseTo(-target[1], 10);
    expect(target[0]).not.toBe(0);
    expect(target[2]).toBeCloseTo(target[3], 10);
    expect(target[4]).toBe(0);
  });

  it('has nothing to work with on a robot without legs', () => {
    expect(new BalancePolicy(stand, ['joint1', 'wrist'], [true, true], [0, 0], 0.002).usable).toBe(false);
  });
});
