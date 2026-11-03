import { REPOS, repoCommit } from './repos.mjs';
import abb from './abb.mjs';
import armorOriginals from './armor-originals.mjs';
import alvarez from './alvarez.mjs';
import armsMisc from './arms-misc.mjs';
import berkeley from './berkeley.mjs';
import booster from './booster.mjs';
import deepRobotics from './deep-robotics.mjs';
import drones from './drones.mjs';
import epson from './epson.mjs';
import fanuc from './fanuc.mjs';
import hightorque from './hightorque.mjs';
import humanoidsMisc from './humanoids-misc.mjs';
import jaka from './jaka.mjs';
import kawasaki from './kawasaki.mjs';
import kuka from './kuka.mjs';
import leggedMisc from './legged-misc.mjs';
import luwu from './luwu.mjs';
import mitsubishi from './mitsubishi.mjs';
import mobileMisc from './mobile-misc.mjs';
import nasaJpl from './nasa-jpl.mjs';
import pollen from './pollen.mjs';
import sourceRobotics from './source-robotics.mjs';
import unitree from './unitree.mjs';
import universalRobots from './universal-robots.mjs';

// Gallery order (by slug), as on armor.dc-engineer.com/gallery/.
export const ARMOR_ROBOTS = [
  ...[abb, armorOriginals, alvarez, armsMisc, berkeley, booster, deepRobotics, drones, epson, fanuc, hightorque, humanoidsMisc, jaka, kawasaki, kuka, leggedMisc, luwu, mitsubishi, mobileMisc, nasaJpl, pollen, sourceRobotics, unitree, universalRobots].flat(),
].sort((a, b) => a.slug.localeCompare(b.slug));
export const armorId = (slug) => `armor-${slug}`;
export const ARMOR_IDS = ARMOR_ROBOTS.map((r) => armorId(r.slug));
// What a build is pinned to: the repo commit, or the sha256 of a directly downloaded file.
export const pinOf = (robot) => (robot.url ? robot.sha256 : repoCommit(robot.repo));

const CATEGORIES = new Set(['arm', 'legged', 'humanoid', 'mobile', 'aerial', 'hand', 'other']);
const BASES = new Set(['fixed', 'floating', 'mobile']);
for (const r of ARMOR_ROBOTS) {
  const sources = ['urdf', 'xacro', 'zip', 'url'].filter((k) => r[k]);
  const problems = [
    sources.length !== 1 && 'needs exactly one of urdf/xacro/zip/url',
    (r.url ? !/^[0-9a-f]{64}$/.test(r.sha256 ?? '') : !REPOS[r.repo]) && 'repo or url+sha256 is not pinned',
    ...Object.keys(r.extra ?? {}).filter((k) => !REPOS[k]).map((k) => `extra repo ${k} is not pinned`),
    !CATEGORIES.has(r.category) && `bad category ${r.category}`,
    !BASES.has(r.base) && `bad base ${r.base}`,
    !(r.title && r.vendor && r.description && Array.isArray(r.dirs)) && 'missing title/vendor/description/dirs',
  ].filter(Boolean);
  if (problems.length) throw new Error(`armor catalog ${r.slug}: ${problems.join('; ')}`);
}
if (new Set(ARMOR_IDS).size !== ARMOR_IDS.length) throw new Error('armor catalog has duplicate slugs');
