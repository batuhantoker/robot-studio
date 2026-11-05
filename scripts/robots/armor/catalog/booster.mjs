// ARMOR gallery robots (booster), resolved to their upstream repositories.
export default [
  {
    slug: 'booster-k1', title: 'Booster Robotics K1', vendor: 'Booster Robotics', category: 'humanoid',
    rev: 1,
    base: 'floating', tags: ['humanoid', 'biped', 'robocup'],
    description: 'Kid-sized humanoid from Booster Robotics used in RoboCup-style soccer and research.',
    repo: 'BoosterRobotics/booster_assets', urdf: 'robots/K1/K1_22dof.urdf',
    dirs: ['robots/K1'],
  },
  {
    slug: 'booster-t1', title: 'Booster Robotics T1', vendor: 'Booster Robotics', category: 'humanoid',
    rev: 1,
    base: 'floating', tags: ['humanoid', 'biped', 'robocup'],
    description: 'Adult-proportioned research humanoid from Booster Robotics with arms, legs and a waist joint.',
    repo: 'BoosterRobotics/booster_assets', urdf: 'robots/T1/T1_23dof.urdf',
    dirs: ['robots/T1'],
  },
];
