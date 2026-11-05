// ARMOR gallery robots (alvarez), resolved to their upstream repositories.
export default [
  {
    slug: 'axioma-robot', title: 'Axioma', vendor: 'Mario David Alvarez Vallejo', category: 'mobile',
    rev: 1,
    base: 'mobile', tags: ['wheeled', '4wd', 'open-source'],
    description: 'Open-source four-wheel ROS 2 research rover designed for SLAM and autonomous navigation.',
    repo: 'MrDavidAlv/Axioma_robot', xacro: 'src/axioma_description/urdf/axioma.urdf.xacro',
    dirs: ['src/axioma_description/meshes/collision', 'src/axioma_description/meshes/visual', 'src/axioma_description/urdf'],
  },
  {
    slug: 'tadeo-ecar', title: 'Tadeo eCar', vendor: 'Mario David Alvarez Vallejo', category: 'mobile',
    rev: 1,
    base: 'mobile', tags: ['wheeled', 'four-wheel-steering', 'open-source'],
    description: 'Open-source autonomous research car with four-wheel drive and four-wheel steering.',
    repo: 'MrDavidAlv/tadeo-eCar-ws', xacro: 'src/tadeocar_description/urdf/tadeocar.urdf.xacro',
    dirs: ['src/tadeocar_description/meshes/chassis', 'src/tadeocar_description/meshes/lamps', 'src/tadeocar_description/meshes/sensors', 'src/tadeocar_description/meshes/suspension', 'src/tadeocar_description/meshes/wheels', 'src/tadeocar_description/urdf'],
  },
  {
    slug: 'tattotronix', title: 'TATTOTRONIX', vendor: 'Mario David Alvarez Vallejo', category: 'arm',
    base: 'fixed', tags: ['desktop', '5-axis', '3d-printed', 'open-source'],
    description: 'Open-source 3D-printed five-axis desktop arm built to hold a tattoo machine.',
    repo: 'MrDavidAlv/TATTOTRONIX', xacro: 'src/tattotronix_description/urdf/tattotronix.urdf.xacro',
    args: { tool: 'tattoo' },
    dirs: ['src/tattotronix_description/meshes/collision', 'src/tattotronix_description/meshes/visual', 'src/tattotronix_description/urdf'],
  },
];
