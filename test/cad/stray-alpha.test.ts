import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { strayAlpha } from '@/cad/assembly/mjcf/build';
import { solidBox } from '@/cad/common/lowest';
import { tag } from '@/cad/common/part';

describe('model transparency', () => {
  it('treats an alpha on most parts as an export artefact', () => {
    expect(strayAlpha([0.2, 0.3, 0.3, 1])).toBe(true);
  });

  it('keeps a few real translucent parts', () => {
    expect(strayAlpha([1, 1, 1, 0.4])).toBe(false);
    expect(strayAlpha([1, 1])).toBe(false);
  });
});

describe('framing bounds', () => {
  const part = (z: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2));
    m.position.z = z;
    return m;
  };

  it('ignores hidden objects, however far out they sit', () => {
    const root = new THREE.Group();
    const hidden = part(5);
    hidden.visible = false;
    root.add(part(0), hidden);
    expect(solidBox(root).max.z).toBeCloseTo(0.1);
  });

  it('ignores kinematic helpers', () => {
    const root = new THREE.Group();
    const helper = part(5);
    tag(helper, { label: 'box', layer: 'kinematic' });
    root.add(part(0), helper);
    expect(solidBox(root).max.z).toBeCloseTo(0.1);
  });

  it('grows a box already holding other robots', () => {
    const root = new THREE.Group();
    root.add(part(0));
    const box = new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(-0.5, -0.5, -0.5));
    expect(solidBox(root, box).min.z).toBeCloseTo(-1);
    expect(box.max.z).toBeCloseTo(0.1);
  });

  it('still gives bounds for a model with nothing solid', () => {
    const root = new THREE.Group();
    root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 1)])));
    expect(solidBox(root).isEmpty()).toBe(false);
  });
});
