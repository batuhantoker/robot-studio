// ARMOR gallery robots (deep-robotics), resolved to their upstream repositories.
export default [
  {
    slug: 'deeprobotics-dr02', title: 'Deep Robotics DR02 Pro', vendor: 'Deep Robotics', category: 'humanoid',
    rev: 1,
    base: 'floating', tags: ['humanoid', 'biped'],
    description: 'Full-size industrial humanoid from Deep Robotics with articulated arms, legs and waist.',
    repo: 'DeepRoboticsLab/deep_robotics_model', urdf: 'DR02/urdf/pro/DR02-pro.urdf',
    dirs: ['DR02/urdf/pro'],
  },
  {
    slug: 'deeprobotics-lite3', title: 'Deep Robotics Lite3', vendor: 'Deep Robotics', category: 'legged',
    base: 'floating', tags: ['quadruped', 'research'],
    description: 'Compact research quadruped from Deep Robotics with three actuated joints per leg.',
    repo: 'DeepRoboticsLab/deep_robotics_model', urdf: 'Lite3/urdf/Lite3.urdf',
    dirs: ['Lite3/urdf'],
  },
  {
    slug: 'deeprobotics-m20', title: 'Deep Robotics Lynx M20', vendor: 'Deep Robotics', category: 'legged',
    base: 'floating', tags: ['quadruped', 'wheel-legged'],
    description: 'Wheel-legged quadruped from Deep Robotics with a driven wheel at the end of each leg.',
    repo: 'DeepRoboticsLab/deep_robotics_model', urdf: 'M20/urdf/M20.urdf',
    dirs: ['M20/urdf'],
  },
  {
    slug: 'deeprobotics-s10', title: 'Deep Robotics Lynx S10', vendor: 'Deep Robotics', category: 'legged',
    base: 'floating', tags: ['quadruped', 'wheel-legged'],
    description: 'Wheel-legged quadruped from Deep Robotics that can roll on its feet or walk.',
    repo: 'DeepRoboticsLab/deep_robotics_model', urdf: 'S10/urdf/S10.urdf',
    dirs: ['S10/urdf'],
  },
  {
    slug: 'deeprobotics-x30', title: 'Deep Robotics X30', vendor: 'Deep Robotics', category: 'legged',
    base: 'floating', tags: ['quadruped', 'inspection'],
    description: 'Ruggedised industrial inspection quadruped from Deep Robotics.',
    repo: 'DeepRoboticsLab/deep_robotics_model', urdf: 'X30/urdf/X30.urdf',
    dirs: ['X30/urdf'],
  },
];
