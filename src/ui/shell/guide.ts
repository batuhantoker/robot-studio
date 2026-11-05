/**
 * The walkthrough: one feature at a time, spotlit on the real screen with a line of text. Steps switch
 * modes and open menus to show them, and everything is put back at the end. Starts from `?`, never by itself.
 */
import type { Store } from '../../app/state/store';
import type { Mode, StudioState } from '../../app/state/types';
import { h } from '../dom/h';
import { isMobile } from './mobile/media';

interface Step {
  /** Selectors, first visible wins; `phone` replaces it on phones. */
  target: string;
  phone?: string;
  title: string;
  text: string;
  mode?: Mode;
  /** Clicked on entering the step (a chip to play, a button whose menu to show), unless already open. */
  click?: string;
}

const STEPS: Step[] = [
  { target: '.robot-title', title: 'Your robot', text: 'Click its name to browse 163 robots: arms, humanoids, legged, CAD.' },
  { target: '.modes', phone: '.mode-button', title: 'Modes', text: 'Eight ways to use the robot. Each mode changes the stage and the bar under it.' },
  { target: '.dock-stack > *', mode: 'motion', click: '.motion-bar .seg .tb:not(.on)', title: 'The mode’s bar', text: 'Controls for the current mode live under the robot. Here: demo motions.' },
  { target: '.dock-stack > *', mode: 'trajectory', title: 'Trajectory', text: 'Add stops, drag them in the view, scrub the path, then render a video.' },
  { target: '.stage-tools .stage-robots', title: 'On stage', text: 'Put up to four robots on one stage and move them around.' },
  { target: '.view-panel', click: '.stage-tools .stage-view', title: 'View', text: 'Looks, glass and section cutaways, explode, overlays. Isolate a part to see what it’s made of.' },
  { target: '.stage-tools > .stage-settings:not(.view-panel):not(.scene-panel)', click: '.stage-tools > .stage-gear:not(.stage-robots):not(.stage-view)', title: 'Surroundings', text: 'Backdrop, floor and a setting: desk, lab, work cell… with loose parts to pick up.' },
  { target: '.side.left:not(.closed) nav.tabs, .side.left .rail', phone: '.dock button[data-tab="robots"], .dock button[data-tab="build"]', title: 'Robots and Build', text: 'Browse the library, or build your own arm joint by joint.' },
  { target: '.side.right:not(.closed) nav.tabs, .side.right .rail', phone: '.dock', title: 'Live, Math, Analysis', text: 'Live numbers, the math behind them, and the current mode’s charts.' },
  { target: '.graphs-chip', title: 'Graphs', text: 'How joints, torque and the tool change over time, in every mode. Hover to read any moment.' },
  { target: '.top-right .help', title: 'That’s it', text: 'Replay this any time with ?. Shortcuts: / search, [ ] panels, G graphs.' },
];

const SEEN = 'robot-studio.walkthrough.v1';
const PAD = 6;

const visible = (el: Element) => {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
};

/** All visible matches of the first selector in the list that has any; their union is spotlit. */
function find(selectors: string): Element[] {
  for (const sel of selectors.split(',').map((s) => s.trim())) {
    const all = [...document.querySelectorAll(sel)].filter(visible);
    if (all.length) return all;
  }
  return [];
}

function union(els: Element[]): DOMRect {
  const rs = els.map((e) => e.getBoundingClientRect());
  const left = Math.min(...rs.map((r) => r.left)), top = Math.min(...rs.map((r) => r.top));
  return new DOMRect(left, top, Math.max(...rs.map((r) => r.right)) - left, Math.max(...rs.map((r) => r.bottom)) - top);
}

/** Other code's menus close on Escape; untrusted, so the walkthrough's own handler ignores it. */
const closeMenus = () => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

export interface Guide {
  open(): void;
  close(): void;
  toggle(): void;
}

