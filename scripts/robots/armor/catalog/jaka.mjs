// ARMOR gallery robots (jaka), resolved to their upstream repositories.
// Joints 2 and 4 centre on 90°: at zero the arm lies flat with its wrist below the base.
const JAKA_READY = { joint_2: Math.PI / 2, joint_3: Math.PI / 2, joint_4: Math.PI / 2, joint_5: Math.PI };

export default [
  {
    slug: 'jaka-a', title: 'JAKA A5', vendor: 'JAKA Robotics', category: 'arm', base: 'fixed',
    home: JAKA_READY,
    tags: ['cobot', '6-axis'],
    description: 'Six-axis collaborative arm from JAKA with a 5 kg payload.',
    repo: 'JAKARobotics/jaka_ros2', urdf: 'src/jaka_description/urdf/jaka_a5.urdf',
    dirs: ['src/jaka_description/meshes/jaka_a5_meshes', 'src/jaka_description/urdf'],
  },
  {
    slug: 'jaka-c', title: 'JAKA C5', vendor: 'JAKA Robotics', category: 'arm', base: 'fixed',
    home: JAKA_READY,
    tags: ['cobot', '6-axis'],
    description: 'Six-axis collaborative arm from the JAKA C series with a 5 kg payload.',
    repo: 'JAKARobotics/jaka_ros2', urdf: 'src/jaka_description/urdf/jaka_c5.urdf',
    dirs: ['src/jaka_description/meshes/jaka_c5_meshes', 'src/jaka_description/urdf'],
  },
  {
    slug: 'jaka-k1', title: 'JAKA K1', vendor: 'JAKA Robotics', category: 'arm', base: 'fixed',
    tags: ['cobot', 'dual-arm'],
    description: 'Dual-arm collaborative robot from JAKA with two seven-axis arms on a torso.',
    repo: 'JAKARobotics/JAKA_K1', urdf: 'jaka_k1_ros2/src/jaka_k1_description/k1-de/urdf/jaka_k1.urdf',
    dirs: ['jaka_k1_ros2/src/jaka_k1_description/k1-arm/meshes', 'jaka_k1_ros2/src/jaka_k1_description/k1-de/urdf'],
  },
  {
    slug: 'jaka-lumi', title: 'JAKA Lumi', vendor: 'JAKA Robotics', category: 'mobile', base: 'mobile',
    tags: ['mobile-manipulator', 'wheeled'],
    description: 'Wheeled mobile manipulator from JAKA carrying a collaborative arm on a lifting torso.',
    repo: 'JAKARobotics/JAKA_Lumi', urdf: 'jaka_lumi_ros/src/jaka_lumi_description/urdf/jaka_lumi.urdf',
    dirs: ['jaka_lumi_ros/src/jaka_lumi_description/meshes', 'jaka_lumi_ros/src/jaka_lumi_description/urdf'],
  },
  {
    slug: 'jaka-pi', title: 'JAKA PI', vendor: 'JAKA Robotics', category: 'humanoid', base: 'floating',
    tags: ['humanoid', 'biped'],
    description: 'Full-body humanoid from JAKA modelled with detailed leg linkages.',
    repo: 'JAKARobotics/JAKA_RL_Lab', urdf: 'deploy/meshes/Jaka_Pi.urdf',
    dirs: ['deploy/meshes'],
  },
  {
    slug: 'jaka-pro', title: 'JAKA Pro7', vendor: 'JAKA Robotics', category: 'arm', base: 'fixed',
    home: JAKA_READY,
    tags: ['cobot', '6-axis'],
    description: 'Six-axis JAKA Pro series cobot with a 7 kg payload and a higher protection rating.',
    repo: 'JAKARobotics/jaka_ros2', urdf: 'src/jaka_description/urdf/jaka_pro7.urdf',
    dirs: ['src/jaka_description/meshes/jaka_pro7_meshes', 'src/jaka_description/urdf'],
  },
  {
    slug: 'jaka-s', title: 'JAKA S5', vendor: 'JAKA Robotics', category: 'arm', base: 'fixed',
    home: JAKA_READY,
    tags: ['cobot', '6-axis'],
    description: 'Six-axis safety-oriented collaborative arm from the JAKA S series with a 5 kg payload.',
    repo: 'JAKARobotics/jaka_ros2', urdf: 'src/jaka_description/urdf/jaka_s5.urdf',
    dirs: ['src/jaka_description/meshes/jaka_s5_meshes', 'src/jaka_description/urdf'],
  },
  {
    slug: 'jaka-zu', title: 'JAKA Zu5', vendor: 'JAKA Robotics', category: 'arm', base: 'fixed',
    home: JAKA_READY,
    tags: ['cobot', '6-axis'],
    description: 'Six-axis collaborative arm from the JAKA Zu series with a 5 kg payload.',
    repo: 'JAKARobotics/jaka_ros2', urdf: 'src/jaka_description/urdf/jaka_zu5.urdf',
    dirs: ['src/jaka_description/meshes/jaka_zu5_meshes', 'src/jaka_description/urdf'],
  },
];
