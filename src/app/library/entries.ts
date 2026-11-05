/** One list for presets, fetched CAD robots, prostheses, and the user's own designs, with filter facets. */
import { isPendulum } from '../../core/robot/config/pendulum';
import { specDofs } from '../../core/robot/config/pose';
import { JOINT_KINDS } from '../../core/robot/joints/kinds';
import type { RobotSpec } from '../../core/robot/schema/types';
import { PRESETS } from '../presets/load';
import type { Catalog, CatalogRobot } from '../robots/catalog';
import type { LibraryEntry, TwinRef } from '../state/types';
import type { SavedRobot } from './storage';

// The pack titles of these two name a source file, not a robot; they stay in the pack so it needs no rebuild.
const CAD_TITLES: Record<string, string> = {
  'armor-unitree-z1': 'Unitree Z1 without gripper',
  'armor-ur5e': 'Universal Robots UR5e, manufacturer model',
};

// Vendored files stay byte-identical to upstream, so a display name for one lives here.
const PRESET_TITLES: Record<string, string> = { original_4dof: '4-DOF Arm' };

/** The name a catalog robot goes by in the studio. */
export const cadTitle = (r: { id: string; title: string }): string => CAD_TITLES[r.id] ?? r.title;

const kindsOf = (spec: RobotSpec) => [...new Set(spec.links.map((l) => JOINT_KINDS[l.joint].label.toLowerCase()))];

export function describe(spec: RobotSpec): string {
  return `${specDofs(spec).length} DOF · ${kindsOf(spec).join(', ')}`;
}

function specEntry(id: string, group: 'preset' | 'mine', spec: RobotSpec, twin?: TwinRef): LibraryEntry {
  const dof = specDofs(spec).length;
  return {
    id, title: spec.name, group, spec, twin,
    subtitle: `${twin ? 'CAD twin · ' : ''}${describe(spec)}`,
    dof, chainDof: dof, category: isPendulum(spec) ? 'other' : 'arm',
    maker: group === 'preset' ? 'Preset' : twin ? `Twin of ${twin.title ?? twin.catalogId}` : 'You',
    tags: [...kindsOf(spec), ...(twin ? ['twin'] : []), group === 'mine' ? 'mine' : 'preset'],
    localOnly: false,
  };
}

function prosthesisEntry(r: CatalogRobot, motors: number, kind: 'prosthesis' | 'dexterous'): LibraryEntry {
  const maker = r.vendor ?? r.maker;
  return {
    id: `prosthesis:${r.id}`, title: r.title, group: 'prosthesis', catalogId: r.id,
    subtitle: `${maker} · ${motors === 1 ? '1 motor drives' : `${motors} motors drive`} ${r.joints_total ?? r.dof} joints`,
    dof: motors, chainDof: motors, category: 'hand', maker,
    tags: [...new Set([...(r.tags ?? []), kind === 'dexterous' ? 'robot hand' : 'prosthesis'])],
    localOnly: !r.license.spdx,
  };
}

function cadEntry(r: CatalogRobot): LibraryEntry {
  if (r.prosthesis) return prosthesisEntry(r, r.prosthesis.motors.length, r.prosthesis.kind ?? 'prosthesis');
  const maker = r.vendor ?? r.maker;
  const chainDof = r.chain ? r.dof : 0;
  return {
    id: `cad:${r.id}`, title: cadTitle(r), group: 'cad', catalogId: r.id,
    subtitle: [maker, r.category].filter(Boolean).join(' · '),
    dof: r.joints_total ?? chainDof, chainDof,
    category: r.category ?? 'arm', maker,
    tags: [...(r.tags ?? []), r.collection ?? 'cad', r.base ?? ''].filter(Boolean),
    localOnly: !r.license.spdx,
  };
}

export function buildEntries(catalog: Catalog | null, mine: SavedRobot[]): LibraryEntry[] {
  return [
    ...mine.map((r) => specEntry(r.id, 'mine', r.spec, r.twin)),
    ...PRESETS.map((p) => ({ ...specEntry(`preset:${p.id}`, 'preset', p.spec), title: PRESET_TITLES[p.id] ?? p.spec.name })),
    ...(catalog?.robots ?? []).map(cadEntry),
  ];
}

export { specEntry };
export const newRobotId = () => `mine:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
