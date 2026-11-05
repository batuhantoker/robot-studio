/** Mount every panel into the layout. */
import { mountBuilder } from '../../ui/builder/panel';
import { ikPanel } from '../../ui/analysis/ik-panel';
import { physicsPanel } from '../../ui/analysis/physics-panel';
import { trajectoryPanel } from '../../ui/analysis/trajectory-panel';
import { trajectoryExportPanel } from '../../ui/analysis/trajectory-export';
import { workspacePanel } from '../../ui/analysis/workspace-panel';
import { mountLibrary } from '../../ui/library/panel';
import { mountRobotActions } from '../../ui/builder/robot-actions';
import { mountLeftTabs } from '../../ui/shell/left-tabs';
import { mountLive } from '../../ui/live/panel';
import { mountMath } from '../../ui/math/panel';
import { mountRightTabs } from '../../ui/shell/right-panel';
import type { Layout } from '../../ui/shell/layout';
import { mountTopbar } from '../../ui/shell/topbar';
import { focusPicker } from '../../ui/shell/focus-picker';
import { mountPartsCard } from '../../ui/teardown/parts-card';
import { mountViewMenu } from '../../ui/teardown/toolbar';
import { mountAnalysisPane } from '../../ui/shell/analysis-pane';
import { mountGraphs } from '../../ui/graphs/drawer';
import { mountGuide } from '../../ui/shell/guide';
import { mountModeBar } from '../../ui/shell/mode-bar';
import { h } from '../../ui/dom/h';
import { mountMotionBar } from '../../ui/motion/bar';
import { mountTaskBar } from '../../ui/task/bar';
import { mountRubikBar } from '../../ui/rubik/bar';
import { mountPilotBar } from '../../ui/pilot/bar';
import { mountPilotPad } from '../../ui/pilot/touch-pad';
import { mountTrajectoryBar } from '../../ui/trajectory/bar';
import { mountMaterialLegend } from '../../ui/teardown/material-legend';
import { libraryActions } from '../controller/library-actions';
import { exportTrajectory } from '../controller/render/export';
import { canRenderVideo } from '../controller/render/recorder';
import { mountRenderOverlay } from '../../ui/render/overlay';
import { mountStageSettings } from '../../ui/stage/settings';
import { mountSceneRobots } from '../../ui/stage/scene-robots';
import { saveSurroundings } from '../../scene/stage/surroundings';
import { shownSurroundings } from '../scene/setting';
import { bindMobileStage } from '../controller/mobile-stage';
import { sceneControls } from '../controller/scene-controls';
import type { Studio } from '../controller/studio';

export function mountPanels(layout: Layout, studio: Studio): void {
  const { store } = studio;
  const active = () => store.state.library.find((e) => e.id === store.state.activeId);
  const guide = mountGuide(store, () => document.querySelector('.top-right .help'));
  mountTopbar(layout.topbar, store, () => [active()?.title ?? '', active()?.subtitle ?? ''], focusPicker(store, studio.bus), (m) => m !== 'pilot' || studio.pilot.available(), guide.open, mountGraphs(layout.graphs, studio.bus));
  const left = mountLeftTabs(layout.left);
  const base = libraryActions(store, (m) => store.set({ draftError: m }), () => studio.session);
  const actions = { ...base, create: () => (base.create(), left.show('build')) };
  mountLibrary(left.robots, store, actions);
  mountRobotActions(left.build, store, actions);
  mountBuilder(left.build, store, (raw) => studio.commitDraft(raw));
  const panes = mountRightTabs(layout.right, store);
  mountLive(panes.live, store, studio.bus);
  mountMath(panes.math, store, studio.bus, () => studio.ik.result);
  mountAnalysisPane(panes.analysis, store, [
    { modes: ['ik'], el: ikPanel(store, studio.bus, studio.analysis) },
    { modes: ['trajectory'], el: trajectoryPanel(store, studio.bus, studio.analysis) },
    { modes: ['trajectory'], el: trajectoryExportPanel(store, {
      canRender: canRenderVideo(),
      render: (settings) => studio.recorder.start(settings),
      cancel: () => studio.recorder.cancel(),
      onProgress: (fn) => studio.recorder.onProgress(fn),
      exportData: (format, rate) => exportTrajectory(studio.session, store.state, format, rate),
    }) },
    { modes: ['physics'], el: physicsPanel(store, studio.bus, studio.analysis) },
    { modes: ['workspace'], el: workspacePanel(store, studio.analysis) },
  ]);
  const stack = h('div.toolbar-stack.dock-stack');
  layout.hudBottom.append(stack);
  mountModeBar(stack, store, studio.analysis);
  const view = mountViewMenu(layout.tools, store);
  mountMotionBar(stack, store, () => studio.motion.presets, studio.task.available);
  mountTaskBar(stack, store, studio.task);
  mountRubikBar(stack, store, studio.rubik);
  mountPilotBar(stack, store, studio.pilot, studio.bus);
  mountPilotPad(layout.stage, store, studio.pilot);
  mountTrajectoryBar(stack, store, studio.bus, studio.analysis, { list: () => studio.trajectoryPresets(), load: (id) => studio.loadTrajectoryPreset(id) });
  mountMaterialLegend(layout.hudTop, store, () => studio.session?.assembly ?? null);
  mountPartsCard(layout.hudTop, store, () => studio.session?.assembly ?? null, (o) => studio.viewport.flash(o), view.parts);
  mountRenderOverlay(layout.stage, studio.recorder);
  mountStageSettings(layout.tools, store);
  mountSceneRobots(layout.tools, studio.viewport.stage, store, sceneControls(studio), (fn) => studio.viewport.onFrame(() => fn()));
  bindMobileStage(studio);
  studio.viewport.setSurroundings(shownSurroundings(store.state));
  store.on(['surroundings', 'scene', 'activeId'], (s) => studio.viewport.setSurroundings(shownSurroundings(s)));
  store.on(['surroundings'], (s) => saveSurroundings(s.surroundings));
}
