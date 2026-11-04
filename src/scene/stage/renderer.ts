/** WebGL renderer, scene, and Z-up camera with orbit controls. */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { PALETTE } from './palette';

export interface Stage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  root: THREE.Group;
  resize(): void;
  /** `fit`, when given, backs the camera off until that box fits the share of the canvas left uncovered. */
  frame(radius: number, center: THREE.Vector3, fit?: { box: THREE.Box3; room: { x: number; y: number } }): void;
}

/** Room left around the fitted box, as a share of the view. */
const MARGIN = 0.88;

/** Nearest distance along `dir` from which every corner of `box` lies inside the half-angle tangents. */
function boxDistance(box: THREE.Box3, center: THREE.Vector3, dir: THREE.Vector3, up: THREE.Vector3, tanX: number, tanY: number): number {
  const right = new THREE.Vector3().crossVectors(up, dir).normalize();
  const upward = new THREE.Vector3().crossVectors(dir, right);
  const r = new THREE.Vector3();
  let d = 0;
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
    r.set(x, y, z).sub(center);
    const near = r.dot(dir);
    d = Math.max(d, near + Math.abs(r.dot(right)) / tanX, near + Math.abs(r.dot(upward)) / tanY);
  }
  return d;
}

export function createStage(host: HTMLElement): Stage {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  // Neutral keeps authored colours (a KUKA orange stays orange) where ACES would shift them.
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.localClippingEnabled = true;
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  // A blurred room keeps reflections soft (no hard panel streaks on metal).
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.12).texture;
  scene.environmentIntensity = 0.6;

  THREE.Object3D.DEFAULT_UP.set(0, 0, 1);
  const camera = new THREE.PerspectiveCamera(32, 1, 0.005, 50);
  camera.up.set(0, 0, 1);
  camera.position.set(1.2, -1.4, 0.9);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;

  const root = new THREE.Group();
  scene.add(root);

  const resize = () => {
    const { clientWidth: w, clientHeight: h } = host;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = `${w}px`;
    renderer.domElement.style.height = `${h}px`;
    camera.aspect = w / Math.max(h, 1);
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(host);
  resize();

  const frame: Stage['frame'] = (radius, center, fit) => {
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    // On a portrait screen the horizontal field is the narrower one; fit whichever is tighter.
    const half = Math.min(Math.atan(tan), Math.atan(tan * camera.aspect));
    const dir = new THREE.Vector3(0.62, -0.68, 0.42).normalize();
    // The sphere fit runs a little tight, which suits arms; a tall hand or humanoid would lose its ends to it.
    let distance = (radius / Math.sin(half)) * 0.82;
    if (fit) distance = Math.max(distance, boxDistance(fit.box, center, dir, camera.up, tan * camera.aspect * fit.room.x * MARGIN, tan * fit.room.y * MARGIN));
    controls.target.copy(center);
    camera.position.copy(center).addScaledVector(dir, distance);
    camera.near = distance / 200;
    camera.far = distance * 20;
    camera.updateProjectionMatrix();
    controls.update();
  };

  renderer.domElement.style.background = PALETTE.backdrop;
  return { renderer, scene, camera, controls, root, resize, frame };
}
