/** Create, duplicate, delete, import and export robots; user robots persist locally. */
import { toMjcf } from '../../core/mjcf/writer/serial-arm';
import { toPythonDict, toStudioDict } from '../../core/robot/io/export';
import { parseRobotJson } from '../../core/robot/schema/json';
import { parseRobot } from '../../core/robot/schema/parse';
import type { RobotSpec } from '../../core/robot/schema/types';
import { blankRobot } from '../../ui/builder/edit';
import type { LibraryActions } from '../../ui/library/panel';
import { buildEntries, newRobotId, specEntry } from '../library/entries';
import { loadCatalog } from '../robots/catalog';
import { loadMine, saveMine } from '../library/storage';
import { focusLimb } from '../robots/focus';
import type { RobotSession } from '../robots/session';
import { restTwin } from '../robots/twin-rest';
import type { Store } from '../state/store';
import type { LibraryEntry, StudioState, TwinRef } from '../state/types';

function download(name: string, text: string, type = 'application/json') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function persist(library: LibraryEntry[]): void {
  saveMine(library.filter((e) => e.group === 'mine' && e.spec).map((e) => ({ id: e.id, spec: e.spec!, twin: e.twin })));
}

export function addMine(store: Store<StudioState>, spec: RobotSpec, twin?: TwinRef): string {
  const id = newRobotId();
  const library = [specEntry(id, 'mine', spec, twin), ...store.state.library];
  persist(library);
  store.set({ library, activeId: id });
  return id;
}

export function libraryActions(store: Store<StudioState>, onError: (m: string) => void, session: () => RobotSession | null): LibraryActions {
  const active = () => store.state.library.find((e) => e.id === store.state.activeId);
  return {
    create: () => addMine(store, parseRobot(blankRobot())),
    duplicate: () => {
      const entry = active();
      if (entry?.spec) addMine(store, parseRobot({ ...toStudioDict(entry.spec), name: `${entry.spec.name}_copy` }), entry.twin);
    },
    remove: () => {
      const library = store.state.library.filter((e) => e.id !== store.state.activeId);
      persist(library);
      store.set({ library, activeId: library[0].id });
    },
    importFile: async (file) => {
      try {
        addMine(store, parseRobotJson(await file.text()));
      } catch (e) {
        onError((e as Error).message);
      }
    },
    exportPython: () => {
      const spec = active()?.spec;
      if (!spec) return;
      try {
        download(`${spec.name}.json`, `${JSON.stringify(toPythonDict(spec), null, 2)}\n`);
      } catch (e) {
        onError((e as Error).message);
      }
    },
    exportStudio: () => {
      const spec = active()?.spec;
      if (spec) download(`${spec.name}.studio.json`, `${JSON.stringify(toStudioDict(spec), null, 2)}\n`);
    },
    refreshCatalog: async () => {
      const fresh = buildEntries(await loadCatalog(), loadMine());
      if (fresh.length !== store.state.library.length) store.set({ library: fresh });
    },
    makeEditable: () => {
      const entry = active();
      const s = session();
      const limb = s && focusLimb(s, store.state.focus);
      if (!entry?.catalogId || !s || !limb || s.source !== 'cad' || !limb.chain.joints.length) return onError('Open a CAD robot with movable joints first.');
      const name = `${entry.catalogId.replace(/[^A-Za-z0-9_]/g, '_')}_${limb.name.replace(/[^A-Za-z0-9_]/g, '_')}_twin`;
      const limits = limb.index.map((i) => s.torqueLimits[i]);
      addMine(store, restTwin(limb.chain, name, limits).spec, { catalogId: entry.catalogId, chainIndex: s.limbs.indexOf(limb) });
    },
    exportMjcf: () => {
      const spec = active()?.spec;
      if (spec) download(`${spec.name}.xml`, `${toMjcf(spec)}\n`, 'application/xml');
    },
  };
}

export { loadMine };
