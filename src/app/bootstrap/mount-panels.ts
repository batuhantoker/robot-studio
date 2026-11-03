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
import { mountToolbar } from '../../ui/teardown/toolbar';
import { mountMotionBar } from '../../ui/motion/bar';
import { mountTaskBar } from '../../ui/task/bar';
import { mountPilotBar } from '../../ui/pilot/bar';
import { mountTrajectoryBar } from '../../ui/trajectory/bar';
import { mountMaterialLegend } from '../../ui/teardown/material-legend';
import { libraryActions } from '../controller/library-actions';
import { exportTrajectory } from '../controller/render/export';
import { canRenderVideo } from '../controller/render/recorder';
import { mountRenderOverlay } from '../../ui/render/overlay';
import { mountStageSettings } from '../../ui/stage/settings';
import { saveSurroundings } from '../../scene/stage/surroundings';
import { bindMobileStage } from '../controller/mobile-stage';
import type { Studio } from '../controller/studio';

export function mountPanels(layout: Layout, studio: Studio): void {
  const { store } = studio;
  const active = () => store.state.library.find((e) => e.id === store.state.activeId);
  mountTopbar(layout.topbar, store, () => [active()?.title ?? '', active()?.subtitle ?? ''], focusPicker(store, studio.bus), (m) => m !== 'pilot' || studio.pilot.available());
  const left = mountLeftTabs(layout.left);
  const base = libraryActions(store, (m) => store.set({ draftError: m }), () => studio.session);
  const actions = { ...base, create: () => (base.create(), left.show('build')) };
  mountLibrary(left.robots, store, actions);
  mountRobotActions(left.build, store, actions);
  mountBuilder(left.build, store, (raw) => studio.commitDraft(raw));
  const panes = mountRightTabs(layout.right, store);
  mountLive(panes.live, store, studio.bus);
  mountMath(panes.math, store, studio.bus, () => studio.ik.result);
  panes.analysis.append(
    ikPanel(store, studio.bus, studio.analysis),
    trajectoryPanel(store, studio.bus, studio.analysis),
    trajectoryExportPanel(store, {
      canRender: canRenderVideo(),
      render: (settings) => studio.recorder.start(settings),
      cancel: () => studio.recorder.cancel(),
      onProgress: (fn) => studio.recorder.onProgress(fn),
      exportData: (format, rate) => exportTrajectory(studio.session, store.state, format, rate),
    }),
    physicsPanel(store, studio.bus, studio.analysis),
    workspacePanel(store, studio.analysis),
  );
  const stack = mountToolbar(layout.hudBottom, store);
  mountMotionBar(stack, store, () => studio.motion.presets, studio.task.available);
  mountTaskBar(stack, store, studio.task);
  mountPilotBar(stack, store, studio.pilot, studio.bus);
  mountTrajectoryBar(stack, store, studio.bus, studio.analysis, { list: () => studio.trajectoryPresets(), load: (id) => studio.loadTrajectoryPreset(id) });
  mountMaterialLegend(layout.hudBottom, store, () => studio.session?.assembly ?? null);
  mountPartsCard(layout.hudTop, store, () => studio.session?.assembly ?? null, (o) => studio.viewport.flash(o));
  mountRenderOverlay(layout.stage, studio.recorder);
  mountStageSettings(layout.stage, store);
  bindMobileStage(studio);
  studio.viewport.setSurroundings(store.state.surroundings);
  store.on(['surroundings'], (s) => {
    studio.viewport.setSurroundings(s.surroundings);
    saveSurroundings(s.surroundings);
  });
}
