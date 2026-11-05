// ARMOR gallery robots (hightorque), resolved to their upstream repositories.
export default [
  {
    slug: 'hightorque-hi', title: 'HighTorque Mini Hi', vendor: 'HighTorque Robotics', category: 'humanoid',
    rev: 1,
    base: 'floating', tags: ['humanoid', 'biped', 'open-source'],
    description: 'Small open-hardware humanoid from HighTorque with legs, arms and a waist.',
    repo: 'HighTorque-Robotics/ht_robot_urdf', urdf: 'hi_25dof/urdf/hi_25dof.urdf',
    dirs: ['hi_25dof/meshes', 'hi_25dof/urdf'],
  },
  {
    slug: 'hightorque-pi-plus', title: 'HighTorque Mini Pi+', vendor: 'HighTorque Robotics',
    rev: 1,
    category: 'humanoid', base: 'floating', tags: ['humanoid', 'biped', 'open-source'],
    description: 'Small open-hardware humanoid from HighTorque that adds arms to the Mini Pi legs.',
    repo: 'HighTorque-Robotics/ht_robot_urdf', urdf: 'pi_plus_24dof/urdf/pi_plus_24dof.urdf',
    dirs: ['pi_plus_24dof/meshes', 'pi_plus_24dof/urdf'],
  },
  {
    slug: 'hightorque-pi', title: 'HighTorque Mini Pi', vendor: 'HighTorque Robotics', category: 'legged',
    rev: 1,
    base: 'floating', tags: ['biped', 'open-source'],
    description: 'Small open-hardware biped from HighTorque with six joints per leg and no arms.',
    repo: 'HighTorque-Robotics/ht_robot_urdf', urdf: 'pi_12dof/urdf/pi_12dof.urdf',
    dirs: ['pi_12dof/meshes', 'pi_12dof/urdf'],
  },
];
