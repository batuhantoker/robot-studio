/** Draw one frame: with AO through the composer when the tier and view allow, else directly. */
import type * as THREE from 'three';
import type { Post } from '../stage/post';
import type { Stage } from '../stage/renderer';
import type { Tier } from '../stage/quality';

export function renderFrame(stage: Stage, post: Post, tier: Tier, transparentView: boolean): void {
  const canvas = stage.renderer.domElement;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const ratio = Math.min(devicePixelRatio || 1, tier.pixelRatio);
  const composer = post.composer as unknown as { _width: number; _height: number; _pixelRatio: number };
  if (composer._width !== w || composer._height !== h || composer._pixelRatio !== ratio) post.setSize(w, h, ratio);
  if (stage.renderer.getPixelRatio() !== ratio) {
    stage.renderer.setPixelRatio(ratio);
    stage.resize();
  }
  // Glass and ghosts are transparent; AO would darken them as if they were solid.
  if (tier.ao && !transparentView) post.composer.render();
  else stage.renderer.render(stage.scene, stage.camera as THREE.Camera);
}
