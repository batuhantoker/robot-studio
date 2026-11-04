/** Keeps the scene framed in the part of the stage the dock and sheets leave free; on phones, handles sized for fingers. */
import { isMobile, onMobileChange } from '../../ui/shell/mobile/media';
import type { Studio } from './studio';

const landscape = matchMedia('(max-height: 500px) and (min-aspect-ratio: 1/1)');
const GAP = 14;

export function bindMobileStage(studio: Studio): void {
  let touch: boolean | null = null;
  const hud = document.querySelector<HTMLElement>('.hud.bottom');
  const tools = document.querySelector<HTMLElement>('.stage-tools');
  const apply = () => {
    const mobile = isMobile();
    if (mobile !== touch) {
      touch = mobile;
      studio.overlays.setTouch(mobile);
      studio.analysis.refreshStops();
    }
    const live = !studio.store.state.rendering;
    // The sheet sits right on the stage's bottom edge; its layout height ignores the slide-in transform.
    const sheet = live && mobile ? document.querySelector<HTMLElement>('.side.sheet') : null;
    const stage = studio.viewport.stage.renderer.domElement.clientHeight;
    const docked = live && !sheet && !!hud?.offsetParent && hud.offsetHeight > 0;
    // In phone landscape the bars are a column on the left; frame the robot in the rest.
    const side = docked && mobile && landscape.matches;
    // The stop editor comes and goes while a stop is dragged; the view must not shift under the pointer.
    const edit = hud?.querySelector<HTMLElement>('.stop-edit');
    const dock = docked ? hud!.offsetHeight - (edit?.offsetParent ? edit.offsetHeight : 0) : 0;
    const bottom = sheet ? Math.min(sheet.offsetHeight, 0.8 * stage) : docked && !side ? Math.min(dock + GAP, 0.4 * stage) : 0;
    // The stage buttons' column on the right takes back part of the left inset; setPanelInset belongs to the On stage panel.
    studio.viewport.setInsets(bottom, side ? Math.max(0, hud!.offsetWidth + 16 - (tools?.offsetWidth ?? 0) - 8) : 0);
  };
  onMobileChange(apply);
  landscape.addEventListener('change', apply);
  new MutationObserver(apply).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  if (hud) new ResizeObserver(apply).observe(hud);
  studio.store.on(['rendering'], apply);
  apply();
}
