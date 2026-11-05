// ARMOR gallery robots (universal-robots), resolved to their upstream repositories.
// At zero a UR lies stretched out flat; this is Menagerie's UR5e home.
const UR_READY = { shoulder_pan_joint: -Math.PI / 2, shoulder_lift_joint: -Math.PI / 2, elbow_joint: Math.PI / 2, wrist_1_joint: -Math.PI / 2, wrist_2_joint: -Math.PI / 2 };

export default [
  {
    slug: 'ur-series', title: 'Universal Robots UR15', vendor: 'Universal Robots', category: 'arm',
    home: UR_READY,
    base: 'fixed', tags: ['cobot', '6-axis'],
    description: 'Six-axis Universal Robots cobot with a 15 kg payload, from the official ROS 2 description.',
    repo: 'UniversalRobots/Universal_Robots_ROS2_Description', xacro: 'urdf/ur.urdf.xacro',
    args: { ur_type: 'ur15', name: 'ur15' },
    dirs: ['config/ur15', 'meshes/ur15/collision', 'meshes/ur15/visual', 'urdf'],
  },
  {
    slug: 'ur5e', title: 'Universal Robots UR5e (ROS 2 description)', vendor: 'Universal Robots',
    home: UR_READY,
    category: 'arm', base: 'fixed', tags: ['cobot', '6-axis'],
    description: 'Six-axis Universal Robots e-Series cobot with a 5 kg payload, from the official ROS 2 description.',
    repo: 'UniversalRobots/Universal_Robots_ROS2_Description', xacro: 'urdf/ur.urdf.xacro',
    args: { ur_type: 'ur5e', name: 'ur5e' },
    dirs: ['config/ur5e', 'meshes/ur5e/collision', 'meshes/ur5e/visual', 'urdf'],
  },
];
