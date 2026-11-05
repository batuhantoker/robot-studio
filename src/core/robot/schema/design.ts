/**
 * Per-robot CAD data: how a chain is dressed, never how it moves. Every field is optional;
 * whatever is absent is planned from the kinematics, so a robot with no design still gets castings.
 * Distances are metres. Points are relative to the joint origin the body rides, at the zero pose.
 */
import type { Vec3 } from '../../math/linear/vec';

export type Finish = 'paint' | 'plastic' | 'aluminium' | 'steel' | 'anodized' | 'rubber';

export interface PaintDesign {
  /** sRGB hex. */
  color: string;
  finish?: Finish;
  /** Overrides the finish's own: a satin robot under studio light clips at the finish's gloss. */
  roughness?: number;
  clearcoat?: number;
}

/** One side of a joint: the casting that stops at its interface. */
export interface SideDesign {
  /** Radius of the flat interface. */
  radius?: number;
  /** How far a knuckle bulges from `centre` along the joint axis. */
  depth?: number;
  /** Where the bulge is centred on the axis, from the joint origin; the interface when absent. */
  centre?: number;
  /** Radius of the neck where it leaves a knuckle. */
  waist?: number;
  /** A fork: the open span across the interface. Only that span is cleared, so a far plate beyond it stays. */
  fork?: number;
}

/** Where a joint's motor sits, when not simply astride the interface. */
export interface DriveDesign {
  /** The body that holds the stator; the parent when absent. */
  in?: 'parent' | 'child';
  /** Puts the whole drive inside that body, its middle here on the axis from the joint origin, with a shaft out through the interface. */
  centre?: number;
  radius?: number;
  /** Radius of that shaft. */
  shaft?: number;
  /** How far the joint opens when exploded, for knuckles too shallow to say. */
  opens?: number;
  /** Opens this way, in the child's frame, not along the axis: a fork lifts off what it straddles. */
  along?: Vec3;
  /** In section, the drive is cut this much nearer the camera: for a drive that lies off the common plane. */
  cut?: number;
}

/** A prismatic joint: a bar on one body running through a guide on the other. Spans are along the joint axis. */
export interface SlideDesign {
  /** Rail: the bar stays on the parent and a carriage on the child rides it. Quill: the bar rides the child, through a guide on the parent. */
  form?: 'rail' | 'quill';
  /** Half width of the bar. */
  r?: number;
  /** A square bar and guide rather than round ones. */
  square?: boolean;
  /** Which way the rack faces, and the motor's pod beside it. A section shows the drive when this lies in its plane. */
  side?: Vec3;
  /** Half width of the guide. */
  outer?: number;
  /** Length of the guide. */
  guide?: number;
  /** Middle of the guide, from the joint origin in the frame of the body that holds it. */
  centre?: number;
  /** Quill: where the bar ends at the child, from the child's frame. */
  front?: number;
  /** Quill: where its other end is, from the child's frame. */
  back?: number;
  /** Rail: its parent is shaped by hand to hold it, so the rail adds nothing to that body and no seat is cut. */
  free?: boolean;
  /** False when the robot's own `inside` hardware drives it instead of the rack, worm and motor. */
  drive?: boolean;
  /** Where the wheel meets the rack, along the axis, when not centred on the guide. */
  wheel?: number;
  /** Which way along the axis the motor lies from the wheel. */
  away?: 1 | -1;
  /** Radius of the motor. */
  motor?: number;
  /** In section, the bar and drive are cut this much nearer the camera: for a slide that lies off the common plane. */
  cut?: number;
  /** Rail: its span, when it runs on past what its carriage needs to reach what holds it. */
  bar?: [number, number];
  /** How far it opens when exploded, when clearing its guide is not what is wanted. */
  opens?: number;
  /** Key into `paint` for the bar. */
  paint?: string;
}

