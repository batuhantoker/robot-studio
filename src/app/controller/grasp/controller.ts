/** Grips around real objects: offers each hand what it can hold, solves the fingers against the object, and draws it. */
import type { MotionPreset } from '../../../core/motion/types';
import { lowestPoint } from '../../../core/prosthesis/closure';
import { countClip, synergyClip } from '../../../core/prosthesis/gesture';
import { type Grasp, type GraspClip, type GraspPlan, graspClip, openMotors, solveGrasp } from '../../../core/prosthesis/grasp';
import { COUNT_TUCK, GRASPS } from '../../../core/prosthesis/grasps';
import { jointsFor, motorsOf } from '../../../core/prosthesis/motors';
import { HeldObject } from '../../../scene/grasp/held-object';
import { StandMesh } from '../../../scene/grasp/stand-mesh';
import type { Snapshot } from '../../live/bus';
import type { RobotSession } from '../../robots/session';
import type { Studio } from '../studio';
import { handSurface } from './surface';

const isGrasp = (c: unknown): c is GraspClip => !!c && 'held' in (c as object);

export class GraspController {
  private readonly object = new HeldObject();
  private readonly stand = new StandMesh();
  private surface: { session: RobotSession; shape: ReturnType<typeof handSurface>; plans: Map<string, GraspPlan>; floor: number } | null = null;

  constructor(private readonly studio: Studio) {
    studio.viewport.overlay.parent!.add(this.object.group, this.stand.group);
    this.object.group.visible = this.stand.group.visible = false;
    studio.motion.extras.unshift((s) => this.presets(s));
    studio.bus.on((snap) => this.sync(snap), 1000);
    studio.store.on(['sessionVersion', 'mode', 'motion'], () => this.refresh());
  }

  private loaded(s: RobotSession) {
    if (this.surface?.session !== s) {
      this.surface?.shape.dispose();
      const shape = handSurface(s);
      this.surface = { session: s, shape, plans: new Map(), floor: lowestPoint(shape, s.home) };
    }
    return this.surface;
  }

  private presets(s: RobotSession): MotionPreset[] {
    const map = s.prosthesis;
    if (!map) return [];
    const grips: MotionPreset[] = (GRASPS[s.id] ?? []).map((g) => ({
      id: `grasp-${g.name}`,
      label: g.label,
      hint: g.hint,
      build: (_robot, q0, size) => this.clip(s, g, q0, size),
    }));
    const counted = (q: number[], start: number[]) => countClip(map, s.limbs, q, start, COUNT_TUCK[s.id]);
    if (!counted(s.home, openMotors(map))) {
      return [...grips, {
        id: 'synergy',
        label: 'Synergy',
        hint: map.motors.length > 1 ? 'What the two synergies do: closes the hand, then slides the tendon towards the thumb and towards the little finger (a model, not a measurement)' : 'What one tendon does: every finger closes together, and opens',
        build: (_robot, q0) => synergyClip(map, jointsFor(map, openMotors(map), q0), motorsOf(map, q0)),
      }];
    }
    const count: MotionPreset = {
      id: 'count',
      label: 'Count',
      hint: 'Makes a fist, then counts on its fingers, one digit at a time',
      build: (_robot, q0) => counted(jointsFor(map, openMotors(map), q0), motorsOf(map, q0))!,
    };
    return [...grips, count];
  }

  private clip(s: RobotSession, g: Grasp, q0: number[], size: number): GraspClip {
    const map = s.prosthesis!, { shape, plans } = this.loaded(s);
    const q = jointsFor(map, openMotors(map), q0);
    const key = `${g.name}|${size.toFixed(2)}`;
    const plan = plans.get(key) ?? solveGrasp(g, map, shape, q, (v) => !!s.collision?.hit(v), size);
    plans.set(key, plan);
    return graspClip(plan, map, q, motorsOf(map, q0));
  }

  private refresh(): void {
    if (this.surface && this.surface.session !== this.studio.session) {
      this.surface.shape.dispose();
      this.surface = null;
    }
  }

  private sync(snap: Snapshot): void {
    const st = this.studio.store.state, clip = this.studio.motion.clip;
    const at = st.mode === 'motion' && snap.session === this.studio.session && st.explode < 0.001 && isGrasp(clip) ? clip.held(snap.time) : null;
    this.object.group.visible = this.stand.group.visible = !!at;
    if (!at || !isGrasp(clip)) return this.object.set(null);
    this.object.set(clip.shape);
    this.object.place(at);
    this.stand.place(clip.standing, clip.stand(snap.time), this.surface?.floor ?? 0, at.p);
  }
}
