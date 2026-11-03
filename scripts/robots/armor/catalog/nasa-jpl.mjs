// ARMOR gallery robots (nasa-jpl), resolved to their upstream repositories.
export default [
  {
    slug: 'ingenuity', title: 'NASA Ingenuity', vendor: 'NASA/JPL-Caltech', category: 'aerial',
    base: 'floating', tags: ['helicopter', 'mars'],
    description: 'Model of NASA JPL\'s Mars helicopter with its coaxial counter-rotating rotors.',
    repo: 'nasa-jpl/m2020-urdf-models', urdf: 'mhs/MHS.urdf',
    dirs: ['mhs'],
    // Same Z-down JPL convention as the rover.
    rootQuat: [0, 1, 0, 0],
  },
  {
    slug: 'perseverance', title: 'NASA Perseverance', vendor: 'NASA/JPL-Caltech', category: 'mobile',
    base: 'mobile', tags: ['rover', 'mars', 'wheeled'],
    description: 'Model of NASA JPL\'s Mars 2020 rover with its rocker-bogie suspension, steerable wheels, mast and robotic arm.',
    repo: 'nasa-jpl/m2020-urdf-models', urdf: 'rover/m2020.urdf',
    dirs: ['rover'],
    // JPL's rover navigation frame is Z-down (X forward, Y right); turn it 180° about X.
    rootQuat: [0, 1, 0, 0],
  },
];
