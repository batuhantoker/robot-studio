// ARMOR gallery robots (berkeley), resolved to their upstream repositories.
export default [
  {
    slug: 'berkeley-humanoid-lite', title: 'Berkeley Humanoid Lite', vendor: 'Hybrid Robotics (UC Berkeley)',
    category: 'humanoid', base: 'floating', tags: ['humanoid', 'biped', '3d-printed', 'open-source'],
    description: 'Low-cost, largely 3D-printed open-source humanoid with arms and legs from UC Berkeley.',
    repo: 'HybridRobotics/Berkeley-Humanoid-Lite-Assets',
    urdf: 'data/robots/berkeley_humanoid/berkeley_humanoid_lite/urdf/berkeley_humanoid_lite.urdf',
    dirs: ['data/robots/berkeley_humanoid/berkeley_humanoid_lite/meshes', 'data/robots/berkeley_humanoid/berkeley_humanoid_lite/urdf'],
  },
  {
    slug: 'berkeley-humanoid', title: 'Berkeley Humanoid', vendor: 'Hybrid Robotics (UC Berkeley)',
    category: 'humanoid', base: 'floating', tags: ['humanoid', 'biped', 'research'],
    description: 'Leg-only research humanoid from UC Berkeley Hybrid Robotics built for learned locomotion.',
    repo: 'HybridRobotics/berkeley_humanoid_description', urdf: 'urdf/robot.urdf',
    dirs: ['meshs', 'urdf'],
  },
];
