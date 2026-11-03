/** Labels with thin leaders from the isolated module's main parts, re-projected every frame. */
import * as THREE from 'three';
import { moduleOf } from '../../cad/assembly/types';
import { partOf } from '../../cad/common/part';
import { h } from '../dom/h';

const MAX = 7;

export class Callouts {
  private readonly svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  private readonly layer = h('div', { style: 'position:absolute;inset:0;pointer-events:none;z-index:2' });
  private items: { anchor: THREE.Object3D; label: HTMLElement; line: SVGLineElement }[] = [];

  constructor(host: HTMLElement) {
    this.svg.setAttribute('style', 'position:absolute;inset:0;width:100%;height:100%;overflow:visible');
    this.layer.append(this.svg);
    host.append(this.layer);
  }

  show(root: THREE.Object3D | null, module: string | null): void {
    this.clear();
    if (!root || !module) return;
    const seen = new Set<string>();
    root.traverse((o) => {
      const meta = partOf(o);
      if (!meta || meta.layer === 'kinematic' || this.items.length >= MAX || moduleOf(o) !== module || seen.has(meta.label)) return;
      seen.add(meta.label);
      const label = h('div.call', { style: 'position:absolute;white-space:nowrap;font:600 11px var(--sans)' }, meta.label,
        h('div.cap.mu', { style: 'font-size:8.4px;margin-top:1px' }, meta.layer));
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('stroke', '#16181b');
      line.setAttribute('stroke-width', '0.8');
      this.svg.append(line);
      this.layer.append(label);
      this.items.push({ anchor: o, label, line });
    });
  }

  update(camera: THREE.Camera, width: number, height: number): void {
    if (!this.items.length) return;
    const screen = this.items.map(({ anchor }) => {
      const box = new THREE.Box3().setFromObject(anchor);
      const p = box.getCenter(new THREE.Vector3()).project(camera);
      return new THREE.Vector2((p.x * 0.5 + 0.5) * width, (-p.y * 0.5 + 0.5) * height);
    });
    const centre = screen.reduce((a, b) => a.clone().add(b), new THREE.Vector2()).multiplyScalar(1 / screen.length);
    this.items.forEach(({ label, line }, i) => {
      const a = screen[i];
      const angle = (i / this.items.length) * Math.PI * 2 - Math.PI / 2;
      const out = centre.clone().add(new THREE.Vector2(Math.cos(angle), Math.sin(angle)).multiplyScalar(Math.min(width, height) * 0.3));
      label.style.left = `${out.x + (Math.cos(angle) < 0 ? -label.offsetWidth - 6 : 6)}px`;
      label.style.top = `${out.y - 8}px`;
      for (const [k, v] of [['x1', a.x], ['y1', a.y], ['x2', out.x], ['y2', out.y]] as const) line.setAttribute(k, String(v));
    });
  }

  clear(): void {
    for (const { label, line } of this.items) {
      label.remove();
      line.remove();
    }
    this.items = [];
  }
}
