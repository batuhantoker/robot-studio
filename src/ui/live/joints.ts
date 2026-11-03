/** Sliders for every robot joint, grouped by limb (shared trunk joints first), with static load. */
import type { Snapshot } from '../../app/live/bus';
import type { RobotSession } from '../../app/robots/session';
import type { Store } from '../../app/state/store';
import type { StudioState } from '../../app/state/types';
import { atLimit } from '../../core/chain/limbs/limits';
import { sharedJoints } from '../../core/chain/limbs/types';
import { dofScale, dofUnit, num } from '../dom/format';
import { h } from '../dom/h';

function groups(s: RobotSession): { title: string; limb: number; joints: number[] }[] {
  const shared = sharedJoints(s.limbs);
  const placed = new Set<number>(shared);
  const out = shared.size ? [{ title: 'Shared', limb: -1, joints: [...shared].sort((a, b) => a - b) }] : [];
  s.limbs.forEach((l, i) => {
    const own = l.index.filter((j) => !placed.has(j) && placed.add(j));
    if (own.length) out.push({ title: s.limbs.length > 1 ? l.name : '', limb: i, joints: own });
  });
  return out;
}

export function jointRows(session: RobotSession, store: Store<StudioState>) {
  const rows: { k: number; el: HTMLElement; slider: HTMLInputElement; val: HTMLElement; torque: HTMLElement; bar: HTMLElement; scale: number; unit: string }[] = [];
  const build = (k: number) => {
    const j = session.joints[k];
    const slider = h('input', { type: 'range', min: String(j.limits[0]), max: String(j.limits[1]), step: String((j.limits[1] - j.limits[0]) / 1000) });
    slider.addEventListener('input', () => {
      const q = [...store.state.q];
      q[k] = Number(slider.value);
      store.set({ q, mode: store.state.mode === 'workspace' ? 'workspace' : 'pose', playing: false });
    });
    const scale = dofScale(j.type), unit = dofUnit(j.type);
    const range = j.continuous ? 'continuous' : `${num(j.limits[0] * scale, 0)}${unit} … ${num(j.limits[1] * scale, 0)}${unit}`;
    const el = h('div.joint', {});
    const row = { k, el, slider, val: h('span.val'), torque: h('span.mu.mono', { style: 'font-size:10.5px' }), bar: h('div.bar', { title: '|τ| / motor limit' }, h('i')), scale, unit };
    rows.push(row);
    el.append(h('span.name', {}, j.name, ' ', row.torque), row.val, slider, h('span.range.mono', {}, range), row.bar);
    return el;
  };
  const el = h('div', {}, ...groups(session).map((g) => h('details.limb-group', { open: true, dataset: { limb: String(g.limb) } },
    g.title ? h('summary.cap', { onclick: () => g.limb >= 0 && store.set({ focus: g.limb }) }, `${g.title} · ${g.joints.length}`) : null,
    ...g.joints.map(build))));
  return {
    el,
    update(s: Snapshot) {
      const limited = atLimit(session.joints, s.q);
      for (const r of rows) {
        r.el.classList.toggle('at-limit', limited[r.k]);
        const q = s.q[r.k];
        if (document.activeElement !== r.slider) r.slider.value = String(q);
        r.val.textContent = `${num(q * r.scale, 1)} ${r.unit}`;
        const tau = s.sim?.applied[r.k] ?? s.bias[r.k];
        const limit = session.torqueLimits[r.k];
        r.torque.textContent = `τ ${num(tau, 2)}${limit ? ` / ${num(limit, 1)}` : ''} ${session.joints[r.k].type === 'slide' ? 'N' : 'N·m'}`;
        const u = limit ? Math.min(Math.abs(tau) / limit, 1) : 0;
        r.bar.classList.toggle('hot', u > 0.8);
        (r.bar.firstChild as HTMLElement).style.cssText = `left:0;width:${u * 100}%`;
      }
      for (const g of el.querySelectorAll<HTMLElement>('.limb-group')) g.classList.toggle('focus', Number(g.dataset.limb) === s.focus);
    },
  };
}
