/** Teardown metadata carried by every mesh in an assembly. */
import * as THREE from 'three';
import { inferMaterial } from '../materials/classes/infer';
import { ROLE_CLASS } from '../materials/classes/roles';
import type { MaterialClass } from '../materials/classes/types';
import type { MaterialRole, MaterialSet } from '../materials/library';

/** Layers decide what x-ray hides and what section reveals. */
export type Layer = 'housing' | 'structure' | 'drive' | 'bearing' | 'fastener' | 'sensor' | 'cable' | 'kinematic';

export interface PartMeta {
  label: string;
  layer: Layer;
  /** Full-explode displacement in the part's parent frame (metres). */
  explode: THREE.Vector3;
  /** Rest position, captured when the part is created. */
  rest: THREE.Vector3;
  role?: MaterialRole;
  material: MaterialClass;
}

export const partOf = (o: THREE.Object3D): PartMeta | undefined => o.userData.part as PartMeta | undefined;

export interface PartOptions {
  label: string;
  layer: Layer;
  explode?: THREE.Vector3;
  shadow?: boolean;
  material?: MaterialClass;
}

/** Class from the role, else from the mesh's own colour. */
function classOf(o: THREE.Object3D, opts: PartOptions, role?: MaterialRole): MaterialClass {
  if (opts.material) return opts.material;
  if (role) return ROLE_CLASS[role];
  const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
  return m?.color ? inferMaterial([...m.color.clone().convertLinearToSRGB().toArray(), m.opacity ?? 1], opts.label) : 'plastic';
}

export function part(
  geometry: THREE.BufferGeometry,
  mats: MaterialSet,
  role: MaterialRole,
  opts: PartOptions,
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, mats.get(role));
  mesh.castShadow = opts.shadow ?? true;
  mesh.receiveShadow = true;
  tag(mesh, opts, role);
  return mesh;
}

export function tag(o: THREE.Object3D, opts: PartOptions, role?: MaterialRole): THREE.Object3D {
  const meta: PartMeta = {
    label: opts.label,
    layer: opts.layer,
    explode: opts.explode ?? new THREE.Vector3(),
    rest: o.position.clone(),
    role,
    material: classOf(o, opts, role),
  };
  o.userData.part = meta;
  return o;
}

/** Re-capture rest positions after a builder moved its parts into place. */
export function settle(root: THREE.Object3D): void {
  root.traverse((o) => {
    const meta = partOf(o);
    if (meta) meta.rest.copy(o.position);
  });
}
