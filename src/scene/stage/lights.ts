/** Key light with soft shadows, sky fill, and a shadow-catching floor with a fine grid. */
import * as THREE from 'three';
import { PALETTE } from './palette';

export interface Studio {
  group: THREE.Group;
  fit(radius: number, floorZ: number): void;
  setShadowSize(size: number): void;
}

export function createStudio(): Studio {
  const group = new THREE.Group();
  const hemi = new THREE.HemisphereLight('#ffffff', '#c9ccd2', 1.1);
  hemi.position.set(0, 0, 1);
  const key = new THREE.DirectionalLight('#ffffff', 2.2);
  key.castShadow = true;
  key.shadow.mapSize.set(4096, 4096);
  key.shadow.bias = -0.0003;
  key.shadow.normalBias = 0.0015;
  key.shadow.radius = 3;
  const rim = new THREE.DirectionalLight('#dfe7ff', 0.6);
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(1, 96),
    new THREE.ShadowMaterial({ color: '#4c535c', opacity: 0.22, polygonOffset: true, polygonOffsetFactor: -2 }),
  );
  floor.receiveShadow = true;
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 96), new THREE.MeshBasicMaterial({ color: PALETTE.floor }));
  const grid = new THREE.GridHelper(2, 40, PALETTE.grid, PALETTE.grid);
  grid.rotation.x = Math.PI / 2;
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = 0.55;
  group.add(hemi, key, key.target, rim, disc, grid, floor);

  const fit = (radius: number, floorZ: number) => {
    const r = Math.max(radius, 0.05) * 2.4;
    for (const o of [floor, disc]) {
      o.scale.setScalar(r);
      o.position.z = floorZ - (o === disc ? 0.0004 * r : 0);
    }
    grid.scale.setScalar(r);
    grid.position.z = floorZ - 0.0002 * r;
    key.position.set(r * 0.7, -r * 0.9, r * 1.6 + floorZ);
    key.target.position.set(0, 0, floorZ);
    rim.position.set(-r, r * 0.8, r * 0.9);
    const cam = key.shadow.camera;
    cam.left = cam.bottom = -r;
    cam.right = cam.top = r;
    cam.near = 0.01;
    cam.far = r * 6;
    cam.updateProjectionMatrix();
  };
  const setShadowSize = (size: number) => {
    key.shadow.mapSize.set(size, size);
    key.shadow.map?.dispose();
    key.shadow.map = null;
  };
  return { group, fit, setShadowSize };
}
