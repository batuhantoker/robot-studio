import { describe, expect, it } from 'vitest';
import { buildEntries } from '@/app/library/entries';
import type { Catalog, CatalogRobot } from '@/app/robots/catalog';
import { kaneLengths } from '@/core/legacy/kane/closed-form';
import { kaneSection } from '@/ui/math/sections/kane';
import type { MathContext } from '@/ui/math/sections/types';

const robot = (id: string, title: string) => ({ id, title, maker: 'Maker', dof: 6, license: { spdx: 'MIT', source: 'u' } }) as unknown as CatalogRobot;

describe('library display names', () => {
  it('titles two pack entries by the robot, and leaves the rest as packed', () => {
    const catalog = { robots: [robot('armor-unitree-z1', 'Unitree Z1 (ROS description)'), robot('armor-ur5e', 'Universal Robots UR5e (ROS 2 description)'), robot('unitree_z1', 'Unitree Z1')] } as unknown as Catalog;
    const title = (id: string) => buildEntries(catalog, []).find((e) => e.id === id)?.title;
    expect(title('cad:armor-unitree-z1')).toBe('Unitree Z1 without gripper');
    expect(title('cad:armor-ur5e')).toBe('Universal Robots UR5e, manufacturer model');
    expect(title('cad:unitree_z1')).toBe('Unitree Z1');
  });

  it('shows a preset by its name and keeps its file id', () => {
    const iiwa = buildEntries(null, []).find((e) => e.id === 'preset:iiwa14');
    expect(iiwa?.title).toBe('KUKA LBR iiwa 14 R820');
  });

  it('shows the user\'s own arm as 4-DOF Arm, under its old id, and the Kane section still applies to it', () => {
    const arm = buildEntries(null, []).find((e) => e.id === 'preset:original_4dof');
    expect(arm?.title).toBe('4-DOF Arm');
    expect(arm?.spec?.name).toBe('original_4dof');
    expect(kaneLengths(arm!.spec!)).not.toBeNull();
    const snap = { session: { spec: arm!.spec } };
    expect(kaneSection.applies?.({ snap } as unknown as MathContext)).toBe(true);
  });
});
