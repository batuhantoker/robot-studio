/** Physics mode's panel: the control lab, then how the motors and tracking are doing right now. */
import type { LiveBus } from '../../app/live/bus';
import type { RobotSession } from '../../app/robots/session';
import type { Store } from '../../app/state/store';
import type { StudioState } from '../../app/state/types';
import { h, replace } from '../dom/h';
import { gainBoard } from '../physics/gain-board';
import { scoreCard } from '../physics/score-card';
import { teachCard } from '../physics/teach-card';
import { LineChart, jointSeries } from '../widgets/chart';
import { segmented } from '../widgets/segmented';
import type { AnalysisContext } from './context';

const DEG = 180 / Math.PI;

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
  const lab = h('div', {}, score.el, controller.el, gains.el, teach.el,
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
    lab.hidden = !p?.lab;
    replace(note, p?.reason ? h('p.note', {}, p.reason) : null);
    if (!p?.lab || !s) return;
    const l = p.lab;
    notes = () => replace(note,
      l.onStand ? h('p.note.lab-hint', {}, 'On a test stand: the base is held still, so this tunes the joints, not balance. It can’t fall over yet.') : null,
      l.estimatedLimits ? h('p.note.lab-hint', {}, 'Torque limits are estimates: this model states none, so they come from its masses.') : null,
      ownMotion ? h('p.note.lab-hint', {}, 'The trajectory leaves these joints still, so the lab runs its own test motion. It may touch where the trajectory wouldn’t.') : null);
    unsubscribe = l.on(() => {
      score.board(l);
      gains.sync();
      teach.update();
    });
    controller.set(l.compensate ? 'model' : 'pid');
    gains.show(l, s);
    teach.show(l);
    score.board(l);
    notes();
  };
  store.on(['sessionVersion', 'focus'], show);
  show();

  bus.on(() => {
    const p = ctx.physics();
    const l = p?.lab;
    if (!p || !l || store.state.mode !== 'physics' || el.offsetParent === null) return;
    if (p.ownMotion !== ownMotion) {
      ownMotion = p.ownMotion;
      notes();
    }
    score.live(p.current);
    teach.update();
    if (l.running) gains.sync();
    const joints = l.judged();
    const { t, applied, error: err } = p.history;
    if (!t.length) return;
    const span: [number, number] = [0, store.state.duration];
    torque.setData(t, joints.map((k, i) => jointSeries(i, `j${i + 1}`, applied.map((row) => (100 * row[k]) / l.limits[k]))), span);
    torque.draw(null, [-100, 100]);
    error.setData(t, joints.map((k, i) => jointSeries(i, `j${i + 1}`, err.map((row) => row[k] * DEG))), span);
  }, 8);
  return el;
}
