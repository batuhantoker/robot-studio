// Authored and hosted by ARMOR itself under CC0-1.0 (no upstream repository); downloaded for local use.
export default [
  {
    slug: 'pendulum-wave-device', title: 'Pendulum Wave Device', vendor: 'DCDC LLC (ARMOR)', category: 'other',
    base: 'fixed', tags: ['pendulum', 'physics-demo'],
    // The URDF holds every pendulum out at 45°; at rest they hang straight down, and all 21 need a chain to swing.
    home: Array(21).fill(-Math.PI / 4), maxChains: 21,
    // The URDF's beam hangs in mid-air; a post and foot at each end stand it on the floor.
    extraGeoms: '<geom type="box" size="0.02 0.02 0.385" pos="-1.02 0 0.385" contype="0" conaffinity="0" group="1" rgba="0.3 0.15 0 1" density="0"/><geom type="box" size="0.02 0.02 0.385" pos="1.12 0 0.385" contype="0" conaffinity="0" group="1" rgba="0.3 0.15 0 1" density="0"/><geom type="box" size="0.03 0.3 0.015" pos="-1.02 0 0.015" contype="0" conaffinity="0" group="1" rgba="0.3 0.15 0 1" density="0"/><geom type="box" size="0.03 0.3 0.015" pos="1.12 0 0.015" contype="0" conaffinity="0" group="1" rgba="0.3 0.15 0 1" density="0"/>',
    description: 'Physics demonstration: a row of pendulums of graded lengths that swing in and out of phase.',
    url: 'https://armor.dc-engineer.com/gallery/originals/pendulum-wave-device/pendulum_wave_device.urdf',
    sha256: '87b449ca50eab88cda49f3f518c46864f02645b05dcb23f91a56c1b493f49d23', spdx: 'CC0-1.0',
    dirs: [],
    licenseNote: 'CC0-1.0 as stated on the ARMOR gallery page; ARMOR publishes no separate license file',
  },
];
