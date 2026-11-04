/** The guide: how to do each thing in the studio, and the shortcuts. Opens with `?` and on the first visit. */
import type { Mode } from '../../app/state/types';
import { h } from '../dom/h';
import { ICON, MODE_ICON, icon } from './icons';

interface Topic {
  title: string;
  glyph: string;
  steps: string[];
}

// **text** is bold: the name of a button or place on screen. A `keys:` step is for keyboards, a `touch:` step for phones.
const TOPICS: Topic[] = [
  { title: 'Pick a robot', glyph: ICON.robots, steps: [
    'Open **Robots**, or click the robot’s name in the top bar.',
    'Search by name, maker or type: `kuka`, `humanoid`, `dof:6-7`. Filters narrow it further.',
    'keys:**↑ ↓** step through the list; **/** jumps to the search box.'] },
  { title: 'Pose it and read the numbers', glyph: MODE_ICON.pose, steps: [
    'In **Pose**, drag a joint slider in **Live**, or drag a limb right in the view.',
    'Live shows dexterity, the tool pose, and each joint’s torque against its motor.',
    '**Home** and **Random pose** sit under the joints.'] },
  { title: 'Play a demo motion', glyph: MODE_ICON.motion, steps: [
    'Pick a motion (Circle, Figure 8, Joint wave…) in the bar at the bottom of the stage.',
    '**Speed** and **Size** tune it while it plays.'] },
  { title: 'Drive a robot', glyph: MODE_ICON.pilot, steps: [
    '**Pilot** works on robots with legs or wheels.',
    'keys:**W S** drive, **A D** turn, **Q E** side step, **Shift** to hurry, **C** switches the camera.',
    'touch:The stick at the bottom left drives and turns, **Run** goes full speed, **◀ ▶** side-step; drag the view to look around.',
    'Humanoids have hand moves in the bar: Wave, Reach, Work, Lift (keys **1–4**).'] },
  { title: 'Grab and carry parts (humanoids)', glyph: MODE_ICON.pilot, steps: [
    'Every setting has loose parts: blocks on the desk, boxes on the lab bench, cartons in the warehouse…',
    'In **Pilot**, turn on **Hands**: pick **Left** or **Right**, move the hand with the arrows (**I J K L**, **U O** for height), then **Grip** (**Space**).',
    'Walk off with it and **Release** over a bench or the floor. **Rest** (**R**) lowers the hands; **Tab** swaps hands.'] },
  { title: 'Pick and place', glyph: MODE_ICON.task, steps: [
    'The robot needs a gripper: **Build → End effector**.',
    'In **Pick & place**, the pick starts on a part in reach. Choose **Pick** or **Place** in the bar, then drag the arrows or click the floor or a bench.',
    '**▶** runs the cycle; the bar says what blocks it.'] },
  { title: 'Reach a target (IK)', glyph: MODE_ICON.ik, steps: [
    'In **IK**, drag the red gizmo: every joint follows.',
    'Several limbs? Grab another limb’s marker, or type targets in **Analysis**.'] },
  { title: 'Plan a trajectory', glyph: MODE_ICON.trajectory, steps: [
    'In **Trajectory**, load a preset or press **+ Stop** to add the current pose.',
    'Click a numbered chip to edit that stop: position, hold time, or pass through as a via.',
    'Drag chips to reorder; scrub to preview. Charts of the path are in **Analysis**.'] },
  { title: 'Render a video or export data', glyph: ICON.play, steps: [
    'In **Trajectory**, open **Analysis → Render & export**.',
    'Pick resolution, frame rate and camera, then **Render video**. CSV and JSON samples are below it.'] },
  { title: 'Simulate physics', glyph: MODE_ICON.physics, steps: [
    '**Physics** runs the trajectory in MuJoCo with PD control.',
    '**▶ Simulate** in the bar; applied torque and tracking error plot in **Analysis**.'] },
  { title: 'Map the workspace', glyph: MODE_ICON.workspace, steps: [
    'In **Workspace**, press **Analyze** (or **Dense 10k**).',
    'Colour the shell by dexterity, torque, limits or reach in **Analysis**.'] },
  { title: 'Look inside', glyph: ICON.view, steps: [
    'The **eye** button (top right of the stage) holds the looks, Glass and Section cutaways, **Explode** and the overlays.',
    '**Isolate a part** lists a module’s parts; click one to find it.'] },
  { title: 'Build your own', glyph: ICON.build, steps: [
    '**Robots → + New robot** opens **Build**: add joints and links, pick an end effector.',
    'Real CAD robots: **Build → Make editable** keeps the meshes.',
    'Export Python JSON, Studio JSON or MJCF from **Build → This robot**.'] },
  { title: 'Several robots on one stage', glyph: MODE_ICON.pose, steps: [
    'The **robot** button (top right of the stage) lists the robots on the stage. **+ Add robot** adds one, up to four.',
    '**Move** slides and turns the selected robot; click any robot in the view to control it.'] },
  { title: 'Surroundings', glyph: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></svg>', steps: [
    'The **gear** sets the backdrop, the floor and a setting: desk, lab, cell, machine shop or warehouse.',
    'They apply to rendered video too.'] },
];

