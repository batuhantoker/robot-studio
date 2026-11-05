/** The Live tab: end effectors, focused-limb dexterity, and every joint; rebuilt per robot. */
import { randomFree } from '../../app/collision/jog';
import type { LiveBus } from '../../app/live/bus';
import type { RobotSession } from '../../app/robots/session';
import type { Store } from '../../app/state/store';
import type { StudioState } from '../../app/state/types';
import { h, replace } from '../dom/h';
import { barsOf } from '../../core/motion/generators/double-pendulum';
import { isPendulum } from '../../core/robot/config/pendulum';
import { motorRows, randomMotors } from '../prosthetics/motors';
import { effectorTable } from './effectors';
import { energyReadout } from './energy';
import { jointRows } from './joints';
import { readouts } from './readouts';

export function mountLive(el: HTMLElement, store: Store<StudioState>, bus: LiveBus) {
  let rows: ReturnType<typeof jointRows> | null = null;
  const reads = readouts();
  let energy: ReturnType<typeof energyReadout> | null = null;
  const readsCap = h('span.cap');
  const readsHost = h('div');
  const effectors = effectorTable(store);
  const effectorSection = h('div.section', {}, h('header', {}, h('span.cap', {}, 'End effectors'), h('span.cap.mu', {}, 'click a limb to focus')), effectors.el);
  const jointsHost = h('div');
  const jointsCap = h('span.cap', {}, 'Joints');
  const jointsHint = h('span.cap.mu', {}, 'bar = |τ| / motor limit');
  const contactNote = h('p.note.accent');
  const random = () => {
    const s = bus.latest?.session;
    if (!s) return;
    const draw = () => s.prosthesis ? randomMotors(s.prosthesis, store.state.q)
      : s.joints.map((j) => j.limits[0] + Math.random() * (j.limits[1] - j.limits[0]));
    store.set({ ...randomFree(s, store.state.q, draw), playing: false, mode: 'pose' });
  };
  const note = () => {
    const c = bus.latest?.session.collision;
    const text = store.state.contact ? `Stopped at contact: ${store.state.contact}.`
      : c && !c.opts.self ? 'This model has no collision geometry, so only the floor stops it.' : '';
    contactNote.textContent = text;
    contactNote.style.display = text ? '' : 'none';
  };
  store.on(['contact', 'sessionVersion'], note);
  note();
  el.append(
    effectorSection,
    h('div.section', {}, h('header', {}, readsCap), readsHost),
    h('div.section', {}, h('header', {}, jointsCap, jointsHint), contactNote, jointsHost),
    h('div.section', {}, h('div.row', {},
      h('button.tb', { onclick: () => bus.latest && store.set({ q: [...bus.latest.session.home], contact: null, playing: false, mode: 'pose' }) }, 'Home'),
      h('button.tb', { onclick: random }, 'Random pose'))),
  );
  let current: RobotSession | null = null;
  bus.on((s) => {
    if (s.session !== current) {
      current = s.session;
      const motors = s.session.prosthesis;
      rows = motors ? motorRows(s.session, motors, store) : jointRows(s.session, store);
      jointsCap.textContent = motors ? 'Motors' : 'Joints';
      jointsHint.textContent = motors ? 'each moves its linked joints' : 'bar = |τ| / motor limit';
      replace(jointsHost, rows.el);
      effectorSection.style.display = s.session.limbs.length > 1 ? '' : 'none';
      const spec = s.session.spec, bars = spec && isPendulum(spec) ? barsOf(spec) : null;
      energy = bars && energyReadout(bars);
      readsCap.textContent = energy ? 'Energy' : 'Dexterity · focused limb';
      replace(readsHost, (energy ?? reads).el);
      note();
    }
    rows?.update(s);
    (energy ?? reads).update(s);
    if (s.session.limbs.length > 1) effectors.update(s);
  }, 20);
}
