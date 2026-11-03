/** On phones: handles sized for fingers, and the scene kept in view beside the bars and above an open sheet. */
import { isMobile, onMobileChange } from '../../ui/shell/mobile/media';
import type { Studio } from './studio';

const landscape = matchMedia('(max-height: 500px) and (min-aspect-ratio: 1/1)');

export function bindMobileStage(studio: Studio): void {
  let touch: boolean | null = null;
  const hud = document.querySelector<HTMLElement>('.hud.bottom');
  const apply = () => {
    const mobile = isMobile();
    if (mobile !== touch) {
      touch = mobile;
      studio.overlays.setTouch(mobile);
      studio.analysis.refreshStops();
    }
    const live = mobile && !studio.store.state.rendering;
    // The sheet sits right on the stage's bottom edge; its layout height ignores the slide-in transform.
    const sheet = live ? document.querySelector<HTMLElement>('.side.sheet') : null;
    const stage = studio.viewport.stage.renderer.domElement.clientHeight;
    // In landscape the bars are a column on the left; frame the robot in the rest.
    const bars = live && !sheet && landscape.matches && hud?.offsetParent ? hud.offsetWidth + 16 : 0;
    studio.viewport.setInsets(sheet ? Math.min(sheet.offsetHeight, 0.8 * stage) : 0, bars);
  };
  onMobileChange(apply);
  landscape.addEventListener('change', apply);
  new MutationObserver(apply).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  if (hud) new ResizeObserver(apply).observe(hud);
  studio.store.on(['rendering'], apply);
  apply();
}
