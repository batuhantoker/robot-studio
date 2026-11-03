import path from 'node:path';
import { FOUR_DOF_COMMIT, FOUR_DOF_URL } from '../../fixtures/upstream.mjs';
import { sparseCheckout } from '../git/sparse.mjs';
import { STUDIO } from '../paths.mjs';

export const FOUR_DOF_CACHE = path.join(STUDIO, '.cache', 'four-dof-arm');

// The STEP assembly (matlab/) and its converter (python/scripts/preview_cad.py).
export const ensureFourDof = () =>
  sparseCheckout({ url: FOUR_DOF_URL, commit: FOUR_DOF_COMMIT, dir: FOUR_DOF_CACHE, dirs: ['matlab', 'python/scripts'], label: '4dof-robotic-arm' });
