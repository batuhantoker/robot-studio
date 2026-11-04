/** Caption chip, callouts, the tour director and the idle drift, ticking with the viewport. */
import { Callouts } from '../../../ui/teardown/callouts';
import type { Studio } from '../studio';
import { orbit } from '../viewport-input';
import { TourDirector } from './director';
import { IdleDrift } from './drift';

export function wireTeardownHud(studio: Studio, host: HTMLElement): (dt: number) => void {
  const callouts = new Callouts(host);
  const caption = document.createElement('div');
  caption.className = 'tour-caption cap';
  host.append(caption);
  const tour = new TourDirector(
    studio.store,
    () => studio.session?.assembly.modules.map((m) => m.id) ?? [],
    () => studio.analysis.recolorWorkspace('manipulability'),
    (text) => ((caption.textContent = text ?? ''), (caption.style.display = text ? 'block' : 'none')),
    (radians) => orbit(studio.viewport, radians),
    (axis) => Math.sign(studio.viewport.stage.camera.position[axis] - studio.viewport.stage.controls.target[axis]) || 1,
    () => {
      const { camera, controls } = studio.viewport.stage;
      const position = camera.position.clone();
      const target = controls.target.clone();
      return () => {
        camera.position.copy(position);
        controls.target.copy(target);
      };
    },
  );
  const drift = new IdleDrift(studio.store, (radians) => orbit(studio.viewport, radians));
  studio.store.on(['isolate', 'activeId', 'explode'], (s) => callouts.show(studio.session?.assembly.root ?? null, s.isolate));
  return (dt) => {
    tour.tick(dt);
    drift.tick(dt);
    callouts.update(studio.viewport.stage.camera, host.clientWidth, host.clientHeight);
  };
}
