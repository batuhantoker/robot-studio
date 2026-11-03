/** Numbered badges at each trajectory stop's tool point (vias are dots); stops in the same place share one. */
import * as THREE from 'three';
import type { Vec3 } from '../../core/math/linear/vec';
import { PALETTE } from '../stage/palette';

const H = 64;
const badges = new Map<string, { map: THREE.Texture; aspect: number }>();

function badge(label: string, on: boolean) {
  const key = `${label}|${on}`;
  const cached = badges.get(key);
  if (cached) return cached;
  const font = `700 30px 'Inter Variable', Inter, system-ui, sans-serif`;
  const probe = document.createElement('canvas').getContext('2d')!;
  probe.font = font;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(H, Math.ceil(probe.measureText(label).width) + 34);
  canvas.height = H;
  const g = canvas.getContext('2d')!;
  g.beginPath();
  g.roundRect(3, 3, canvas.width - 6, H - 6, (H - 6) / 2);
  g.fillStyle = on ? PALETTE.accent : PALETTE.ink;
  g.fill();
  g.lineWidth = 4;
  g.strokeStyle = '#fff';
  g.stroke();
  g.fillStyle = '#fff';
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(label, canvas.width / 2, H / 2 + 2);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const made = { map, aspect: canvas.width / H };
  badges.set(key, made);
  return made;
}

let dotTexture: THREE.Texture | null = null;

function dot(): THREE.Texture {
  if (dotTexture) return dotTexture;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 32;
  const g = canvas.getContext('2d')!;
  g.beginPath();
  g.arc(16, 16, 12, 0, Math.PI * 2);
  g.fillStyle = PALETTE.ink;
  g.fill();
  g.lineWidth = 4;
  g.strokeStyle = '#fff';
  g.stroke();
  dotTexture = new THREE.CanvasTexture(canvas);
  dotTexture.colorSpace = THREE.SRGBColorSpace;
  return dotTexture;
}

export class StopsOverlay {
  readonly group = new THREE.Group();
  private sprites: { sprite: THREE.Sprite; stops: number[] }[] = [];
  private size = 0.02;

  setScale(reach: number): void {
    this.size = reach * 0.04;
  }

  show(tips: Vec3[], selected: number | null, via: (i: number) => boolean = () => false): void {
    const groups: { p: Vec3; stops: number[] }[] = [];
    tips.forEach((p, i) => {
      const near = groups.find((g) => Math.hypot(g.p[0] - p[0], g.p[1] - p[1], g.p[2] - p[2]) < this.size * 0.5);
      if (near) near.stops.push(i);
      else groups.push({ p, stops: [i] });
    });
    while (this.sprites.length < groups.length) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, transparent: true }));
      sprite.renderOrder = 25;
      this.group.add(sprite);
      this.sprites.push({ sprite, stops: [] });
    }
    for (const extra of this.sprites.splice(groups.length)) {
      extra.sprite.material.dispose();
      this.group.remove(extra.sprite);
    }
    groups.forEach((g, k) => {
      const entry = this.sprites[k];
      const named = g.stops.filter((i) => !via(i) || i === selected);
      const b = named.length ? badge(named.map((i) => i + 1).join(' · '), selected !== null && g.stops.includes(selected)) : { map: dot(), aspect: 1 };
      const size = named.length ? this.size : this.size * 0.3;
      entry.stops = g.stops;
      entry.sprite.position.set(...g.p);
      entry.sprite.scale.set(size * b.aspect, size, 1);
      if (entry.sprite.material.map !== b.map) {
        entry.sprite.material.map = b.map;
        entry.sprite.material.needsUpdate = true;
      }
    });
  }

  /** Stops on the badge under the ray, or null. */
  hit(ray: THREE.Raycaster): number[] | null {
    if (!this.group.visible) return null;
    const hit = ray.intersectObjects(this.sprites.map((s) => s.sprite), false)[0];
    return (hit && this.sprites.find((s) => s.sprite === hit.object)?.stops) || null;
  }
}
