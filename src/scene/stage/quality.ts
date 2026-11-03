/** Quality tiers, stepped down automatically when frames run slow (integrated GPUs). */
export interface Tier {
  name: 'high' | 'medium' | 'low';
  ao: boolean;
  pixelRatio: number;
  shadowSize: number;
}

export const TIERS: Tier[] = [
  { name: 'high', ao: true, pixelRatio: 2, shadowSize: 4096 },
  { name: 'medium', ao: false, pixelRatio: 1.5, shadowSize: 2048 },
  { name: 'low', ao: false, pixelRatio: 1, shadowSize: 1024 },
];

export class QualityGovernor {
  tier = 0;
  private samples: number[] = [];
  private settle = 0;

  constructor(private readonly onChange: (t: Tier) => void) {}

  /** Feed one frame time (ms); after ~2 s of frames slower than 30 fps, drop a tier. */
  frame(ms: number): void {
    // Single long frames are loads and shader compiles, not sustained slowness.
    if (ms > 250 || this.settle-- > 0 || this.tier === TIERS.length - 1) return;
    this.samples.push(ms);
    if (this.samples.length < 120) return;
    const avg = this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
    this.samples = [];
    if (avg > 33) {
      this.tier++;
      this.settle = 60;
      this.onChange(TIERS[this.tier]);
    }
  }
}
