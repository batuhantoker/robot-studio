/** The Live tab: end effectors, focused-limb dexterity, and every joint; rebuilt per robot. */
import type { LiveBus } from '../../app/live/bus';
import type { RobotSession } from '../../app/robots/session';
import type { Store } from '../../app/state/store';
import type { StudioState } from '../../app/state/types';
import { h, replace } from '../dom/h';
import { effectorTable } from './effectors';
import { jointRows } from './joints';
import { readouts } from './readouts';

export function mountLive(el: HTMLElement, store: Store<StudioState>, bus: LiveBus) {
  let rows: ReturnType<typeof jointRows> | null = null;
  const reads = readouts();
  const effectors = effectorTable(store);
  const effectorSection = h('div.section', {}, h('header', {}, h('span.cap', {}, 'End effectors'), h('span.cap.mu', {}, 'click a limb to focus')), effectors.el);
  const jointsHost = h('div');
  const random = () => {
    const s = bus.latest?.session;
    if (s) store.set({ q: s.joints.map((j) => j.limits[0] + Math.random() * (j.limits[1] - j.limits[0])), playing: false, mode: 'pose' });
  };
  el.append(
    effectorSection,
    h('div.section', {}, h('header', {}, h('span.cap', {}, 'Dexterity · focused limb')), reads.el),
    h('div.section', {}, h('header', {}, h('span.cap', {}, 'Joints'), h('span.cap.mu', {}, 'bar = |τ| / motor limit')), jointsHost),
    h('div.section', {}, h('div.row', {},
      h('button.tb', { onclick: () => bus.latest && store.set({ q: [...bus.latest.session.home], playing: false, mode: 'pose' }) }, 'Home'),
      h('button.tb', { onclick: random }, 'Random pose'))),
  );
  let current: RobotSession | null = null;
  bus.on((s) => {
    if (s.session !== current) {
      current = s.session;
      rows = jointRows(s.session, store);
      replace(jointsHost, rows.el);
      effectorSection.style.display = s.session.limbs.length > 1 ? '' : 'none';
    }
    rows?.update(s);
    reads.update(s);
    if (s.session.limbs.length > 1) effectors.update(s);
  }, 20);
}
