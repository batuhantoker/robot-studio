/** Pilot controls: the keys, the camera, how fast the robot is going, and (humanoids) the hands. */
import type { LiveBus } from '../../app/live/bus';
import type { Store } from '../../app/state/store';
import type { StudioState } from '../../app/state/types';
import { h, replace } from '../dom/h';

export interface PilotView {
  available(): boolean;
  kind(): 'legs' | 'wheels' | null;
  camera: 'chase' | 'pov';
  toggleCamera(): void;
  speed(): number;
  pose: { yaw: number };
  onChange(fn: () => void): void;
  /** Hand moves (humanoids), the one playing, and whether scenery stands in the way. */
  actions?(): { id: string; label: string }[];
  play?(id: string): void;
  playing?(): string | null;
  blocked?: boolean;
  /** Direct hand control (humanoids): which hand, its grip, and what it holds. */
  handState?(): { side: 0 | 1; closed: boolean; fingers: boolean; holding: string | null; moved: boolean } | null;
  setHand?(side: 0 | 1): void;
  toggleGrip?(): void;
  restHands?(): void;
  nudge?(dir: [number, number, number] | null): void;
}

/** A button that nudges the hand while held down (mouse or touch). */
function holdButton(label: string, title: string, dir: [number, number, number], view: PilotView): HTMLElement {
  const b = h('button.tb.pilot-pad', { title }, label);
  const stop = () => view.nudge?.(null);
  b.addEventListener('pointerdown', (e) => {
    b.setPointerCapture(e.pointerId);
    view.nudge?.(dir);
  });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, stop);
  return b;
}

const key = (keys: string, what: string) => h('span.pilot-key', {}, ...keys.split(' ').map((k) => h('kbd', {}, k)), h('span.mu', {}, what));

export function mountPilotBar(el: HTMLElement, store: Store<StudioState>, view: PilotView, bus: LiveBus): void {
  const bar = h('div.toolbar.pilot-bar');
  el.prepend(bar);
  const keys = h('div.row', { style: 'gap:10px' });
  const cams = h('div.seg');
  const moves = h('div.seg.pilot-moves');
  // Its own card in the dock: inside the bar it would trail off the end of a phone's sideways scroll.
  const handsRow = h('div.toolbar.pilot-hands', { style: 'display:none' });
  let handsOpen = false;
  const readout = h('span.mono', { style: 'font-size:11px;min-width:118px' });
  const note = h('span.mu.pilot-note', { style: 'font-size:11px' });
  // On phones the bar wraps here: moves on the first line, camera and readout on the second.
  bar.append(h('span.cap', {}, 'Pilot'), keys, moves, h('span.pilot-break'), cams, readout, note);
  bar.before(handsRow);
  let hint = '';
  const render = () => {
    const s = store.state;
    bar.style.display = s.mode === 'pilot' ? '' : 'none';
    if (s.mode !== 'pilot') {
      handsRow.style.display = 'none';
      return;
    }
    const kind = view.kind();
    if (!view.available() || !kind) {
      replace(keys);
      replace(cams);
      replace(moves);
      replace(handsRow);
      note.textContent = 'Pilot needs a robot with legs or wheels.';
      return;
    }
    replace(keys, key('W S', 'drive'), key('A D', kind === 'wheels' ? 'steer' : 'turn'), kind === 'legs' ? key('Q E', 'side step') : null, key('⇧', 'faster'), key('C', 'camera'));
    replace(cams, ...(['chase', 'pov'] as const).map((c) => h('button.tb', {
      class: view.camera === c ? 'on' : '',
      onclick: () => view.camera !== c && view.toggleCamera(),
    }, c === 'chase' ? 'Follow' : 'Look out')));
    const hs = view.handState?.() ?? null;
    replace(moves, ...(view.actions?.() ?? []).map((a, i) => h('button.tb', {
      class: view.playing?.() === a.id ? 'on' : '',
      title: `${a.label} (key ${i + 1})`,
      onclick: () => view.play?.(a.id),
    }, h('kbd', {}, String(i + 1)), ' ', a.label)), ...(hs ? [h('button.tb', {
      class: handsOpen ? 'on' : '',
      title: 'Move a hand yourself and grip with it',
      onclick: () => ((handsOpen = !handsOpen), render()),
    }, 'Hands')] : []));
    handsRow.style.display = hs && handsOpen ? '' : 'none';
    if (hs) {
      replace(handsRow,
        h('div.seg', {}, ...(['Left', 'Right'] as const).map((label, i) => h('button.tb', {
          class: hs.side === i ? 'on' : '', title: 'Which hand the pad moves (Tab)', onclick: () => view.setHand?.(i as 0 | 1),
        }, label))),
        h('div.seg', {},
          holdButton('↑', 'Reach forward (I)', [1, 0, 0], view), holdButton('↓', 'Draw back (K)', [-1, 0, 0], view),
          holdButton('←', 'Move left (J)', [0, 1, 0], view), holdButton('→', 'Move right (L)', [0, -1, 0], view),
          holdButton('⤒', 'Raise (U)', [0, 0, 1], view), holdButton('⤓', 'Lower (O)', [0, 0, -1], view)),
        h('button.tb', { class: hs.closed ? 'on' : '', title: 'Close the hand on what it touches, or let go (Space)', onclick: () => view.toggleGrip?.() },
          hs.closed ? 'Release' : 'Grip'),
        h('button.tb', { title: 'Hands back to walking (R)', onclick: () => view.restHands?.() }, 'Rest'),
        h('span.mu', { style: 'font-size:11px' }, hs.holding ? `Holding the ${hs.holding.toLowerCase()}` : hs.closed ? 'Closed on nothing: move it onto a part' : 'Bring the hand to a part and grip'),
        key('I J K L U O', 'hand'), key('Tab', 'other hand'), key('Space', 'grip'));
    }
    hint = view.camera === 'pov' ? 'Drag, or click to take the mouse, to turn and look · Esc frees it' : 'Drag to look around';
    tick();
  };
  const tick = () => {
    if (store.state.mode !== 'pilot') return;
    const deg = ((((view.pose.yaw * 180) / Math.PI) % 360) + 360) % 360;
    readout.textContent = `${view.speed().toFixed(2)} m/s · ${deg.toFixed(0).padStart(3, ' ')}°`;
    note.textContent = view.blocked ? 'Something is in the way · back off or turn' : hint;
    note.classList.toggle('accent', !!view.blocked);
  };
  store.on(['mode', 'sessionVersion'], render);
  view.onChange(render);
  bus.on(tick, 12);
  render();
}
