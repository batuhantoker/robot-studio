// ARMOR gallery robots (humanoids-misc), resolved to their upstream repositories.
export default [
  {
    slug: 'agibot-x2', title: 'AgiBot X2 Ultra', vendor: 'AgiBot', category: 'humanoid', base: 'floating',
    tags: ['humanoid', 'biped'],
    description: 'Compact full-body humanoid from AgiBot with articulated legs, waist, arms and head.',
    repo: 'AgibotTech/agibot_x2_urdf', urdf: 'X2_URDF-v1.4.0/X2-Ultra_simple_collision.urdf',
    dirs: ['X2_URDF-v1.4.0'],
  },
  {
    slug: 'fourier-gr1', title: 'Fourier GR-1', vendor: 'Fourier Intelligence', category: 'humanoid',
    base: 'floating', tags: ['humanoid', 'biped'],
    description: 'General-purpose full-size humanoid from Fourier Intelligence, modelled in its GR1T1 configuration.',
    repo: 'FFTAI/Wiki-GRx-Models', urdf: 'GRX/GR1/gr1t1/basic_urdf/gr1t1.urdf',
    dirs: ['GRX/GR1/gr1t1/basic_urdf', 'GRX/GR1/gr1t1/meshes/gr1t1'],
  },
  {
    slug: 'icub', title: 'iCub', vendor: 'Istituto Italiano di Tecnologia', category: 'humanoid',
    base: 'floating', tags: ['humanoid', 'research', 'open-source'],
    description: 'IIT\'s child-sized open-source research humanoid, modelled from the Gazebo V2.7 description.',
    repo: 'robotology/icub-models', urdf: 'iCub/robots/iCubGazeboV2_7/model.urdf',
    dirs: ['iCub/meshes/simmechanics', 'iCub/robots/iCubGazeboV2_7'],
  },
  {
    slug: 'lerobot-humanoid', title: 'Hugging Face LeRobot Humanoid', vendor: 'Hugging Face',
    category: 'humanoid', base: 'floating', tags: ['humanoid', 'biped', '3d-printed', 'open-source'],
    description: 'Low-cost 3D-printed open-source biped from the LeRobot project, here the leg-only version.',
    repo: 'huggingface/lerobot-humanoid-model', urdf: 'models/bipedal_plateform_no_arms/urdf/robot.urdf',
    dirs: ['models/bipedal_plateform_no_arms/urdf'],
  },
  {
    slug: 'poppy-humanoid', title: 'Poppy Humanoid', vendor: 'Poppy Project', category: 'humanoid',
    base: 'floating', tags: ['humanoid', 'open-source', 'education'],
    description: 'Open-source 3D-printed humanoid from the Poppy Project built with Dynamixel servos.',
    repo: 'poppy-project/poppy-humanoid', urdf: 'hardware/URDF/robots/Poppy_Humanoid.URDF',
    dirs: ['hardware/URDF/meshes', 'hardware/URDF/robots'],
  },
  {
    slug: 'roboto-origin', title: 'RoboParty Roboto Origin', vendor: 'RoboParty', category: 'humanoid',
    base: 'floating', tags: ['humanoid', 'biped', 'open-source'],
    description: 'Open-source full-size humanoid from RoboParty with articulated arms and legs.',
    repo: 'Roboparty/roboto_origin', urdf: 'modules/rpo_description/urdf/rpo.urdf',
    dirs: ['modules/rpo_description/meshes', 'modules/rpo_description/urdf'],
  },
  {
    slug: 'star1', title: 'RobotEra STAR1', vendor: 'RobotEra', category: 'humanoid', base: 'floating',
    tags: ['humanoid', 'biped', 'dexterous-hands'],
    description: 'Full-size humanoid from RobotEra with dexterous multi-fingered hands.',
    repo: 'roboterax/models', urdf: 'star1/urdf/l3_with_hand_fixedpin_xml.urdf',
    dirs: ['star1/meshes', 'star1/urdf'],
  },
];
