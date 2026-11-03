/**
 * A lab bench the robot is bolted to or stands at: a centrifuge that closes its lid and spins up, an orbital shaker
 * swirling a plate, a stirrer turning a bar in a beaker, and racks and bottles around them.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { type Scenery, type Stance, block, canvasTexture, cycle, cylinder, ease, glass, moving, paint, spin, standBefore } from './kit';

const WELLS = ['#3d8fe0', '#2e9d6a', '#e0782e', '#d6182b', '#8f5bd6', '#f2b51d'];

const plateTexture = () => canvasTexture(120, 80, (g) => {
  g.fillStyle = '#f4f6f8';
  g.fillRect(0, 0, 120, 80);
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 12; c++) {
      g.fillStyle = WELLS[(r + Math.floor(c / 3)) % WELLS.length];
      g.globalAlpha = 0.55 + 0.45 * (((r * 7 + c * 3) % 5) / 4);
      g.beginPath();
      g.arc(6 + c * 9.8, 6 + r * 9.6, 3.4, 0, 2 * Math.PI);
      g.fill();
    }
  }
}, true);

const rounded = (w: number, d: number, h: number, r: number, m: THREE.Material) => {
  const mesh = new THREE.Mesh(new RoundedBoxGeometry(w, d, h, 3, r), m);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
};

export function buildLab(s: number, height: number, stance?: Stance): Scenery {
  const group = new THREE.Group();
  const seeThrough: THREE.Object3D[] = [];
  const white = paint('#eceef1', 0.4, 0.05);
  const cabinet = paint('#d3d8de', 0.5, 0.1);
  const dark = paint('#2b2f35', 0.5, 0.4);

  const w = 3.0 * s, d = 1.7 * s, t = Math.max(0.025, 0.05 * s), cx = 0.2 * s, cy = 0.15 * s;
  block(group, w, d, t, paint('#f1f2f4', 0.32, 0), cx, cy, -t);
  const front = cy - d / 2;
  const toe = Math.min(0.08, 0.1 * height);
  for (const x0 of [cx - w / 2 + 0.04 * s, cx + w / 2 - 0.84 * s]) {
    const cw = 0.8 * s, ch = height - t - toe, mid = x0 + cw / 2;
    block(group, cw, d - 0.12 * s, ch, cabinet, mid, cy + 0.02 * s, -height + toe);
    block(group, cw - 0.04 * s, d - 0.2 * s, toe, dark, mid, cy + 0.02 * s, -height);
    for (const side of [-1, 1]) {
      block(group, cw / 2 - 0.02 * s, 0.01 * s, ch - 0.04 * s, white, mid + side * cw / 4, front + 0.05 * s, -height + toe + 0.02 * s);
      block(group, 0.012 * s, 0.025 * s, 0.14 * s, paint('#9aa1a9', 0.3, 0.8), mid + side * 0.04 * s, front + 0.035 * s, -t - 0.22 * s);
    }
  }
  block(group, w - 1.7 * s, 0.03 * s, height - t, cabinet, cx, cy + d / 2 - 0.08 * s, -height);

  const cf = new THREE.Group();
  cf.position.set(-0.8 * s, 0.5 * s, 0);
  group.add(cf);
  const ch = 0.24 * s;
  const body = rounded(0.5 * s, 0.46 * s, ch, 0.03 * s, white);
  body.position.z = ch / 2;
  cf.add(body);
  const bowl = cylinder(0.18 * s, 0.004 * s, paint('#1f2328', 0.6, 0.3), 48);
  bowl.position.z = ch + 0.002 * s;
  cf.add(bowl);
  const panel = block(cf, 0.2 * s, 0.006 * s, 0.07 * s, paint('#000000', 0.3, 0, { emissive: '#3d8fe0', emissiveIntensity: 0.25 }), 0.08 * s, -0.232 * s, 0.1 * s);
  panel.castShadow = false;
  const ledMat = paint('#5fe08a', 0.4, 0, { emissive: '#5fe08a', emissiveIntensity: 0 });
  block(cf, 0.022 * s, 0.006 * s, 0.022 * s, ledMat, -0.14 * s, -0.232 * s, 0.12 * s);
  const rotor = moving(new THREE.Group());
  rotor.position.z = ch + 0.004 * s;
  cf.add(rotor);
  const hub = cylinder(0.05 * s, 0.035 * s, paint('#b9bec4', 0.3, 0.85), 32);
  hub.position.z = 0.0175 * s;
  rotor.add(hub);
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    const arm = new THREE.Group();
    arm.rotation.z = a;
    rotor.add(arm);
    block(arm, 0.12 * s, 0.03 * s, 0.014 * s, paint('#b9bec4', 0.3, 0.85), 0.07 * s, 0, 0.01 * s);
    const tube = cylinder(0.019 * s, 0.07 * s, paint(WELLS[i], 0.35), 16);
    tube.position.set(0.13 * s, 0, 0.03 * s);
    tube.rotation.y = 0.6;
    arm.add(tube);
  }
  // The lid hangs from a hinge along the back edge; its window pane lives with the other glass.
  const hingeAt = new THREE.Vector3(0, 0.23 * s, ch);
  const lid = moving(new THREE.Group());
  lid.position.copy(hingeAt);
  cf.add(lid);
  const lidShell = rounded(0.48 * s, 0.44 * s, 0.035 * s, 0.015 * s, white);
  lidShell.position.set(0, -0.22 * s, 0.0175 * s);
  lid.add(lidShell);
  const rim = cylinder(0.12 * s, 0.006 * s, dark, 40);
  rim.position.set(0, -0.22 * s, 0.036 * s);
  lid.add(rim);
  const lidGlass = moving(new THREE.Group());
  lidGlass.position.copy(hingeAt).add(cf.position);
  const pane = cylinder(0.1 * s, 0.004 * s, glass('#cfe0ea', 0.3), 40);
  pane.castShadow = false;
  pane.position.set(0, -0.22 * s, 0.04 * s);
  lidGlass.add(pane);
  seeThrough.push(lidGlass);

  const sh = new THREE.Group();
  sh.position.set(0.75 * s, 0.62 * s, 0);
  group.add(sh);
  const shBase = rounded(0.42 * s, 0.36 * s, 0.1 * s, 0.02 * s, paint('#dfe3e8', 0.45, 0.1));
  shBase.position.z = 0.05 * s;
  sh.add(shBase);
  block(sh, 0.3 * s, 0.006 * s, 0.04 * s, dark, 0, -0.181 * s, 0.03 * s);
  const knob = cylinder(0.018 * s, 0.016 * s, paint('#9aa1a9', 0.35, 0.6), 20).rotateX(Math.PI / 2);
  knob.position.set(0.11 * s, -0.19 * s, 0.05 * s);
  sh.add(knob);
  const deck = moving(new THREE.Group());
  deck.position.z = 0.11 * s;
  sh.add(deck);
  block(deck, 0.4 * s, 0.34 * s, 0.014 * s, paint('#b9bec4', 0.32, 0.85));
  block(deck, 0.27 * s, 0.185 * s, 0.035 * s, paint('#ffffff', 0.35, 0, { map: plateTexture() }), 0, 0, 0.014 * s);

  const st = new THREE.Group();
  st.position.set(1.28 * s, 0.42 * s, 0);
  group.add(st);
  const stBase = rounded(0.24 * s, 0.3 * s, 0.08 * s, 0.015 * s, white);
  stBase.position.z = 0.04 * s;
  st.add(stBase);
  block(st, 0.2 * s, 0.2 * s, 0.006 * s, paint('#c9ced5', 0.25, 0.1), 0, 0.03 * s, 0.08 * s);
  for (const x of [-0.06, 0.06]) {
    const k = cylinder(0.016 * s, 0.016 * s, paint('#d6182b', 0.4), 20).rotateX(Math.PI / 2);
    k.position.set(x * s, -0.155 * s, 0.04 * s);
    st.add(k);
  }
  const floorZ = 0.086 * s, beakerR = 0.07 * s;
  const bar = moving(new THREE.Mesh(new THREE.CapsuleGeometry(0.008 * s, 0.05 * s, 4, 12).rotateZ(Math.PI / 2), paint('#ffffff', 0.3)));
  bar.position.set(st.position.x, st.position.y + 0.03 * s, floorZ + 0.008 * s);
  group.add(bar);
  const beaker = new THREE.Mesh(new THREE.CylinderGeometry(beakerR, beakerR, 0.15 * s, 40, 1, true).rotateX(Math.PI / 2), glass('#dfeaf0', 0.22));
  beaker.position.set(bar.position.x, bar.position.y, floorZ + 0.075 * s);
  const liquid = new THREE.Mesh(new THREE.CylinderGeometry(beakerR * 0.96, beakerR * 0.96, 0.085 * s, 40).rotateX(Math.PI / 2),
    paint('#3d8fe0', 0.1, 0, { transparent: true, opacity: 0.42, depthWrite: false }));
  liquid.position.set(bar.position.x, bar.position.y, floorZ + 0.0425 * s);
  seeThrough.push(beaker, liquid);

  const rack = new THREE.Group();
  rack.position.set(-0.12 * s, 0.78 * s, 0);
  group.add(rack);
  block(rack, 0.38 * s, 0.14 * s, 0.06 * s, white);
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 2; j++) {
      const x = (i - 2.5) * 0.058 * s, y = (j - 0.5) * 0.06 * s;
      const tube = cylinder(0.016 * s, 0.12 * s, paint('#e3eaef', 0.25), 16);
      tube.position.set(x, y, 0.07 * s);
      const cap = cylinder(0.019 * s, 0.022 * s, paint(WELLS[(i + j * 3) % WELLS.length], 0.45), 16);
      cap.position.set(x, y, 0.141 * s);
      rack.add(tube, cap);
    }
  }
  const tips = new THREE.Group();
  tips.position.set(1.25 * s, -0.33 * s, 0);
  group.add(tips);
  block(tips, 0.17 * s, 0.12 * s, 0.07 * s, paint('#2f6fd0', 0.45));
  block(tips, 0.16 * s, 0.11 * s, 0.006 * s, paint('#f2d16b', 0.5), 0, 0, 0.07 * s);
  const bottles = new THREE.Group();
  bottles.position.set(-1.05 * s, -0.32 * s, 0);
  group.add(bottles);
  [[-0.08, 0, 0.17], [0.03, 0.03, 0.14], [0.12, -0.03, 0.12]].forEach(([x, y, h], i) => {
    const amber = cylinder(0.042 * s, h * s, paint(i === 2 ? '#e9eef2' : '#6b3d14', 0.15, 0.1), 28);
    amber.position.set(x * s, y * s, (h * s) / 2);
    const neck = cylinder(0.02 * s, 0.03 * s, paint('#2f6fd0', 0.5), 20);
    neck.position.set(x * s, y * s, h * s + 0.015 * s);
    bottles.add(amber, neck);
  });

  const period = 14;
  return standBefore({
    group,
    seeThrough,
    pose(time) {
      const x = cycle(time, period);
      const open = x < 1 ? 1 - ease(x) : x < 11.5 ? 0 : x < 12.5 ? ease(x - 11.5) : 1;
      lid.rotation.x = lidGlass.rotation.x = -1.75 * open;
      rotor.rotation.z = spin(time - 1, 2 * Math.PI * 3, 2, 5, 3, 4);
      ledMat.emissiveIntensity = x > 1 && x < 11 ? 1.4 : 0.2;
      const orbit = 2 * Math.PI * 2.2 * time, r = 0.016 * s;
      deck.position.x = r * Math.cos(orbit);
      deck.position.y = r * Math.sin(orbit);
      bar.rotation.z = 2 * Math.PI * 1.5 * time;
    },
  }, front, stance);
}
