/**
 * Post-processing: MSAA beauty pass, ground-truth ambient occlusion on the robot only (overlays are
 * hidden during the AO depth/normal renders), and the tone-mapping output pass.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';

export interface Post {
  composer: EffectComposer;
  ao: GTAOPass;
  setSize(w: number, h: number, pixelRatio: number): void;
  setClipping(planes: THREE.Plane[] | null): void;
}

export function createPost(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, hide: THREE.Object3D[]): Post {
  const target = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const ao = new GTAOPass(scene, camera, 4, 4);
  ao.updateGtaoMaterial({ radius: 0.25, distanceExponent: 1.5, thickness: 1.5, scale: 1.1, samples: 16 });
  ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
  ao.blendIntensity = 0.85;
  const render = ao.render.bind(ao);
  ao.render = (...args: Parameters<GTAOPass['render']>) => {
    const shown = hide.map((o) => o.visible);
    hide.forEach((o) => (o.visible = false));
    render(...args);
    hide.forEach((o, i) => (o.visible = shown[i]));
  };
  composer.addPass(ao);
  composer.addPass(new OutputPass());
  return {
    composer,
    ao,
    setSize(w, h, pixelRatio) {
      composer.setPixelRatio(pixelRatio);
      composer.setSize(w, h);
    },
    setClipping(planes) {
      // The AO normal pass must clip like the scene, or cut parts return as pale ghosts.
      (ao as unknown as { normalMaterial: THREE.Material }).normalMaterial.clippingPlanes = planes;
    },
  };
}
