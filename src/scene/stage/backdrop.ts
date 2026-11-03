/**
 * The backdrop gradient, drawn in the scene behind everything. Backdrop and floor share `BACKDROP_GLSL`,
 * which pre-inverts the Neutral tone curve: authored colours come out unchanged and the floor's outer
 * ring matches the backdrop exactly, where a CSS backdrop would meet a tone-mapped floor at a seam.
 */
import * as THREE from 'three';

/** Seen by the main camera only: mirrors and AO must not draw the backdrop. */
export const BACKDROP_LAYER = 1;

export const BACKDROP_GLSL = /* glsl */ `
uniform vec3 topSrgb;
uniform vec3 bottomSrgb;
uniform float viewHeight;
vec3 srgbToLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}
// Inverse of three's NeutralToneMapping at exposure 1; exact for greys, close for tinted colours.
vec3 untone(vec3 t) {
  t = min(t, vec3(0.995));
  vec3 c = mix(t, 0.0576 / (1.0 - t) - 0.24 + 0.76, step(vec3(0.76), t));
  float m = min(c.r, min(c.g, c.b));
  // Capped so antialiased edges against a white backdrop do not bloom.
  return min(c + (m >= 0.04 ? 0.04 : 0.4 * sqrt(m) - m), vec3(4.0));
}
// The CSS gradient: mixed in sRGB, top to bottom of the frame, dithered below one 8-bit step
// so long dark ramps do not band once quantised and encoded.
vec3 backdropAt() {
  float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
  return srgbToLinear(mix(bottomSrgb, topSrgb, clamp(gl_FragCoord.y / viewHeight, 0.0, 1.0)) + n / 255.0);
}`;

export interface BackdropUniforms {
  topSrgb: { value: THREE.Color };
  bottomSrgb: { value: THREE.Color };
  viewHeight: { value: number };
  [key: string]: { value: unknown };
}

export const backdropUniforms = (): BackdropUniforms => ({
  topSrgb: { value: new THREE.Color() },
  bottomSrgb: { value: new THREE.Color() },
  viewHeight: { value: 1 },
});

/** Raw sRGB, so the shader mixes the gradient the way CSS does before linearising. */
export function setGradient(u: BackdropUniforms, top: string, bottom: string): void {
  u.topSrgb.value.set(top).convertLinearToSRGB();
  u.bottomSrgb.value.set(bottom).convertLinearToSRGB();
}

/** Keep `viewHeight` in step with whatever this object is being drawn into. */
export function trackViewHeight(o: THREE.Object3D, u: BackdropUniforms): void {
  const size = new THREE.Vector2();
  o.onBeforeRender = (renderer) => {
    const target = renderer.getRenderTarget();
    u.viewHeight.value = target ? target.height : renderer.getDrawingBufferSize(size).y;
  };
}

export function createBackdrop(): { mesh: THREE.Mesh; uniforms: BackdropUniforms } {
  const uniforms = backdropUniforms();
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    uniforms,
    vertexShader: 'void main() { gl_Position = vec4(position.xy, 1.0, 1.0); }',
    fragmentShader: `${BACKDROP_GLSL}
void main() {
  gl_FragColor = vec4(untone(backdropAt()), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,
    depthTest: false,
    depthWrite: false,
  }));
  mesh.frustumCulled = false;
  mesh.renderOrder = -100;
  mesh.layers.set(BACKDROP_LAYER);
  trackViewHeight(mesh, uniforms);
  return { mesh, uniforms };
}
