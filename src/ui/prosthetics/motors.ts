/** A prosthesis in the Live tab: one slider per motor, each moving its joints through the hand's linkage, and its grips. */
import { jog } from '../../app/collision/jog';
import type { Snapshot } from '../../app/live/bus';
import type { RobotSession } from '../../app/robots/session';
import type { Store } from '../../app/state/store';
import type { StudioState } from '../../app/state/types';
import { gripMotors, jointsFor, type MotorMap, motorsOf, type ProsthesisMotor } from '../../core/prosthesis/motors';
import { num } from '../dom/format';
import { h } from '../dom/h';

const DEG = 180 / Math.PI;
const motorText = (m: ProsthesisMotor, v: number) => (m.unit === 'fraction' ? `${num(v * 100, 0)}%` : `${num(v * DEG, 1)}°`);

export function motorRows(session: RobotSession, map: MotorMap, store: Store<StudioState>) {
  let blocked = -1;
  const move = (motors: number[], i: number) => {
    const { q, contact } = jog(session, store.state.q, jointsFor(map, motors, store.state.q));
    blocked = contact ? i : -1;
    store.set({ q, contact, mode: 'pose', playing: false });
    return q;
  };
  const rows = map.motors.map((m, i) => {
    const slider = h('input', { type: 'range', min: String(m.range[0]), max: String(m.range[1]), step: String((m.range[1] - m.range[0]) / 1000) });
    const val = h('span.val');
    const joints = h('span.range.mono');
    const el = h('div.joint', {}, h('span.name', {}, m.label), val, slider, joints);
    slider.addEventListener('input', () => {
      const motors = motorsOf(map, store.state.q);
      motors[i] = Number(slider.value);
      slider.value = String(motorsOf(map, move(motors, i))[i]);
    });
    return { el, slider, val, joints };
  });
  // Grips go through the same contact guard as the sliders: a grip that would close on itself stops at the touch.
  const grips = map.grips.length
    ? h('div.row', { style: 'gap:4px;margin:6px 0 2px;flex-wrap:wrap' }, h('span.cap.mu', {}, 'Grips'),
      ...map.grips.map((g) => h('button.tb', { onclick: () => move(gripMotors(map, g, motorsOf(map, store.state.q)), -1) }, g.label)))
    : null;
  const el = h('div', {}, grips, ...rows.map((r) => r.el));
  return {
    el,
    update(s: Snapshot) {
      const motors = motorsOf(map, s.q);
      rows.forEach((r, i) => {
        const m = map.motors[i];
        r.el.classList.toggle('at-limit', motors[i] <= m.range[0] + 1e-6 || motors[i] >= m.range[1] - 1e-6);
        r.el.classList.toggle('blocked', i === blocked && !!store.state.contact);
        if (document.activeElement !== r.slider) r.slider.value = String(motors[i]);
        r.val.textContent = motorText(m, motors[i]);
        const ds = map.drives[i];
        const shown = ds.map((d) => `${session.joints[d.k].name} ${num(s.q[d.k] * DEG, 0)}°`);
        r.joints.textContent = m.hint ?? (ds.length > 3 ? `${ds.length} joints · ${shown[0]}` : shown.join(' · '));
      });
    },
  };
}

/** A random hand pose drawn in motor space, so the linkage holds. */
export function randomMotors(map: MotorMap, q: number[]): number[] {
  return jointsFor(map, map.motors.map((m) => m.range[0] + Math.random() * (m.range[1] - m.range[0])), q);
}
