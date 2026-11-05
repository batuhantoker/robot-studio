/** What the graphs can plot, read out of the live history for the focused limb. */
import { type Sample, rates } from '../../app/live/history';
import type { RobotSession } from '../../app/robots/session';
import { dofScale, dofUnit } from '../dom/format';
import { type Series, jointSeries } from '../widgets/chart';

export interface GraphView {
  session: RobotSession;
  focus: number;
  t: number[];
  samples: Sample[];
}

export interface Metric {
  id: string;
  chip: string;
  title: string;
  /** Plotted until the user says otherwise. */
  shown: boolean;
  minSpan: number;
  /** Lowest the value can be, for quantities with no negative side. */
  floor?: number;
  digits: number;
  series(v: GraphView): Series[];
  /** Why the graph can be empty. */
  empty?: string;
}

function eachJoint(v: GraphView, make: (j: number, k: number, label: string) => Series): Series[] {
  return v.session.limbs[v.focus].index.map((j, k) => make(j, k, `j${k + 1}`));
}

const named = (v: GraphView, j: number, unit: string) => ({ name: v.session.joints[j].name, unit });

/** Wheels and other free joints turn forever: shown as an angle, broken where it wraps. */
const wrapped = (degrees: number[]) => degrees
  .map((d) => ((((d + 180) % 360) + 360) % 360) - 180)
  .map((d, i, all) => (i && Math.abs(d - all[i - 1]) > 180 ? NaN : d));

const tool = (v: GraphView, axis: number) => v.samples.map((s) => s.tips[v.focus]?.[axis] ?? NaN);

export const METRICS: Metric[] = [
  {
    id: 'joints', chip: 'Joints', title: 'Joint position', shown: true, minSpan: 10, digits: 1,
    series: (v) => eachJoint(v, (j, k, label) => {
      const { type } = v.session.joints[j];
      const values = v.samples.map((s) => s.q[j] * dofScale(type));
      const free = v.session.limbs[v.focus].chain.joints[k].continuous;
      return jointSeries(k, label, free ? wrapped(values) : values, named(v, j, dofUnit(type)));
    }),
  },
  {
    id: 'speed', chip: 'Speed', title: 'Joint speed', shown: false, minSpan: 10, digits: 1,
    series: (v) => eachJoint(v, (j, k, label) => {
      const { type } = v.session.joints[j];
      return jointSeries(k, label, rates(v.t, v.samples.map((s) => s.q[j] * dofScale(type))), named(v, j, `${dofUnit(type)}/s`));
    }),
  },
  {
    id: 'torque', chip: 'Torque', title: 'Joint torque', shown: true, minSpan: 1, digits: 2,
    series: (v) => eachJoint(v, (j, k, label) => jointSeries(k, label, v.samples.map((s) => s.tau[j]),
      named(v, j, v.session.joints[j].type === 'slide' ? 'N' : 'N·m'))),
  },
  {
    id: 'tool', chip: 'Tool xyz', title: 'Tool position', shown: false, minSpan: 50, digits: 1,
    // The frame triads draw x y z in red, green, blue; the lines keep to that.
    series: (v) => (['#e34948', '#008300', '#2a78d6'] as const).map((color, axis) => ({
      label: 'xyz'[axis], color, name: `Tool ${'xyz'[axis]}`, unit: 'mm', values: tool(v, axis).map((m) => m * 1000),
    })),
  },
  {
    id: 'tool-speed', chip: 'Tool speed', title: 'Tool speed', shown: true, minSpan: 0.2, floor: 0, digits: 3,
    series: (v) => {
      const [x, y, z] = [0, 1, 2].map((axis) => rates(v.t, tool(v, axis)));
      return [jointSeries(0, 'speed', x.map((_, i) => Math.hypot(x[i], y[i], z[i])), { name: 'Tool speed', unit: 'm/s' })];
    },
  },
  {
    id: 'dexterity', chip: 'Dexterity', title: 'Manipulability ×10⁻³', shown: false, minSpan: 1, floor: 0, digits: 2,
    series: (v) => [jointSeries(0, 'w', v.samples.map((s) => (s.manipulability[v.focus] ?? NaN) * 1e3), { name: 'Manipulability ×10⁻³' })],
  },
  {
    id: 'error', chip: 'Error', title: 'Tracking error', shown: false, minSpan: 1, digits: 2,
    empty: 'Shown in Physics, on robots you can build',
    series: (v) => eachJoint(v, (j, k, label) => {
      const { type } = v.session.joints[j];
      return jointSeries(k, label, v.samples.map((s) => (s.error?.[j] ?? NaN) * dofScale(type)), named(v, j, dofUnit(type)));
    }),
  },
];
