/**
 * The floor under the robot: a tone pool that turns into the backdrop's own colour toward its rim (so it
 * has no edge), a procedural grid or tiles that fade out, an optional faint mirror, and the shadow catcher.
 */
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { BACKDROP_GLSL, backdropUniforms, setGradient, trackViewHeight } from './backdrop';
import type { Backdrop, FloorId } from './surroundings';

const LOCAL_VERTEX = /* glsl */ `
varying vec2 vLocal;
void main() {
  vLocal = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const BASE_FRAGMENT = /* glsl */ `${BACKDROP_GLSL}
uniform vec3 floorColor;
varying vec2 vLocal;
void main() {
  float d = length(vLocal);
  vec3 color = mix(backdropAt(), floorColor, 1.0 - smoothstep(0.03, 0.4, d));
  gl_FragColor = vec4(untone(color), 1.0 - smoothstep(0.6, 1.0, d));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// Grid lines (minor, and every fifth) or two-tone tiles with grout, antialiased with fwidth.
const PATTERN_FRAGMENT = /* glsl */ `${BACKDROP_GLSL}
uniform vec3 lineColor;
uniform vec3 tileColor;
uniform float cells;
uniform float opacity;
uniform float tiles;
varying vec2 vLocal;
float lines(vec2 p, float width) {
  vec2 g = abs(fract(p - 0.5) - 0.5) / fwidth(p);
  return 1.0 - min(min(g.x, g.y) / width, 1.0);
}
void main() {
  vec2 p = vLocal * cells;
  float fade = 1.0 - smoothstep(0.06, 0.42, length(vLocal));
  vec3 color = lineColor;
  float a;
  if (tiles > 0.5) {
    float checker = mod(floor(p.x * 0.5) + floor(p.y * 0.5), 2.0);
    float grout = lines(p * 0.5, 1.2);
    color = mix(tileColor, lineColor, grout);
    a = max(checker * 0.3, grout * 0.6);
  } else {
    a = max(lines(p, 1.0) * 0.5, lines(p / 5.0, 1.5) * 0.95);
  }
  gl_FragColor = vec4(untone(color), a * opacity * fade);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// The stock Reflector writes alpha 1; this one only shows where something is reflected.
const MIRROR = {
  name: 'PolishedFloor',
  uniforms: {
    color: { value: null },
    tDiffuse: { value: null },
    textureMatrix: { value: null },
    strength: { value: 0.1 },
  },
  vertexShader: /* glsl */ `
uniform mat4 textureMatrix;
varying vec4 vUv;
varying vec2 vLocal;
void main() {
  vUv = textureMatrix * vec4(position, 1.0);
  vLocal = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
  fragmentShader: /* glsl */ `
uniform sampler2D tDiffuse;
uniform float strength;
varying vec4 vUv;
varying vec2 vLocal;
void main() {
  vec4 r = texture2DProj(tDiffuse, vUv);
  float fade = 1.0 - smoothstep(0.03, 0.28, length(vLocal));
  gl_FragColor = vec4(r.rgb, r.a * strength * fade);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,
};

export interface Floor {
  group: THREE.Group;
  /** Never sampled by ambient occlusion: the mirror re-renders the scene in every pass it is drawn in. */
  aoHidden: THREE.Object3D[];
  /** `extent`: half-width of scenery standing on the floor, whose shadows it must catch too. */
  fit(radius: number, floorZ: number, extent?: number): void;
  apply(b: Backdrop, floor: FloorId): void;
}

export function createFloor(): Floor {
  const group = new THREE.Group();
  const disc = () => new THREE.CircleGeometry(1, 160);

  const baseUniforms = { ...backdropUniforms(), floorColor: { value: new THREE.Color() } };
  const base = new THREE.Mesh(disc(), new THREE.ShaderMaterial({
    uniforms: baseUniforms, vertexShader: LOCAL_VERTEX, fragmentShader: BASE_FRAGMENT, transparent: true, depthWrite: false,
  }));
  base.renderOrder = -4;
  trackViewHeight(base, baseUniforms);

  const patternUniforms = {
    ...backdropUniforms(),
    lineColor: { value: new THREE.Color() },
    tileColor: { value: new THREE.Color() },
    cells: { value: 40 },
    opacity: { value: 0.6 },
    tiles: { value: 0 },
  };
  const pattern = new THREE.Mesh(disc(), new THREE.ShaderMaterial({
    uniforms: patternUniforms, vertexShader: LOCAL_VERTEX, fragmentShader: PATTERN_FRAGMENT, transparent: true, depthWrite: false,
  }));
  pattern.renderOrder = -2;

  const mirror = new Reflector(disc(), { textureWidth: 1024, textureHeight: 1024, clipBias: 0.002, multisample: 4, shader: MIRROR });
  const mirrorMaterial = mirror.material as THREE.ShaderMaterial;
  mirrorMaterial.transparent = true;
  mirrorMaterial.depthWrite = false;
  mirror.renderOrder = -3;

  const shadow = new THREE.Mesh(disc(), new THREE.ShadowMaterial({ color: '#202429', opacity: 0.24, polygonOffset: true, polygonOffsetFactor: -2 }));
  shadow.receiveShadow = true;
  shadow.renderOrder = -1;

  group.add(base, mirror, pattern, shadow);

  return {
    group,
    aoHidden: [mirror],
    fit(radius, floorZ, extent = 0) {
      const reach = Math.max(radius, 0.05) * 2.4;
      // Wide enough that its rim is always beyond the shadows and well into the backdrop.
      const wide = reach * 4;
      const catcher = Math.max(reach, extent * 1.15);
      const layers: [THREE.Object3D, number, number][] = [[base, wide, 0.0008], [mirror, wide, 0.0006], [pattern, wide, 0.0003], [shadow, catcher, 0]];
      for (const [o, size, below] of layers) {
        o.scale.setScalar(size);
        o.position.z = floorZ - below * size;
      }
      // Cells stay the size the old grid had: 40 across the shadow disc.
      patternUniforms.cells.value = (20 * wide) / reach;
    },
    apply(b, floor) {
      base.visible = shadow.visible = floor !== 'none';
      pattern.visible = floor === 'grid' || floor === 'tiles';
      mirror.visible = floor === 'polished';
      setGradient(baseUniforms, b.top, b.bottom);
      baseUniforms.floorColor.value.set(b.floor);
      (shadow.material as THREE.ShadowMaterial).opacity = b.shadow;
      patternUniforms.lineColor.value.set(b.grid);
      patternUniforms.tileColor.value.set(b.floor).lerp(new THREE.Color(b.grid), 0.35);
      patternUniforms.tiles.value = floor === 'tiles' ? 1 : 0;
      patternUniforms.opacity.value = floor === 'tiles' ? 0.8 : b.dark ? 0.7 : 0.6;
      mirrorMaterial.uniforms.strength.value = b.dark ? 0.12 : 0.09;
    },
  };
}
