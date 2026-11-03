// ARMOR gallery robots (abb), resolved to their upstream repositories.
export default [
  {
    slug: 'abb-crb15000', title: 'ABB GoFa CRB 15000', vendor: 'ABB', category: 'arm', base: 'fixed',
    tags: ['cobot', '6-axis'],
    description: 'Six-axis collaborative arm from ABB, here the 5 kg / 0.95 m reach variant.',
    repo: 'ros-industrial/abb', xacro: 'abb_crb15000_support/urdf/crb15000_5_95.xacro',
    dirs: ['abb_crb15000_support/meshes/crb15000_5_95/collision', 'abb_crb15000_support/meshes/crb15000_5_95/visual', 'abb_crb15000_support/urdf', 'abb_resources/urdf'],
  },
  {
    slug: 'abb-irb120', title: 'ABB IRB 120', vendor: 'ABB', category: 'arm', base: 'fixed',
    tags: ['industrial', '6-axis', 'compact'],
    description: 'ABB\'s smallest six-axis industrial arm, modelled in its 3 kg / 0.58 m reach version.',
    repo: 'ros-industrial/abb', xacro: 'abb_irb120_support/urdf/irb120_3_58.xacro',
    dirs: ['abb_irb120_support/meshes/irb120_3_58/collision', 'abb_irb120_support/meshes/irb120_3_58/visual', 'abb_irb120_support/urdf', 'abb_resources/urdf'],
  },
  {
    slug: 'abb-irb2400', title: 'ABB IRB 2400', vendor: 'ABB', category: 'arm', base: 'fixed',
    tags: ['industrial', '6-axis'],
    description: 'Mid-size six-axis industrial arm from ABB, modelled in its 12 kg / 1.55 m reach version.',
    repo: 'ros-industrial/abb', xacro: 'abb_irb2400_support/urdf/irb2400_12_155.xacro',
    dirs: ['abb_irb2400_support/meshes/irb2400_common/collision', 'abb_irb2400_support/meshes/irb2400_common/visual', 'abb_irb2400_support/urdf', 'abb_resources/urdf'],
  },
  {
    slug: 'abb-irb4600', title: 'ABB IRB 4600', vendor: 'ABB', category: 'arm', base: 'fixed',
    tags: ['industrial', '6-axis'],
    description: 'Six-axis industrial arm from ABB, modelled in its 60 kg / 2.05 m reach version.',
    repo: 'ros-industrial/abb', xacro: 'abb_irb4600_support/urdf/irb4600_60_205.xacro',
    dirs: ['abb_irb4600_support/meshes/irb4600/collision', 'abb_irb4600_support/meshes/irb4600/visual', 'abb_irb4600_support/meshes/irb4600_60_205/collision', 'abb_irb4600_support/meshes/irb4600_60_205/visual', 'abb_irb4600_support/urdf'],
  },
  {
    slug: 'abb-irb6640', title: 'ABB IRB 6640', vendor: 'ABB', category: 'arm', base: 'fixed',
    tags: ['industrial', '6-axis', 'heavy-payload'],
    description: 'Large six-axis ABB arm for heavy handling and spot welding.',
    repo: 'ros-industrial/abb', xacro: 'abb_irb6600_support/urdf/irb6640.xacro',
    dirs: ['abb_irb6600_support/meshes/irb6640/collision', 'abb_irb6600_support/meshes/irb6640/visual', 'abb_irb6600_support/urdf'],
  },
  {
    slug: 'abb-irb6700', title: 'ABB IRB 6700', vendor: 'ABB', category: 'arm', base: 'fixed',
    tags: ['industrial', '6-axis', 'heavy-payload'],
    description: 'Large six-axis ABB arm, modelled in its 200 kg / 2.60 m reach version.',
    repo: 'ros-industrial/abb', xacro: 'abb_irb6700_support/urdf/irb6700_200_260.xacro',
    dirs: ['abb_irb6700_support/meshes/irb6700/collision', 'abb_irb6700_support/meshes/irb6700/visual', 'abb_irb6700_support/meshes/irb6700_200_260/collision', 'abb_irb6700_support/meshes/irb6700_200_260/visual', 'abb_irb6700_support/urdf', 'abb_resources/urdf'],
  },
  {
    slug: 'abb-yumi', title: 'ABB YuMi', vendor: 'ABB', category: 'arm', base: 'fixed',
    tags: ['cobot', 'dual-arm', '7-axis'],
    description: 'ABB\'s dual-arm collaborative robot with two seven-axis arms on a shared torso, shown without grippers.',
    repo: 'ethz-asl/yumi', xacro: 'yumi_description/urdf/yumi_nogrippers.urdf.xacro',
    args: { prefix: 'PositionJointInterface' },
    dirs: ['yumi_description/gazebo', 'yumi_description/meshes', 'yumi_description/urdf'],
  },
];
