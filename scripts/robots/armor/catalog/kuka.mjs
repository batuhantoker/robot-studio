// ARMOR gallery robots (kuka), resolved to their upstream repositories.
export default [
  {
    slug: 'kuka-kr16', title: 'KUKA KR 16-2', vendor: 'KUKA', category: 'arm', base: 'fixed',
    tags: ['industrial', '6-axis'],
    description: 'Six-axis KUKA arm with a 16 kg payload for arc welding and handling.',
    repo: 'ros-industrial/kuka_experimental', urdf: 'kuka_kr16_support/urdf/kr16_2.urdf',
    dirs: ['kuka_kr16_support/meshes/kr16_2/collision', 'kuka_kr16_support/meshes/kr16_2/visual', 'kuka_kr16_support/urdf'],
  },
  {
    slug: 'kuka-kr3', title: 'KUKA KR 3 R540', vendor: 'KUKA', category: 'arm', base: 'fixed',
    tags: ['industrial', '6-axis', 'compact'],
    description: 'Compact six-axis KUKA arm with a 3 kg payload and 540 mm reach.',
    repo: 'ros-industrial/kuka_experimental', xacro: 'kuka_kr3_support/urdf/kr3r540.xacro',
    dirs: ['kuka_kr3_support/meshes/kr3r540/collision', 'kuka_kr3_support/meshes/kr3r540/visual', 'kuka_kr3_support/urdf', 'kuka_resources/urdf'],
  },
  {
    slug: 'kuka-kr6', title: 'KUKA KR 6 R900 sixx', vendor: 'KUKA', category: 'arm', base: 'fixed',
    tags: ['industrial', '6-axis', 'compact'],
    description: 'Small six-axis KUKA AGILUS arm with a 6 kg payload and 900 mm reach.',
    repo: 'ros-industrial/kuka_experimental', xacro: 'kuka_kr6_support/urdf/kr6r900sixx.xacro',
    dirs: ['kuka_kr6_support/meshes/kr6_agilus/collision', 'kuka_kr6_support/meshes/kr6_agilus/visual', 'kuka_kr6_support/meshes/kr6r900sixx/collision', 'kuka_kr6_support/meshes/kr6r900sixx/visual', 'kuka_kr6_support/urdf', 'kuka_resources/urdf'],
  },
];
