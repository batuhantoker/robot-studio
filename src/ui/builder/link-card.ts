/** Editor for one link: joint kind from the catalogue, axes, offset, mass, limits, gains. */
import { JOINT_KINDS, JOINT_KIND_LIST } from '../../core/robot/joints/kinds';
import type { JointKind, LinkSpec } from '../../core/robot/schema/types';
import { DEG } from '../dom/format';
import { h } from '../dom/h';
import { field, numberInput, select, textInput, vecInput } from '../widgets/fields';

export type RawLink = Record<string, unknown>;

export interface LinkCardHandlers {
  change(patch: RawLink): void;
  move(delta: -1 | 1): void;
  remove(): void;
  focus(): void;
}

const AXES: [string, number[]][] = [['X', [1, 0, 0]], ['Y', [0, 1, 0]], ['Z', [0, 0, 1]]];

function axisPicker(axis: number[], onPick: (v: number[]) => void) {
  return h('div.row', {},
    ...AXES.map(([n, v]) => h('button.tb', { class: v.every((c, i) => Math.abs(c - axis[i]) < 1e-9) ? 'on' : '', onclick: () => onPick(v) }, n)),
    h('div', { style: 'flex:1' }, vecInput(axis, onPick, { step: 0.1, digits: 3 })));
}

function limitRows(link: LinkSpec, change: (p: RawLink) => void) {
  const pairs = link.dofs.map((d) => [...d.limits]);
  const commit = () => change({ limits: pairs.length === 1 ? pairs[0] : pairs });
  return link.dofs.map((d, i) => {
    const scale = d.type === 'hinge' ? DEG : 1000;
    const unit = d.type === 'hinge' ? '°' : 'mm';
    return field(`${d.name.replace(`${link.name}_`, '') || 'range'} ${unit}`, h('div.vec', { style: 'grid-template-columns:1fr 1fr' },
      numberInput(d.limits[0], (v) => ((pairs[i][0] = v), commit()), { scale, step: d.type === 'hinge' ? 5 : 5, digits: 1 }),
      numberInput(d.limits[1], (v) => ((pairs[i][1] = v), commit()), { scale, step: d.type === 'hinge' ? 5 : 5, digits: 1 })));
  });
}

export function linkCard(link: LinkSpec, index: number, open: boolean, focused: boolean, on: LinkCardHandlers): HTMLElement {
  const info = JOINT_KINDS[link.joint];
  const body = h('div', { style: open ? '' : 'display:none' },
    field('Name', textInput(link.name, (name) => on.change({ name }))),
    field('Joint', select(JOINT_KIND_LIST.map((k) => [k.kind, `${k.label} · ${k.dofs.length} DOF`]), link.joint, (joint: JointKind) => on.change({ joint, limits: undefined }))),
    h('p.note', {}, `${info.motion}. ${info.useCase}.`),
    field('Axis', axisPicker(link.axis, (axis) => on.change({ axis }))),
    info.dofs.some((d) => d.axis !== 'axis') ? field('Axis 2', axisPicker(link.axis2, (axis2) => on.change({ axis2 }))) : null,
    field('Offset mm', vecInput(link.offset, (offset) => on.change({ offset }), { scale: 1000, step: 5, digits: 1 })),
    field('Mass kg', numberInput(link.mass, (mass) => on.change({ mass }), { step: 0.05 })),
    field('Radius mm', numberInput(link.radius, (radius) => on.change({ radius }), { scale: 1000, step: 1, digits: 1 })),
    ...limitRows(link, on.change),
    field('Torque N·m', numberInput(link.torque_limit, (torque_limit) => on.change({ torque_limit }), { step: 0.5 })),
    field('Kp / Kd', h('div.vec', { style: 'grid-template-columns:1fr 1fr' },
      numberInput(link.kp, (kp) => on.change({ kp }), { step: 1 }),
      numberInput(link.kd, (kd) => on.change({ kd }), { step: 0.1 }))),
    h('div.row', { style: 'margin-top:6px' },
      h('button.tb', { onclick: () => on.move(-1) }, '↑'),
      h('button.tb', { onclick: () => on.move(1) }, '↓'),
      h('div', { style: 'flex:1' }),
      h('button.tb', { onclick: on.remove }, 'Remove')));
  const header = h('header', { onclick: () => on.focus() },
    h('span.cap.mu', {}, String(index + 1).padStart(2, '0')),
    h('b', {}, link.name),
    h('span.chip', { class: link.joint === 'revolute' ? '' : 'accent' }, `${info.label} · ${link.dofs.length}`));
  return h('div.card', { class: focused ? 'on' : '' }, header, body);
}
