/** What the Robots panel on the stage drives: the scene actions, the studio's live moves and the viewport's picking. */
import type { SceneControls } from '../../ui/stage/scene-robots';
import { MAX_ROBOTS } from './robots';
import { removeFromScene, setBase, switchTo } from './scene';
import type { Studio } from './studio';

export function sceneControls(studio: Studio): SceneControls {
  const { store, viewport } = studio;
  return {
    robots: () => store.state.scene.map((r) => ({ key: r.key, entryId: r.entryId, base: r.base, active: r.key === store.state.activeKey })),
    cap: () => MAX_ROBOTS,
    add: (entryId) => studio.addRobot(entryId),
    remove: (key) => removeFromScene(store, key),
    activate: (key) => switchTo(store, key),
    previewBase: (key, base) => studio.previewBase(key, base),
    setBase: (key, base) => setBase(store, key, base),
    frameAll: () => viewport.frameAll(),
    inset: (right) => viewport.setPanelInset(right),
    robotAt: (x, y) => viewport.robotAt(x, y),
    robotRoot: (key) => viewport.robotRoot(key),
    onChange: (fn) => void store.on(['scene', 'activeKey'], fn),
  };
}
