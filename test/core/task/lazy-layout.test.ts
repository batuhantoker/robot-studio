/** Loading a robot must not search for spots: that can take seconds, and it waits for Pick & place, in slices. */
import fs from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskController } from '@/app/controller/task/controller';
import { arrange, arrangeSteps, taskSetup } from '@/app/controller/task/setup';
import type { Studio } from '@/app/controller/studio';
import { sessionFromSpec } from '@/app/robots/from-spec';
import type { RobotSession } from '@/app/robots/session';
import { Store } from '@/app/state/store';
import type { StudioState } from '@/app/state/types';
import { parseRobot } from '@/core/robot/schema/parse';

vi.mock('@/scene/overlays/task-pads', () => ({
  TaskPads: class {
    group = {};
    gizmo = { axis: null, dragging: false, getHelper: () => ({ visible: false }) };
    show() {}
    setReach() {}
    setSpots() {}
  },
}));
vi.mock('@/scene/task/prop', () => ({ TaskProp: class { group = {}; set() {} place() {} } }));
vi.mock('@/scene/task/stands', () => ({ TaskStands: class { group = {}; set() {} } }));
vi.mock('@/app/controller/task/floor-click', () => ({ bindFloorClicks: () => {} }));
vi.mock('@/app/controller/task/reach-job', () => ({ reachJob: () => () => {} }));
vi.mock('@/app/controller/task/setup', async (actual) => {
  const real = await actual<typeof import('@/app/controller/task/setup')>();
  return { ...real, arrange: vi.fn(real.arrange), arrangeSteps: vi.fn(real.arrangeSteps) };
});

vi.stubGlobal('window', globalThis);

const preset = (path: string) => JSON.parse(fs.readFileSync(new URL(`../../../presets/${path}.json`, import.meta.url), 'utf8'));

function bench(session: RobotSession) {
  const store = new Store({ mode: 'pose', playing: false, focus: 0, sessionVersion: 0, task: { pick: null, place: null, moving: 'pick' } } as unknown as StudioState);
  const studio = {
    store,
    session,
    bus: { on: () => {} },
    overlays: { effectors: { group: { children: [] } } },
    viewport: { overlay: { add: () => {} }, stage: { root: { add: () => {} } }, props: () => ({ all: () => [] }), supportBelow: () => -Infinity },
  } as unknown as Studio;
  const task = new TaskController(studio);
  return { store, studio, task, load: async () => { store.set({ sessionVersion: store.state.sessionVersion + 1 }); await new Promise((r) => setTimeout(r, 5)); } };
}

describe('the layout search', () => {
  beforeEach(() => void vi.mocked(arrangeSteps).mockClear());

  it('does not run when a robot loads, and runs once on entering Pick & place', async () => {
    const s = await sessionFromSpec('iiwa14', 'iiwa14', parseRobot(preset('studio/iiwa14')));
    const { store, task, load } = bench(s);
    await load();
    expect(arrange).not.toHaveBeenCalled();
    expect(arrangeSteps).not.toHaveBeenCalled();
    expect(task.available()).toBe(true);
    expect(task.clip).toBeNull();
    const shown = new Set<string>();
    const watch = setInterval(() => shown.add(task.status().text), 1);
    store.set({ mode: 'task' });
    expect(task.status().busy).toBe(true);
    await vi.waitFor(() => expect(task.clip).not.toBeNull(), { timeout: 20_000, interval: 20 });
    clearInterval(watch);
    expect([...shown].filter((text) => /Place both/.test(text))).toEqual([]);
    expect(arrangeSteps).toHaveBeenCalledTimes(1);
    expect(task.status().bad).toBe(false);
    store.set({ mode: 'pose' });
    store.set({ mode: 'task' });
    expect(arrangeSteps).toHaveBeenCalledTimes(1);
    s.dispose();
  }, 60_000);

  it('finds the same spots the whole search does', async () => {
    const s = await sessionFromSpec('panda', 'panda', parseRobot(preset('studio/panda')));
    const { store, task, load } = bench(s);
    await load();
    store.set({ mode: 'task' });
    await vi.waitFor(() => expect(task.clip).not.toBeNull(), { timeout: 20_000, interval: 20 });
    const whole = arrange(taskSetup(s, 0)!);
    expect([store.state.task.pick, store.state.task.place]).toEqual(whole.spots);
    expect(task.setup!.surfaceZ).toBe(whole.setup.surfaceZ);
    s.dispose();
  }, 60_000);

  it('hands the page back between slices, and says why a robot has no layout', async () => {
    const s = await sessionFromSpec('original_4dof', '4-DOF Arm', { ...parseRobot(preset('serial-arm/original_4dof')), design: {} });
    const { store, task, load } = bench(s);
    await load();
    let ticks = 0;
    const beat = setInterval(() => ticks++, 0);
    store.set({ mode: 'task' });
    await vi.waitFor(() => expect(task.status().busy).toBeUndefined(), { timeout: 40_000, interval: 20 });
    clearInterval(beat);
    expect(ticks).toBeGreaterThan(20);
    expect(task.status().text).toMatch(/No floor or stand height/);
    expect(task.status().bad).toBe(true);
    s.dispose();
  }, 60_000);

  it('stops when its session is replaced, before that model is freed', async () => {
    const s = await sessionFromSpec('original_4dof', '4-DOF Arm', { ...parseRobot(preset('serial-arm/original_4dof')), design: {} });
    const { store, studio, task, load } = bench(s);
    await load();
    store.set({ mode: 'task' });
    await new Promise((r) => setTimeout(r, 30));
    (studio as { session: RobotSession | null }).session = null;
    const probe = vi.spyOn(s.collision!, 'hit');
    await new Promise((r) => setTimeout(r, 60));
    expect(probe).not.toHaveBeenCalled();
    expect(task.status().busy).toBe(true);
    s.dispose();
  }, 60_000);
});
