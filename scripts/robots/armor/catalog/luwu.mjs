// ARMOR gallery robots (luwu), resolved to their upstream repositories.
export default [
  {
    slug: 'xgo-lite3', title: 'Luwu XGO Lite3', vendor: 'Luwu Dynamics', category: 'legged', base: 'floating',
    tags: ['quadruped', 'desktop', 'manipulator'],
    description: 'Desktop servo quadruped from Luwu Dynamics with a small arm on its back.',
    repo: 'LuwuDynamics/luwu_mjlab', urdf: 'src/assets/robots/lite3/xmls/lite3.urdf',
    dirs: ['src/assets/robots/lite3/xmls'],
  },
  {
    slug: 'xgo-mini2', title: 'Luwu XGO Mini2', vendor: 'Luwu Dynamics', category: 'legged', base: 'floating',
    tags: ['quadruped', 'desktop', 'manipulator'],
    description: 'Desktop servo quadruped from Luwu Dynamics with a small arm and gripper.',
    repo: 'LuwuDynamics/luwu_mjlab', urdf: 'src/assets/robots/mini2s/xmls/mini2s.urdf',
    dirs: ['src/assets/robots/mini2s/meshes/dae', 'src/assets/robots/mini2s/xmls'],
  },
];
