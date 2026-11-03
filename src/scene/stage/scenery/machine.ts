/**
 * Machine tending: a CNC mill behind the robot whose glass doors part for loading, then close while the
 * spindle plunges and traverses; a stack light tells the two apart. A parts table stands within reach.
 */
import * as THREE from 'three';
import { type Scenery, type Stance, YELLOW, blink, block, canvasTexture, cycle, cylinder, ease, floorStrip, glass, moving, paint, spin, stackLight } from './kit';

const screenTexture = () => canvasTexture(128, 96, (g) => {
  g.fillStyle = '#0e1a2b';
  g.fillRect(0, 0, 128, 96);
  g.fillStyle = '#1f3a5f';
  g.fillRect(0, 0, 128, 12);
  g.strokeStyle = '#5fd0ff';
  g.lineWidth = 2;
  g.beginPath();
  for (let x = 0; x <= 70; x += 2) g.lineTo(8 + x, 52 + 18 * Math.sin(x / 7) * Math.cos(x / 23));
  g.stroke();
  g.fillStyle = '#3c5a80';
  for (let i = 0; i < 5; i++) g.fillRect(88, 22 + i * 13, 30 - (i % 3) * 7, 6);
  g.fillStyle = '#5fe08a';
  g.fillRect(8, 82, 60, 6);
}, true);

