/** The Math tab: an accordion of live derivations; only open sections re-render. */
import type { LiveBus, Snapshot } from '../../app/live/bus';
import type { Store } from '../../app/state/store';
import type { StudioState } from '../../app/state/types';
import type { IkResult } from '../../core/solvers/ik/types';
import { limbQ } from '../../core/chain/limbs/types';
import { focusLimb } from '../../app/robots/focus';
import { h, replace } from '../dom/h';
import { dhSection } from './sections/dh';
import { dynamicsSection } from './sections/dynamics';
import { forwardSection } from './sections/forward';
import { framesSection } from './sections/frames';
import { ikSection } from './sections/ik';
import { jacobianSection } from './sections/jacobian';
import { kaneSection } from './sections/kane';
import { staticsSection } from './sections/statics';
import { trajectorySection } from './sections/trajectory';
import type { MathContext, MathSection } from './sections/types';

const SECTIONS: MathSection[] = [
  framesSection, forwardSection, dhSection, jacobianSection, ikSection, staticsSection, trajectorySection, kaneSection, dynamicsSection,
];

function focusJoint(snap: Snapshot, state: StudioState): number {
  const id = state.isolate;
  const names = focusLimb(snap.session, snap.focus).chain.joints.map((j) => j.name);
  if (id?.startsWith('joint:')) {
    const link = id.slice(6);
    const k = names.findIndex((n) => n === link || n.startsWith(`${link}_`));
    if (k >= 0) return k;
  }
  if (id?.startsWith('body:')) {
    const mod = snap.session.assembly.modules.find((m) => m.id === id);
    if (mod && (mod.limb ?? 0) === snap.focus && mod.joints[0] !== undefined) return mod.joints[0];
  }
  return 0;
}

export function mountMath(el: HTMLElement, store: Store<StudioState>, bus: LiveBus, ik: () => IkResult | null): void {
  const open = new Set(['frames', 'dh', 'jacobian']);
  const host = h('div');
  el.append(host);
  const bodies = new Map<string, HTMLElement>();
  const build = () => {
    replace(host, ...SECTIONS.map((s) => {
      const body = h('div', { style: open.has(s.id) ? '' : 'display:none' });
      bodies.set(s.id, body);
      const header = h('header', { style: 'cursor:pointer', onclick: () => {
        open.has(s.id) ? open.delete(s.id) : open.add(s.id);
        body.style.display = open.has(s.id) ? '' : 'none';
        draw(true);
      } }, h('span.cap', {}, s.title), h('span.cap.mu', {}, open.has(s.id) ? '−' : '+'));
      return h('div.section', { dataset: { section: s.id } }, header, body);
    }));
  };
  let last = 0;
  const draw = (force = false) => {
    const snap = bus.latest;
    if (!snap || el.offsetParent === null) return;
    if (!force && performance.now() - last < 220) return;
    last = performance.now();
    const limb = focusLimb(snap.session, snap.focus);
    const ctx: MathContext = { snap, state: store.state, limb, lq: limbQ(limb, snap.q), joint: focusJoint(snap, store.state), ik: ik() };
    for (const s of SECTIONS) {
      const wrap = host.querySelector<HTMLElement>(`[data-section="${s.id}"]`);
      const applies = s.applies?.(ctx) ?? true;
      if (wrap) wrap.style.display = applies ? '' : 'none';
      if (applies && open.has(s.id)) replace(bodies.get(s.id)!, ...s.render(ctx));
    }
  };
  build();
  bus.on(() => draw(), 5);
  store.on(['isolate', 'tab', 'focus'], () => draw(true));
}
