import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { tag, partOf } from '@/cad/common/part';
import { MaterialSet } from '@/cad/materials/library';
import type { Assembly, ModuleInfo } from '@/cad/assembly/types';
import type { MaterialClass } from '@/cad/materials/classes/types';

vi.mock('@/cad/materials/paint/table', () => ({
  PAINT: {
    'by-id': {
      body: { color: '#dbe6d9', finish: 'paint' },
      parts: [
        { name: /^gear_cover$/, coat: { color: '#123456', finish: 'plastic' } },
        { at: 'base', coat: { color: '#444444', finish: 'rubber' } },
        { at: 'tip', coat: { color: '#111111', finish: 'anodized' } },
      ],
    },
    'Some Maker': { body: { color: '#ffcc00', finish: 'paint' } },
    zoned: {
      body: { color: '#eed600', finish: 'paint' },
      parts: [
        { name: /^arm$/, within: { box: [[-9, -9, 0.2], [9, 9, 9]] }, coat: { color: '#111111', finish: 'anodized' } },
        { name: /^forearm$/, within: { through: [[0, 0, 0.5]] }, coat: { color: '#222222', finish: 'rubber' } },
        { name: /^base_link$/, within: { surfaces: [[-1, -1, 0.4], [1, 1, 0.6]] }, coat: { color: '#444444', finish: 'rubber' } },
        { name: /^wrist$/, within: { box: [[9, 9, 9], [10, 10, 10]] }, coat: { color: '#333333', finish: 'rubber' } },
      ],
    },
  },
}));
const { paintAssembly } = await import('@/cad/materials/paint/apply');

const hex = (m: THREE.Material | THREE.Material[]) => `#${(m as THREE.MeshPhysicalMaterial).color.getHexString()}`;

function robot(colours: Partial<Record<string, MaterialClass>> = {}) {
  const mats = new MaterialSet();
  const root = new THREE.Group();
  const meshes: Record<string, THREE.Mesh> = {};
  const modules: ModuleInfo[] = [];
  const body = (name: string, limb: number, joints: number[], mesh = `${name}_mesh`) => {
    const g = new THREE.Group();
    g.userData.module = `body:${name}`;
    root.add(g);
    const m = new THREE.Mesh(new THREE.BoxGeometry(), mats.cad([0.5, 0.5, 0.5, 1], name).material);
    m.name = mesh;
    tag(m, { label: name, layer: 'housing', material: colours[name] ?? 'aluminium' });
    g.add(m);
    meshes[name] = m;
    modules.push({ id: `body:${name}`, label: name, kind: 'Body', joints, limb });
    return g;
  };
  body('base_link', -1, []);
  body('arm', 0, [0]);
  const cover = body('forearm', 0, [1], 'gear_cover');
  const tip = body('wrist', 0, [2]);
  const assembly = { kind: 'cad', root, mats, modules, indicators: [], floorZ: 0, update() {}, dispose() {} } as Assembly;
  return { assembly, meshes, cover, tip };
}

