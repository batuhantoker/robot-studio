/**
 * What stands around the robot, from nothing to a whole warehouse aisle, sized from the robot's own radius.
 * Moving parts run on a scenery clock advanced with each frame, so rendered video shows them too.
 */
import * as THREE from 'three';
import { buildCell } from './scenery/cell';
import { buildDesk } from './scenery/desk';
import { type Scenery, type Stance, dispose } from './scenery/kit';
import { buildLab } from './scenery/lab';
import { buildMachine } from './scenery/machine';
import { buildWarehouse } from './scenery/warehouse';

export type EnvironmentId = 'open' | 'desk' | 'lab' | 'cell' | 'machine' | 'warehouse';

export const ENVIRONMENTS: [EnvironmentId, string][] = [
  ['open', 'Open'], ['desk', 'Desk'], ['lab', 'Lab bench'], ['cell', 'Work cell'], ['machine', 'Machining'], ['warehouse', 'Warehouse'],
];

/** A table's height: in proportion to the robot, but always a table. */
const tableHeight = (s: number) => Math.min(Math.max(1.6 * s, 0.45), 0.78);

/** For a standing robot, `s` is a person-sized workplace unit from the bench height instead of the robot's radius. */
const KINDS: Record<Exclude<EnvironmentId, 'open'>, { build(s: number, drop: number, stance?: Stance): Scenery; raised: boolean; extent: number }> = {
  desk: { build: buildDesk, raised: true, extent: 2.2 },
  lab: { build: buildLab, raised: true, extent: 2.2 },
  cell: { build: buildCell, raised: false, extent: 3.7 },
  machine: { build: buildMachine, raised: false, extent: 3 },
  warehouse: { build: buildWarehouse, raised: false, extent: 3.7 },
};

export interface Environment {
  group: THREE.Group;
  /** Wire mesh and glass: AO would treat them as solid and shade what is seen through them. */
  seeThrough: THREE.Group;
  id: EnvironmentId;
  /** How far below the robot's base the floor sits (a table's height). */
  drop: number;
  /** Half-width of the ground the setting covers, for the shadow frustum. */
  extent: number;
  /** Whether the scenery clock runs. */
  motion: boolean;
  fit(radius: number, floorZ: number, stance?: Stance): void;
  apply(id: EnvironmentId): void;
  update(dt: number): void;
  /** Highest still scenery top at (x, y) at or below `z`, else the floor. */
  supportBelow(x: number, y: number, z: number): number;
  /** Where a ray first meets still scenery, and whether that is a top a spot can stand on. */
  hit(ray: THREE.Ray): { point: THREE.Vector3; top: boolean } | null;
}

/** Moving parts and floor paint are never where a spot stands. */
const skipped = (o: THREE.Object3D | null): boolean => !!o && (o.userData.moving === true || o.userData.marking === true || skipped(o.parent));

export function createEnvironment(): Environment {
  const group = new THREE.Group();
  const seeThrough = new THREE.Group();
  let id: EnvironmentId = 'open';
  let radius = 0.5;
  let floorZ = 0;
  let stance: Stance | undefined;
  let time = 0;
  let built: Scenery | null = null;
  const caster = new THREE.Raycaster();

  const hits = (ray: THREE.Ray) => {
    group.updateMatrixWorld(true);
    caster.ray.copy(ray);
    caster.far = Infinity;
    return caster.intersectObject(group, true).filter((h) => !skipped(h.object));
  };
  const toWorld = new THREE.Matrix4(), instance = new THREE.Matrix4();
  const up = (h: THREE.Intersection) => {
    const n = h.face?.normal;
    if (!n) return false;
    toWorld.copy(h.object.matrixWorld);
    if (h.instanceId !== undefined) {
      (h.object as THREE.InstancedMesh).getMatrixAt(h.instanceId, instance);
      toWorld.multiply(instance);
    }
    return n.clone().transformDirection(toWorld).z > 0.9;
  };

  const env: Environment = {
    group,
    seeThrough,
    id,
    drop: 0,
    extent: 0,
    motion: true,
    fit(r, z, st) {
      if (Math.abs(r - radius) < 1e-9 && Math.abs(z - floorZ) < 1e-9 && JSON.stringify(st) === JSON.stringify(stance) && built) return;
      radius = Math.max(r, 0.05);
      floorZ = z;
      stance = st;
      rebuild();
    },
    apply(next) {
      id = env.id = next;
      rebuild();
    },
    update(dt) {
      // A hidden tab resumes with one long frame; don't jump the scenery by it.
      if (env.motion) time += Math.min(Math.max(dt, 0), 0.1);
      built?.pose?.(time);
    },
    supportBelow(x, y, z) {
      const ground = floorZ - env.drop;
      if (!built) return ground;
      const tol = 0.002 * radius;
      const top = hits(new THREE.Ray(new THREE.Vector3(x, y, z + tol), new THREE.Vector3(0, 0, -1)))[0];
      return top ? Math.max(top.point.z, ground) : ground;
    },
    hit(ray) {
      const first = built ? hits(ray)[0] : undefined;
      return first ? { point: first.point.clone(), top: up(first) } : null;
    },
  };
  const rebuild = () => {
    for (const c of [...group.children, ...seeThrough.children]) {
      c.removeFromParent();
      dispose(c);
    }
    built = null;
    const kind = id === 'open' ? null : KINDS[id];
    const standing = !!stance?.standing;
    // A raised setting's unit puts its table at the bench height, as tableHeight does for a bolted robot.
    const s = standing && stance ? stance.hand / 1.6 : radius;
    env.drop = kind?.raised && !standing ? tableHeight(radius) : 0;
    env.extent = kind ? kind.extent * Math.max(s, radius) : 0;
    if (kind) {
      built = kind.build(s, kind.raised && standing ? stance!.hand : env.drop, stance);
      group.add(built.group);
      for (const o of built.seeThrough ?? []) seeThrough.add(o);
      built.pose?.(time);
    }
    group.position.z = seeThrough.position.z = floorZ;
    group.rotation.z = seeThrough.rotation.z = stance?.facing ?? 0;
  };
  return env;
}
