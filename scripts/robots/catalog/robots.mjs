// Expected licenses are checked against each LICENSE file at fetch time.
export const MENAGERIE_ROBOTS = [
  {
    id: 'franka_panda',
    dir: 'franka_emika_panda',
    xml: 'panda.xml',
    title: 'Franka Emika Panda',
    maker: 'Franka Robotics',
    description:
      '7-DOF collaborative arm with torque sensing in every joint, fitted with the Franka Hand parallel-jaw gripper.',
    spdx: 'Apache-2.0',
    chain: {
      joints: ['joint1', 'joint2', 'joint3', 'joint4', 'joint5', 'joint6', 'joint7'],
      // Midpoint between the fingertip pads (tips reach z = 0.1123 in the hand frame).
      tip: { body: 'hand', pos: [0, 0, 0.1034] },
    },
  },
  {
    id: 'ur5e',
    dir: 'universal_robots_ur5e',
    xml: 'ur5e.xml',
    title: 'Universal Robots UR5e',
    maker: 'Universal Robots',
    description: '6-DOF collaborative industrial arm with a 5 kg payload and 850 mm reach, shown with a bare tool flange.',
    spdx: 'BSD-3-Clause',
    chain: {
      joints: [
        'shoulder_pan_joint',
        'shoulder_lift_joint',
        'elbow_joint',
        'wrist_1_joint',
        'wrist_2_joint',
        'wrist_3_joint',
      ],
      tip: { site: 'attachment_site' },
    },
  },
  {
    id: 'kuka_iiwa14',
    dir: 'kuka_iiwa_14',
    xml: 'iiwa14.xml',
    title: 'KUKA LBR iiwa 14',
    maker: 'KUKA',
    description: '7-DOF lightweight arm with joint torque sensors and a 14 kg payload, shown without an end effector.',
    spdx: 'BSD-3-Clause',
    chain: {
      joints: ['joint1', 'joint2', 'joint3', 'joint4', 'joint5', 'joint6', 'joint7'],
      tip: { site: 'attachment_site' },
    },
  },
  {
    id: 'unitree_z1',
    dir: 'unitree_z1',
    xml: 'z1_gripper.xml',
    title: 'Unitree Z1',
    maker: 'Unitree Robotics',
    description: 'Lightweight 6-DOF arm fitted with a gripper that has one moving jaw against a fixed jaw.',
    spdx: 'BSD-3-Clause',
    chain: {
      joints: ['joint1', 'joint2', 'joint3', 'joint4', 'joint5', 'joint6'],
      // On the flange axis 1 cm inside the jaw tips (tips reach x = 0.200 in link06 when closed).
      tip: { body: 'link06', pos: [0.19, 0, 0] },
    },
  },
  {
    id: 'trossen_vx300s',
    dir: 'trossen_vx300s',
    xml: 'vx300s.xml',
    title: 'Trossen ViperX 300 6DOF',
    maker: 'Trossen Robotics',
    description: '6-DOF research arm built from Dynamixel servos, with a parallel sliding-finger gripper.',
    spdx: 'BSD-3-Clause',
    chain: {
      joints: ['waist', 'shoulder', 'elbow', 'forearm_roll', 'wrist_angle', 'wrist_rotate'],
      tip: { site: 'pinch' },
    },
  },
  {
    id: 'so101',
    dir: 'robotstudio_so101',
    xml: 'so101.xml',
    title: 'SO-101',
    maker: 'TheRobotStudio',
    description: 'Open-source 3D-printed 5-DOF hobby arm driven by Feetech STS3215 servos, with a single moving gripper jaw.',
    spdx: 'Apache-2.0',
    chain: {
      joints: ['shoulder_pan', 'shoulder_lift', 'elbow_flex', 'wrist_flex', 'wrist_roll'],
      tip: { site: 'gripperframe' },
    },
  },
  // `studio` robots lose their free joint and get limbs from the compiled model (menagerie/studio.mjs); `limbs`
  // names each limb's tip body, otherwise ARMOR's leg/arm discovery picks them.
  {
    id: 'ms_human_700',
    dir: 'ms_human_700',
    xml: 'MS-Human-700.xml',
    title: 'MS-Human-700',
    maker: 'LNS Group',
    description:
      'Full-body human musculoskeletal model: 700 muscles, drawn as red cables, wrap over the bones and pull on ' +
      'its 85 joints. The knee\'s small gliding joints follow its angle only in simulation; posed, each has its own slider.',
    spdx: 'Apache-2.0',
    category: 'humanoid',
    // Six pelvis joints make it a floating base: it stands on the floor, not bolted to a bench.
    base: 'floating',
    tags: ['musculoskeletal', 'muscles', 'biomechanics'],
    studio: true,
    limbs: [
      { name: 'right arm', body: 'hand_r' },
      { name: 'left arm', body: 'hand_l' },
      { name: 'right leg', body: 'toes_r' },
      { name: 'left leg', body: 'toes_l' },
      { name: 'head', body: 'head_neck' },
    ],
  },
  {
    id: 'aloha',
    dir: 'aloha',
    xml: 'aloha.xml',
    title: 'ALOHA 2',
    maker: 'Google DeepMind · Stanford',
    description: 'Bimanual teleoperation rig behind ALOHA robot-learning research: two 6-DOF ViperX arms with parallel grippers facing over one table.',
    spdx: 'BSD-3-Clause',
    category: 'arm',
    base: 'fixed',
    tags: ['bimanual', 'teleoperation', 'robot learning'],
    studio: true,
    // keyframe_no_act.xml's neutral_pose: arms folded over the table, grippers open.
    home: [0, -0.96, 1.16, 0, -0.3, 0, 0.0084, 0.0084, 0, -0.96, 1.16, 0, -0.3, 0, 0.0084, 0.0084],
    limbs: [
      { name: 'left arm', body: 'left/gripper_link' },
      { name: 'right arm', body: 'right/gripper_link' },
    ],
  },
  {
    id: 'google_robot',
    dir: 'google_robot',
    xml: 'robot.xml',
    title: 'Google Robot',
    maker: 'Google',
    description: 'The mobile manipulator from Google\'s large-scale robot-learning work (RT-1, SayCan): a 7-DOF arm and parallel-jaw gripper on a wheeled base.',
    spdx: 'Apache-2.0',
    category: 'arm',
    // A wheeled base: it stands on the floor rather than on a bench.
    base: 'mobile',
    tags: ['mobile manipulator', 'rt-1', 'robot learning'],
    studio: true,
    limbs: [{ name: 'arm', body: 'link_gripper' }],
  },
  {
    id: 'apptronik_apollo',
    dir: 'apptronik_apollo',
    xml: 'apptronik_apollo.xml',
    title: 'Apptronik Apollo',
    maker: 'Apptronik',
    description: 'Full-size general-purpose humanoid built for work alongside people, with 32 actuated joints.',
    spdx: 'Apache-2.0',
    category: 'humanoid',
    base: 'floating',
    tags: ['biped', 'commercial'],
    studio: true,
    home: 'stand',
  },
  {
    id: 'google_barkour_vb',
    dir: 'google_barkour_vb',
    xml: 'barkour_vb.xml',
    title: 'Google Barkour vB',
    maker: 'Google DeepMind',
    description: 'The agile quadruped Google DeepMind built to run its dog-style agility course, with three motors per leg.',
    spdx: 'Apache-2.0',
    category: 'legged',
    base: 'floating',
    tags: ['quadruped', 'agility'],
    studio: true,
    // scene.xml's home keyframe without its free-joint values: abduction, hip, knee per leg.
    home: [0, 0.5, 1, 0, 0.5, 1, 0, 0.5, 1, 0, 0.5, 1],
  },
];

export const MONTAJ = {
  id: 'montaj1',
  dir: 'montaj1',
  xml: 'cad_preview.xml',
  title: 'Montaj1 (4-DOF study arm)',
  maker: 'batuhantoker/4dof-robotic-arm',
  description:
    "The SolidWorks 4-DOF arm from the 4dof-robotic-arm study, tessellated from STEP into a visual-only kinematic model.",
  chain: {
    joints: ['cad_joint1', 'cad_joint2', 'cad_joint3', 'cad_joint4'],
    tip: { site: 'tool_tip' },
  },
  license: { spdx: null, file: null, source: 'https://github.com/batuhantoker/4dof-robotic-arm/tree/a2043a14164371bd95f44dd9865d8383d2701d26/matlab' },
};

export const CATALOG_IDS = [...MENAGERIE_ROBOTS.map((r) => r.id), MONTAJ.id];
