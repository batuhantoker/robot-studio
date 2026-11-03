/** Render one pass of the trajectory to a video, or download its samples as CSV / JSON. */
import type { RenderSettings, Resolution } from '../../app/controller/render/recorder';
import type { Store } from '../../app/state/store';
import type { StudioState } from '../../app/state/types';
import { h, replace } from '../dom/h';
import { numberInput } from '../widgets/fields';
import { segmented, toggle } from '../widgets/segmented';

export interface TrajectoryExportActions {
  canRender: boolean;
  /** Resolves with why the render failed, or null. */
  render(settings: RenderSettings): Promise<string | null>;
  cancel(): void;
  onProgress(fn: (p: { frame: number; frames: number } | null) => void): void;
  /** Returns why nothing was exported, or null. */
  exportData(format: 'csv' | 'json', rate: number): string | null;
}

const KEY = 'robot-studio:render';
const DEFAULTS: RenderSettings = { height: 1080, fps: 60, orbit: false, path: true, timecode: false };
const RESOLUTIONS: [`${Resolution}`, string][] = [['720', '720p'], ['1080', '1080p'], ['1440', '1440p'], ['2160', '4K']];

function load(): RenderSettings {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<RenderSettings>) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function trajectoryExportPanel(store: Store<StudioState>, actions: TrajectoryExportActions) {
  const settings = load();
  const save = (patch: Partial<RenderSettings>) => {
    Object.assign(settings, patch);
    try {
      localStorage.setItem(KEY, JSON.stringify(settings));
    } catch {
      // Not persisted; the choice still applies to this session.
    }
    renderButton();
  };
  let rate = 100;
  let error: string | null = null;
  const note = h('div');
  const showError = (e: string | null) => {
    error = e;
    replace(note, error ? h('p.note', {}, error) : actions.canRender ? null : h('p.note', {}, 'This browser cannot encode video; CSV and JSON still work.'));
  };

  const res = segmented(RESOLUTIONS, `${settings.height}`, (v) => (res.set(v), save({ height: Number(v) as Resolution })));
  const fps = segmented<'30' | '60'>([['30', '30'], ['60', '60']], `${settings.fps}`, (v) => (fps.set(v), save({ fps: Number(v) as 30 | 60 })));
  const camera = segmented<'fixed' | 'orbit'>([['fixed', 'Fixed'], ['orbit', 'Orbit']], settings.orbit ? 'orbit' : 'fixed', (v) => (camera.set(v), save({ orbit: v === 'orbit' })));
  const path = toggle('Tool path', settings.path, (v) => (path.classList.toggle('on', v), save({ path: v })));
  const timecode = toggle('Time code', settings.timecode, (v) => (timecode.classList.toggle('on', v), save({ timecode: v })));

  const go = h('div.row');
  const progress = h('span.mono.mu');
  const renderButton = () => {
    const name = `${settings.height === 2160 ? '4K' : `${settings.height}p`}${settings.fps}`;
    replace(go, store.state.rendering
      ? h('button.tb.on', { onclick: () => actions.cancel() }, '■ Cancel')
      : h('button.tb.primary', {
        disabled: !actions.canRender,
        onclick: () => {
          showError(null);
          void actions.render({ ...settings }).then(showError);
        },
      }, `● Render ${name} video`),
    store.state.rendering ? progress : null);
  };
  actions.onProgress((p) => (progress.textContent = p ? `${Math.min(100, Math.round((100 * p.frame) / p.frames))}%` : ''));

  const label = (text: string) => h('span.cap.mu', { style: 'width:62px' }, text);
  const el = h('div.section', {},
    h('header', {}, h('span.cap', {}, 'Render & export'), h('span.cap.mu', {}, 'trajectory, start to end')),
    h('div.row', {}, label('Video'), res.el, fps.el),
    h('div.row', { style: 'margin-top:6px' }, label('Camera'), camera.el, h('div.seg', {}, path, timecode)),
    h('div', { style: 'margin-top:8px' }, go),
    h('div.row', { style: 'margin-top:12px' }, label('Data'),
      h('span.mu', {}, 'Hz'),
      h('div', { style: 'width:62px' }, numberInput(rate, (v) => v > 0 && (rate = v), { step: 10, digits: 0 })),
      h('button.tb', { onclick: () => showError(actions.exportData('csv', rate)) }, 'CSV'),
      h('button.tb', { onclick: () => showError(actions.exportData('json', rate)) }, 'JSON')),
    note);
  store.on(['rendering'], renderButton);
  store.on(['activeId'], () => showError(null));
  renderButton();
  showError(null);
  return el;
}
