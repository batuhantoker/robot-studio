/** Runs the tour the Auto tour chip starts; any input ends it and puts the view back as it was. */
import type { Store } from '../../state/store';
import type { SectionAxis } from '../../../scene/teardown/section';
import type { StudioState } from '../../state/types';
import { BEATS } from './script';

type Saved = Pick<StudioState, 'mode' | 'playing' | 'time' | 'cut' | 'explode' | 'isolate' | 'section' | 'overlays'>;

export class TourDirector {
  private beat = -1;
  private beatStart = 0;
  private explodeFrom = 0;
  private sweepFrom = 0;
  private saved: Saved | null = null;
  private putCameraBack: (() => void) | null = null;

  constructor(
    private readonly store: Store<StudioState>,
    private readonly modules: () => string[],
    private readonly runWorkspace: () => void,
    private readonly caption: (text: string | null) => void,
    private readonly orbit: (radians: number) => void,
    /** +1 when the camera is on the axis's positive side. */
    private readonly side: (axis: SectionAxis) => number,
    /** Remembers the camera; the returned function puts it back. */
    private readonly keepCamera: () => () => void,
  ) {
    const stop = () => store.state.touring && store.set({ touring: false });
    for (const type of ['pointerdown', 'wheel', 'keydown']) addEventListener(type, stop, { capture: true });
    store.on(['touring'], (s) => (s.touring ? this.start() : this.end()));
  }

  tick(dt: number): void {
    if (!this.store.state.touring) return;
    this.orbit(dt * 0.12);
    const beat = BEATS[this.beat];
    const t = (performance.now() - this.beatStart) / 1000;
    if (beat.explodeTo !== undefined) {
      const u = Math.min(t / 1.6, 1);
      const eased = 1 - (1 - u) ** 3;
      this.store.set({ explode: this.explodeFrom + (beat.explodeTo - this.explodeFrom) * eased });
    }
    if (beat.sweep !== undefined) {
      const u = Math.min(t / beat.seconds, 1);
      this.store.set({ section: { ...this.store.state.section, offset: this.sweepFrom * (1 - u * u * (3 - 2 * u)) } });
    }
    if (t >= beat.seconds) this.go((this.beat + 1) % BEATS.length);
  }

  private start(): void {
    const { mode, playing, time, cut, explode, isolate, section, overlays } = this.store.state;
    this.saved = { mode, playing, time, cut, explode, isolate, section, overlays };
    this.putCameraBack = this.keepCamera();
    this.go(0);
  }

  private end(): void {
    this.beat = -1;
    this.caption(null);
    // Camera first: restoring the mode may reframe, and should do so from the user's own view.
    this.putCameraBack?.();
    this.putCameraBack = null;
    if (this.saved) this.store.set(this.saved);
    this.saved = null;
  }

  private go(index: number): void {
    this.beat = index;
    this.beatStart = performance.now();
    this.explodeFrom = this.store.state.explode;
    const beat = BEATS[index];
    if (beat.sweep !== undefined) this.sweepFrom = beat.sweep * this.side(this.store.state.section.axis);
    this.store.set({ ...beat.patch(this.store.state, this.modules().filter((m) => m.startsWith('joint:') || m.startsWith('body:'))), touring: true });
    if (beat.enter === 'workspace') this.runWorkspace();
    this.caption(beat.caption);
  }
}
