// ARMOR gallery robots (drones), resolved to their upstream repositories.
export default [
  {
    slug: 'crazyflie', title: 'Bitcraze Crazyflie', vendor: 'Bitcraze', category: 'aerial', base: 'floating',
    tags: ['drone', 'quadrotor', 'micro'],
    description: 'Palm-sized open-source quadrotor from Bitcraze used widely in swarm and control research.',
    repo: 'bitcraze/crazyflie-simulation',
    xacro: 'crazyflie_ws/src/crazyflie_description/urdf/crazyflie_body.xacro',
    dirs: ['crazyflie_ws/src/crazyflie_description/meshes/collada_files', 'crazyflie_ws/src/crazyflie_description/urdf'],
  },
  {
    slug: 'hummingbird', title: 'AscTec Hummingbird', vendor: 'Ascending Technologies', category: 'aerial',
    base: 'floating', tags: ['drone', 'quadrotor', 'research'],
    description: 'Research quadrotor from Ascending Technologies as modelled in the ETH RotorS simulator.',
    repo: 'ethz-asl/rotors_simulator', xacro: 'rotors_description/urdf/hummingbird.xacro',
    args: { namespace: 'hummingbird' },
    dirs: ['rotors_description/meshes', 'rotors_description/urdf'],
  },
  {
    slug: 'techpod', title: 'Applied Aeronautics Techpod', vendor: 'Applied Aeronautics', category: 'aerial',
    base: 'floating', tags: ['fixed-wing', 'research'],
    description: 'Fixed-wing UAV airframe as modelled in the ETH RotorS simulator.',
    repo: 'ethz-asl/rotors_simulator', xacro: 'rotors_description/urdf/techpod.xacro',
    args: { namespace: 'techpod', aero_params_yaml_file: 'none', vehicle_params_yaml_file: 'none', is_input_joystick: 'false' },
    dirs: ['rotors_description/meshes', 'rotors_description/urdf'],
    // Its Y_UP Collada body only lines up with the collision box when up_axis is applied.
    colladaUpAxis: true,
  },
];
