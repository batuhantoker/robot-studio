/** Caption chip, callouts, and the tour director, ticking with the viewport. */
import { Callouts } from '../../../ui/teardown/callouts';
import type { Studio } from '../studio';
import { orbit } from '../viewport-input';
import { TourDirector } from './director';

export function wireTeardownHud(studio: Studio, host: HTMLElement): (dt: number) => void {
  const callouts = new Callouts(host);
  const caption = document.createElement('div');
  caption.className = 'tour-caption cap';
  host.append(caption);
  const tour = new TourDirector(
    studio.store,
    () => studio.session?.assembly.modules.map((m) => m.id) ?? [],
    () => studio.analysis.runWorkspace(2500, 'manipulability'),
    (text) => ((caption.textContent = text ?? ''), (caption.style.display = text ? '' : 'none')),
    (radians) => orbit(studio.viewport, radians),
  );
  studio.store.on(['isolate', 'activeId', 'explode'], (s) => callouts.show(studio.session?.assembly.root ?? null, s.isolate));
  return (dt) => {
    tour.tick(dt);
    callouts.update(studio.viewport.stage.camera, host.clientWidth, host.clientHeight);
  };
}
