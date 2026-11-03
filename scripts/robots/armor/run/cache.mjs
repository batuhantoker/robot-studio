import fs from 'node:fs';
import path from 'node:path';
import { ARMOR_OUT, ROBOTS_DIR } from '../../paths.mjs';
import { pinOf } from '../catalog/index.mjs';

// Bump when prepare/compile output changes so cached robots are rebuilt.
export const PIPELINE = 5;
const BUILD_KEYS = ['repo', 'urdf', 'xacro', 'zip', 'url', 'inner', 'args', 'dirs', 'extra', 'category', 'colladaUpAxis', 'rootQuat'];
const buildKey = (robot) => JSON.stringify(BUILD_KEYS.map((k) => robot[k] ?? null));
const stampFile = (robot) => path.join(ARMOR_OUT, robot.slug, 'entry.json');

// A previous build of this robot whose inputs are unchanged and whose files are all on disk.
export function cachedEntry(robot) {
  try {
    const stamp = JSON.parse(fs.readFileSync(stampFile(robot), 'utf8'));
    const fresh =
      stamp.pipeline === PIPELINE && stamp.commit === pinOf(robot) && stamp.build === buildKey(robot);
    const files = [...stamp.entry.files, stamp.entry.license.file].filter(Boolean);
    if (!fresh || !files.every((f) => fs.existsSync(path.join(ROBOTS_DIR, f)))) return null;
    const { title, vendor, description, base, tags } = robot;
    return { ...stamp.entry, title, maker: vendor, vendor, description, base, tags };
  } catch {
    return null;
  }
}

export function saveEntry(robot, entry) {
  const stamp = { pipeline: PIPELINE, commit: pinOf(robot), build: buildKey(robot), entry };
  fs.writeFileSync(stampFile(robot), `${JSON.stringify(stamp, null, 2)}\n`);
}
