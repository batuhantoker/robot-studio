import { describe, expect, it } from 'vitest';
import { applyFilter, facetCounts } from '@/app/library/filter/apply';
import { parseQuery } from '@/app/library/filter/query';
import { EMPTY_FILTER } from '@/app/library/filter/types';
import type { LibraryEntry } from '@/app/state/types';

const entry = (title: string, dof: number, category: string, maker: string, group: LibraryEntry['group'] = 'cad', tags: string[] = []): LibraryEntry => ({
  id: `${group}:${title}`, title, group, subtitle: '', dof, chainDof: dof, category, maker, tags, localOnly: false,
});

const ROBOTS = [
  entry('UR5e', 6, 'arm', 'Universal Robots', 'cad', ['cobot', '6-axis']),
  entry('LBR iiwa 14', 7, 'arm', 'KUKA', 'cad', ['cobot', '7-axis']),
  entry('KR 6 R900', 6, 'arm', 'KUKA', 'cad', ['industrial']),
  entry('G1', 29, 'humanoid', 'Unitree', 'cad', ['biped']),
  entry('Go2', 12, 'legged', 'Unitree', 'cad', ['quadruped']),
  entry('planar_2link', 2, 'arm', 'Preset', 'preset'),
];

const names = (f: Partial<typeof EMPTY_FILTER>) => applyFilter(ROBOTS, { ...EMPTY_FILTER, ...f }).map((e) => e.title);

describe('library filter', () => {
  it('parses DOF tokens', () => {
    expect(parseQuery('kuka dof:6-7')).toEqual({ words: ['kuka'], min: 6, max: 7 });
    expect(parseQuery('dof > 12')).toMatchObject({ words: [], min: 13 });
    expect(parseQuery('dof<=6 arm')).toEqual({ words: ['arm'], min: 0, max: 6 });
    expect(parseQuery('dof:7')).toMatchObject({ min: 7, max: 7 });
  });

  it('searches words across name, maker, type and tags (AND)', () => {
    expect(names({ query: 'kuka' })).toEqual(['KR 6 R900', 'LBR iiwa 14']);
    expect(names({ query: 'kuka cobot' })).toEqual(['LBR iiwa 14']);
    expect(names({ query: 'quadruped' })).toEqual(['Go2']);
  });

  it('combines DOF bands (OR) with type and source (AND)', () => {
    expect(names({ bands: ['6', '7'], sort: 'dof' })).toEqual(['KR 6 R900', 'UR5e', 'LBR iiwa 14']);
    expect(names({ bands: ['8-12', '25+'], categories: ['legged'] })).toEqual(['Go2']);
    expect(names({ source: 'preset' })).toEqual(['planar_2link']);
    expect(names({ query: 'dof>10', sort: 'dof' })).toEqual(['Go2', 'G1']);
  });

  it('counts each chip as if it were toggled, under the other facets', () => {
    const counts = facetCounts(ROBOTS, { ...EMPTY_FILTER, categories: ['arm'] });
    expect(counts.band('6')).toBe(2);
    expect(counts.band('25+')).toBe(0);
    expect(counts.category('humanoid')).toBe(1);
    expect(counts.source('all')).toBe(4);
  });
});
