/** Hand the gains to a learner and watch it practise. */
import type { ControlLab } from '../../app/controller/learn/lab';
import type { Method } from '../../app/controller/learn/run';
import { GAIN_KEYS } from '../../core/control/gains';
import { runColor } from '../../scene/overlays/runs';
import { h } from '../dom/h';
import { LineChart } from '../widgets/chart';
import { segmented } from '../widgets/segmented';

const WHAT: Record<Method, string> = {
  policy: 'Policy gradient: treats the gains as a policy, and nudges it toward whatever scored above average.',
  evolution: 'Cross-entropy evolution: keeps the best quarter of each batch and breeds the next batch from them.',
};

/** One bar per run, in order: the whole lesson at a glance. */
function drawStrip(c: HTMLCanvasElement, scores: number[], total: number): void {
  const dpr = devicePixelRatio || 1;
  const [w, hgt] = [c.clientWidth, c.clientHeight];
  if (!w) return;
  c.width = Math.round(w * dpr);
  c.height = Math.round(hgt * dpr);
  const g = c.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const step = w / total;
  scores.forEach((s, i) => {
    const bar = Math.max((s / 100) * hgt, 1.5);
    g.fillStyle = `#${runColor(s).getHexString()}`;
    g.fillRect(i * step, hgt - bar, Math.max(step, 1), bar);
  });
}

const duration = (s: number) => (s < 90 ? `${s.toFixed(0)} s` : s < 5400 ? `${(s / 60).toFixed(0)} min` : `${(s / 3600).toFixed(1)} h`);

export function teachCard(onTeach: (m: Method) => void) {
  let lab: ControlLab | null = null;
  let method: Method = 'policy';
  let started = 0;
  let wall = 0;
  const methods = segmented<Method>([['policy', 'Policy gradient (RL)'], ['evolution', 'Evolution (CEM)']], method, (m) => {
    method = m;
    methods.set(m);
    what.textContent = WHAT[m];
  });
  const what = h('p.note.lab-hint', {}, WHAT[method]);
  const go = h('button.tb.primary', { onclick: () => {
    if (lab?.running) return lab.stopLearning();
    started = performance.now();
    onTeach(method);
  } }, 'Teach it');
  const status = h('span.mu.lab-status');
  const fill = h('i');
  const progress = h('div.lab-progress', { hidden: true }, fill);
  const chart = new LineChart({ floor: 0, ceiling: 100, minSpan: 100, digits: 0, xUnit: 'runs' });
  chart.el.hidden = true;
  const strip = h('canvas.lab-strip', { hidden: true, title: 'Every run in order: height and colour are its score' });
  const subject = h('p.note.lab-hint');
  const el = h('div.lab-section', {},
    h('div.cap', {}, 'Teach it'),
    subject,
    h('p.note.lab-hint', {}, 'It sees only the score. Every run happens on a private copy; the stage draws each path, and the robot races through the latest.'),
    methods.el, what,
    h('div.row', {}, go, status), progress, strip, chart.el);

  return {
    el,
    show(next: ControlLab) {
      lab = next;
      chart.el.hidden = strip.hidden = !lab.learner;
      const n = lab.judged().length;
      subject.textContent = `What it learns: ${n * GAIN_KEYS.length} numbers, Kp, Ki and Kd on ${n === 1 ? 'one joint' : `${n} joints`}. The motion stays the same; only how hard each joint pushes changes.`;
    },
    update() {
      const run = lab?.learner;
      const running = !!lab?.running;
      go.textContent = running ? 'Stop' : run ? 'Teach it again' : 'Teach it';
      go.classList.toggle('primary', !running);
      progress.hidden = !running;
      if (!run) {
        status.textContent = '';
        return;
      }
      if (running) wall = (performance.now() - started) / 1000;
      fill.style.width = `${(run.runs / run.total) * 100}%`;
      status.textContent = `${run.runs} runs · ${duration(run.practice)} of practice in ${duration(wall)}`;
      const { runs, best, mean } = run.curve;
      strip.hidden = false;
      drawStrip(strip, run.history, run.total);
      if (!runs.length) return;
      chart.el.hidden = false;
      const mine = lab!.best('you')?.stats.score;
      chart.setData(runs, [
        { label: 'Best', color: '#d6182b', values: best, name: 'Best so far' },
        { label: 'Batch', color: '#7b8189', values: mean, name: 'Batch average' },
        ...(mine === undefined ? [] : [{ label: 'You', color: '#2a78d6', values: runs.map(() => mine), dashed: true, name: 'Your best' }]),
      ], [0, run.total]);
    },
  };
}
