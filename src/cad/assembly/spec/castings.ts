/** A robot as one casting per chain body, meeting at flat interfaces, with its drives seated inside them. */
import * as THREE from 'three';
import { linkJointStart } from '../../../core/chain/model/from-spec';
import { identityTransform } from '../../../core/math/linear/transform';
import type { Vec3 } from '../../../core/math/linear/vec';
import { add, dot, scale, sub } from '../../../core/math/linear/vec';
import { JOINT_KINDS } from '../../../core/robot/joints/kinds';
import type { BodyDesign } from '../../../core/robot/schema/design';
import type { LinkSpec, RobotSpec } from '../../../core/robot/schema/types';
import { hullOf } from '../../common/hull';
import { lowestSolidZ } from '../../common/lowest';
import type { MaterialSet } from '../../materials/library';
import { bakeSlot } from '../../parts/castings/bake';
import { buildCasting, coat, wallOf } from '../../parts/castings/casting';
import { buildConduit } from '../../parts/castings/conduit';
import { driveBores, seatedDrive } from '../../parts/castings/drive';
import { seatedSlide } from '../../parts/castings/slide';
import { type Field, type Solid, carve, cone, drum, half, inset, meet, piece, within } from '../../parts/castings/field';
import { type Joint, planChain } from '../../parts/castings/plan';
import { type Cast, bodyEnds, castBody, cellFor, crispDrum } from '../../parts/castings/recipe';
import { JOINT_MODULES } from '../../registry/joint-modules';
import type { JointModule } from '../../parts/types';
import { type Gap, poseSlots, type Slot } from './slots';
import { type SpecBody, toolSize } from './body';

const tagModule = (g: THREE.Object3D, id: string) => ((g.userData.module = id), g);

/** The solid a hull marker stands for, at the zero pose. */
function markerField(o: THREE.Object3D, origin: Vec3): Field {
  const inverse = new THREE.Matrix4().makeTranslation(...origin).multiply(o.matrixWorld).invert();
  const { shape, size } = hullOf(o)!;
  const p = new THREE.Vector3();
  return (x, y, z) => {
    p.set(x, y, z).applyMatrix4(inverse);
    if (shape === 'sphere') return p.length() - size[0];
    if (shape === 'box') {
      const qx = Math.abs(p.x) - size[0], qy = Math.abs(p.y) - size[1], qz = Math.abs(p.z) - size[2];
      return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0);
    }
    const qr = Math.hypot(p.x, p.y) - size[0], qz = Math.abs(p.z) - size[1];
    return Math.hypot(Math.max(qr, 0), Math.max(qz, 0)) + Math.min(Math.max(qr, qz), 0);
  };
}

/** Hardware a neighbouring casting has to stay clear of, from a non-revolute joint's own hull. */
function moduleClearance(m: JointModule, origin: Vec3, gap: number): Field[] {
  const out: Field[] = [];
  for (const stage of m.stages) {
    stage.updateWorldMatrix(true, true);
    stage.traverse((o) => void (hullOf(o) && out.push(inset(markerField(o, origin), -gap))));
  }
  return out;
}

/** A robot with no design data is one being edited, rebuilt on every change: a coarser mesh keeps that near 0.3 s. */
const DRAFT_CELL = 3;

/** Empty stages for a joint with no hardware. */
const virtualModule = (link: LinkSpec): JointModule => ({ stages: [new THREE.Group(), ...link.dofs.map(() => new THREE.Group())], exit: () => 0, indicators: [], size: 0 });

/** Has a seated drive and an interface to open for it. */
const turns = (j: Joint | undefined) => j?.kind === 'roll' || j?.kind === 'hinge';

const overlap = (a: Cast, b: Cast, by: number) => [0, 1, 2].every((i) => a.lo[i] - by < b.hi[i] && b.lo[i] - by < a.hi[i]);

/** The hole a drive passes through, from outside the interface to just past the wall. */
function opening(j: Joint, role: 'parent' | 'child', wall: number): Solid {
  const seat = add(j.origin, scale(j.axis, j.plane));
  const inward = scale(j.axis, role === 'parent' ? -1 : 1);
  return crispDrum(sub(seat, scale(inward, 0.002)), add(seat, scale(inward, wall * 1.6 + 0.002)), driveBores(j).r);
}

