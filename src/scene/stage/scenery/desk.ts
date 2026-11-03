/** A desk the robot is bolted to, or stands at, with an indexing turntable presenting parts beside it. */
import * as THREE from 'three';
import { type Scenery, type Stance, block, box, cycle, cylinder, ease, moving, paint, standBefore } from './kit';

export function buildDesk(s: number, height: number, stance?: Stance): Scenery {
  const group = new THREE.Group();
  const top = paint('#d9c4a3', 0.55);
  const steel = paint('#4a4f56', 0.4, 0.75);
  const w = 2.9 * s, d = 1.7 * s, t = Math.max(0.025, 0.06 * s);
  const cx = 0.55 * s;
  const slab = box(w, d, t, top);
  slab.position.set(cx, 0, -t / 2);
  group.add(slab);
  const leg = Math.max(0.03, 0.07 * s);
  for (const [x, y] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
    const l = box(leg, leg, height - t, steel);
    l.position.set(cx + x * (w / 2 - leg), y * (d / 2 - leg), -t - (height - t) / 2);
    group.add(l);
  }
  // A rail along the back stiffens the frame and reads as furniture rather than a plank.
  const rail = box(w - 2 * leg, leg * 0.6, leg * 1.4, steel);
  rail.position.set(cx, d / 2 - leg, -t - leg);
  group.add(rail);

  const R = 0.27 * s;
  const table = new THREE.Group();
  table.position.set(1.15 * s, 0.5 * s, 0);
  group.add(table);
  const housing = cylinder(R * 1.1, 0.05 * s, paint('#2d3136', 0.45, 0.4), 48);
  housing.position.z = 0.025 * s;
  const led = cylinder(R * 1.104, 0.008 * s, paint('#38c172', 0.4, 0, { emissive: '#38c172', emissiveIntensity: 0.8 }), 48);
  led.position.z = 0.036 * s;
  table.add(housing, led);
  const platter = moving(new THREE.Group());
  platter.position.z = 0.05 * s;
  table.add(platter);
  const disc = cylinder(R, 0.022 * s, paint('#b9bec4', 0.3, 0.85), 64);
  disc.position.z = 0.011 * s;
  platter.add(disc);
  const parts = ['#d6182b', '#2f6fd0', '#e0782e'];
  parts.forEach((c, i) => {
    const a = (i * 2 * Math.PI) / 3;
    const nest = block(platter, 0.13 * s, 0.13 * s, 0.012 * s, paint('#3a3f45', 0.6, 0.3), 0.6 * R * Math.cos(a), 0.6 * R * Math.sin(a), 0.022 * s);
    nest.rotation.z = a;
    const part = block(platter, 0.085 * s, 0.085 * s, 0.085 * s, paint(c, 0.45), 0.6 * R * Math.cos(a), 0.6 * R * Math.sin(a), 0.034 * s);
    part.rotation.z = a;
  });

  // Turns a third, then dwells, like a part presenter waiting for the next pick.
  const index = 3.4, turn = 1.1;
  return standBefore({
    group,
    pose(time) {
      const k = Math.floor(time / index);
      platter.rotation.z = ((k + ease(cycle(time, index) / turn)) * 2 * Math.PI) / 3;
      (led.material as THREE.MeshStandardMaterial).emissiveIntensity = cycle(time, index) < turn ? 1.4 : 0.6;
    },
  }, -d / 2, stance);
}
