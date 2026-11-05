/** The graphs drawer under the stage: how the live data moves, in every mode, beside whatever panel is open. */
import type { LiveBus, Snapshot } from '../../app/live/bus';
import { HISTORY_HZ, LiveHistory } from '../../app/live/history';
import { limbLabel } from '../../app/robots/body';
import { h } from '../dom/h';
import { isFolded, setFolded } from '../shell/fold/memory';
import { ICON, icon } from '../shell/icons';
import { isMobile } from '../shell/mobile/media';
import { LineChart } from '../widgets/chart';
import { segmented } from '../widgets/segmented';
import { METRICS, type Metric } from './metrics';

type Seconds = '10' | '30' | '60';

function card(m: Metric) {
  const chart = new LineChart({ minSpan: m.minSpan, floor: m.floor, digits: m.digits, rolling: true });
  const value = h('span.mono.graph-value');
  const empty = h('p.graph-empty', { hidden: true }, m.empty ?? '');
  const el = h('div.graph-card', {}, h('header', {}, h('b', {}, m.title), value), chart.el, empty);
  return { m, chart, value, empty, el };
}

/** Returns the button that shows and hides it. */
export function mountGraphs(host: HTMLElement, bus: LiveBus): HTMLElement {
  const history = new LiveHistory();
  bus.on((s) => history.record(s), HISTORY_HZ);
  let seconds: Seconds = '30';
  const cards = METRICS.map(card);
  const chipKey = (m: Metric) => `graphs:${m.id}`;
  const showing = (m: Metric) => !isFolded(chipKey(m), !m.shown);

  const update = (s: Snapshot) => {
    // A hovered chart holds still so the readout can be read.
    if (host.hidden || cards.some((c) => c.chart.hovering)) return;
    const now = history.samples.at(-1)?.t ?? 0, from = now - Number(seconds);
    const samples = history.samples.filter((x) => x.t >= from);
    const view = { session: s.session, focus: s.focus, samples, t: samples.map((x) => x.t) };
    limb.textContent = s.session.limbs.length > 1 ? limbLabel(s.session, s.focus) : '';
    for (const c of cards) {
      if (c.el.hidden) continue;
      const series = c.m.series(view);
      const hasData = series.some((x) => x.values.some(Number.isFinite));
      c.chart.setData(view.t, series, [from, now]);
      c.chart.el.hidden = !hasData && !!c.m.empty;
      c.empty.hidden = hasData || !c.m.empty;
      const only = series.length === 1 ? series[0] : null;
      const last = only?.values.at(-1) ?? NaN;
      c.value.textContent = only && Number.isFinite(last) ? `${last.toFixed(c.m.digits)}${only.unit ? ` ${only.unit}` : ''}` : '';
    }
  };
  bus.on(update, 15);
  const refresh = () => bus.latest && update(bus.latest);

  for (const c of cards) {
    c.el.hidden = !showing(c.m);
    c.chart.onHover = (t) => cards.forEach((o) => o !== c && !o.el.hidden && o.chart.mark(t));
  }
  const chips = cards.map((c) => {
    const b = h('button.tb', { onclick: () => {
      if (!c.el.hidden && cards.filter((o) => !o.el.hidden).length === 1) return;
      c.el.hidden = !c.el.hidden;
      setFolded(chipKey(c.m), c.el.hidden);
      b.classList.toggle('on', !c.el.hidden);
      refresh();
    } }, c.m.chip);
    b.classList.toggle('on', !c.el.hidden);
    return b;
  });
  const span = segmented<Seconds>([['10', '10 s'], ['30', '30 s'], ['60', '60 s']], seconds, (v) => {
    seconds = v;
    span.set(v);
    refresh();
  });
  const limb = h('span.cap.mu.graphs-limb');
  const setOpen = (on: boolean) => {
    host.hidden = !on;
    button.classList.toggle('on', on);
    button.setAttribute('aria-pressed', String(on));
    refresh();
  };
  const toggle = () => {
    const opening = !!host.hidden;
    setOpen(opening);
    setFolded('graphs', !opening);
  };
  const button = h('button.tourchip.graphs-chip', { onclick: toggle, title: 'How the live data changes over time  ( G )' }, icon(ICON.graphs), h('span', {}, 'Graphs'));
  host.append(
    h('div.graphs-head', {}, h('span.cap', {}, 'Graphs'), limb, h('div.graphs-chips', {}, ...chips), span.el,
      h('button.icon-btn.sm', { onclick: toggle, title: 'Hide graphs  ( G )', 'aria-label': 'Hide graphs' }, icon(ICON.close))),
    h('div.graphs-row', {}, ...cards.map((c) => c.el)));
  addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() !== 'g' || e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement).closest?.('input, select, textarea')) return;
    toggle();
  });
  setOpen(!isFolded('graphs', isMobile()));
  return button;
}
