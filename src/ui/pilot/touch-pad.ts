/**
 * Pilot on a touch screen: a stick at the bottom left of the stage drives (up and down) and turns or steers
 * (left and right), with side steps for legs and a run toggle beside it. Shown only for touch, only in Pilot.
 */
import type { Store } from '../../app/state/store';
import type { StudioState } from '../../app/state/types';
import { h, replace } from '../dom/h';

export interface PilotPadView {
  available(): boolean;
  kind(): 'legs' | 'wheels' | 'arm' | null;
  steer(x: number, y: number): void;
  sideStep(v: number): void;
  running: boolean;
  onChange(fn: () => void): void;
}

const touchFirst = () => document.documentElement.classList.contains('mobile') || matchMedia('(pointer: coarse)').matches;

/** Inside this fraction of the stick's travel nothing moves, so a resting thumb doesn't creep. */
const DEAD = 0.12;

export function mountPilotPad(stage: HTMLElement, store: Store<StudioState>, view: PilotPadView): void {
  const knob = h('div.pilot-stick-knob');
  const stick = h('div.pilot-stick', { title: 'Drag to drive and turn' }, knob);
  const side = h('div.pilot-pad-buttons');
  const pad = h('div.pilot-touch', { style: 'display:none' }, stick, side);
  stage.append(pad);

  let finger: number | null = null;
  const move = (e: PointerEvent) => {
    const r = stick.getBoundingClientRect(), R = r.width / 2;
    let [x, y] = [e.clientX - (r.left + R), e.clientY - (r.top + R)];
    const n = Math.hypot(x, y), travel = 0.62 * R;
    if (n > travel) [x, y] = [(x * travel) / n, (y * travel) / n];
    knob.style.transform = `translate(${x}px, ${y}px)`;
    const shape = (v: number) => (Math.abs(v) < DEAD ? 0 : Math.sign(v) * (Math.abs(v) - DEAD) / (1 - DEAD));
    view.steer(shape(x / travel), shape(-y / travel));
  };
  const release = () => {
    finger = null;
    knob.style.transform = '';
    view.steer(0, 0);
  };
  stick.addEventListener('pointerdown', (e) => {
    finger = e.pointerId;
    stick.setPointerCapture(e.pointerId);
    move(e);
  });
  stick.addEventListener('pointermove', (e) => e.pointerId === finger && move(e));
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) stick.addEventListener(ev, release);

  const hold = (label: string, title: string, v: number) => {
    const b = h('button.tb.pilot-pad', { title }, label);
    b.addEventListener('pointerdown', (e) => {
      b.setPointerCapture(e.pointerId);
      view.sideStep(v);
    });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, () => view.sideStep(0));
    return b;
  };
  // Just above the stage's bottom dock, under the left thumb; a short landscape stage keeps it on screen.
  const place = () => {
    const dock = (stage.querySelector('.hud.bottom') ?? document.querySelector('.pilot-bar')?.parentElement) as HTMLElement | null;
    const s = stage.getBoundingClientRect(), d = dock?.getBoundingClientRect();
    const above = d && d.height ? s.bottom - d.top + 12 : 12;
    pad.style.left = '12px';
    pad.style.bottom = `${Math.max(12, Math.min(above, s.height - pad.offsetHeight - 64))}px`;
  };
  const watch = new ResizeObserver(place);
  const render = () => {
    const on = store.state.mode === 'pilot' && view.available() && !!view.kind() && touchFirst();
    pad.style.display = on ? '' : 'none';
    const dock = stage.querySelector('.hud.bottom') ?? document.querySelector('.pilot-bar');
    if (on && dock) {
      watch.observe(dock);
      watch.observe(stage);
      place();
    }
    if (!on) {
      if (finger !== null) release();
      view.sideStep(0);
      return;
    }
    replace(side,
      h('button.tb', { class: view.running ? 'on' : '', title: 'Run: full speed', onclick: () => (view.running = !view.running) }, 'Run'),
      ...(view.kind() === 'legs' ? [hold('◀', 'Side step left', 1), hold('▶', 'Side step right', -1)] : []),
      ...(view.kind() === 'arm' ? [hold('▲', 'Raise the tool', -1), hold('▼', 'Lower the tool', 1)] : []));
  };
  store.on(['mode', 'sessionVersion'], render);
  view.onChange(render);
  addEventListener('resize', render);
  render();
}
