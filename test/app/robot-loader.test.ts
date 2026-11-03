import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RobotSession } from '@/app/robots/session';
import type { LibraryEntry } from '@/app/state/types';
import type { RobotSpec } from '@/core/robot/schema/types';

const opened: { id: string; session: RobotSession; release: () => void }[] = [];

vi.mock('@/app/robots/from-spec', () => ({
  sessionFromSpec: (id: string) => new Promise<RobotSession>((resolve) => {
    const session = {
      id,
      handle: { model: { nbuffer: 150e6 }, data: { nbuffer: 1e6, narena: 14e6 } },
      dispose: vi.fn(),
    } as unknown as RobotSession;
    opened.push({ id, session, release: () => resolve(session) });
  }),
}));
vi.mock('@/app/robots/from-catalog', () => ({ sessionFromCatalog: vi.fn() }));
vi.mock('@/app/robots/from-twin', () => ({ sessionFromTwin: vi.fn() }));

const { RobotLoader, MAX_ROBOTS, heldBytes } = await import('@/app/controller/robots');

const entry = (id: string): LibraryEntry => ({
  id, title: id, group: 'mine', subtitle: '', dof: 6, chainDof: 6, category: 'arm', maker: '', tags: [], localOnly: false, spec: {} as RobotSpec,
});

/** Start a load, let its session arrive, and wait for the loader to take it. */
async function loaded(loader: InstanceType<typeof RobotLoader>, id: string, key?: string) {
  const pending = loader.load(entry(id), () => {}, key);
  await vi.waitFor(() => expect(opened.some((o) => o.id === id)).toBe(true));
  opened.find((o) => o.id === id)!.release();
  return pending;
}

describe('robot loader', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    opened.length = 0;
  });

  it('replaces the active placement and frees the old session afterwards', async () => {
    const loader = new RobotLoader(() => null);
    const a = await loaded(loader, 'a');
    const b = await loaded(loader, 'b');
    expect(loader.current).toBe(b);
    expect(a!.dispose).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(a!.dispose).toHaveBeenCalledOnce();
  });

  it('keeps one session per placement', async () => {
    const loader = new RobotLoader(() => null);
    const a = await loaded(loader, 'a');
    const b = await loaded(loader, 'b', 'second');
    expect(loader.current).toBe(a);
    expect(loader.get('second')).toBe(b);
    loader.activeKey = 'second';
    expect(loader.current).toBe(b);
  });

  it('disposes a load that a newer one for the same placement overtook', async () => {
    const loader = new RobotLoader(() => null);
    const first = loader.load(entry('slow'), () => {});
    const second = loader.load(entry('fast'), () => {});
    opened.find((o) => o.id === 'fast')!.release();
    const fast = await second;
    opened.find((o) => o.id === 'slow')!.release();
    expect(await first).toBeNull();
    expect(opened.find((o) => o.id === 'slow')!.session.dispose).toHaveBeenCalledOnce();
    expect(loader.current).toBe(fast);
  });

  it('removes a placement, dropping its in-flight load', async () => {
    const loader = new RobotLoader(() => null);
    const kept = await loaded(loader, 'kept', 'gone');
    const late = loader.load(entry('late'), () => {}, 'gone');
    loader.remove('gone');
    opened.find((o) => o.id === 'late')!.release();
    expect(await late).toBeNull();
    expect(loader.get('gone')).toBeNull();
    vi.advanceTimersByTime(300);
    expect(kept!.dispose).toHaveBeenCalledOnce();
  });

  it('clears the status only when the last load settles', async () => {
    const loader = new RobotLoader(() => null);
    const status = vi.fn();
    const a = loader.load(entry('a'), status, 'one');
    const b = loader.load(entry('b'), status, 'two');
    opened.find((o) => o.id === 'a')!.release();
    await a;
    expect(status).not.toHaveBeenCalledWith(null);
    opened.find((o) => o.id === 'b')!.release();
    await b;
    expect(status).toHaveBeenLastCalledWith(null);
  });

  it('refuses another robot at the cap or past the memory budget', async () => {
    const loader = new RobotLoader(() => null);
    expect(loader.roomForAnother()).toBeNull();
    for (let i = 0; i < 3; i++) await loaded(loader, `r${i}`, `k${i}`);
    expect(heldBytes(loader.get('k0')!)).toBe(180e6);
    expect(loader.roomForAnother()).toMatch(/memory/);
    loader.remove('k2');
    loader.remove('k1');
    expect(loader.roomForAnother()).toBeNull();
    for (let i = 1; i < MAX_ROBOTS; i++) await loaded(loader, `s${i}`, `s${i}`);
    expect(loader.roomForAnother()).toMatch(/up to 4/);
  });
});
