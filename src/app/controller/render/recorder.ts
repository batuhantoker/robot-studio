/**
 * Offline video of one pass of the trajectory. Every frame is stepped with an exact time step and drawn
 * at a fixed 16:9 size, supersampled with AO and full shadows, then encoded with WebCodecs, so nothing
 * depends on how fast this machine draws.
 */
import * as THREE from 'three';
import { solidBox } from '../../../cad/common/lowest';
import { PALETTE } from '../../../scene/stage/palette';
import { BACKDROPS, type Backdrop } from '../../../scene/stage/surroundings';
import { download, fileStem } from '../../../ui/dom/download';
import type { StudioState } from '../../state/types';
import type { Studio } from '../studio';

export type Resolution = 720 | 1080 | 1440 | 2160;

export interface RenderSettings {
  height: Resolution;
  fps: 30 | 60;
  /** Swing the camera slowly around the robot over the take. */
  orbit: boolean;
  /** Draw the tool path as a tube. */
  path: boolean;
  /** Robot name and trajectory time in the corner. */
  timecode: boolean;
}

export interface RenderProgress {
  frame: number;
  frames: number;
  /** The frame as encoded; shown while rendering. */
  preview: HTMLCanvasElement;
  label: string;
}

const HOLD_S = 0.5;
const ORBIT = THREE.MathUtils.degToRad(36);
// Supersampling never draws more than a 4K frame.
const MAX_PIXELS = 3840 * 2160;

export const canRenderVideo = (): boolean => typeof VideoEncoder === 'function';

type Origin = Pick<StudioState, 'activeId' | 'sessionVersion' | 'waypoints' | 'duration' | 'stopOpts' | 'pace'>;

interface Job {
  cancelled: boolean;
  failure: string | null;
  from: Origin | null;
}

function pathTube(points: number[][], radius: number): THREE.Mesh | null {
  const pts = points.map((p) => new THREE.Vector3(p[0], p[1], p[2])).filter((p, i, all) => i === 0 || p.distanceTo(all[i - 1]) > radius * 0.05);
  if (pts.length < 2) return null;
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const tube = new THREE.Mesh(
    new THREE.TubeGeometry(curve, Math.min(pts.length * 3, 1200), radius, 10, false),
    new THREE.MeshBasicMaterial({ color: PALETTE.accent, transparent: true, opacity: 0.9, toneMapped: false }),
  );
  tube.renderOrder = 5;
  return tube;
}

/** A turntable start for 16:9: robot and path fill the frame, seen from the current side at a calm elevation. */
function turntable(subject: THREE.Box3, view: { position: THREE.Vector3; target: THREE.Vector3 }, fov: number) {
  const sphere = subject.getBoundingSphere(new THREE.Sphere());
  const flat = view.position.clone().sub(view.target).setZ(0);
  if (flat.lengthSq() < 1e-8) flat.set(0.62, -0.68, 0);
  const elevation = THREE.MathUtils.degToRad(22);
  const dir = flat.normalize().multiplyScalar(Math.cos(elevation)).setZ(Math.sin(elevation));
  const distance = (sphere.radius / Math.sin(THREE.MathUtils.degToRad(fov / 2))) * 0.92;
  return { target: sphere.center, position: sphere.center.clone().addScaledVector(dir, distance), distance };
}

function paintTimecode(g: CanvasRenderingContext2D, b: Backdrop, title: string, time: number, duration: number): void {
  const h = g.canvas.height;
  const size = Math.round(h * 0.022);
  const pad = Math.round(h * 0.04);
  g.textBaseline = 'alphabetic';
  g.font = `600 ${size}px "Inter Variable", Inter, system-ui, sans-serif`;
  g.fillStyle = b.dark ? 'rgba(255,255,255,0.92)' : 'rgba(22,24,27,0.9)';
  g.fillText(title, pad, h - pad - size * 1.5);
  g.font = `500 ${Math.round(size * 0.85)}px "JetBrains Mono", ui-monospace, monospace`;
  g.fillStyle = b.dark ? 'rgba(255,255,255,0.6)' : 'rgba(22,24,27,0.5)';
  g.fillText(`t ${time.toFixed(2)} s  /  ${duration.toFixed(2)} s`, pad, h - pad);
}

export class TrajectoryRecorder {
  private job: Job | null = null;
  private readonly listeners: ((p: RenderProgress | null) => void)[] = [];

  constructor(private readonly studio: Studio) {
    const keys = ['activeId', 'sessionVersion', 'waypoints', 'duration', 'stopOpts', 'pace'] as const;
    studio.store.on(['mode', ...keys], (s) => {
      const f = this.job?.from;
      if (f && (s.mode !== 'trajectory' || keys.some((k) => s[k] !== f[k]))) this.cancel();
    });
  }

  get busy(): boolean {
    return !!this.job;
  }

  onProgress(fn: (p: RenderProgress | null) => void): void {
    this.listeners.push(fn);
  }

  cancel(): void {
    if (this.job) this.job.cancelled = true;
  }

