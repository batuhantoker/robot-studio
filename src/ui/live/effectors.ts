/** Every end effector at once: tool position and conditioning per limb; click to focus a limb. */
import type { Snapshot } from '../../app/live/bus';
import type { Store } from '../../app/state/store';
import type { StudioState } from '../../app/state/types';
import { mm, num } from '../dom/format';
import { h, replace } from '../dom/h';

export function effectorTable(store: Store<StudioState>) {
  const body = h('tbody');
  const el = h('table.grid.effectors', {},
    h('thead', {}, h('tr', {}, ...['limb', 'x y z mm', 'w ×10⁻³', 'κ'].map((t) => h('th', {}, t)))), body);
  return {
    el,
    update(s: Snapshot) {
      replace(body, ...s.session.limbs.map((limb, i) => {
        const tip = s.posed.limbs[i].tip.p;
        const d = s.limbs[i];
        return h('tr', {
          class: `${i === s.focus ? 'on' : ''} ${d.nearSingular ? 'warn' : ''}`,
          onclick: () => store.set({ focus: i }),
          title: d.nearSingular ? 'Near a singularity' : `${limb.chain.joints.length} DOF`,
        }, h('td', {}, limb.name), h('td', {}, tip.map((v) => mm(v, 0)).join(' ')),
        h('td', {}, num(d.svd.manipulability * 1e3, 1)), h('td', {}, num(d.svd.condition, 1)));
      }));
    },
  };
}
