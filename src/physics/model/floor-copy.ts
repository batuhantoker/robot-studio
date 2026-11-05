/**
 * A second compile of a robot that can fall. Every library model is bolted to the world with no floor, so the whole
 * worldbody (URDF imports leave base geoms in it) goes inside one free body, beside a plane. Bodies shift by one.
 */
import { ModelHandle } from './handle';

export const FREE_JOINT = 'studio_free';
export const FLOOR_GEOM = 'studio_floor';
/** The wrapper body, first under the world. */
export const ROOT_BODY = 1;

export function floorXml(xml: string): string {
  const tag = '<worldbody>';
  const open = xml.indexOf(tag), close = xml.lastIndexOf('</worldbody>');
  if (open < 0 || close < 0) throw new Error('no worldbody');
  const floor = `<geom name="${FLOOR_GEOM}" type="plane" size="0 0 1" pos="0 0 -100" contype="0" conaffinity="1"/>`;
  const body = `<body name="studio_root"><freejoint name="${FREE_JOINT}"/><inertial pos="0 0 0" mass="0.001" diaginertia="1e-6 1e-6 1e-6"/>`;
  const inner = xml.slice(open + tag.length, close);
  // Keyframes hold qpos for the bolted model, the wrong length now.
  return `${xml.slice(0, open)}${tag}${floor}${body}${inner}</body>${xml.slice(close)}`.replace(/<keyframe>[\s\S]*?<\/keyframe>/, '');
}

export function compileFloorCopy(files: Map<string, Uint8Array>, entry: string): Promise<ModelHandle> {
  const patched = new Map(files);
  patched.set(entry, new TextEncoder().encode(floorXml(new TextDecoder().decode(files.get(entry)!))));
  return ModelHandle.fromFiles(patched, entry);
}