  /** Render and download the take; resolves with why it failed, or null (also when cancelled). */
  async start(settings: RenderSettings): Promise<string | null> {
    if (this.job) return null;
    if (!canRenderVideo()) return 'This browser cannot encode video (WebCodecs is missing).';
    const { store, viewport } = this.studio;
    const session = this.studio.session;
    if (!session || store.state.waypoints[0]?.length !== session.joints.length) return 'No trajectory for this robot yet.';
    const job: Job = { cancelled: false, failure: null, from: null };
    this.job = job;
    const H = settings.height;
    const W = Math.round((H * 16) / 9 / 2) * 2;
    const ss = Math.max(1, Math.min(2, Math.sqrt(MAX_PIXELS / (W * H))));
    const fps = settings.fps;
    let mb: typeof import('mediabunny');
    let codec: 'avc' | 'vp9' | null;
    try {
      mb = await import('mediabunny');
      codec = (await mb.getFirstEncodableVideoCodec(['avc', 'vp9'], { width: W, height: H, frameRate: fps })) as 'avc' | 'vp9' | null;
    } catch (e) {
      this.job = null;
      return `Video encoder failed to load: ${(e as Error).message}`;
    }
    if (!codec) {
      this.job = null;
      return `This browser cannot encode ${H}p video.`;
    }

    const preview = document.createElement('canvas');
    preview.width = W;
    preview.height = H;
    const g = preview.getContext('2d')!;
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    const output = new mb.Output({
      format: codec === 'avc' ? new mb.Mp4OutputFormat({ fastStart: 'in-memory' }) : new mb.WebMOutputFormat(),
      target: new mb.BufferTarget(),
    });
    // About 0.12 bits per pixel per frame: smooth gradients and fine edges survive without banding.
    const source = new mb.CanvasSource(preview, { codec, quality: new mb.Quality({ bitrate: Math.round(W * H * fps * 0.12) }), keyFrameInterval: 1 });
    output.addVideoTrack(source, { frameRate: fps });

    const { camera, controls } = viewport.stage;
    const view = { position: camera.position.clone(), target: controls.target.clone(), near: camera.near, far: camera.far };
    const shown = viewport.overlay.children.map((c) => [c, c.visible] as const);
    const tool = this.studio.analysis.profile()?.tool;
    const tube = settings.path && tool ? pathTube(tool, Math.max(this.studio.overlays.reach, 0.05) * 0.0045) : null;
    const canvas = viewport.canvas;
    const lost = (e: Event) => {
      e.preventDefault();
      job.failure = 'The graphics card dropped the render (WebGL context lost). Try a lower resolution.';
      job.cancelled = true;
    };
    const backdrop = BACKDROPS[store.state.surroundings.backdrop];
    const title = session.title;
    const label = `${H === 2160 ? '4K' : `${H}p`} · ${fps} fps · ${codec === 'avc' ? 'MP4' : 'WebM'}`;
    const hold = Math.round(HOLD_S * fps);
    const frames = hold * 2 + Math.ceil(store.state.duration * fps);
    const dt = 1 / fps;
    let k = 0;

    let orbit: ReturnType<typeof turntable> | null = null;
    const prepare = () => {
      for (const c of viewport.overlay.children) c.visible = c === tube;
      if (orbit) {
        const u = Math.min(k / Math.max(frames - 1, 1), 1);
        const angle = (u * u * (3 - 2 * u) - 0.5) * ORBIT;
        camera.position.copy(orbit.position).sub(orbit.target).applyAxisAngle(new THREE.Vector3(0, 0, 1), angle).add(orbit.target);
        camera.lookAt(orbit.target);
      }
    };
    const frame = async (step: number) => {
      viewport.stepOffline(step, prepare);
      const s = store.state;
      g.drawImage(canvas, 0, 0, W, H);
      if (settings.timecode) paintTimecode(g, backdrop, title, s.time, s.duration);
      await source.add(k * dt, dt);
      k++;
      const p = { frame: k, frames: Math.max(frames, k), preview, label };
      this.listeners.forEach((fn) => fn(p));
    };

    store.set({ mode: 'trajectory', rendering: true, playing: false, time: 0, selectedStop: null });
    const s0 = store.state;
    job.from = { activeId: s0.activeId, sessionVersion: s0.sessionVersion, waypoints: s0.waypoints, duration: s0.duration, stopOpts: s0.stopOpts, pace: s0.pace };
    canvas.addEventListener('webglcontextlost', lost);
    if (tube) viewport.overlay.add(tube);
    if (settings.orbit) {
      const subject = solidBox(session.assembly.root);
      if (tube) subject.expandByObject(tube);
      orbit = turntable(subject, view, camera.fov);
      camera.near = orbit.distance / 200;
      camera.far = orbit.distance * 20;
    }
    viewport.beginOffline(Math.round(W * ss), Math.round(H * ss));
    try {
      await output.start();
      for (let i = 0; i < hold && !job.cancelled; i++) await frame(0);
      store.set({ playing: true });
      while (!job.cancelled) {
        await frame(dt);
        // Playback also halts on a collision; the take ends on that pose.
        if (store.state.time >= store.state.duration || !store.state.playing) break;
      }
      store.set({ playing: false });
      for (let i = 0; i < hold && !job.cancelled; i++) await frame(0);
      if (job.cancelled) {
        await output.cancel();
        return job.failure;
      }
      await output.finalize();
      const buffer = output.target.buffer;
      if (!buffer) return 'The encoder produced no data.';
      download(`${fileStem(title)}-trajectory-${H}p${fps}.${codec === 'avc' ? 'mp4' : 'webm'}`, new Blob([buffer], { type: codec === 'avc' ? 'video/mp4' : 'video/webm' }));
      return null;
    } catch (e) {
      await output.cancel().catch(() => undefined);
      return job.failure ?? `Rendering failed: ${(e as Error).message}`;
    } finally {
      canvas.removeEventListener('webglcontextlost', lost);
      viewport.endOffline();
      if (tube) {
        viewport.overlay.remove(tube);
        tube.geometry.dispose();
        (tube.material as THREE.Material).dispose();
      }
      for (const [c, v] of shown) c.visible = v;
      camera.position.copy(view.position);
      camera.near = view.near;
      camera.far = view.far;
      controls.target.copy(view.target);
      controls.update();
      this.job = null;
      store.set({ rendering: false, ...(store.state.mode === 'trajectory' ? { playing: false } : {}) });
      this.listeners.forEach((fn) => fn(null));
    }
  }
}
