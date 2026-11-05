import { describe, expect, it } from 'vitest';
import { PRESETS } from '@/app/presets/load';
import { specDofs } from '@/core/robot/config/pose';
import { toStudioDict } from '@/core/robot/io/export';
// @ts-expect-error The build scripts are plain JavaScript.
import { libraryEntries, presetDof, renderLibrary, updateReadme } from '../../../scripts/robots/library/render.mjs';

const robot = (id: string, extra = {}) => ({
  id, title: id.toUpperCase(), vendor: 'Maker', category: 'arm', dof: 6, joints_total: 6,
  license: { spdx: 'MIT', source: 'https://example.com/x' }, ...extra,
});

describe('the library', () => {
  it('holds the 4-DOF Arm and none of the robots dropped from it', () => {
    const ids = PRESETS.map((p) => p.id);
    expect(ids).toContain('original_4dof');
    for (const id of ['spatial_3link', 'spatial_6link', 'spatial_12link', 'planar_2link', 'so101', 'humanoid_arm', 'mobile_manipulator']) expect(ids).not.toContain(id);
  });
});

describe('robot library in the README', () => {
  it('counts joints as the studio does, on every preset', () => {
    for (const { id, spec } of PRESETS) expect(presetDof(toStudioDict(spec)), id).toBe(specDofs(spec).length);
  });

  it('links published robots to the studio by their full library id', () => {
    const out = renderLibrary(libraryEntries([robot('armor-x')], []));
    expect(out).toContain('[ARMOR-X](https://robotics-studio-one.vercel.app/?robot=cad:armor-x)');
  });

  it('gives hands their own id prefix', () => {
    const out = renderLibrary(libraryEntries([robot('hand', { category: 'hand', prosthesis: {} })], []));
    expect(out).toContain('?robot=prosthesis:hand');
  });

  it('does not link a model with no license, which the live site does not carry', () => {
    const out = renderLibrary(libraryEntries([robot('spot', { license: { spdx: null, source: 'https://example.com/s' } })], []));
    expect(out).toContain('| SPOT | Maker | 6 | [none stated](https://example.com/s), local only |');
    expect(out).not.toContain('?robot=cad:spot');
  });

  it('keeps a pipe in a name from breaking the table', () => {
    expect(renderLibrary(libraryEntries([robot('a|b')], []))).toContain('A\\|B');
  });

  it('refuses a category it has no group for, rather than dropping the robot', () => {
    expect(() => renderLibrary(libraryEntries([robot('x', { category: 'submarine' })], []))).toThrow(/cad:x/);
  });

  it('rewrites only its block and the counts, and can run twice', () => {
    const before = 'open one of 9 robots\n<!-- robot-library:start -->\nold\n<!-- robot-library:end -->\nloads its 9 CAD robots\nThe 9 robots whose upstream states no license\n';
    const entries = libraryEntries([robot('a'), robot('b', { license: { spdx: null, source: 'u' } })], []);
    const once = updateReadme(before, entries);
    expect(once).not.toContain('\nold\n');
    expect(once).toContain('open one of 2 robots');
    expect(once).toContain('loads its 1 CAD robots');
    expect(once).toContain('The 1 robots whose upstream');
    expect(updateReadme(once, entries)).toBe(once);
  });

  it('refuses a README without the block', () => {
    expect(() => updateReadme('nothing here', [])).toThrow(/robot-library/);
  });
});
