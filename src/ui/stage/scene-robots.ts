/**
 * Robots on the stage: a button beside the gear opens the list of robots in the scene, where one is the
 * robot you control, each can be placed by number or with arrows on the stage, and more can be added.
 * Clicking a robot on the stage takes control of it.
 */
import type { Store } from '../../app/state/store';
import type { LibraryEntry, StudioState } from '../../app/state/types';
import { type Base, BaseGizmo, movedBase } from '../../scene/overlays/base-gizmo';
import type { Stage } from '../../scene/stage/renderer';
import { h, replace } from '../dom/h';
import { robotRow } from '../library/robot-row';
import { numberInput } from '../widgets/fields';
import type * as THREE from 'three';

export interface SceneRobotView {
  key: string;
  entryId: string;
  base: Base;
  active: boolean;
}

/** What the scene offers the panel; bases are in metres and radians, in the stage frame. */
export interface SceneControls {
  robots(): SceneRobotView[];
  /** Most robots the page can hold at once (MuJoCo's memory). */
  cap(): number;
  /** Null once added, else why not (memory can run out below the cap). */
  add(entryId: string): string | null | Promise<string | null>;
  remove(key: string): void;
  activate(key: string): void;
  /** Moves a robot live without saving; `setBase` saves. */
  previewBase(key: string, base: Base): void;
  setBase(key: string, base: Base): void;
  frameAll(): void;
  /** Room the open panel takes on the right of the stage (px), so the view centres beside it. */
  inset(right: number): void;
  robotAt(clientX: number, clientY: number): string | null;
  robotRoot(key: string): THREE.Object3D | null;
  onChange(fn: () => void): void;
}

const ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h9M6 20v-3h5v3M8.5 17l2.5-7 5 2.5"/><circle cx="11" cy="10" r="1.2"/><path d="M19 3v6M16 6h6"/></svg>';
const MM = { scale: 1000, step: 10, digits: 0 }, DEG = { scale: 180 / Math.PI, step: 5, digits: 0 };

