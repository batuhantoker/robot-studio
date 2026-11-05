import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Store } from '@/app/state/store';
import type { LibraryEntry, StudioState } from '@/app/state/types';

const ARM = 'armor-ur5e';
const entry = { id: `cad:${ARM}`, catalogId: ARM } as LibraryEntry;

function browser(search: string, saved: Record<string, string> = {}) {
  const items = new Map(Object.entries(saved));
  const at = { pathname: '/', search, hash: '' };
  vi.stubGlobal('location', at);
  vi.stubGlobal('history', { replaceState: (_: unknown, __: string, url: string) => (at.search = url.slice(1)) });
  vi.stubGlobal('localStorage', { getItem: (k: string) => items.get(k) ?? null, setItem: (k: string, v: string) => items.set(k, v) });
  return { at, items };
}

function store(robots = 1) {
  const state = { library: [entry], activeId: entry.id, scene: Array(robots).fill({}) } as unknown as StudioState;
  return { state, set: (p: Partial<StudioState>) => Object.assign(state, p), on: () => {} } as unknown as Store<StudioState>;
}

describe('a fitted tool outlives the page', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllGlobals());

  it('comes back from the browser, and a link overrides it', async () => {
    browser('', { 'robot-studio.tools.v1': JSON.stringify({ [ARM]: 'suction', junk: 'laser' }) });
    expect((await import('@/app/robots/fitted')).fittedTool(ARM)).toBe('suction');
    vi.resetModules();
    browser(`?robot=cad:${ARM}&tool=parallel`, { 'robot-studio.tools.v1': JSON.stringify({ [ARM]: 'suction' }) });
    expect((await import('@/app/robots/fitted')).fittedTool(ARM)).toBe('parallel');
    vi.resetModules();
    browser(`?robot=cad:${ARM}&tool=none`, { 'robot-studio.tools.v1': JSON.stringify({ [ARM]: 'suction' }) });
    expect((await import('@/app/robots/fitted')).fittedTool(ARM)).toBeNull();
  });

  it('writes a lone robot’s address, saves the choice, and swaps the entry so it reloads', async () => {
    const { at, items } = browser('');
    const { fitTool, fittedTool } = await import('@/app/robots/fitted');
    const s = store();
    fitTool(s, entry, 'parallel');
    expect(fittedTool(ARM)).toBe('parallel');
    expect(at.search).toBe(`?robot=cad:${ARM}&tool=parallel`);
    expect(JSON.parse(items.get('robot-studio.tools.v1')!)).toEqual({ [ARM]: 'parallel' });
    expect(s.state.library[0]).not.toBe(entry);
  });

  it('leaves the address alone on a stage of several robots, which restores itself', async () => {
    const { at } = browser('');
    const { fitTool } = await import('@/app/robots/fitted');
    fitTool(store(2), entry, 'parallel');
    expect(at.search).toBe('');
  });

  it('falls back to what really compiled when a refit fails', async () => {
    const { at, items } = browser('');
    const { fitTool, fittedTool, settleTool } = await import('@/app/robots/fitted');
    const s = store();
    fitTool(s, entry, 'suction');
    settleTool(s, ARM, null);
    expect(fittedTool(ARM)).toBeNull();
    expect(at.search).toBe('');
    expect(JSON.parse(items.get('robot-studio.tools.v1')!)).toEqual({});
  });

  it('takes no tool on an arm that carries its own', async () => {
    browser('?robot=franka_panda&tool=parallel');
    expect((await import('@/app/robots/fitted')).fittedTool('franka_panda')).toBeNull();
  });
});
