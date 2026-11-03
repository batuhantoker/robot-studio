/** Pilot controls: the keys, the camera, and how fast the robot is going. */
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
}

const key = (keys: string, what: string) => h('span.pilot-key', {}, ...keys.split(' ').map((k) => h('kbd', {}, k)), h('span.mu', {}, what));

export function mountPilotBar(el: HTMLElement, store: Store<StudioState>, view: PilotView, bus: LiveBus): void {
  const bar = h('div.toolbar.pilot-bar');
  el.prepend(bar);
  const keys = h('div.row', { style: 'gap:10px' });
  const cams = h('div.seg');
  const readout = h('span.mono', { style: 'font-size:11px;min-width:118px' });
  const note = h('span.mu', { style: 'font-size:11px' });
  bar.append(h('span.cap', {}, 'Pilot'), keys, cams, readout, note);
  const render = () => {
    const s = store.state;
    bar.style.display = s.mode === 'pilot' ? '' : 'none';
    if (s.mode !== 'pilot') return;
    const kind = view.kind();
    if (!view.available() || !kind) {
      replace(keys);
      replace(cams);
      note.textContent = 'Pilot needs a robot with legs or wheels.';
      return;
    }
    replace(keys, key('W S', 'drive'), key('A D', kind === 'wheels' ? 'steer' : 'turn'), kind === 'legs' ? key('Q E', 'side step') : null, key('⇧', 'faster'), key('C', 'camera'));
    replace(cams, ...(['chase', 'pov'] as const).map((c) => h('button.tb', {
      class: view.camera === c ? 'on' : '',
      onclick: () => view.camera !== c && view.toggleCamera(),
    }, c === 'chase' ? 'Follow' : 'Look out')));
    note.textContent = view.camera === 'pov' ? 'Drag, or click to take the mouse, to turn and look · Esc frees it' : 'Drag to look around';
  };
  const tick = () => {
    if (store.state.mode !== 'pilot') return;
    const deg = ((((view.pose.yaw * 180) / Math.PI) % 360) + 360) % 360;
    readout.textContent = `${view.speed().toFixed(2)} m/s · ${deg.toFixed(0).padStart(3, ' ')}°`;
  };
  store.on(['mode', 'sessionVersion'], render);
  view.onChange(render);
  bus.on(tick, 12);
  render();
}
