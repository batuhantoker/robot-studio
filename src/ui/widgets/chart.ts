/** A multi-series line chart on canvas: axes, a legend that hides series, and a crosshair reading every series. */
import { h, replace } from '../dom/h';

export interface Series {
  label: string;
  color: string;
  /** NaN breaks the line. */
  values: number[];
  dashed?: boolean;
  /** Full name and unit for the readout; the legend keeps to `label`. */
  name?: string;
  unit?: string;
}

export interface ChartOptions {
  /** The y axis never spans less, so a resting signal reads flat instead of magnifying noise. */
  minSpan?: number;
  /** The signal can't go below this (a speed), so the axis doesn't either. */
  floor?: number;
  digits?: number;
  /** Time counts back from the newest sample at the right edge. */
  rolling?: boolean;
}

// Checked for colour-blind separation and contrast against --paper in this order.
const COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
export const seriesColor = (i: number) => COLORS[i % COLORS.length];

/** Past the palette the hues repeat dashed, so no two joints share a line style. */
export const jointSeries = (k: number, label: string, values: number[], extra: Partial<Series> = {}): Series =>
  ({ label, values, color: seriesColor(k), dashed: k >= COLORS.length, ...extra });

/** Round axis ticks covering [lo, hi]; the range snaps to them, so the scale holds still while data moves inside it. */
export function niceTicks(lo: number, hi: number, count = 4): number[] {
  const raw = (hi - lo) / Math.max(count - 1, 1) || 1;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].find((m) => m * mag >= raw * (1 - 1e-9))! * mag;
  const first = Math.floor(lo / step + 1e-9), last = Math.ceil(hi / step - 1e-9);
  return Array.from({ length: last - first + 1 }, (_, i) => Number(((first + i) * step).toPrecision(10)));
}

const tick = (v: number) => (Math.abs(v) >= 1e4 ? v.toExponential(0) : String(Number(v.toPrecision(4))));
const PAD = { left: 38, right: 8, top: 7, bottom: 17 };

export class LineChart {
  readonly el: HTMLElement;
  hovering = false;
  /** Tells other charts on the same time axis where the crosshair is. */
  onHover: ((t: number | null) => void) | null = null;
  private readonly canvas = h('canvas');
  private readonly legend = h('div.chart-legend');
  private readonly tip = h('div.chart-tip', { hidden: true });
  private readonly off = new Set<string>();
  private series: Series[] = [];
  private t: number[] = [];
  private span: [number, number] | null = null;
  private legendKey = '';
  private playhead: number | null = null;
  private band: [number, number] | undefined;
  private cross: number | null = null;
  private toTime = (_x: number) => 0;

  constructor(private readonly opts: ChartOptions = {}) {
    this.el = h('div.chart', {}, this.canvas, this.legend, this.tip);
    this.canvas.addEventListener('pointermove', (e) => this.point(e));
    this.canvas.addEventListener('pointerleave', () => this.leave());
  }

  /** `span` fixes the time axis; by default it runs from the first sample to the last. */
  setData(t: number[], series: Series[], span: [number, number] | null = null): void {
    this.t = t;
    this.series = series;
    this.span = span;
    const key = series.map((s) => s.label).join('|');
    if (key !== this.legendKey) this.buildLegend(key);
    this.draw(null);
  }

  /** Show a crosshair driven by another chart. */
  mark(t: number | null): void {
    this.cross = t;
    this.draw(this.playhead);
  }

  draw(playhead: number | null, band: [number, number] | undefined = this.band): void {
    this.playhead = playhead;
    this.band = band;
    const c = this.canvas;
    const dpr = devicePixelRatio || 1;
    const [w, hgt] = [c.clientWidth || 360, c.clientHeight || 120];
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(hgt * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(hgt * dpr);
    }
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, hgt);
    if (!this.t.length) return;
    const shown = this.series.filter((s) => !this.off.has(s.label));
    const [x0, x1] = [PAD.left, w - PAD.right];
    const [top, bottom] = [PAD.top, hgt - PAD.bottom];
    const [t0, t1] = this.span ?? [this.t[0], this.t.at(-1)!];
    const x = (t: number) => x0 + ((t - t0) / (t1 - t0 || 1)) * (x1 - x0);
    this.toTime = (px) => t0 + ((px - x0) / (x1 - x0 || 1)) * (t1 - t0);

    const ticks = this.yTicks(shown, band);
    const [lo, hi] = [ticks[0], ticks.at(-1)!];
    const y = (v: number) => bottom - ((v - lo) / (hi - lo || 1)) * (bottom - top);

    g.font = '9.5px JetBrains Mono, monospace';
    g.textBaseline = 'middle';
    g.textAlign = 'right';
    g.lineWidth = 1;
    for (const v of ticks) {
      g.strokeStyle = v === 0 ? '#c3c7cd' : '#eef0f2';
      g.beginPath();
      g.moveTo(x0, Math.round(y(v)) + 0.5);
      g.lineTo(x1, Math.round(y(v)) + 0.5);
      g.stroke();
      g.fillStyle = '#7b8189';
      g.fillText(tick(v), x0 - 5, y(v));
    }
    this.timeAxis(g, x, t0, t1, bottom);
    if (band) {
      g.fillStyle = 'rgba(214,24,43,0.06)';
      g.fillRect(x0, top, x1 - x0, Math.max(y(band[1]) - top, 0));
      g.fillRect(x0, y(band[0]), x1 - x0, Math.max(bottom - y(band[0]), 0));
    }

