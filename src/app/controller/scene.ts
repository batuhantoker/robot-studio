/** Robots on the stage: add, remove and move them, and switch which one the studio drives. */
import { freshRobot, park } from '../scene/parked';
import { saveScene } from '../scene/storage';
import type { Store } from '../state/store';
import type { RobotBase, SceneRobot, StudioState } from '../state/types';

type S = Store<StudioState>;

const SPACING = 1.2;

function nextKey(scene: SceneRobot[]): string {
  for (let n = 2; ; n++) if (!scene.some((r) => r.key === `r${n}`)) return `r${n}`;
}

/**
 * Make `key` the active robot: park the outgoing robot's fields on its placement, restore the incoming's.
 * One patch, because activeId listeners read the per-robot fields as soon as it changes.
 */
function handover(s: StudioState, scene: SceneRobot[], key: string, parkOutgoing: boolean): Partial<StudioState> {
  const incoming = scene.find((r) => r.key === key)!;
  const outgoing = parkOutgoing ? park(s) : null;
  return {
    scene: scene.map((r) => (r.key === key ? { ...r, parked: null } : r.key === s.activeKey ? { ...r, parked: outgoing } : r)),
    activeKey: key,
    activeId: incoming.entryId,
    ...(incoming.parked ?? freshRobot()),
  };
}

export function switchTo(store: S, key: string): void {
  const s = store.state;
  if (key !== s.activeKey && s.scene.some((r) => r.key === key)) store.set(handover(s, s.scene, key, true));
}

/** Put a library entry on the stage and drive it; returns its placement key. */
export function addToScene(store: S, entryId: string, base?: RobotBase): string {
  const s = store.state;
  const key = nextKey(s.scene);
  const at = base ?? { x: 0, y: Math.max(...s.scene.map((r) => r.base.y)) + SPACING, yaw: 0 };
  store.set(handover(s, [...s.scene, { key, entryId, base: at, parked: null }], key, true));
  return key;
}

/** Take a robot off the stage; the last one stays. Removing the active robot drives its neighbour. */
export function removeFromScene(store: S, key: string): void {
  const s = store.state;
  const i = s.scene.findIndex((r) => r.key === key);
  if (i < 0 || s.scene.length < 2) return;
  const scene = s.scene.filter((r) => r.key !== key);
  store.set(key === s.activeKey ? handover(s, scene, scene[Math.max(0, i - 1)].key, false) : { scene });
}

export function setBase(store: S, key: string, base: RobotBase): void {
  store.set({ scene: store.state.scene.map((r) => (r.key === key ? { ...r, base } : r)) });
}

/** Keep the stage in step with the library, and save it. */
export function bindScene(store: S): void {
  // Picking a robot in the library swaps the one at the active placement.
  store.on(['activeId'], (s) => {
    if (s.scene.some((r) => r.key === s.activeKey && r.entryId !== s.activeId)) {
      store.set({ scene: s.scene.map((r) => (r.key === s.activeKey ? { ...r, entryId: s.activeId } : r)) });
    }
  });
  store.on(['library'], (s) => {
    const ids = new Set(s.library.map((e) => e.id));
    const scene = s.scene.filter((r) => r.key === s.activeKey || ids.has(r.entryId));
    if (scene.length !== s.scene.length) store.set({ scene });
  });
  store.on(['scene', 'activeKey'], (s) => saveScene(s.scene, s.activeKey));
}