export interface JointDesign {
  /** Interface plane along the joint axis, from the joint origin. */
  seat?: number;
  /** A hinge however the link runs: an elbow's sideways offset can outgrow the link and read as a roll. */
  hinge?: boolean;
  /** A flat seat however the link runs: stacked arms like a SCARA's turn on a plane across their whole width. */
  roll?: boolean;
  /** Puts the child on the other side of the interface, for a link that doubles back across it. */
  flip?: boolean;
  radius?: number;
  parent?: SideDesign;
  child?: SideDesign;
  drive?: DriveDesign;
  slide?: SlideDesign;
  /** No hardware: the body simply moves, as a mobile base does over the floor. */
  virtual?: boolean;
  /** A plain pin, drawn by the bodies' own shapes: nothing drives it, and its parent still stands. */
  pin?: boolean;
}

export interface PlaneDesign {
  at: Vec3;
  /** Points out of the solid. */
  normal: Vec3;
}

export type ShapeDesign =
  | { sphere: Vec3; r: number }
  | { cone: [Vec3, Vec3]; r: [number, number] }
  | { drum: [Vec3, Vec3]; r: number; round?: number }
  | { dome: Vec3; axis: Vec3; r: number; h: number }
  | { box: Vec3; size: Vec3; round?: number; axis?: Vec3 }
  /** `outline` is [radius, height] points rising up `axis`. */
  | { revolve: Vec3; axis: Vec3; outline: [number, number][] }
  /** A convex block: what lies inside every plane, its edges rounded by `round`. */
  | { planes: PlaneDesign[]; round?: number };

/**
 * A shape merged into, or with `cut` taken out of, the casting. A merge is filleted by the body's blend unless
 * `crisp`, which keeps a true edge, or a fillet of `blend` alone. A cut is sharp unless `blend` gives it a fillet;
 * with `soft` too it melts into the surface and has no edge to draw. `above` keeps only what is above that height.
 * `feature` names what it belongs to: shapes of different features may not overlap. The `host` is what cuts are meant
 * to cut, and the hollow follows it alone, so a thick boss on the casting stays solid. `last` merges it crisply after the
 * joints' own cuts, for a part a knuckle's clearance would otherwise bite into; it must keep clear of that knuckle itself.
 */
export type ShapeOp = ShapeDesign & { cut?: boolean; crisp?: boolean; soft?: boolean; blend?: number; above?: number; feature?: string; host?: boolean; last?: boolean };

/** A flush panel of another paint: the stretch of wall beyond a plane, or within `width` of it. */
export interface CoverDesign {
  label: string;
  paint: string;
  at: Vec3;
  normal: Vec3;
  width?: number;
  /** Further planes bounding it, each keeping what lies on the side its normal points away from. */
  within?: PlaneDesign[];
  /** Keeps only what lies within this of the line through `at` along `normal`: a round cap on a tapering link. */
  radius?: number;
  /** How far it lifts when exploded, when something inside has to come out under it. */
  opens?: number;
  /** Exterior finish only: a section leaves no ghost of it across the cut. */
  trim?: boolean;
}

/** Bolts about the body's own vertical: heads up on a circle, or round socket heads seated at `seats`. */
export interface BoltsDesign {
  size: number;
  z?: number;
  count?: number;
  radius?: number;
  /** Where the first one sits, in degrees from +x. */
  angle?: number;
  seats?: { at: Vec3; facing: Vec3 }[];
}

/** A mecanum wheel on the body, its axle along y. */
export interface WheelDesign {
  at: Vec3;
  r: number;
  width: number;
  /** Which way the rollers lean. */
  hand: 1 | -1;
  /** Where the axle meets the body, along y from the wheel's middle. */
  axle: number;
  /** Keys into `paint`. */
  rollers?: string;
  hub?: string;
  /** How far it comes off its axle when exploded. */
  opens?: number;
}

/** A corner of an outline; with `arc`, the radius of the arc that reaches it, its centre left of the way round when positive. */
export type OutlinePoint = [x: number, y: number, arc?: number];

/**
 * A part drawn as it is made, not cast: true edges at any size, from a drawing's own numbers. Points are relative to the
 * joint origin. `opens` is the way it comes off when exploded; `hull: false` leaves it to its neighbours.
 */