describe('paintAssembly', () => {
  it('paints the body coat, and by name, base and tip', () => {
    const { assembly, meshes } = robot();
    paintAssembly(assembly, { id: 'by-id', maker: 'x' });
    expect(hex(meshes.arm.material)).toBe('#dbe6d9');
    expect(hex(meshes.forearm.material)).toBe('#123456');
    expect(hex(meshes.base_link.material)).toBe('#444444');
    expect(hex(meshes.wrist.material)).toBe('#111111');
  });

  it('moves the class with the paint, for the Materials look', () => {
    const { assembly, meshes } = robot();
    paintAssembly(assembly, { id: 'by-id', maker: 'x' });
    expect(partOf(meshes.arm)?.material).toBe('paint');
    expect(partOf(meshes.wrist)?.material).toBe('anodized');
    expect(partOf(meshes.base_link)?.material).toBe('rubber');
  });

  it('leaves a robot with no row untouched', () => {
    const { assembly, meshes } = robot();
    const before = meshes.arm.material;
    paintAssembly(assembly, { id: 'other', maker: 'nobody' });
    expect(meshes.arm.material).toBe(before);
  });

  it('applies a maker row to a colourless model', () => {
    const { assembly, meshes } = robot();
    paintAssembly(assembly, { id: 'other', maker: 'Some Maker' });
    expect(hex(meshes.arm.material)).toBe('#ffcc00');
  });

  it('never lets a maker row touch a model that has colour', () => {
    const { assembly, meshes } = robot({ arm: 'paint' });
    const before = meshes.forearm.material;
    paintAssembly(assembly, { id: 'other', maker: 'Some Maker' });
    expect(meshes.forearm.material).toBe(before);
  });

  it('keeps glass unless a rule names it', () => {
    const { assembly, meshes } = robot({ arm: 'glass' });
    const before = meshes.arm.material;
    paintAssembly(assembly, { id: 'by-id', maker: 'x' });
    expect(meshes.arm.material).toBe(before);
    expect(partOf(meshes.arm)?.material).toBe('glass');
  });

  it('leaves a fitted tool, which sits in a nested group, alone', () => {
    const { assembly, tip } = robot();
    const tool = new THREE.Group();
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(), assembly.mats.get('alu'));
    tag(jaw, { label: 'jaw', layer: 'housing', material: 'aluminium' });
    tool.add(jaw);
    tip.add(tool);
    paintAssembly(assembly, { id: 'by-id', maker: 'x' });
    expect(jaw.material).toBe(assembly.mats.get('alu'));
  });

  it('skips inertia boxes and other non-housing layers', () => {
    const { assembly, tip } = robot();
    const box = new THREE.Mesh(new THREE.BoxGeometry(), assembly.mats.get('accent'));
    tag(box, { label: 'inertia', layer: 'kinematic', material: 'paint' });
    tip.add(box);
    paintAssembly(assembly, { id: 'by-id', maker: 'x' });
    expect(box.material).toBe(assembly.mats.get('accent'));
  });

  describe('regions', () => {
    const tris = (m: THREE.Mesh) => m.geometry.attributes.position.count / 3;
    const pieces = (a: Assembly, body: string) => (a.root.children.find((g) => g.userData.module === `body:${body}`)!.children as THREE.Mesh[]);

    it('splits a mesh into a sibling mesh, losing no triangles', () => {
      const { assembly } = robot();
      paintAssembly(assembly, { id: 'zoned', maker: 'x' });
      const [rest, zone] = pieces(assembly, 'arm');
      expect(pieces(assembly, 'arm')).toHaveLength(2);
      expect(tris(rest) + tris(zone)).toBe(12);
      expect(tris(zone)).toBeGreaterThan(0);
      expect(tris(rest)).toBeGreaterThan(0);
      expect(hex(rest.material)).toBe('#eed600');
      expect(hex(zone.material)).toBe('#111111');
    });

    it('gives the piece its own class and the part it came from', () => {
      const { assembly } = robot();
      paintAssembly(assembly, { id: 'zoned', maker: 'x' });
      const [rest, zone] = pieces(assembly, 'arm');
      expect(partOf(zone)?.material).toBe('anodized');
      expect(partOf(rest)?.material).toBe('paint');
      expect(partOf(zone)?.label).toBe(partOf(rest)?.label);
      expect(zone.name).toBe(rest.name);
    });

    it('takes the whole surface at a point, stopping at its creases', () => {
      const { assembly } = robot();
      paintAssembly(assembly, { id: 'zoned', maker: 'x' });
      const [rest, zone] = pieces(assembly, 'forearm');
      expect(tris(zone)).toBe(2);
      expect(tris(rest)).toBe(10);
    });

    it('takes surfaces only when they lie wholly in the box', () => {
      const { assembly } = robot();
      paintAssembly(assembly, { id: 'zoned', maker: 'x' });
      const [rest, zone] = pieces(assembly, 'base_link');
      expect(tris(zone)).toBe(2);
      expect(tris(rest)).toBe(10);
    });

    it('adds nothing when a zone holds no triangles', () => {
      const { assembly } = robot();
      paintAssembly(assembly, { id: 'zoned', maker: 'x' });
      expect(pieces(assembly, 'wrist')).toHaveLength(1);
    });

    it('reads a zone in the body frame, not the mesh frame', () => {
      const { assembly, meshes } = robot();
      meshes.arm.position.set(0, 0, 5);
      paintAssembly(assembly, { id: 'zoned', maker: 'x' });
      const [rest, zone] = pieces(assembly, 'arm');
      expect(tris(zone)).toBe(12);
      expect(tris(rest)).toBe(0);
      expect(zone.position.z).toBe(5);
    });

    it('frees what it made and still disposes the assembly', () => {
      const { assembly } = robot();
      const original = vi.fn();
      assembly.dispose = original;
      paintAssembly(assembly, { id: 'zoned', maker: 'x' });
      const [, zone] = pieces(assembly, 'arm');
      const freed = vi.fn();
      zone.geometry.addEventListener('dispose', freed);
      assembly.dispose();
      expect(freed).toHaveBeenCalled();
      expect(original).toHaveBeenCalled();
    });
  });
});
