/** Starting state: library from presets, fetched CAD and saved robots; URL can pick the robot. */
import { buildEntries } from '../library/entries';
import { loadMine } from '../library/storage';
import type { Catalog } from '../robots/catalog';
import type { StudioState } from '../state/types';

export function initialState(catalog: Catalog | null): StudioState {
  const library = buildEntries(catalog, loadMine());
  const wanted = new URLSearchParams(location.search).get('robot');
  const active = library.find((e) => e.id === wanted || e.id.endsWith(`:${wanted}`)) ?? library.find((e) => e.id === 'preset:spatial_6link') ?? library[0];
  return {
    library,
    activeId: active.id,
    focus: 0,
    draft: active.spec ?? null,
    draftError: null,
    loading: null,
    sessionVersion: 0,
    q: [],
    mode: 'pose',
    tab: 'live',
    cut: 'solid',
    look: 'studio',
    explode: 0,
    isolate: null,
    overlays: { frames: false, com: false, ellipsoid: false, trail: true, workspace: false, labels: true },
    targets: [],
    waypoints: [],
    duration: 6,
    playing: false,
    motion: { preset: null, speed: 1, size: 1 },
    time: 0,
    touring: false,
  };
}
