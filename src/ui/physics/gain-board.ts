/** A mixing desk for the controller: one fader per joint, one gain at a time. */
import type { ControlLab, GainGroup } from '../../app/controller/learn/lab';
import { GAIN_KEYS, type GainKey } from '../../core/control/gains';
import { h, replace } from '../dom/h';
import { segmented } from '../widgets/segmented';

const STEPS = 1000;
const LABEL: Record<GainKey, string> = { kp: 'Kp', ki: 'Ki', kd: 'Kd' };
const HINT: Record<GainKey, string> = {
  kp: 'Stiffness: how hard a joint pulls toward its target. Too low sags, too high shakes.',
  ki: 'Memory: builds up to remove steady error like gravity sag. Too much overshoots and swings.',
  kd: 'Damping: resists motion to stop the wobble. Too much makes the motors buzz.',
};

const shown = (v: number) => (v === 0 ? 'off' : v >= 100 ? v.toFixed(0) : v >= 1 ? v.toFixed(1) : v.toPrecision(2));

interface Fader {
  group: GainGroup;
  input: HTMLInputElement;
  value: HTMLElement;
}

export function gainBoard() {
  let lab: ControlLab | null = null;
  let key: GainKey = 'kp';
  let faders: Fader[] = [];
  let held: Fader | null = null;
  const tabs = segmented(GAIN_KEYS.map((k) => [k, LABEL[k]] as [GainKey, string]), key, (k) => {
    key = k;
    tabs.set(k);
    hint.textContent = HINT[k];
    sync();
  });
  const count = h('span.cap.mu');
  const hint = h('p.note.lab-hint', {}, HINT[key]);
  const rows = h('div.lab-faders');
  const saved = h('button.tb', { hidden: true, onclick: () => {
    const kept = lab?.saved();
    if (kept) lab!.useAttempt(kept);
  }, title: 'The best gains found for this robot, kept between visits' });
  const el = h('div.lab-section', {},
    h('div.row.spread', {}, tabs.el, count),
    hint, rows,
    h('div.row', {},
      h('button.tb', { onclick: () => lab?.use('start'), title: 'Back to the gains the lab opened with' }, 'Start over'),
      h('button.tb', { onclick: () => lab?.use('rule'), title: 'Kp = Mω², Kd = 2Mω from each joint’s inertia, ω = 30 rad/s' }, 'Textbook rule'),
      saved));

  const toPos = (lo: number, hi: number, v: number) => (v <= 0 ? 0 : Math.round((STEPS * Math.log(Math.max(v, lo) / lo)) / Math.log(hi / lo)));
  const fromPos = (lo: number, hi: number, p: number) => lo * (hi / lo) ** (p / STEPS);

  function sync() {
    if (!lab) return;
    for (const f of faders) {
      const k = f.group.joints[0];
      const v = lab.gains[k][key];
      f.value.textContent = shown(v);
      if (f === held) continue;
      const { lo, hi } = lab.range(k, key);
      f.input.value = String(toPos(lo, hi, v));
    }
    const kept = lab.saved();
    saved.hidden = !kept;
    if (kept) saved.textContent = `Best saved · ${kept.score.toFixed(0)}`;
  }

  const fader = (group: GainGroup): HTMLElement => {
    const name = group.joints.length > 1 ? `${group.label} ×${group.joints.length}` : group.label;
    const input = h('input', { type: 'range', min: '0', max: String(STEPS), step: '1', 'aria-label': `${name} gain` });
    const value = h('output.mono');
    const f: Fader = { group, input, value };
    const k = group.joints[0];
    const set = (restart: boolean) => {
      if (!lab) return;
      const { lo, hi } = lab.range(k, key);
      const p = Number(input.value);
      lab.setGain(group, key, p === 0 && key === 'ki' ? 0 : fromPos(lo, hi, p), restart);
      value.textContent = shown(lab.gains[k][key]);
    };
    input.addEventListener('pointerdown', () => (held = f));
    input.addEventListener('input', () => set(false));
    input.addEventListener('change', () => {
      held = null;
      set(true);
    });
    faders.push(f);
    return h('div.lab-fader', {}, h('label', { title: name }, name), input, value);
  };

  return {
    el,
    sync,
    show(next: ControlLab) {
      lab = next;
      faders = [];
      held = null;
      const groups = next.groups();
      count.textContent = `${groups.length * GAIN_KEYS.length} knobs`;
      replace(rows, ...groups.map(fader));
      sync();
    },
  };
}
