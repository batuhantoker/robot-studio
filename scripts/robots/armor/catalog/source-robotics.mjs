// ARMOR gallery robots (source-robotics), resolved to their upstream repositories.
export default [
  {
    slug: 'par6', title: 'Source Robotics PAR6', vendor: 'Source Robotics', category: 'arm', base: 'fixed',
    tags: ['desktop', '6-axis', 'open-source'],
    description: 'Open-source six-axis collaborative desktop arm from Source Robotics, shown with a bare flange.',
    repo: 'Source-Robotics/robot_descriptions', urdf: 'urdf/par6_description/par6_flange.urdf',
    dirs: ['urdf/par6_description'],
  },
  {
    slug: 'parol6', title: 'Source Robotics PAROL6', vendor: 'Source Robotics', category: 'arm', base: 'fixed',
    tags: ['desktop', '6-axis', '3d-printed', 'open-source'],
    description: 'Open-source 3D-printed six-axis desktop arm driven by stepper motors, shown with a bare flange.',
    repo: 'Source-Robotics/robot_descriptions', urdf: 'urdf/parol6_description/parol6_flange.urdf',
    dirs: ['urdf/parol6_description'],
  },
];
