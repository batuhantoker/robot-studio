// ARMOR gallery robots (epson), resolved to their upstream repositories.
export default [
  {
    slug: 'epson-c8-c901s', title: 'Epson C8-C901S', vendor: 'Epson Robots', category: 'arm', base: 'fixed',
    tags: ['industrial', '6-axis', 'compact'],
    description: 'Compact six-axis Epson arm from the C8 series with about 900 mm reach.',
    repo: 'Epson-Robots/epson-robot-ros2',
    xacro: 'epson_robot_description/models/C8-C901S/urdf/epson_robot.urdf.xacro',
    dirs: ['epson_robot_description/models/C8-C901S/config', 'epson_robot_description/models/C8-C901S/meshes', 'epson_robot_description/models/C8-C901S/urdf'],
  },
  {
    slug: 'epson-gx8-c452s', title: 'Epson GX8-C452S', vendor: 'Epson Robots', category: 'arm', base: 'fixed',
    tags: ['industrial', 'scara', '4-axis'],
    description: 'Four-axis Epson SCARA from the GX8 series with a 450 mm arm length.',
    repo: 'Epson-Robots/epson-robot-ros2',
    xacro: 'epson_robot_description/models/GX8-C452S/urdf/epson_robot.urdf.xacro',
    dirs: ['epson_robot_description/models/GX8-C452S/config', 'epson_robot_description/models/GX8-C452S/meshes', 'epson_robot_description/models/GX8-C452S/urdf'],
  },
  {
    slug: 'epson-rs4-c351s', title: 'Epson RS4-C351S', vendor: 'Epson Robots', category: 'arm', base: 'fixed',
    tags: ['industrial', 'scara', '4-axis'],
    description: 'Ceiling-mounted four-axis Epson SCARA from the RS4 series with a 350 mm arm length.',
    repo: 'Epson-Robots/epson-robot-ros2',
    xacro: 'epson_robot_description/models/RS4-C351S/urdf/epson_robot.urdf.xacro',
    dirs: ['epson_robot_description/models/RS4-C351S/config', 'epson_robot_description/models/RS4-C351S/meshes', 'epson_robot_description/models/RS4-C351S/urdf'],
  },
];
