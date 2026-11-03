// ARMOR gallery robots (fanuc), resolved to their upstream repositories.
export default [
  {
    slug: 'fanuc-crx10ia', title: 'FANUC CRX-10iA', vendor: 'FANUC', category: 'arm', base: 'fixed',
    tags: ['cobot', '6-axis'],
    description: 'Six-axis collaborative arm from FANUC\'s CRX line with a 10 kg payload.',
    repo: 'FANUC-CORPORATION/fanuc_description', xacro: 'fanuc_crx_description/robot/crx10ia.urdf.xacro',
    dirs: ['fanuc_crx_description/meshes/crx10ia/collision', 'fanuc_crx_description/meshes/crx10ia/visual', 'fanuc_crx_description/robot', 'fanuc_crx_description/urdf'],
  },
  {
    slug: 'fanuc-lrmate-200ib', title: 'FANUC LR Mate 200iB', vendor: 'FANUC', category: 'arm', base: 'fixed',
    tags: ['industrial', '6-axis', 'compact'],
    description: 'Earlier-generation compact six-axis FANUC arm for light assembly and handling.',
    repo: 'ros-industrial/fanuc', xacro: 'fanuc_lrmate200ib_support/urdf/lrmate200ib.xacro',
    dirs: ['fanuc_lrmate200ib_support/meshes/lrmate200ib/collision', 'fanuc_lrmate200ib_support/meshes/lrmate200ib/visual', 'fanuc_lrmate200ib_support/urdf', 'fanuc_resources/urdf'],
  },
  {
    slug: 'fanuc-lrmate-200id', title: 'FANUC LR Mate 200iD', vendor: 'FANUC', category: 'arm', base: 'fixed',
    tags: ['industrial', '6-axis', 'compact'],
    description: 'Compact six-axis FANUC tabletop-class arm for light handling and machine tending.',
    repo: 'FANUC-CORPORATION/fanuc_description', xacro: 'fanuc_lrmate_description/robot/lrmate200id.urdf.xacro',
    dirs: ['fanuc_lrmate_description/meshes/lrmate200id/collision', 'fanuc_lrmate_description/meshes/lrmate200id/visual', 'fanuc_lrmate_description/robot', 'fanuc_lrmate_description/urdf'],
  },
  {
    slug: 'fanuc-m20id-12', title: 'FANUC M-20iD/12L', vendor: 'FANUC', category: 'arm', base: 'fixed',
    tags: ['industrial', '6-axis', 'long-reach'],
    description: 'Long-reach six-axis FANUC handling arm with a 12 kg payload and a hollow wrist.',
    repo: 'FANUC-CORPORATION/fanuc_description', xacro: 'fanuc_m20_description/robot/m20_12_23d.urdf.xacro',
    dirs: ['fanuc_m20_description/meshes/m20_12_23d/collision', 'fanuc_m20_description/meshes/m20_12_23d/visual', 'fanuc_m20_description/robot', 'fanuc_m20_description/urdf'],
  },
  {
    slug: 'fanuc-r2000ic-165f', title: 'FANUC R-2000iC/165F', vendor: 'FANUC', category: 'arm', base: 'fixed',
    tags: ['industrial', '6-axis', 'heavy-payload'],
    description: 'Heavy six-axis FANUC arm with a 165 kg payload, common in spot welding lines.',
    repo: 'FANUC-CORPORATION/fanuc_description', xacro: 'fanuc_r2000_description/robot/r2000ic_165f.urdf.xacro',
    dirs: ['fanuc_r2000_description/meshes/r2000ic_165f/collision', 'fanuc_r2000_description/meshes/r2000ic_165f/visual', 'fanuc_r2000_description/robot', 'fanuc_r2000_description/urdf'],
  },
];