export function mountSceneRobots(stageEl: HTMLElement, stage: Stage, store: Store<StudioState>, scene: SceneControls, onFrame: (fn: () => void) => void): void {
  const button = h('button.stage-gear.stage-robots', { title: 'On stage', 'aria-label': 'On stage', 'aria-expanded': 'false' });
  button.innerHTML = ICON;
  const count = h('span.cap.mu');
  const list = h('div.scene-list');
  const picker = h('div.scene-picker', { hidden: true });
  const addButton = h('button.tb', {}, '+ Add robot');
  const moveButton = h('button.tb', { title: 'Show arrows and a ring on the robot to slide and turn it' }, 'Move');
  const panel = h('div.stage-settings.scene-panel', { hidden: true, role: 'dialog', 'aria-label': 'On stage' },
    h('div.stage-settings-head', {}, h('h4', {}, 'On stage'), h('div.row', {}, count, h('button.tb', { onclick: () => scene.frameAll(), title: 'Fit every robot in view' }, 'Frame all'))),
    list,
    h('div.row.scene-actions', {}, addButton, moveButton),
    picker,
    h('p.hint', {}, 'Click a robot on the stage to control it. Positions are in millimetres and degrees, on the floor.'));
  stageEl.append(button, panel);

  let moving = false;
  // Pilot drives the robot and shifts the world under it; placing by hand would fight it.
  const piloting = () => (store.state.mode as string) === 'pilot';
  const gizmo = new BaseGizmo(stage, {
    root: (key) => scene.robotRoot(key),
    moved: (key, dx, dy, dyaw, done) => {
      const robots = scene.robots();
      const r = robots.find((x) => x.key === key);
      const active = robots.find((x) => x.active);
      if (!r || !active) return;
      const base = movedBase(r.base, active.base.yaw, dx, dy, dyaw);
      if (done) scene.setBase(key, base);
      else scene.previewBase(key, base);
    },
  });
  onFrame(() => moving && gizmo.follow());
  const activeKey = () => scene.robots().find((r) => r.active)?.key ?? null;
  const setMoving = (on: boolean) => {
    moving = on && !piloting();
    moveButton.classList.toggle('on', moving);
    moveButton.hidden = piloting();
    gizmo.show(moving ? activeKey() : null);
  };
  moveButton.addEventListener('click', () => setMoving(!moving));

  const open = (on: boolean) => {
    panel.hidden = !on;
    button.classList.toggle('on', on);
    button.setAttribute('aria-expanded', String(on));
    if (!on) {
      setMoving(false);
      picker.hidden = true;
    }
  };
  button.addEventListener('click', () => open(panel.hidden !== false));
  // On desktop the open panel covers the stage's top right, where added robots stand; with one robot the view stays put.
  const updateInset = () => {
    const on = !panel.hidden && !document.documentElement.classList.contains('mobile') && scene.robots().length > 1;
    const canvas = stage.renderer.domElement.getBoundingClientRect();
    scene.inset(on ? Math.max(0, canvas.right - panel.getBoundingClientRect().left + 8) : 0);
  };
  // The tool cluster also hides the panel when another of its popovers opens.
  new MutationObserver(updateInset).observe(panel, { attributes: true, attributeFilter: ['hidden'] });
  addEventListener('resize', updateInset);
  // The stage stays usable while the list is open: dragging the arrows and clicking robots happen there.
  addEventListener('pointerdown', (e) => {
    const t = e.target as Node;
    if (!panel.hidden && !panel.contains(t) && !button.contains(t) && t !== stage.renderer.domElement) open(false);
  });
  addEventListener('keydown', (e) => e.key === 'Escape' && !panel.hidden && open(false));

  const entry = (id: string): LibraryEntry | undefined => store.state.library.find((e) => e.id === id);
  const search = h('input.text.search', { placeholder: 'Search robots…', spellcheck: false });
  const refusal = h('p.note.accent', { hidden: true });
  const results = h('div.robot-list.scene-results');
  picker.append(search, refusal, results);
  const add = async (id: string) => {
    if (scene.robots().length >= scene.cap()) return;
    refusal.hidden = true;
    const why = await scene.add(id);
    if (why) {
      refusal.textContent = why;
      refusal.hidden = false;
      return;
    }
    picker.hidden = true;
    search.value = '';
  };
  const renderPicker = () => {
    const q = search.value.trim().toLowerCase();
    const full = scene.robots().length >= scene.cap();
    const shown = store.state.library.filter((e) => !q || `${e.title} ${e.maker} ${e.category} ${e.tags.join(' ')}`.toLowerCase().includes(q)).slice(0, 60);
    replace(results, full ? h('p.note', {}, `The page holds up to ${scene.cap()} robots at once; remove one to add another.`) : null,
      ...shown.map((e) => {
        const row = robotRow(e, false, () => void add(e.id));
        row.classList.toggle('off', full);
        return row;
      }));
  };
  search.addEventListener('input', renderPicker);
  addButton.addEventListener('click', () => {
    picker.hidden = !picker.hidden;
    refusal.hidden = true;
    if (!picker.hidden) {
      renderPicker();
      search.focus();
    }
  });

  const render = () => {
    const robots = scene.robots();
    count.textContent = `${robots.length} / ${scene.cap()}`;
    addButton.disabled = robots.length >= scene.cap();
    replace(list, ...robots.map((r) => {
      const e = entry(r.entryId);
      const set = (patch: Partial<Base>) => scene.setBase(r.key, { ...r.base, ...patch });
      return h('div.scene-robot', { class: r.active ? 'on' : '', dataset: { key: r.key } },
        h('div.scene-robot-head', { onclick: () => !r.active && scene.activate(r.key), title: r.active ? 'The robot you control' : 'Control this robot' },
          h('div.robot-main', {}, h('b', {}, e?.title ?? r.entryId), h('small', {}, r.active ? 'In control' : [e?.maker, e?.category].filter(Boolean).join(' · '))),
          robots.length > 1 ? h('button.scene-remove', { title: 'Remove from the stage', 'aria-label': 'Remove', onclick: (ev: Event) => (ev.stopPropagation(), scene.remove(r.key)) }, '×') : null),
        r.active ? h('div.scene-base', {},
          h('label', {}, 'X', numberInput(r.base.x, (x) => set({ x }), MM)),
          h('label', {}, 'Y', numberInput(r.base.y, (y) => set({ y }), MM)),
          h('label', {}, 'Yaw', numberInput(r.base.yaw, (yaw) => set({ yaw }), DEG))) : null);
    }));
    if (moving) gizmo.show(activeKey());
    if (!picker.hidden) renderPicker();
    updateInset();
  };
  scene.onChange(render);
  store.on(['library'], render);
  store.on(['mode'], () => setMoving(moving));
  render();

  // A click (not a drag) on another robot takes control of it.
  const canvas = stage.renderer.domElement;
  let down: [number, number] | null = null;
  canvas.addEventListener('pointerdown', (e) => (down = gizmo.busy ? null : [e.clientX, e.clientY]));
  canvas.addEventListener('pointerup', (e) => {
    const click = down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 4;
    down = null;
    if (!click || scene.robots().length < 2) return;
    const key = scene.robotAt(e.clientX, e.clientY);
    if (key && key !== activeKey()) scene.activate(key);
  });
}
