/** Mount every panel into the layout. */
import { mountBuilder } from '../../ui/builder/panel';
import { ikPanel } from '../../ui/analysis/ik-panel';
import { physicsPanel } from '../../ui/analysis/physics-panel';
import { trajectoryPanel } from '../../ui/analysis/trajectory-panel';
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
import { mountMaterialLegend } from '../../ui/teardown/material-legend';
import { libraryActions } from '../controller/library-actions';
import type { Studio } from '../controller/studio';

export function mountPanels(layout: Layout, studio: Studio): void {
  const { store } = studio;
  const active = () => store.state.library.find((e) => e.id === store.state.activeId);
  mountTopbar(layout.topbar, store, () => [active()?.title ?? '', active()?.subtitle ?? ''], focusPicker(store, studio.bus));
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
    trajectoryPanel(store, studio.analysis),
    physicsPanel(store, studio.bus, studio.analysis),
    workspacePanel(store, studio.analysis),
  );
  const stack = mountToolbar(layout.hudBottom, store);
  mountMotionBar(stack, store, () => studio.motion.presets);
  mountMaterialLegend(layout.hudBottom, store, () => studio.session?.assembly ?? null);
  mountPartsCard(layout.hudTop, store, () => studio.session?.assembly ?? null, (o) => studio.viewport.flash(o));
}
