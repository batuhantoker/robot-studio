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
    // RS-series SCARAs are built to hang from above; the URDF has no mount, so it stood on its quill.
    extraGeoms: '<geom type="box" size="0.46 0.06 0.012" pos="0 -0.05 0.245" contype="0" conaffinity="0" group="1" rgba="0.28 0.3 0.33 1" density="0"/><geom type="box" size="0.46 0.016 0.016" pos="0 -0.49 0.245" contype="0" conaffinity="0" group="1" rgba="0.28 0.3 0.33 1" density="0"/><geom type="box" size="0.46 0.016 0.016" pos="0 0.39 0.245" contype="0" conaffinity="0" group="1" rgba="0.28 0.3 0.33 1" density="0"/><geom type="box" size="0.016 0.46 0.016" pos="-0.44 -0.05 0.245" contype="0" conaffinity="0" group="1" rgba="0.28 0.3 0.33 1" density="0"/><geom type="box" size="0.016 0.46 0.016" pos="0.44 -0.05 0.245" contype="0" conaffinity="0" group="1" rgba="0.28 0.3 0.33 1" density="0"/><geom type="box" size="0.016 0.016 0.44" pos="-0.44 -0.49 -0.18" contype="0" conaffinity="0" group="1" rgba="0.28 0.3 0.33 1" density="0"/><geom type="box" size="0.016 0.016 0.44" pos="-0.44 0.39 -0.18" contype="0" conaffinity="0" group="1" rgba="0.28 0.3 0.33 1" density="0"/><geom type="box" size="0.016 0.016 0.44" pos="0.44 -0.49 -0.18" contype="0" conaffinity="0" group="1" rgba="0.28 0.3 0.33 1" density="0"/><geom type="box" size="0.016 0.016 0.44" pos="0.44 0.39 -0.18" contype="0" conaffinity="0" group="1" rgba="0.28 0.3 0.33 1" density="0"/><geom type="box" size="0.03 0.48 0.012" pos="-0.44 -0.05 -0.61" contype="0" conaffinity="0" group="1" rgba="0.28 0.3 0.33 1" density="0"/><geom type="box" size="0.03 0.48 0.012" pos="0.44 -0.05 -0.61" contype="0" conaffinity="0" group="1" rgba="0.28 0.3 0.33 1" density="0"/>',
    tags: ['industrial', 'scara', '4-axis'],
    description: 'Ceiling-mounted four-axis Epson SCARA from the RS4 series with a 350 mm arm length.',
    repo: 'Epson-Robots/epson-robot-ros2',
    xacro: 'epson_robot_description/models/RS4-C351S/urdf/epson_robot.urdf.xacro',
    dirs: ['epson_robot_description/models/RS4-C351S/config', 'epson_robot_description/models/RS4-C351S/meshes', 'epson_robot_description/models/RS4-C351S/urdf'],
  },
];
