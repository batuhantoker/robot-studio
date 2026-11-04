/** The wall a palm-up hand is bolted to, Dactyl-rig style: a panel, and a flange round the forearm's base. */
import * as THREE from 'three';
import { block, pin } from '../../cad/parts/shapes/blocks';

export class WallMount {
  readonly group = new THREE.Group();
  private readonly panel = new THREE.MeshPhysicalMaterial({ color: '#c3c7cd', roughness: 0.8 });
  private readonly anodised = new THREE.MeshPhysicalMaterial({ color: '#2b2e33', roughness: 0.42, metalness: 0.45, clearcoat: 0.2 });
  private readonly steel = new THREE.MeshPhysicalMaterial({ color: '#a7adb5', roughness: 0.3, metalness: 0.9 });

  /** A hand of `radius` at its base leaving the wall at `base` along +y; the panel stands on `floor`. */
  set(base: THREE.Vector3, radius: number, floor: number): void {
    this.clear();
    const t = 0.03, width = Math.max(radius * 7.5, 0.4), top = base.z + Math.max(radius * 3.2, 0.16);
    const wall = new THREE.Mesh(block(width, t, top - floor, 0.006), this.panel);
    wall.position.set(base.x, base.y - t / 2 - 0.012, (top + floor) / 2);
    const flange = new THREE.Mesh(pin(radius * 1.28, 0.014, 'y', 64), this.anodised);
    flange.position.set(base.x, base.y - 0.005, base.z);
    this.group.add(wall, flange);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      const bolt = new THREE.Mesh(pin(0.0042, 0.005, 'y', 16), this.steel);
      bolt.position.set(base.x + Math.cos(a) * radius * 1.12, base.y + 0.004, base.z + Math.sin(a) * radius * 1.12);
      this.group.add(bolt);
    }
    this.group.traverse((o) => ((o as THREE.Mesh).castShadow = (o as THREE.Mesh).receiveShadow = true));
  }

  clear(): void {
    for (const m of this.group.children as THREE.Mesh[]) m.geometry.dispose();
    this.group.clear();
  }
}
