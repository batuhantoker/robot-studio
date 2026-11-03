/** Loads the active library entry into a session, swapping and disposing the previous one. */
import type { Catalog } from '../robots/catalog';
import { sessionFromCatalog } from '../robots/from-catalog';
import { sessionFromSpec } from '../robots/from-spec';
import { sessionFromTwin } from '../robots/from-twin';
import type { RobotSession } from '../robots/session';
import type { LibraryEntry } from '../state/types';

export class RobotLoader {
  current: RobotSession | null = null;
  private token = 0;

  constructor(private readonly catalog: () => Catalog | null) {}

  /** Resolve the newest request only; older in-flight loads are disposed on arrival. */
  async load(entry: LibraryEntry, onStatus: (s: string | null) => void): Promise<RobotSession | null> {
    const token = ++this.token;
    let session: RobotSession;
    try {
      const twinSource = entry.twin && this.catalog()?.robots.find((r) => r.id === entry.twin!.catalogId);
      if (entry.spec && entry.twin && twinSource) {
        onStatus(`Binding ${twinSource.title} CAD`);
        session = await sessionFromTwin(entry.id, entry.spec, entry.twin, twinSource);
      } else if (entry.spec) {
        session = await sessionFromSpec(entry.id, entry.title, entry.spec);
      } else {
        const robot = this.catalog()?.robots.find((r) => r.id === entry.catalogId);
        if (!robot) throw new Error(`robot ${entry.catalogId} is not in the catalog`);
        onStatus(`Loading ${robot.title} · ${robot.files.length} files`);
        session = await sessionFromCatalog(robot, (d, t) => onStatus(`Loading ${robot.title} · ${d}/${t} files`));
      }
    } catch (error) {
      onStatus(null);
      throw error;
    }
    if (token !== this.token) {
      session.dispose();
      return null;
    }
    const previous = this.current;
    this.current = session;
    onStatus(null);
    // Panels may still hold the old snapshot for a frame; free its WASM objects afterwards.
    setTimeout(() => previous?.dispose(), 250);
    return session;
  }
}
