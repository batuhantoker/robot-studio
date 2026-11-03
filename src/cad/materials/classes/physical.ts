/** Physically based materials per class, tuned for the light studio. */
import * as THREE from 'three';
import type { MaterialClass } from './types';

const metalTone = (c: THREE.Color, toward: string, k: number) => c.clone().lerp(new THREE.Color(toward), k);

export function physicalMaterial(cls: MaterialClass, color: THREE.Color): THREE.MeshPhysicalMaterial {
  switch (cls) {
    case 'paint':
      return new THREE.MeshPhysicalMaterial({ color, metalness: 0.1, roughness: 0.34, clearcoat: 1, clearcoatRoughness: 0.12 });
    case 'plastic':
      return new THREE.MeshPhysicalMaterial({ color, metalness: 0, roughness: 0.42, clearcoat: 0.4, clearcoatRoughness: 0.35, sheen: 0.15, sheenRoughness: 0.6 });
    case 'aluminium':
      // Large glossy metal mirrors the studio panels in black and white; keep it satin.
      return new THREE.MeshPhysicalMaterial({ color: metalTone(color, '#c9ced6', 0.5), metalness: 0.7, roughness: 0.48, envMapIntensity: 0.55 });
    case 'steel':
      return new THREE.MeshPhysicalMaterial({ color: metalTone(color, '#b4bac2', 0.6), metalness: 0.85, roughness: 0.36, envMapIntensity: 0.6 });
    case 'anodized':
      return new THREE.MeshPhysicalMaterial({ color, metalness: 0.45, roughness: 0.52, clearcoat: 0.2, clearcoatRoughness: 0.55, envMapIntensity: 0.7 });
    case 'rubber':
      return new THREE.MeshPhysicalMaterial({ color, metalness: 0, roughness: 0.92, sheen: 0.6, sheenRoughness: 0.8, sheenColor: new THREE.Color('#5d636c') });
    case 'copper':
      return new THREE.MeshPhysicalMaterial({ color: metalTone(color, '#c27a45', 0.5), metalness: 0.85, roughness: 0.38, envMapIntensity: 0.7 });
    case 'glass':
      return new THREE.MeshPhysicalMaterial({ color, metalness: 0, roughness: 0.05, transparent: true, opacity: 0.35, envMapIntensity: 1.6, depthWrite: false });
    case 'electronics':
      return new THREE.MeshPhysicalMaterial({ color, metalness: 0.1, roughness: 0.6 });
  }
}

/** Authored sRGB colour → the renderer's linear working space. */
export const srgb = (rgba: ArrayLike<number>) => new THREE.Color().setRGB(rgba[0], rgba[1], rgba[2], THREE.SRGBColorSpace);
