/** Load rings glow with |τ| / τ_max: the accent marks the part doing the work. */
import type * as THREE from 'three';

export function updateIndicators(indicators: (THREE.Mesh | null)[], torque: number[], limits: number[]): void {
  indicators.forEach((mesh, k) => {
    if (!mesh) return;
    const u = limits[k] ? Math.min(Math.abs(torque[k] ?? 0) / limits[k], 1.5) : 0;
    const m = mesh.material as THREE.MeshPhysicalMaterial;
    m.emissiveIntensity = 0.05 + 1.6 * u;
  });
}
