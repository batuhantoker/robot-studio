/** Loads library entries into sessions, one per stage placement; a newer load for a placement replaces the older. */
import type { Catalog } from '../robots/catalog';
import { sessionFromCatalog } from '../robots/from-catalog';
import { sessionFromSpec } from '../robots/from-spec';
import { sessionFromTwin } from '../robots/from-twin';
import type { RobotSession } from '../robots/session';
import type { LibraryEntry } from '../state/types';

export const MAX_ROBOTS = 4;
// MuJoCo's heap stops at 2 GB, and compiling a heavy CAD robot peaks about 1.1 GB above what is already held.
const HELD_BUDGET = 500e6;

/** Rough MuJoCo heap a session holds: its model, its MjData and the collision checker's own copy. */
export function heldBytes(s: RobotSession): number {
  const { model, data } = s.handle;
  return model.nbuffer + 2 * (data.nbuffer + data.narena);
}

export class RobotLoader {
  /** The placement the studio drives. */
  activeKey = 'main';
  private readonly sessions = new Map<string, RobotSession>();
  private readonly entries = new Map<string, LibraryEntry>();
  private readonly tokens = new Map<string, number>();
  private pending = 0;

  constructor(private readonly catalog: () => Catalog | null) {}

  get current(): RobotSession | null {
    return this.sessions.get(this.activeKey) ?? null;
  }

  get(key: string): RobotSession | null {
    return this.sessions.get(key) ?? null;
  }

  /** Whether the placement already holds this entry; an edited robot is a new entry object, so it loads again. */
  has(key: string, entry: LibraryEntry): boolean {
    return this.sessions.has(key) && this.entries.get(key) === entry;
  }

  keys(): string[] {
    return [...this.sessions.keys()];
  }

  /** Why no further robot fits on the stage, or null when one does. */
  roomForAnother(): string | null {
    if (this.sessions.size >= MAX_ROBOTS) return `The stage holds up to ${MAX_ROBOTS} robots.`;
    let held = 0;
    for (const s of this.sessions.values()) held += heldBytes(s);
    return held > HELD_BUDGET ? 'Not enough memory for another robot; remove one first.' : null;
  }

  /** Resolve the newest request per placement only; older in-flight loads are disposed on arrival. */
  async load(entry: LibraryEntry, onStatus: (s: string | null) => void, key = this.activeKey): Promise<RobotSession | null> {
    const token = this.bump(key);
    this.pending++;
    let session: RobotSession;
    try {
      session = await this.open(entry, onStatus);
    } finally {
      if (--this.pending === 0) onStatus(null);
    }
    if (token !== this.tokens.get(key)) {
      session.dispose();
      return null;
    }
    this.retire(this.sessions.get(key));
    this.sessions.set(key, session);
    this.entries.set(key, entry);
    return session;
  }

  /** Drop a placement, and any load still in flight for it. */
  remove(key: string): void {
    this.bump(key);
    this.retire(this.sessions.get(key));
    this.sessions.delete(key);
    this.entries.delete(key);
  }

  private bump(key: string): number {
    const token = (this.tokens.get(key) ?? 0) + 1;
    this.tokens.set(key, token);
    return token;
  }

  private retire(session: RobotSession | undefined): void {
    // Panels may still hold the old snapshot for a frame; free its WASM objects afterwards.
    if (session) setTimeout(() => session.dispose(), 250);
  }

  private async open(entry: LibraryEntry, onStatus: (s: string | null) => void): Promise<RobotSession> {
    const twinSource = entry.twin && this.catalog()?.robots.find((r) => r.id === entry.twin!.catalogId);
    if (entry.spec && entry.twin && twinSource) {
      onStatus(`Binding ${twinSource.title} CAD`);
      return sessionFromTwin(entry.id, entry.spec, entry.twin, twinSource);
    }
    if (entry.spec) return sessionFromSpec(entry.id, entry.title, entry.spec);
    const robot = this.catalog()?.robots.find((r) => r.id === entry.catalogId);
    if (!robot) throw new Error(`robot ${entry.catalogId} is not in the catalog`);
    onStatus(`Loading ${robot.title} · ${robot.files.length} files`);
    return sessionFromCatalog(robot, (d, t) => onStatus(`Loading ${robot.title} · ${d}/${t} files`));
  }
}