const SHORTCUTS: [string, string][] = [
  ['/', 'Search robots'], ['↑ ↓', 'Next or previous robot'], ['[  ]', 'Hide or show the side panels'], ['?', 'This guide'],
  ['Esc', 'Close a menu, let go of a stop'], ['← →', 'Trajectory: step through points (Shift: stops only)'], ['Delete', 'Trajectory: remove the selected stop'],
  ['W A S D', 'Pilot: drive and turn'], ['Q E', 'Pilot: side step'], ['C', 'Pilot: camera'],
  ['I J K L', 'Pilot hands: move the hand'], ['U O', 'Pilot hands: lower, raise'], ['Space', 'Pilot hands: grip or release'], ['Tab  R', 'Pilot hands: other hand, rest'],
];

const SEEN = 'robot-studio.guide.v2';

function rich(line: string): HTMLElement {
  const [, kind, text] = /^(?:(keys|touch):)?(.*)$/s.exec(line)!;
  const p = h('p', { class: kind ?? '' });
  for (const part of text.split(/(\*\*[^*]+\*\*|`[^`]+`)/)) {
    if (part.startsWith('**')) p.append(h('b', {}, part.slice(2, -2)));
    else if (part.startsWith('`')) p.append(h('code', {}, part.slice(1, -1)));
    else if (part) p.append(part);
  }
  return p;
}

export interface Guide {
  open(): void;
  close(): void;
  toggle(): void;
}

export function mountGuide(root: HTMLElement, enterMode: (m: Mode) => void): Guide {
  const start = (n: number, title: string, text: string) => h('div.start-step', {}, h('i.num', {}, String(n)), h('div', {}, h('b', {}, title), h('span', {}, text)));
  const card = h('div.guide-card', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Guide' },
    h('header', {},
      h('div', {}, h('h2', {}, 'How to use Robot Studio'), h('p.mu', {}, 'Three places to know, then a recipe for each thing you can do.')),
      h('button.icon-btn', { onclick: () => close(), 'aria-label': 'Close guide' }, icon(ICON.close))),
    h('div.guide-body', {},
      h('div.start', {},
        start(1, 'Pick a robot', 'Open Robots, or click the robot’s name in the top bar.'),
        start(2, 'Choose a mode', 'Pose, Motion, Pilot, IK, Trajectory… at the top.'),
        start(3, 'Use the bar under the robot', 'It changes with the mode. Numbers and charts live in Live and Analysis.')),
      h('div.topics', {}, ...TOPICS.map((t) => h('section.topic', {}, h('h3', {}, icon(t.glyph), t.title), ...t.steps.map(rich)))),
      h('h3.shortcuts-title.keys', {}, 'Shortcuts'),
      h('dl.shortcuts.keys', {}, ...SHORTCUTS.flatMap(([k, v]) => [h('dt', {}, ...k.split(' ').filter(Boolean).map((x) => h('kbd', {}, x))), h('dd', {}, v)]))),
    h('footer', {},
      h('button.tb', { onclick: () => (close(), enterMode('pose')) }, 'Start in Pose mode'),
      h('button.tb.primary', { onclick: () => close() }, 'Got it')));
  const el = h('div.guide', { hidden: true }, card);
  el.addEventListener('pointerdown', (e) => e.target === el && close());
  root.append(el);

  const open = () => {
    el.hidden = false;
    document.documentElement.classList.add('modal-open');
    card.querySelector<HTMLElement>('.guide-body')!.scrollTop = 0;
  };
  const close = () => {
    el.hidden = true;
    document.documentElement.classList.remove('modal-open');
    try {
      localStorage.setItem(SEEN, '1');
    } catch {
      // Without storage the guide just opens again next visit.
    }
  };
  const toggle = () => (el.hidden ? open() : close());
  addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement).closest?.('input, select, textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === '?') toggle();
    else if (e.key === 'Escape' && !el.hidden) close();
  });
  let seen = false;
  try {
    seen = localStorage.getItem(SEEN) === '1';
  } catch {
    seen = false;
  }
  if (!seen) open();
  return { open, close, toggle };
}
