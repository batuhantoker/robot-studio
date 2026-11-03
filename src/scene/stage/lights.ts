/** Key light with soft shadows, sky fill and rim, tuned per backdrop, over a floor that fades into it, plus the setting around the robot. */
import * as THREE from 'three';
import { createBackdrop, setGradient } from './backdrop';
import { createEnvironment } from './environment';
import { createFloor } from './floor';
import { BACKDROPS, DEFAULT_SURROUNDINGS, type Surroundings } from './surroundings';

export interface Studio {
  group: THREE.Group;
  /** Objects ambient occlusion must skip. */
  aoHidden: THREE.Object3D[];
  fit(radius: number, floorZ: number): void;
  setShadowSize(size: number): void;
  apply(s: Surroundings, scene: THREE.Scene): void;
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
  const floor = createFloor();
  const backdrop = createBackdrop();
  const environment = createEnvironment();
  group.add(hemi, key, key.target, rim, floor.group, backdrop.mesh, environment.group, environment.seeThrough);
  let fitted = { radius: 0.5, floorZ: 0 };

  const fit = (radius: number, floorZ: number) => {
    fitted = { radius, floorZ };
    environment.fit(radius, floorZ);
    // A desk lifts the robot: the floor, and what lights it, sit lower by the desk's height.
    const ground = floorZ - environment.drop;
    const r = Math.max(radius, 0.05) * 2.4;
    floor.fit(radius, ground, environment.extent);
    key.position.set(r * 0.7, -r * 0.9, r * 1.6 + floorZ);
    key.target.position.set(0, 0, ground);
    rim.position.set(-r, r * 0.8, r * 0.9);
    // The work cell's conveyor runs past the robot's own shadow disc.
    const extent = Math.max(r, environment.extent);
    const cam = key.shadow.camera;
    cam.left = cam.bottom = -extent;
    cam.right = cam.top = extent;
    cam.near = 0.01;
    cam.far = r * 6 + environment.drop;
    cam.updateProjectionMatrix();
  };
  const setShadowSize = (size: number) => {
    if (key.shadow.mapSize.x === size) return;
    key.shadow.mapSize.set(size, size);
    key.shadow.map?.dispose();
    key.shadow.map = null;
  };
  const apply = (s: Surroundings, scene: THREE.Scene) => {
    const b = BACKDROPS[s.backdrop] ?? BACKDROPS[DEFAULT_SURROUNDINGS.backdrop];
    hemi.color.set(b.sky);
    hemi.groundColor.set(b.ground);
    hemi.intensity = b.hemi;
    key.color.set(b.key);
    key.intensity = b.keyIntensity;
    rim.color.set(b.rim);
    rim.intensity = b.rimIntensity;
    scene.environmentIntensity = b.env;
    floor.apply(b, s.floor);
    setGradient(backdrop.uniforms, b.top, b.bottom);
    if (environment.id !== s.environment) {
      environment.apply(s.environment);
      fit(fitted.radius, fitted.floorZ);
    }
  };
  return { group, aoHidden: [...floor.aoHidden, backdrop.mesh, environment.seeThrough], fit, setShadowSize, apply };
}
