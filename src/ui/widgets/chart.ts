/** A tiny multi-series line chart on canvas with a playhead; redrawn on demand. */
import { h } from '../dom/h';

export interface Series {
  label: string;
  color: string;
  values: number[];
  dashed?: boolean;
}

const COLORS = ['#16181b', '#3d8fe0', '#f05a23', '#2e9d6a', '#8b5cf6', '#c9a227', '#0ea5a4', '#db2777'];
export const seriesColor = (i: number) => COLORS[i % COLORS.length];

export class LineChart {
  readonly el = h('canvas.chart');
  private series: Series[] = [];
  private t: number[] = [];

  setData(t: number[], series: Series[]): void {
    this.t = t;
    this.series = series;
    this.draw(null);
  }

  draw(playhead: number | null, band?: [number, number]): void {
    const c = this.el;
    const dpr = devicePixelRatio || 1;
    const [w, hgt] = [c.clientWidth || 360, c.clientHeight || 120];
    c.width = w * dpr;
    c.height = hgt * dpr;
    const g = c.getContext('2d')!;
    g.scale(dpr, dpr);
    g.clearRect(0, 0, w, hgt);
    if (!this.t.length) return;
    const all = this.series.flatMap((s) => s.values).concat(band ?? []);
    const [lo, hi] = [Math.min(...all, 0), Math.max(...all, 0)];
    const pad = (hi - lo) * 0.08 || 1;
    const y = (v: number) => hgt - 14 - ((v - lo + pad) / (hi - lo + 2 * pad)) * (hgt - 22);
    const x = (t: number) => 6 + ((t - this.t[0]) / (this.t.at(-1)! - this.t[0] || 1)) * (w - 12);
    g.strokeStyle = '#e1e3e6';
    g.beginPath();
    g.moveTo(6, y(0));
    g.lineTo(w - 6, y(0));
    g.stroke();
    if (band) {
      g.fillStyle = 'rgba(214,24,43,0.06)';
      g.fillRect(6, 0, w - 12, y(band[1]));
      g.fillRect(6, y(band[0]), w - 12, hgt - y(band[0]));
    }
    for (const s of this.series) {
      g.strokeStyle = s.color;
      g.lineWidth = 1.4;
      g.setLineDash(s.dashed ? [4, 3] : []);
      g.beginPath();
      s.values.forEach((v, i) => (i ? g.lineTo(x(this.t[i]), y(v)) : g.moveTo(x(this.t[i]), y(v))));
      g.stroke();
    }
    g.setLineDash([]);
    if (playhead !== null) {
      g.strokeStyle = '#d6182b';
      g.beginPath();
      g.moveTo(x(playhead), 0);
      g.lineTo(x(playhead), hgt);
      g.stroke();
    }
    g.fillStyle = '#8b8f95';
    g.font = '9px JetBrains Mono, monospace';
    g.fillText(`${hi.toFixed(2)}`, 8, 10);
    g.fillText(`${lo.toFixed(2)}`, 8, hgt - 3);
  }
}
