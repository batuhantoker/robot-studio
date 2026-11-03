/** Runs the tour when idle; any input hands control back, 25 s of quiet restarts it. */
import type { Store } from '../../state/store';
import type { StudioState } from '../../state/types';
import { BEATS } from './script';

const IDLE_SECONDS = 25;

export class TourDirector {
  private beat = -1;
  private beatStart = 0;
  private idle = 0;
  private explodeFrom = 0;

  constructor(
    private readonly store: Store<StudioState>,
    private readonly modules: () => string[],
    private readonly runWorkspace: () => void,
    private readonly caption: (text: string | null) => void,
    private readonly orbit: (radians: number) => void,
  ) {
    const stop = () => {
      this.idle = 0;
      if (store.state.touring) store.set({ touring: false });
    };
    for (const type of ['pointerdown', 'wheel', 'keydown']) addEventListener(type, stop, { capture: true });
    store.on(['touring'], (s) => (s.touring ? this.start() : this.end()));
  }

  tick(dt: number): void {
    const s = this.store.state;
    if (!s.touring) {
      this.idle = s.rendering || s.selectedStop !== null ? 0 : this.idle + dt;
      if (this.idle > IDLE_SECONDS) this.store.set({ touring: true });
      return;
    }
    this.orbit(dt * 0.12);
    const beat = BEATS[this.beat];
    const t = (performance.now() - this.beatStart) / 1000;
    if (beat.explodeTo !== undefined) {
      const u = Math.min(t / 1.6, 1);
      const eased = 1 - (1 - u) ** 3;
      this.store.set({ explode: this.explodeFrom + (beat.explodeTo - this.explodeFrom) * eased });
    }
    if (t >= beat.seconds) this.go((this.beat + 1) % BEATS.length);
  }

  private start(): void {
    this.go(0);
  }

  private end(): void {
    this.beat = -1;
    this.caption(null);
  }

  private go(index: number): void {
    this.beat = index;
    this.beatStart = performance.now();
    this.explodeFrom = this.store.state.explode;
    const beat = BEATS[index];
    this.store.set({ ...beat.patch(this.store.state, this.modules().filter((m) => m.startsWith('joint:') || m.startsWith('body:'))), touring: true });
    if (beat.enter === 'workspace') this.runWorkspace();
    this.caption(beat.caption);
  }
}