export type MadeDesign = { label: string; paint?: string; opens?: Vec3; layer?: 'structure' | 'drive' | 'fastener'; hull?: false } & (
  /** Off a lathe: [radius, distance along `axis`] from `turned`, from the axis out and back. */
  | { turned: Vec3; axis: Vec3; profile: [number, number][] }
  /** Cut from plate: `outline` and round `holes` ([x, y, r]) in the plane at `sheet`, `x` its first axis, `thick` along `normal`. */
  | { sheet: Vec3; normal: Vec3; x: Vec3; thick: number; outline: OutlinePoint[]; holes?: [number, number, number][]; bevel?: number }
  /** 40-series T-slot from one point to the other, `width` by `height` across, `up` the way the height runs; `mitre` is each end's slope across the width. */
  | { extrusion: [Vec3, Vec3]; width: number; height: number; up: Vec3; caps?: boolean; mitre?: [number, number] }
  /** Socket-head screws on a circle about `axis`, heads standing that way. */
  | { screws: Vec3; axis: Vec3; count: number; r: number; head: number; phase?: number }
);

/** Hardware in a casting's hollow, at points relative to its joint origin. `opens` is the way it comes out when exploded. */
export type InsideDesign = { opens?: Vec3 } & (
  | { motor: Vec3; axis: Vec3; r: number; length: number; gear?: number; label?: string }
  | { belt: [Vec3, Vec3]; axis: Vec3; r: [number, number]; width: number; bore?: number; label?: string }
  /** `size` is half sizes. */
  | { block: Vec3; size: Vec3; label: string; paint?: string }
);

/** A flexible conduit between two bodies, arching up from both and re-formed as they move. Points are relative to each body's joint origin. */
export interface ConduitDesign {
  start: { link: string; at: Vec3 };
  end: { link: string; at: Vec3 };
  r: number;
  /** How far the arch's control points stand above its ends. */
  rise: number;
  paint?: string;
}

export interface BodyDesign {
  /** A quicker, more conservative hull, for a robot still being edited. */
  draft?: boolean;
  label?: string;
  /** Key into `paint`; `shell` when absent. */
  paint?: string;
  /** Length of straight wall above a flat seat before the neck starts to taper. */
  collar?: number;
  /** Sets its fillets, mesh and hull, for a body with no joint end to take them from. */
  size?: number;
  /** False when its shapes alone are the body, with no neck joining its two ends. */
  neck?: boolean;
  /** Points the neck passes through on its way from the joint end, each with its radius: a real link is seldom straight. */
  spine?: { at: Vec3; r: number }[];
  /** Mesh cell, when the body has detail finer than its size suggests. */
  cell?: number;
  /** Fillet between the body's parts, when it should be tighter than its size suggests. */
  blend?: number;
  shapes?: ShapeOp[];
  covers?: CoverDesign[];
  bolts?: BoltsDesign;
  wheels?: WheelDesign[];
  inside?: InsideDesign[];
  /** Parts drawn as they are made; a body can be nothing else. */
  made?: MadeDesign[];
  /** Thickness of the casting's wall. */
  wall?: number;
  /** Most hull spheres; a sharp-cornered body needs more to reach into its corners. */
  spheres?: number;
  /** In section, this body is cut this much nearer the camera than the rest: for a part that lies off the common plane. */
  cut?: number;
}

export interface RobotDesign {
  /** Where the numbers came from; shown nowhere, kept so they can be traced. */
  source?: string;
  paint?: Record<string, PaintDesign>;
  joints?: Record<string, JointDesign>;
  /** By link name: the body that rides that link's joint. */
  links?: Record<string, BodyDesign>;
  base?: BodyDesign;
  /** The lengthwise section, for an arm whose links sit off its middle plane. */
  section?: SectionDesign;
  conduit?: ConduitDesign;
  /** The chain just ends: no flange, no tool. */
  bare?: boolean;
}

/** Where the lengthwise cut lies, on the camera's side of the middle plane. */
export interface SectionDesign {
  at: number;
}
