import { sparseCheckout } from '../git/sparse.mjs';
import { CACHE_DIR } from '../paths.mjs';

export const MENAGERIE_URL = 'https://github.com/google-deepmind/mujoco_menagerie';
// Bump with: git ls-remote https://github.com/google-deepmind/mujoco_menagerie HEAD
export const MENAGERIE_COMMIT = '98a70c569c4c1b6da467a20012f766ee1f8dc521';

export const ensureMenagerie = (dirs) =>
  sparseCheckout({ url: MENAGERIE_URL, commit: MENAGERIE_COMMIT, dir: CACHE_DIR, dirs, label: 'mujoco_menagerie' });
