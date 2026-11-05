/** How the current gains are doing, and how every try so far compares. */
import type { Attempt, ControlLab } from '../../app/controller/learn/lab';
import type { RunStats } from '../../core/control/score';
import { h, replace } from '../dom/h';

const MAX_BARS = 40;
const pct = (v: number) => `${(v * 100).toFixed(v < 0.1 && v > 0 ? 1 : 0)}%`;
const peakLabel = 'Peak', upLabel = 'Stayed up';

function reading(label: string, title: string) {
  const value = h('b.mono', {}, '–');
  const name = h('small', {}, label);
  return { value, label: name, el: h('span.lab-reading', { title }, name, value) };
}

export function scoreCard() {
  const big = h('b.lab-big', {}, '–');
  const error = reading('Error', 'RMS tracking error over this run');
  const peak = reading('Peak', 'Largest tracking error in this run');
  const buzz = reading('Buzz', 'How hard the torque jumps from step to step, as a share of the limit. Above a few percent the motors are fighting themselves');
  const limit = reading('At limit', 'Share of the time a motor was asked for more than it has');
  const you = h('b', {}, '–');
  const ai = h('b', {}, '–');
  const youTries = h('small', {}, 'no tries yet');
  const aiTries = h('small', {}, 'not taught yet');
  const bars = h('div.lab-bars');
  const el = h('div.lab-card', {},
    h('div.lab-top', {},
      h('div', {}, h('div.cap.mu', {}, 'This run'), h('div.lab-score', {}, big, h('span', {}, '/ 100'))),
      h('div.lab-readings', {}, error.el, peak.el, buzz.el, limit.el)),
    h('div.lab-tally', {},
      h('div', {}, h('span.cap.mu', {}, 'Your best'), you, youTries),
      h('div.ai', {}, h('span.cap.mu', {}, 'AI best'), ai, aiTries)),
    bars);

  const bar = (lab: ControlLab, a: Attempt) => h('i', {
    class: a.who === 'ai' ? 'ai' : '',
    style: `height:${Math.max(a.stats.score, 3)}%`,
    title: `${a.who === 'ai' ? 'AI' : 'You'}: ${a.stats.score.toFixed(0)}. Click to run these gains again`,
    onclick: () => lab.useAttempt(a),
  });

  return {
    el,
    /** The run under way. */
    live(s: RunStats | null, onFloor: boolean) {
      big.textContent = s ? s.score.toFixed(0) : '–';
      error.value.textContent = s ? `${s.rmsDeg.toFixed(2)}°` : '–';
      peak.label.textContent = onFloor ? upLabel : peakLabel;
      peak.value.textContent = !s ? '–' : onFloor ? pct(s.upright) : `${s.peakDeg.toFixed(1)}°`;
      peak.el.classList.toggle('hot', onFloor && !!s && s.upright < 1);
      buzz.value.textContent = s ? pct(s.jitter) : '–';
      limit.value.textContent = s ? pct(s.saturation) : '–';
      buzz.el.classList.toggle('hot', !!s && s.jitter > 0.02);
      limit.el.classList.toggle('hot', !!s && s.saturation > 0.02);
    },
    /** The attempts on this limb. */
    board(lab: ControlLab) {
      const list = lab.attempts();
      const tries = list.filter((a) => a.who === 'you').length;
      const lessons = list.filter((a) => a.who === 'ai').length;
      you.textContent = lab.best('you')?.stats.score.toFixed(0) ?? '–';
      ai.textContent = lab.best('ai')?.stats.score.toFixed(0) ?? '–';
      youTries.textContent = tries ? `${tries} ${tries === 1 ? 'try' : 'tries'}` : 'no tries yet';
      aiTries.textContent = lessons ? `${lessons} ${lessons === 1 ? 'lesson' : 'lessons'}` : 'not taught yet';
      replace(bars, ...list.slice(-MAX_BARS).map((a) => bar(lab, a)));
      bars.hidden = !list.length;
    },
  };
}
