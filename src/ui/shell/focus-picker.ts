/** For robots with several limbs: which one the math panel explains (all limbs stay live). */
import type { LiveBus } from '../../app/live/bus';
import { limbLabel } from '../../app/robots/body';
import type { RobotSession } from '../../app/robots/session';
import type { Store } from '../../app/state/store';
import type { StudioState } from '../../app/state/types';
import { h, replace } from '../dom/h';
import { select } from '../widgets/fields';

export function focusPicker(store: Store<StudioState>, bus: LiveBus): HTMLElement {
  const el = h('div.row');
  let session: RobotSession | null = null;
  const render = () => {
    if (!session || session.limbs.length < 2) {
      replace(el);
      return;
    }
    const s = session;
    const options = s.limbs.map((l, i) => [String(i), `${limbLabel(s, i)} · ${l.chain.joints.length} DOF`] as [string, string]);
    replace(el, h('span.cap.mu', {}, `${session.limbs.length} limbs · focus`), h('div', { style: 'width:190px' },
      select(options, String(store.state.focus), (v) => store.set({ focus: Number(v) }))));
  };
  bus.on((s) => {
    if (s.session !== session) {
      session = s.session;
      render();
    }
  }, 4);
  store.on(['focus'], render);
  return el;
}
