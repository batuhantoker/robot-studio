/** Physics mode's panel: the control lab, then how the motors and tracking are doing right now. */
import type { Scope } from '../../app/controller/learn/lab';
import type { LiveBus } from '../../app/live/bus';
import type { RobotSession } from '../../app/robots/session';
import type { Store } from '../../app/state/store';
import type { StudioState } from '../../app/state/types';
import { STAND_SECONDS } from '../../physics/control/stand';
import { h, replace } from '../dom/h';
import { gainBoard } from '../physics/gain-board';
import { scoreCard } from '../physics/score-card';
import { teachCard } from '../physics/teach-card';
import { LineChart, jointSeries } from '../widgets/chart';
import { segmented } from '../widgets/segmented';
import type { AnalysisContext } from './context';

const DEG = 180 / Math.PI;
const MAX_LINES = 12;

const OWN_TASK = {
  swing: 'iLQR plans the swing-up inside the motors’ limits, its feedback tracks the plan, and LQR catches the rig and holds it upright. Choose Track to tune gains by hand or teach them.',
  free: 'No torque at all: MuJoCo lets it go from the pose you set, and only gravity moves it. Choose Track to tune gains by hand or teach them.',
};

export function physicsPanel(store: Store<StudioState>, bus: LiveBus, ctx: AnalysisContext, session: () => RobotSession | null) {
  const torque = new LineChart({ digits: 0 });
  const error = new LineChart({ minSpan: 1, digits: 2 });
  const score = scoreCard();
  const gains = gainBoard();
  const teach = teachCard((m) => ctx.teach(m));
  const controller = segmented<'pid' | 'model'>([['pid', 'PID'], ['model', 'PID + gravity model']], 'pid', (v) => {
    controller.set(v);
    ctx.physics()?.lab?.setCompensate(v === 'model');
  });
  const note = h('div');
  let problem: string | null = null;
  const floor = segmented<'stand' | 'floor'>([['stand', 'Test stand'], ['floor', 'On the floor']], 'stand', (v) => {
    void ctx.setFloor(v === 'floor').then((why) => {
      problem = why;
      show();
    });
  });
  const shove = h('button.tb', { onclick: () => ctx.shove(), title: 'Push the robot sideways, right now' }, 'Shove');
  const floorRow = h('div.row.lab-row', {}, floor.el, shove);
  const scope = segmented<Scope>([['limb', 'This limb'], ['robot', 'Whole robot']], 'limb', (v) => {
    ctx.physics()?.lab?.setScope(v);
    show();
  });
  const scopeRow = h('div.row.lab-row', {}, scope.el);
  const lab = h('div', {}, floorRow, score.el, controller.el, scopeRow, gains.el, teach.el,
    h('div.cap.mu', { style: 'margin-top:14px' }, 'Torque, % of each joint’s limit'), torque.el,
    h('div.cap.mu', { style: 'margin-top:8px' }, 'Tracking error °'), error.el);
  const el = h('div.section', {}, h('header', {}, h('span.cap', {}, 'Control lab'), h('span.cap.mu', {}, 'MuJoCo WASM')), note, lab);

  let unsubscribe: (() => void) | null = null;
  let notes = () => {};
  let ownMotion = false;
  const show = () => {
    const p = ctx.physics();
    const s = session();
    unsubscribe?.();
    unsubscribe = null;
    const own = store.state.pendulum?.task;
    const owned = own === 'swing' || own === 'free';
    lab.hidden = !p?.lab || owned;
    replace(note, p?.reason ? h('p.note', {}, p.reason) : owned ? h('p.note', {}, OWN_TASK[own]) : null);
    if (!p?.lab || !s || owned) return;
    const l = p.lab;
    const block = p.floorBlock;
    floorRow.hidden = block === undefined;
    floor.set(p.onFloor ? 'floor' : 'stand');
    shove.hidden = !p.onFloor;
    for (const b of floor.el.querySelectorAll('button')) if (b.dataset.v === 'floor') b.disabled = !!block;
    scopeRow.hidden = s.limbs.length < 2 || p.onFloor;
    scope.set(l.scope);
    notes = () => replace(note,
      problem ? h('p.note.lab-hint', {}, problem) : null,
      l.overloaded.length ? h('p.note.lab-hint.accent', {}, `Too weak to hold itself up: ${l.overloaded[0].name} needs ${l.overloaded[0].needs.toFixed(1)} N·m and has ${l.overloaded[0].has.toFixed(1)}. No gains can fix that; raise its torque in Build.`) : null,
      l.onStand ? h('p.note.lab-hint', {}, block ? `On a test stand: the base is held still. ${block}` : 'On a test stand: the base is held still, so this tunes the joints, not balance.') : null,
      l.onFloor ? h('p.note.lab-hint', {}, 'On the floor: it holds its pose and takes a shove 1.5 s in. A fall ends the run.') : null,
      l.estimatedLimits ? h('p.note.lab-hint', {}, 'Torque limits are estimates: this model states none, so they come from its masses.') : null,
      ownMotion ? h('p.note.lab-hint', {}, 'The trajectory leaves these joints still, so the lab runs its own test motion. It may touch where the trajectory wouldn’t.') : null);
    unsubscribe = l.on(() => {
      score.board(l);
      gains.sync();
      teach.update();
    });
    controller.set(l.compensate ? 'model' : 'pid');
    gains.show(l);
    teach.show(l);
    score.board(l);
    notes();
  };
  store.on(['sessionVersion', 'focus', 'pendulum'], show);
  show();

  bus.on(() => {
    const p = ctx.physics();
    const l = p?.lab;
    if (!p || !l || store.state.mode !== 'physics' || el.offsetParent === null) return;
    if (p.ownMotion !== ownMotion) {
      ownMotion = p.ownMotion;
      notes();
    }
    score.live(p.current, p.onFloor);
    teach.update();
    if (l.running) gains.sync();
    const joints = l.judged().slice(0, MAX_LINES);
    const { t, applied, error: err } = p.history;
    if (!t.length) return;
    const span: [number, number] = [0, p.onFloor ? STAND_SECONDS : store.state.duration];
    torque.setData(t, joints.map((k, i) => jointSeries(i, `j${i + 1}`, applied.map((row) => (100 * row[k]) / l.limits[k]))), span);
    torque.draw(null, [-100, 100]);
    error.setData(t, joints.map((k, i) => jointSeries(i, `j${i + 1}`, err.map((row) => row[k] * DEG))), span);
  }, 8);
  return el;
}