export function buildMachine(s: number, _drop = 0, stance?: Stance): Scenery {
  const group = new THREE.Group();
  const seeThrough: THREE.Object3D[] = [];
  const shell = paint('#e4e6e9', 0.42, 0.1);
  const trim = paint('#cfd3d8', 0.42, 0.15);
  const dark = paint('#2b2f35', 0.5, 0.4);
  const liner = paint('#5d636b', 0.5, 0.55);
  const steel = paint('#b9bec4', 0.32, 0.85);

  // The mill: front face at y = 0 of its own frame, body toward +y. A bolted arm reaches it behind; a standing
  // robot has it at its left, the vise raised to its hands, and the parts table in front (a mill ahead would hide it).
  const standing = !!stance?.standing;
  const lift = standing ? Math.max(0, stance.hand - 0.78 * s) : 0;
  const W = 2.1 * s, D = 1.25 * s, H = 1.95 * s + lift;
  const ox0 = -0.55 * s, ox1 = 0.35 * s, zs = 0.6 * s + lift, zh = 1.45 * s + lift, plinth = 0.1 * s;
  const mill = new THREE.Group();
  if (standing) mill.position.set(-(ox0 + ox1) / 2, (stance.front ?? 0.3 * s) + 0.06 * s, 0);
  else mill.position.set(-0.35 * s, 1.45 * s, 0);
  group.add(mill);
  block(mill, W - 0.06 * s, D - 0.06 * s, plinth, dark, 0, D / 2);
  block(mill, W, D, zs - plinth, shell, 0, D / 2, plinth);
  block(mill, W, D, H - zh, shell, 0, D / 2, zh);
  block(mill, ox0 + W / 2, D, zh - zs, shell, (-W / 2 + ox0) / 2, D / 2, zs);
  block(mill, W / 2 - ox1, D, zh - zs, shell, (ox1 + W / 2) / 2, D / 2, zs);
  block(mill, W * 1.002, 0.02 * s, 0.14 * s, dark, 0, -0.005 * s, H - 0.26 * s);
  const cw = ox1 - ox0, cx = (ox0 + ox1) / 2;
  block(mill, cw, 0.05 * s, zh - zs, liner, cx, D - 0.2 * s, zs);
  for (const x of [ox0 + 0.01 * s, ox1 - 0.01 * s]) block(mill, 0.02 * s, D - 0.2 * s, zh - zs, liner, x, (D - 0.2 * s) / 2, zs);
  block(mill, cw, D - 0.2 * s, 0.02 * s, liner, cx, (D - 0.2 * s) / 2, zh - 0.02 * s);
  block(mill, cw, D - 0.2 * s, 0.015 * s, paint('#454b52', 0.6, 0.4), cx, (D - 0.2 * s) / 2, zs);
  const lamp = block(mill, cw * 0.8, 0.03 * s, 0.012 * s, paint('#ffffff', 0.4, 0, { emissive: '#f4f8ff', emissiveIntensity: 1.4 }), cx, 0.1 * s, zh - 0.034 * s);
  lamp.castShadow = false;

  const ty = 0.55 * s;
  block(mill, 0.76 * s, 0.5 * s, 0.05 * s, steel, cx, ty, zs);
  block(mill, 0.24 * s, 0.15 * s, 0.07 * s, paint('#3c4a5e', 0.45, 0.5), cx, ty, zs + 0.05 * s);
  for (const side of [-1, 1]) block(mill, 0.24 * s, 0.025 * s, 0.05 * s, steel, cx, ty + side * 0.065 * s, zs + 0.12 * s);
  const partTop = zs + 0.12 * s + 0.06 * s;
  block(mill, 0.17 * s, 0.1 * s, 0.06 * s, paint('#d4d8dd', 0.25, 0.9), cx, ty, zs + 0.12 * s);

  // Spindle head, built down to the tool tip at its origin; the ram reaches up into the header.
  const head = moving(new THREE.Group());
  mill.add(head);
  const toolLen = 0.09 * s;
  const tool = cylinder(0.012 * s, toolLen, paint('#e8eaed', 0.2, 0.95), 16);
  tool.position.z = toolLen / 2;
  const spinner = new THREE.Group();
  spinner.position.z = toolLen;
  const holder = cylinder(0.04 * s, 0.07 * s, dark, 24, 0.02 * s);
  holder.position.z = 0.035 * s;
  const flat = block(spinner, 0.02 * s, 0.084 * s, 0.03 * s, steel, 0, 0, 0.02 * s);
  flat.castShadow = false;
  spinner.add(holder);
  const nose = cylinder(0.065 * s, 0.08 * s, paint('#4a4f57', 0.4, 0.6), 32);
  nose.position.z = toolLen + 0.07 * s + 0.04 * s;
  block(head, 0.24 * s, 0.28 * s, 0.55 * s, paint('#4a4f57', 0.45, 0.5), 0, 0.06 * s, toolLen + 0.15 * s);
  head.add(tool, spinner, nose);
  const parkZ = zh - toolLen - 0.27 * s, cutZ = partTop - 0.01 * s;

  const leafW = cw / 2 + 0.02 * s, leafH = zh - zs + 0.08 * s, leafY = -0.035 * s, bar = 0.04 * s;
  const leaves = [-1, 1].map((side) => {
    const leaf = moving(new THREE.Group());
    leaf.position.set(0, leafY, zs - 0.04 * s);
    block(leaf, leafW, 0.025 * s, bar, trim, 0, 0, 0);
    block(leaf, leafW, 0.025 * s, bar * 1.6, trim, 0, 0, leafH - bar * 1.6);
    block(leaf, bar, 0.025 * s, leafH, trim, -leafW / 2 + bar / 2, 0, 0);
    block(leaf, bar, 0.025 * s, leafH, trim, leafW / 2 - bar / 2, 0, 0);
    block(leaf, 0.025 * s, 0.03 * s, leafH * 0.4, dark, -side * (leafW / 2 - bar * 1.6), -0.03 * s, leafH * 0.3);
    mill.add(leaf);
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(leafW - 2 * bar, leafH - 2.6 * bar).rotateX(Math.PI / 2), glass());
    const paneRoot = moving(new THREE.Group());
    paneRoot.position.copy(mill.position);
    paneRoot.rotation.copy(mill.rotation);
    pane.position.set(0, leafY, zs - 0.04 * s + bar + (leafH - 2.6 * bar) / 2);
    paneRoot.add(pane);
    seeThrough.push(paneRoot);
    const closed = side < 0 ? ox0 + leafW / 2 : ox1 - leafW / 2;
    return { leaf, pane, closed, travel: side * leafW * 0.96 };
  });

  const pendant = new THREE.Group();
  pendant.position.set(W / 2 + 0.06 * s, -0.12 * s, 0.95 * s + lift);
  pendant.rotation.z = 0.35;
  mill.add(pendant);
  block(pendant, 0.04 * s, 0.2 * s, 0.04 * s, dark, -0.04 * s, 0.1 * s, 0.14 * s);
  block(pendant, 0.36 * s, 0.07 * s, 0.3 * s, paint('#3a3f46', 0.5, 0.3), 0.08 * s, 0, 0);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.26 * s, 0.19 * s).rotateX(Math.PI / 2),
    paint('#000000', 0.3, 0, { emissive: '#ffffff', emissiveMap: screenTexture(), emissiveIntensity: 0.9 }));
  screen.position.set(0.06 * s, -0.0355 * s, 0.17 * s);
  pendant.add(screen);
  for (let i = 0; i < 4; i++) {
    const key = cylinder(0.012 * s, 0.01 * s, paint(i === 3 ? '#d6182b' : '#9aa1a9', 0.5), 12).rotateX(Math.PI / 2);
    key.position.set(0.19 * s, -0.037 * s, 0.22 * s - i * 0.05 * s);
    pendant.add(key);
  }

  const light = stackLight(s);
  light.group.position.set(W / 2 - 0.14 * s, D - 0.2 * s, H);
  mill.add(light.group);

  const line = paint(YELLOW, 0.7, 0, { polygonOffset: true, polygonOffsetFactor: -4 });
  const lw = 0.035 * s;
  floorStrip(mill, line, -W / 2 - 0.12 * s, -0.45 * s, W / 2 + 0.12 * s, -0.45 * s, lw);
  for (const x of [-W / 2 - 0.12 * s, W / 2 + 0.12 * s]) floorStrip(mill, line, x, -0.45 * s, x, D + 0.12 * s, lw);

  const table = new THREE.Group();
  if (standing) table.position.set((stance.front ?? 0.3 * s) + 0.36 * s, -0.2 * s, 0);
  else table.position.set(-1.35 * s, 0.3 * s, 0);
  group.add(table);
  const th = standing ? stance.hand - 0.02 * s : 0.5 * s;
  block(table, 0.72 * s, 0.56 * s, 0.035 * s, paint('#5b6672', 0.45, 0.6), 0, 0, th - 0.035 * s);
  for (const [x, y] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) block(table, 0.035 * s, 0.035 * s, th - 0.035 * s, dark, x * 0.32 * s, y * 0.24 * s);
  block(table, 0.6 * s, 0.44 * s, 0.02 * s, steel, 0, 0, th);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 3; j++) {
      if ((i * 3 + j) % 5 === 1) continue;
      const blank = cylinder(0.034 * s, 0.07 * s, paint('#cdd2d8', 0.28, 0.9), 24);
      blank.position.set((i - 1.5) * 0.13 * s, (j - 1) * 0.13 * s, th + 0.02 * s + 0.035 * s);
      table.add(blank);
    }
  }

  const period = 16;
  return {
    group,
    seeThrough,
    pose(t) {
      const x = cycle(t, period);
      const open = x < 1.2 ? ease(x / 1.2) : x < 5.5 ? 1 : x < 6.7 ? 1 - ease((x - 5.5) / 1.2) : 0;
      for (const l of leaves) l.leaf.position.x = l.pane.position.x = l.closed + l.travel * open;
      const down = x < 7 ? 0 : x < 7.6 ? ease((x - 7) / 0.6) : x < 14.4 ? 1 : x < 15 ? 1 - ease((x - 14.4) / 0.6) : 0;
      const across = x > 7.6 && x < 14.4 ? 0.07 * s * Math.sin((2 * Math.PI * (x - 7.6)) / 3.4) : 0;
      head.position.set(cx + across, ty, parkZ + (cutZ - parkZ) * down);
      spinner.rotation.z = tool.rotation.z = spin(t - 6.8, 2 * Math.PI * 5, 0.5, 7.6, 0.6, period - 8.7);
      light.set(0, x < 6.7 ? blink(t, 0.8) : 0, x < 6.7 ? 0 : 1);
    },
  };
}
