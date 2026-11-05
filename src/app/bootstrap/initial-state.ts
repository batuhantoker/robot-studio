/** Starting state: library from presets, fetched CAD and saved robots; URL can pick the robot. */
import { buildEntries } from '../library/entries';
import { loadMine } from '../library/storage';
import type { Catalog } from '../robots/catalog';
import { ORIGIN } from '../scene/frame';
import { freshRobot } from '../scene/parked';
import { MAIN_KEY, restoreScene } from '../scene/storage';
import type { StudioState } from '../state/types';
import { loadSurroundings } from '../../scene/stage/surroundings';

export function initialState(catalog: Catalog | null): StudioState {
  const library = buildEntries(catalog, loadMine());
  const wanted = new URLSearchParams(location.search).get('robot');
  // A link naming a robot opens it alone; otherwise a saved stage of several robots comes back.
  const saved = wanted ? null : restoreScene(library);
  const savedActive = saved && library.find((e) => e.id === saved.robots.find((r) => r.key === saved.activeKey)!.entryId);
  const active = savedActive || (library.find((e) => e.id === wanted || e.id.endsWith(`:${wanted}`)) ?? library.find((e) => e.id === 'preset:puma560') ?? library[0]);
  return {
    library,
    activeId: active.id,
    ...freshRobot(),
    draft: active.spec ?? null,
    draftError: null,
    loading: null,
    sessionVersion: 0,
    mode: 'pose',
    tab: 'live',
    cut: 'solid',
    look: 'studio',
    explode: 0,
    isolate: null,
    section: { axis: 'y', offset: 0 },
    overlays: { frames: false, com: false, ellipsoid: false, trail: true, workspace: false, labels: true },
    playing: false,
    time: 0,
    rendering: false,
    surroundings: loadSurroundings(),
    touring: false,
    contact: null,
    scene: saved?.robots ?? [{ key: MAIN_KEY, entryId: active.id, base: { ...ORIGIN }, parked: null }],
    activeKey: saved?.activeKey ?? MAIN_KEY,
  };
}
