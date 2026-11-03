/**
 * A small production cell: safety fence on the two far sides, hazard tape, and a running conveyor that
 * carries parcels in through the fence and out past the robot, between curtained hoods at its ends.
 */
import * as THREE from 'three';
import { type Scenery, type Stance, YELLOW, blink, block, box, canvasTexture, cycle, floorStrip, hazardTexture, moving, paint, stackLight, tapeMaterial } from './kit';

// Welded wire mesh: opaque wires, open cells.
const meshAlpha = () => canvasTexture(64, 64, (g) => {
  g.fillStyle = '#000';
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#fff';
  g.fillRect(0, 0, 64, 5);
  g.fillRect(0, 0, 5, 64);
});

// Rubber belt with a lighter cleat every quarter tile, so its travel reads.
const beltTexture = () => canvasTexture(64, 64, (g) => {
  g.fillStyle = '#2a2d31';
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#3d4248';
  for (let x = 0; x < 64; x += 16) g.fillRect(x, 0, 3, 64);
}, true);

export function buildCell(s: number, _drop = 0, stance?: Stance): Scenery {
  const group = new THREE.Group();
  const yellow = paint(YELLOW, 0.45, 0.2);
  const wire = new THREE.MeshStandardMaterial({
    color: '#2f3338', roughness: 0.5, metalness: 0.6, alphaMap: meshAlpha(), alphaTest: 0.5, side: THREE.DoubleSide,
  });
  const alu = paint('#b9bec4', 0.35, 0.8);
  const hoodPaint = paint('#5f6b78', 0.5, 0.35);
  const flap = paint('#1d2024', 0.85);
  const seeThrough: THREE.Object3D[] = [];

  const a = 2.3 * s; // half-size of the fenced square
  const h = 2.4 * s; // fence height
  const post = Math.max(0.02, 0.055 * s);
  const cw = 0.5 * s; // conveyor width
  // A bolted arm reaches back to a belt behind it; a standing robot works a belt across its front at hand height.
  const standing = !!stance?.standing;
  const across = standing ? (stance.front ?? 0.3 * s) + cw / 2 + 0.06 * s : 1.3 * s;
  const ch = standing ? stance.hand - 0.0175 * s : 0.5 * s; // belt height
  const gap = [across - cw / 2 - post, across + cw / 2 + post];

  const panel = (x0: number, y0: number, x1: number, y1: number) => {
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len < post * 2) return;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len, h * 0.86), wire);
    const uv = m.geometry.attributes.uv as THREE.BufferAttribute;
    const cells = (len / (h * 0.86)) * 18;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * cells, uv.getY(i) * 18);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, h * 0.07 + (h * 0.86) / 2);
    m.rotation.set(Math.PI / 2, Math.atan2(y1 - y0, x1 - x0), 0, 'ZXY');
    seeThrough.push(m);
    for (const z of [h * 0.07, h * 0.93]) {
      const r = box(len, post * 0.5, post * 0.5, yellow);
      r.position.set((x0 + x1) / 2, (y0 + y1) / 2, z);
      r.rotation.z = Math.atan2(y1 - y0, x1 - x0);
      group.add(r);
    }
  };
  const upright = (x: number, y: number, tall = h) => block(group, post, post, tall, yellow, x, y);

  // Fence on the two far sides (-x, +y); the near sides stay open to the camera, as a cutaway would,
  // marked only by tape (a post at the near corner would stand in the default line of sight).
  // The conveyor enters through a gap in one of them.
  if (standing) {
    panel(-a, -a, -a, a);
    panel(-a, a, gap[0], a);
    panel(gap[1], a, a, a);
    for (const [x, y] of [[-a, -a], [-a, a], [gap[0], a], [gap[1], a], [a, a]]) upright(x, y);
  } else {
    panel(-a, -a, -a, gap[0]);
    panel(-a, gap[1], -a, a);
    panel(-a, a, a, a);
    for (const [x, y] of [[-a, -a], [-a, gap[0]], [-a, gap[1]], [-a, a], [a, a]]) upright(x, y);
  }

  // The conveyor, built along its own x from outside the fence to past the open side.
  const line = new THREE.Group();
  if (standing) {
    line.rotation.z = -Math.PI / 2;
    line.position.x = across;
  } else line.position.y = across;
  group.add(line);
  const x0 = -a - 1.3 * s, x1 = a + 0.9 * s;
  const len = x1 - x0, mid = (x0 + x1) / 2;
  const tile = 0.4 * s;
  const beltMap = beltTexture();
  beltMap.repeat.set(len / tile, 1);
  const belt = box(len, cw, 0.035 * s, paint('#ffffff', 0.9, 0, { map: beltMap }));
  belt.position.set(mid, 0, ch);
  line.add(belt);
  for (const side of [-1, 1]) {
    const rail = box(len, 0.04 * s, 0.13 * s, alu);
    rail.position.set(mid, side * (cw / 2 + 0.02 * s), ch - 0.025 * s);
    line.add(rail);
    for (let i = 0; i <= 4; i++) {
      block(line, 0.04 * s, 0.04 * s, ch - 0.08 * s, alu, x0 + 0.15 * s + ((len - 0.3 * s) * i) / 4, side * (cw / 2));
    }
  }
  const drumR = 0.05 * s;
  const drums = [x0, x1].map((x) => {
    const drum = moving(new THREE.Mesh(new THREE.CylinderGeometry(drumR, drumR, cw, 24), alu));
    drum.position.set(x, 0, ch - 0.015 * s);
    drum.castShadow = true;
    line.add(drum);
    return drum;
  });

  // Parcels wrap around inside the hoods, out of sight behind the strip curtains.
  const hoodLen = 0.62 * s, hoodH = 0.36 * s, wall = 0.02 * s, beltTop = ch + 0.0175 * s;
  const hood = (xs: number, dir: 1 | -1) => {
    const hx = xs + (dir * hoodLen) / 2;
    for (const side of [-1, 1]) block(line, hoodLen, wall, hoodH + 0.06 * s, hoodPaint, hx, side * (cw / 2 + 0.05 * s), beltTop - 0.06 * s);
    block(line, hoodLen, cw + 0.12 * s, wall * 1.5, hoodPaint, hx, 0, beltTop + hoodH);
    block(line, wall, cw + 0.12 * s, hoodH, hoodPaint, xs - dir * wall * 0.5, 0, beltTop);
    const mouth = xs + dir * hoodLen;
    const strips = 7, sw = (cw + 0.08 * s) / strips;
    for (let i = 0; i < strips; i++) {
      block(line, 0.006 * s, sw * 0.92, hoodH - 0.01 * s, flap, mouth - dir * 0.01 * s, -(cw + 0.08 * s) / 2 + sw * (i + 0.5), beltTop + 0.01 * s);
    }
  };
  hood(x0 - 0.06 * s, 1);
  hood(x1 + 0.06 * s, -1);

  const card = [paint('#c39a6b', 0.85), paint('#b4885a', 0.85), paint('#d4b48c', 0.85)];
  const tape = paint('#9b7440', 0.6);
  const start = x0 + 0.2 * s, span = x1 - 0.2 * s - start;
  const sizes = [[0.24, 0.22, 0.17], [0.2, 0.26, 0.14], [0.26, 0.2, 0.18], [0.22, 0.24, 0.15], [0.18, 0.18, 0.2], [0.25, 0.21, 0.13]];
  const parcels = sizes.map(([w, d, t], i) => {
    const p = moving(new THREE.Group());
    block(p, w * s, d * s, t * s, card[i % 3]);
    block(p, w * s * 1.004, d * s * 0.24, 0.004 * s, tape, 0, 0, t * s);
    p.position.set(0, ((i * 37) % 7 - 3) * 0.012 * s, beltTop);
    p.rotation.z = ((i * 53) % 9 - 4) * 0.025;
    line.add(p);
    return { p, offset: (span * (i + 0.15 * ((i * 7) % 3))) / sizes.length };
  });
  const speed = 0.3 * s;

  const lamp = stackLight(s);
  if (standing) lamp.group.position.set(gap[1], a, h);
  else lamp.group.position.set(-a, gap[1], h);
  group.add(lamp.group);

  // Hazard tape around the cell.
  const tapeMat = tapeMaterial(hazardTexture());
  const tw = 0.1 * s;
  floorStrip(group, tapeMat, -a - 2 * tw, -a - tw, a + 2 * tw, -a - tw, tw);
  floorStrip(group, tapeMat, -a - 2 * tw, a + tw, a + 2 * tw, a + tw, tw);
  floorStrip(group, tapeMat, -a - tw, -a, -a - tw, a, tw);
  floorStrip(group, tapeMat, a + tw, -a, a + tw, a, tw);

  return {
    group,
    seeThrough,
    pose(t) {
      const travel = speed * t;
      beltMap.offset.x = -cycle(travel / tile, 1);
      for (const d of drums) d.rotation.y = travel / drumR;
      for (const { p, offset } of parcels) p.position.x = start + cycle(offset + travel, span);
      // Amber flashes as a batch arrives; green otherwise.
      lamp.set(0, cycle(t, 12) < 2.4 ? blink(t, 0.6) : 0, 1);
    },
  };
}
