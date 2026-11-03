import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addToScene, bindScene, removeFromScene, setBase, switchTo } from '@/app/controller/scene';
import { ORIGIN, relativeBase, stageBase } from '@/app/scene/frame';
import { freshRobot } from '@/app/scene/parked';
import { restoreScene, saveScene } from '@/app/scene/storage';
import { Store } from '@/app/state/store';
import type { LibraryEntry, StudioState } from '@/app/state/types';

const memory = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => memory.get(k) ?? null,
  setItem: (k: string, v: string) => void memory.set(k, v),
  removeItem: (k: string) => void memory.delete(k),
});

const entry = (id: string): LibraryEntry => ({ id, title: id, group: 'cad', subtitle: '', dof: 6, chainDof: 6, category: 'arm', maker: '', tags: [], localOnly: false });
const library = ['cad:ur5e', 'cad:panda', 'cad:go2'].map(entry);

function studio(): Store<StudioState> {
  const store = new Store({
    library, activeId: 'cad:ur5e', ...freshRobot(), scene: [{ key: 'main', entryId: 'cad:ur5e', base: { ...ORIGIN }, parked: null }], activeKey: 'main',
  } as StudioState);
  bindScene(store);
  return store;
}

const placement = (store: Store<StudioState>, key: string) => store.state.scene.find((r) => r.key === key)!;

describe('scene state', () => {
  beforeEach(() => memory.clear());

  it('parks the outgoing robot and restores it on the way back', () => {
    const store = studio();
    const own = { q: [0.1, 0.2], focus: 1, waypoints: [[0, 0], [1, 1]], duration: 9, task: { pick: [0.3, 0, 0.1], place: null, moving: 'place' } } as const;
    store.set(own as unknown as Partial<StudioState>);
    const key = addToScene(store, 'cad:panda');
    expect(store.state).toMatchObject({ activeKey: key, activeId: 'cad:panda', ...freshRobot() });
    store.set({ q: [5, 5, 5] });
    switchTo(store, 'main');
    expect(store.state).toMatchObject({ activeKey: 'main', activeId: 'cad:ur5e', ...own });
    expect(placement(store, key).parked!.q).toEqual([5, 5, 5]);
    expect(placement(store, 'main').parked).toBeNull();
  });

  it('restores the fields in the same update that changes the active robot', () => {
    const store = studio();
    store.set({ q: [1] });
    addToScene(store, 'cad:panda');
    const seen: number[][] = [];
    store.on(['activeId'], (s) => seen.push(s.q));
    switchTo(store, 'main');
    expect(seen).toEqual([[1]]);
  });

  it('places the same robot twice under different keys', () => {
    const store = studio();
    store.set({ q: [1] });
    const twin = addToScene(store, 'cad:ur5e');
    expect(twin).not.toBe('main');
    expect(store.state.activeId).toBe('cad:ur5e');
    store.set({ q: [2] });
    switchTo(store, 'main');
    expect(store.state.q).toEqual([1]);
    expect(placement(store, twin).parked!.q).toEqual([2]);
  });

  it('spaces new robots out and moves them', () => {
    const store = studio();
    const a = addToScene(store, 'cad:panda');
    const b = addToScene(store, 'cad:go2');
    expect(placement(store, a).base).toEqual({ x: 0, y: 1.2, yaw: 0 });
    expect(placement(store, b).base.y).toBeCloseTo(2.4);
    setBase(store, a, { x: -1, y: 0.5, yaw: 1 });
    expect(placement(store, a).base).toEqual({ x: -1, y: 0.5, yaw: 1 });
  });

  it('swaps the robot at the active placement when the library picks another', () => {
    const store = studio();
    addToScene(store, 'cad:panda');
    store.set({ activeId: 'cad:go2' });
    expect(store.state.scene.map((r) => r.entryId)).toEqual(['cad:ur5e', 'cad:go2']);
  });

  it('removes robots, driving the neighbour when the active one goes, and keeps the last', () => {
    const store = studio();
    store.set({ q: [7] });
    const a = addToScene(store, 'cad:panda');
    const b = addToScene(store, 'cad:go2');
    removeFromScene(store, a);
    expect(store.state.scene.map((r) => r.key)).toEqual(['main', b]);
    expect(store.state.activeKey).toBe(b);
    removeFromScene(store, b);
    expect(store.state).toMatchObject({ activeKey: 'main', activeId: 'cad:ur5e', q: [7] });
    removeFromScene(store, 'main');
    expect(store.state.scene).toHaveLength(1);
  });

  it('drops robots whose library entry is gone, but not the active one', () => {
    const store = studio();
    addToScene(store, 'cad:panda');
    addToScene(store, 'cad:go2');
    store.set({ library: library.filter((e) => e.id !== 'cad:panda' && e.id !== 'cad:go2') });
    expect(store.state.scene.map((r) => r.entryId)).toEqual(['cad:ur5e', 'cad:go2']);
  });
});

describe('scene storage', () => {
  beforeEach(() => memory.clear());

  it('saves a stage of several robots and brings it back', () => {
    const store = studio();
    store.set({ q: [3] });
    const key = addToScene(store, 'cad:panda');
    const back = restoreScene(library)!;
    expect(back.activeKey).toBe(key);
    expect(back.robots.map((r) => r.entryId)).toEqual(['cad:ur5e', 'cad:panda']);
    expect(back.robots[0].parked!.q).toEqual([3]);
    expect(back.robots[1].parked).toBeNull();
  });

  it('starts a lone robot fresh, as before', () => {
    const store = studio();
    const key = addToScene(store, 'cad:panda');
    removeFromScene(store, key);
    expect(restoreScene(library)).toBeNull();
  });

  it('skips robots no longer in the library and bad records', () => {
    saveScene([
      { key: 'main', entryId: 'cad:ur5e', base: { ...ORIGIN }, parked: null },
      { key: 'r2', entryId: 'cad:gone', base: { ...ORIGIN }, parked: null },
      { key: 'r3', entryId: 'cad:go2', base: { x: 1, y: 2, yaw: 0 }, parked: { q: 'broken' } as never },
    ], 'r2');
    const back = restoreScene(library)!;
    expect(back.robots.map((r) => r.key)).toEqual(['main', 'r3']);
    expect(back.activeKey).toBe('main');
    expect(back.robots[1].parked).toBeNull();
    memory.set('robot-studio.scene.v1', '{not json');
    expect(restoreScene(library)).toBeNull();
  });
});

describe('scene frames', () => {
  it('sees other robots from the active one', () => {
    const r = relativeBase({ x: 1, y: 0, yaw: Math.PI / 2 }, { x: 1, y: 1, yaw: Math.PI / 2 });
    expect(r.x).toBeCloseTo(1);
    expect(r.y).toBeCloseTo(0);
    expect(r.yaw).toBeCloseTo(0);
  });

  it('round-trips between the stage and a robot frame', () => {
    const from = { x: 0.4, y: -1.3, yaw: 2.9 };
    const base = { x: -2, y: 0.7, yaw: -2.8 };
    const back = stageBase(from, relativeBase(from, base));
    expect(back.x).toBeCloseTo(base.x);
    expect(back.y).toBeCloseTo(base.y);
    expect(back.yaw).toBeCloseTo(base.yaw);
  });
});