/** `hint` (the ? button) pulses until the walkthrough has been opened once. */
export function mountGuide(store: Store<StudioState>, hint: () => HTMLElement | null = () => null): Guide {
  const spot = h('div.coach-spot');
  const count = h('span.coach-count');
  const title = h('b');
  const text = h('p');
  const back = h('button.tb.ghost', { onclick: () => go(at - 1) }, 'Back');
  const next = h('button.tb.primary', { onclick: () => go(at + 1) });
  const card = h('div.coach-card', { role: 'dialog', 'aria-live': 'polite' },
    h('div.coach-head', {}, title, count), text,
    h('div.coach-foot', {}, h('button.coach-skip', { onclick: () => close() }, 'Skip'), h('div.row', {}, back, next)));
  // Swallows presses so the stage and other menus' outside-click handlers don't react underneath.
  const el = h('div.coach', { hidden: true, onpointerdown: (e: Event) => e.stopPropagation() }, spot, card);
  document.body.append(el);

  let at = -1;
  let raf = 0;
  let saved: Pick<StudioState, 'mode' | 'playing' | 'motion'> | null = null;

  const targetsOf = (step: Step) => find(isMobile() && step.phone ? step.phone : step.target);
  const place = () => {
    const step = STEPS[at];
    const targets = step ? targetsOf(step) : [];
    if (!targets.length) return;
    const r = union(targets);
    Object.assign(spot.style, { left: `${r.left - PAD}px`, top: `${r.top - PAD}px`, width: `${r.width + 2 * PAD}px`, height: `${r.height + 2 * PAD}px` });
    const cw = card.offsetWidth, ch = card.offsetHeight, m = 12;
    const below = r.bottom + PAD + m, above = r.top - PAD - m - ch;
    let left = Math.min(Math.max(m, r.left + r.width / 2 - cw / 2), innerWidth - cw - m);
    let top = below + ch < innerHeight - m ? below : above > m ? above : NaN;
    // Too tall to go above or below it: beside the target, on its roomier side.
    if (Number.isNaN(top)) {
      left = r.left > innerWidth - r.right ? Math.max(m, r.left - PAD - m - cw) : Math.min(r.right + PAD + m, innerWidth - cw - m);
      top = Math.min(Math.max(m, r.top), innerHeight - ch - m);
    }
    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
  };
  const loop = () => {
    place();
    raf = requestAnimationFrame(loop);
  };

  const go = (i: number, dir = i >= at ? 1 : -1): void => {
    if (i >= STEPS.length) return close();
    if (i < 0) return;
    closeMenus();
    const step = STEPS[i];
    if (step.mode && store.state.mode !== step.mode) store.set({ mode: step.mode, playing: step.mode === 'trajectory' || step.mode === 'motion' });
    if (step.click) {
      const b = document.querySelector<HTMLElement>(step.click);
      if (b && b.getAttribute('aria-expanded') !== 'true') b.click();
    }
    // A feature this robot or screen doesn't have is passed over.
    if (!targetsOf(step).length) return go(i + dir, dir);
    at = i;
    count.textContent = `${i + 1} / ${STEPS.length}`;
    title.textContent = step.title;
    text.textContent = step.text;
    back.disabled = i === 0;
    next.textContent = i === STEPS.length - 1 ? 'Done' : 'Next';
    place();
  };

  const open = () => {
    if (!el.hidden) return;
    if (store.state.touring) store.set({ touring: false });
    saved = { mode: store.state.mode, playing: store.state.playing, motion: store.state.motion };
    el.hidden = false;
    document.documentElement.classList.add('modal-open');
    hint()?.classList.remove('new');
    try {
      localStorage.setItem(SEEN, '1');
    } catch {
      // The hint just pulses again next visit.
    }
    at = -1;
    go(0);
    raf = requestAnimationFrame(loop);
  };
  const close = () => {
    if (el.hidden) return;
    el.hidden = true;
    cancelAnimationFrame(raf);
    document.documentElement.classList.remove('modal-open');
    closeMenus();
    if (saved) store.set(saved);
    saved = null;
  };
  const toggle = () => (el.hidden ? open() : close());

  // Capture: while it runs, arrows and Escape belong to the walkthrough, not the trajectory editor underneath.
  addEventListener('keydown', (e) => {
    if (!e.isTrusted) return;
    if (el.hidden) {
      if (e.key === '?' && !(e.target as HTMLElement).closest?.('input, select, textarea') && !e.metaKey && !e.ctrlKey && !e.altKey) open();
      return;
    }
    const keys: Record<string, () => void> = { Escape: close, ArrowRight: () => go(at + 1), Enter: () => go(at + 1), ArrowLeft: () => go(at - 1), '?': close };
    const fn = keys[e.key];
    if (!fn) return;
    e.preventDefault();
    e.stopPropagation();
    fn();
  }, { capture: true });

  requestAnimationFrame(() => {
    try {
      if (localStorage.getItem(SEEN) !== '1') hint()?.classList.add('new');
    } catch {
      // No storage: no hint.
    }
  });
  return { open, close, toggle };
}