    g.save();
    g.beginPath();
    g.rect(x0, top - 1, x1 - x0, bottom - top + 2);
    g.clip();
    g.lineWidth = 1.6;
    g.lineJoin = 'round';
    const n = this.t.length;
    // More points than pixels only costs time.
    const stride = Math.max(1, Math.floor(n / ((x1 - x0) * 1.5)));
    for (const s of shown) {
      g.strokeStyle = s.color;
      g.setLineDash(s.dashed ? [4, 3] : []);
      g.beginPath();
      let pen = false;
      for (let i = 0; i < n; i += i + stride >= n && i !== n - 1 ? n - 1 - i : stride) {
        const v = s.values[i];
        if (!Number.isFinite(v)) { pen = false; continue; }
        if (pen) g.lineTo(x(this.t[i]), y(v));
        else g.moveTo(x(this.t[i]), y(v));
        pen = true;
      }
      g.stroke();
    }
    g.restore();
    g.setLineDash([]);
    g.lineWidth = 1;
    if (playhead !== null) this.rule(g, x(playhead), '#d6182b', top, bottom);
    if (this.cross !== null) this.rule(g, x(this.cross), '#3a3e45', top, bottom);
  }

  private rule(g: CanvasRenderingContext2D, px: number, color: string, top: number, bottom: number): void {
    g.strokeStyle = color;
    g.beginPath();
    g.moveTo(Math.round(px) + 0.5, top);
    g.lineTo(Math.round(px) + 0.5, bottom);
    g.stroke();
  }

  private yTicks(shown: Series[], band?: [number, number]): number[] {
    let [lo, hi] = [Infinity, -Infinity];
    for (const s of shown) {
      for (const v of s.values) {
        if (!Number.isFinite(v)) continue;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    }
    if (band) [lo, hi] = [Math.min(lo, band[0]), Math.max(hi, band[1])];
    if (lo > hi) [lo, hi] = [0, 0];
    const min = this.opts.minSpan ?? 0;
    if (hi - lo < min) [lo, hi] = [(lo + hi - min) / 2, (lo + hi + min) / 2];
    const { floor } = this.opts;
    if (floor !== undefined && lo < floor + min) [lo, hi] = [floor, Math.max(hi, floor + min)];
    return niceTicks(lo, hi);
  }

  private timeAxis(g: CanvasRenderingContext2D, x: (t: number) => number, t0: number, t1: number, bottom: number): void {
    g.fillStyle = '#7b8189';
    g.textBaseline = 'alphabetic';
    const rolling = !!this.opts.rolling;
    const ticks = rolling ? niceTicks(t0 - t1, 0, 4).filter((v) => v >= t0 - t1) : niceTicks(t0, t1, 4).filter((v) => v >= t0 && v <= t1);
    for (const v of ticks) {
      const px = x(rolling ? t1 + v : v);
      g.textAlign = px > x(t1) - 12 ? 'right' : px < x(t0) + 12 ? 'left' : 'center';
      g.fillText(rolling ? (v === 0 ? 'now' : `${tick(v)} s`) : `${tick(v)} s`, px, bottom + 13);
    }
  }

  private buildLegend(key: string): void {
    this.legendKey = key;
    this.off.clear();
    const keys = this.series.length < 2 ? [] : this.series.map((s) => {
      const line = h('i', { style: `border-top:2px ${s.dashed ? 'dashed' : 'solid'} ${s.color}` });
      const b = h('button', { title: s.name ?? s.label, onclick: () => {
        if (!this.off.delete(s.label)) this.off.add(s.label);
        b.classList.toggle('off', this.off.has(s.label));
        this.draw(this.playhead);
      } }, line, s.label);
      return b;
    });
    replace(this.legend, ...keys);
  }

  private point(e: PointerEvent): void {
    if (!this.t.length) return;
    const r = this.canvas.getBoundingClientRect();
    const want = this.toTime(e.clientX - r.left);
    let i = 0;
    for (let k = 1; k < this.t.length; k++) if (Math.abs(this.t[k] - want) < Math.abs(this.t[i] - want)) i = k;
    this.hovering = true;
    this.cross = this.t[i];
    this.draw(this.playhead);
    this.onHover?.(this.t[i]);
    this.readout(i, e.clientX, r);
  }

  private leave(): void {
    this.hovering = false;
    this.cross = null;
    this.tip.hidden = true;
    this.draw(this.playhead);
    this.onHover?.(null);
  }

  private readout(i: number, px: number, r: DOMRect): void {
    const digits = this.opts.digits ?? 2;
    const end = this.span?.[1] ?? 0;
    const when = this.opts.rolling ? `${(this.t[i] - end).toFixed(1)} s` : `${this.t[i].toFixed(2)} s`;
    replace(this.tip, h('div.cap.mu', {}, when), ...this.series.filter((s) => !this.off.has(s.label)).map((s) => {
      const v = s.values[i];
      return h('div.chart-tip-row', {}, h('i', { style: `border-top:2px ${s.dashed ? 'dashed' : 'solid'} ${s.color}` }),
        h('b', {}, Number.isFinite(v) ? `${v.toFixed(digits)}${s.unit ? ` ${s.unit}` : ''}` : '–'), h('span', {}, s.name ?? s.label));
    }));
    this.tip.hidden = false;
    const { offsetWidth: w, offsetHeight: hgt } = this.tip;
    this.tip.style.left = `${px + 14 + w > innerWidth - 8 ? px - w - 14 : px + 14}px`;
    this.tip.style.top = `${Math.max(8, Math.min(r.top, innerHeight - hgt - 8))}px`;
  }
}
