// ARMOR gallery robots (pollen), resolved to their upstream repositories.
export default [
  {
    slug: 'reachy-mini', title: 'Pollen Robotics Reachy Mini', vendor: 'Pollen Robotics', category: 'other',
    base: 'fixed', tags: ['desktop', 'stewart-platform', 'open-source'],
    description: 'Desktop expressive robot head from Pollen Robotics moved by a Stewart platform, with a rotating body and two antennas.',
    repo: 'pollen-robotics/reachy_mini', urdf: 'src/reachy_mini/descriptions/reachy_mini/urdf/robot.urdf',
    dirs: ['src/reachy_mini/descriptions/reachy_mini/urdf'],
  },
  {
    slug: 'reachy2', title: 'Pollen Robotics Reachy 2', vendor: 'Pollen Robotics', category: 'humanoid',
    rev: 1,
    base: 'mobile', tags: ['humanoid', 'dual-arm', 'mobile-base', 'open-source'],
    description: 'Open-source humanoid upper body with two seven-axis arms and an expressive head on a mobile base.',
    repo: 'pollen-robotics/reachy2_mujoco', urdf: 'reachy2_mujoco/description/modified_urdf/reachy2.urdf',
    dirs: ['reachy2_mujoco/description/modified_urdf'],
  },
];