export function castingBody(spec: RobotSpec, mats: MaterialSet, root: THREE.Group): SpecBody {
  const plan = planChain(spec);
  const starts = linkJointStart(spec);
  const named = spec.design?.paint ?? {};
  const paintOf = (d: BodyDesign | undefined) => ({ body: named[d?.paint ?? 'shell'], named });
  const draft = (k: number): BodyDesign => ({ cell: cellFor(Math.max(...bodyEnds(plan, k).map((e) => e.side.radius), 0)) * DRAFT_CELL, draft: true });
  const bodyDesign = (k: number) => (!spec.design ? draft(k) : k < 0 ? spec.design.base : spec.design.links?.[spec.links[k].name]);
  // By the body's own size, as the casting takes it: a drive's mounts sit on that wall.
  const wallAt = (k: number) => wallOf(bodyDesign(k), Math.max(...bodyEnds(plan, k).map((e) => e.side.radius), 0));
  const moduleOfBody = (k: number) => (k < 0 ? 'base' : `link:${spec.links[k].name}`);
  const built = plan.joints.map((j) => {
    if (j.kind === 'module') return JOINT_MODULES[j.link.joint]({ mats, link: j.link, index: j.index });
    if (j.kind === 'virtual') return virtualModule(j.link);
    if (j.kind !== 'slide') return seatedDrive(mats, j, plan.gap, wallAt(j.index - 1), wallAt(j.index));
    const rail = j.slide!.form === 'rail';
    return seatedSlide(mats, j, plan.gap, wallAt(rail ? j.index : j.index - 1), moduleOfBody(rail ? j.index - 1 : j.index), named);
  });
  const slots: Slot[] = [];
  const modules: SpecBody['modules'] = [];
  const gaps: Gap[] = [];
  const clearance: Field[] = [];
  spec.links.forEach((link, k) => {
    const m = built[k];
    const id = `joint:${link.name}`;
    modules.push({ id, label: link.name, kind: JOINT_KINDS[link.joint].label, joints: link.dofs.map((_, i) => starts[k] + i) });
    m.stages.forEach((stage, i) => {
      const dof = starts[k] + i - 1;
      slots.push({ group: tagModule(stage, id) as THREE.Group, frame: (f) => (i === 0 ? f.pre[starts[k]] : f.frames[dof]), body: i === 0 ? starts[k] - 1 : dof, before: starts[k] + i, enclosed: plan.joints[k].kind !== 'module' });
      root.add(stage);
    });
    // A joint opens along the link's own axis; the plan may have turned that to run from parent to child.
    const slide = plan.joints[k].slide;
    const way = (link.joint === 'revolute' && dot(plan.joints[k].axis, link.axis) < 0) || (slide?.form === 'rail' && slide.foot) ? -1 : 1;
    const along = plan.joints[k].drive?.along;
    link.dofs.forEach(() => gaps.push(along ? { by: (m.size * 1.3) / link.dofs.length, along } : (way * m.size * 1.3) / link.dofs.length));
    if (plan.joints[k].kind === 'module') clearance.push(...moduleClearance(m, plan.joints[k].origin, plan.gap));
  });
  const earlier: { cast: Cast; slid: number }[] = [];
  /** Slides between the base and body `k`: bodies a slide apart do not stay where the zero pose has them. */
  const slidesTo = (k: number) => plan.joints.slice(0, k + 1).filter((j) => j.kind === 'slide').length;
  const finish = (cast: Cast, k: number): Solid => {
    let solid = cast.solid;
    // Interfaces set by hand are the design's own promise, and a robot with none needs this net.
    if (!spec.design?.joints) for (const { cast: before, slid } of earlier) if (slid === slidesTo(k) && overlap(cast, before, plan.gap)) solid = carve(solid, piece(within(inset(before.solid.f, -plan.gap), before.lo, before.hi, before.pad - plan.gap)));
    for (const c of clearance) solid = carve(solid, piece(c));
    return solid;
  };
  const keepClear = (cast: Cast): Cast => ({ ...cast, bores: [...(cast.bores ?? []), ...clearance] });
  const openingsOf = (k: number, wall: number) => [
    ...(k >= 0 && turns(plan.joints[k]) ? [opening(plan.joints[k], 'child', wall)] : []),
    ...(turns(plan.joints[k + 1]) ? [opening(plan.joints[k + 1], 'parent', wall)] : []),
    // The register a tool's spigot centres in, big enough for the spigot of a tool sized by the arm's reach.
    ...(k === spec.links.length - 1 && !plan.bare ? [crispDrum(add(plan.flange.at, scale(plan.flange.normal, 0.002)), sub(plan.flange.at, scale(plan.flange.normal, Math.max(wall * 0.8, toolSize(spec) * 0.06))), Math.max(plan.flange.radius * 0.42, toolSize(spec) * 0.33))] : []),
  ];
  const castLink = (k: number) => {
    const link = spec.links[k];
    const j = plan.joints[k];
    const design = bodyDesign(k);
    const ends = bodyEnds(plan, k);
    const cast = castBody(ends, j.origin, design, plan.gap);
    if (!cast) return;
    const g = buildCasting(mats, keepClear(cast), finish(cast, k), openingsOf(k, wallOf(design, cast.size)), ends.map((e) => e.n), j.origin, design, design?.label ?? `${link.name} casting`, paintOf(design), bakeSlot(spec, k));
    earlier.push({ cast, slid: slidesTo(k) });
    if (!g) return;
    built[k].stages.at(-1)!.add(tagModule(g, `link:${link.name}`));
    modules.push({ id: `link:${link.name}`, label: `${link.name} link`, kind: 'Link', joints: [] });
  };
  spec.links.forEach((_, k) => castLink(k));
  // A body can be nothing but its bar.
  plan.joints.forEach((j, k) => {
    if (j.slide?.form === 'quill' && !modules.some((m) => m.id === moduleOfBody(k))) modules.push({ id: moduleOfBody(k), label: `${j.link.name} link`, kind: 'Link', joints: [] });
  });
  const run = spec.design?.conduit;
  const conduit = run ? buildConduit(mats, run.r, run.rise) : null;
  if (run && conduit) {
    coat(conduit.mesh, mats, named[run.paint ?? '']);
    // A section has nothing to show in a cable: cut, it would only leave a broken arch in the air.
    conduit.mesh.userData.cut = 1;
    root.add(tagModule(conduit.mesh, `link:${run.start.link}`));
  }
  /** Where a point on a body is now, in the assembly's frame. */
  const onBody = ({ link, at }: { link: string; at: Vec3 }) => {
    const stage = built[spec.links.findIndex((l) => l.name === link)].stages.at(-1)!;
    return new THREE.Vector3(...at).applyQuaternion(stage.quaternion).add(stage.position);
  };
  return {
    slots,
    modules,
    gaps,
    follow: () => void (run && conduit?.form(onBody(run.start), onBody(run.end))),
    indicators: built.flatMap((m, k) => spec.links[k].dofs.map((_, i) => m.indicators[i] ?? null)),
    lastStage: built[built.length - 1].stages.at(-1)!,
    stand: (home) => {
      poseSlots(slots, home, gaps, 0);
      // Nothing stands on the floor but what rides the first joint.
      if (plan.joints[0].kind === 'virtual' && !spec.design?.joints?.[spec.links[0].name]?.pin) return Math.min(0, lowestSolidZ(root));
      const design = spec.design?.base;
      // A rail held by hand-shaped parts leaves the base no end of its own.
      const ends = bodyEnds(plan, -1);
      const [end] = ends;
      const R = end?.side.radius ?? 0;
      const floorZ = Math.min(0, lowestSolidZ(root), end ? end.at[2] - R * 0.5 : 0);
      const foot: Field[] = [];
      const bounds: { at: Vec3; r: number }[] = [];
      if (end && !design?.shapes) {
        const ground: Vec3 = [end.at[0], end.at[1], floorZ];
        foot.push(drum(ground, add(ground, [0, 0, R * 0.22]), R * 1.9, R * 0.05), cone(ground, end.at, R * 1.08, R));
        bounds.push({ at: ground, r: R * 1.9 }, { at: end.at, r: R * 1.08 });
      }
      const raw = castBody(ends, spec.base, design, plan.gap, foot, bounds);
      const baseSlot = new THREE.Group();
      if (raw) {
        const floor = piece(half([0, 0, floorZ], [0, 0, -1]));
        const cast = { ...raw, solid: meet(raw.solid, floor), shell: raw.shell && meet(piece(raw.shell), floor).f };
        const g = buildCasting(mats, keepClear(cast), finish(cast, -1), openingsOf(-1, wallOf(design, cast.size)), ends.map((e) => e.n), [0, 0, 0], design, design?.label ?? 'Base casting', paintOf(design), bakeSlot(spec, -1));
        if (g) {
          baseSlot.add(g);
          // Faces overlap a hair at their edges; here that hair would sit under the floor.
          g.traverse((o) => {
            const p = (o as THREE.Mesh).geometry?.attributes.position;
            if (p) for (let i = 0; i < p.count; i++) if (p.getZ(i) < floorZ) p.setZ(i, floorZ);
          });
        }
      }
      root.add(tagModule(baseSlot, 'base'));
      slots.push({ group: baseSlot, frame: () => identityTransform(), body: -1, before: 0 });
      modules.unshift({ id: 'base', label: design?.label ?? 'Base', kind: 'Base', joints: [] });
      return floorZ;
    },
  };
}

