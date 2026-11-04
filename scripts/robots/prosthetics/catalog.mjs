// Prosthetic hands, each fetched from its maker's repository at a pinned commit and mounted at the wrist.
// `prosthesis.motors` is what the wearer commands: each motor drives its joints as offset + scale · motor.
export const PROSTHETICS_REPOS = {
  'psyonicinc/ability-hand-api': '34c9a9324d3739d976e6de441e56ccefafd0000b',
  'CentroEPiaggio/pisa-iit-soft-hand': '174eebc6e9e33c886cab7995f749830a436de3e8',
  'qbrobotics/qbhand-ros': '13b6e4fcb2adedb6259295a1ee3ee3e90e6c2909',
  'google-deepmind/mujoco_menagerie': '98a70c569c4c1b6da467a20012f766ee1f8dc521',
};
// Repositories not on GitHub.
export const PROSTHETICS_HOSTS = { 'qbrobotics/qbhand-ros': 'https://bitbucket.org' };

// PSYONIC's four-bar fit from ah_simulators/ah_mujoco.py: pip = 1.05851325 · mcp + 0.72349796.
const ABH_PIP = { scale: 1.05851325, offset: 0.72349796 };
const abhFinger = (f, label, home) => ({
  name: f, label, range: [0, 1.74], home,
  joints: [{ joint: `${f}_mcp` }, { joint: `${f}_pip`, ...ABH_PIP }],
});

// PSYONIC's grip names; the motor values are our estimates of each posture, checked free of self-contact.
const ABH_GRIPS = [
  { name: 'open', label: 'Open', motors: { thumb_rotator: -0.3, thumb_flexor: 0, index: 0, middle: 0, ring: 0, pinky: 0 } },
  { name: 'power', label: 'Power', motors: { thumb_rotator: -1.75, thumb_flexor: 0.45, index: 1.2, middle: 1.2, ring: 1.2, pinky: 1.2 } },
  { name: 'key', label: 'Key', motors: { thumb_rotator: -0.05, thumb_flexor: 0.55, index: 1.45, middle: 1.5, ring: 1.55, pinky: 1.6 } },
  { name: 'pinch', label: 'Pinch', motors: { thumb_rotator: -1.15, thumb_flexor: 0.6, index: 0.95, middle: 1.5, ring: 1.6, pinky: 1.65 } },
  { name: 'chuck', label: 'Chuck', motors: { thumb_rotator: -1.25, thumb_flexor: 0.55, index: 0.85, middle: 0.95, ring: 1.5, pinky: 1.55 } },
  { name: 'point', label: 'Point', motors: { thumb_rotator: -1.0, thumb_flexor: 0.9, index: 0, middle: 1.55, ring: 1.6, pinky: 1.65 } },
  { name: 'hook', label: 'Hook', motors: { thumb_rotator: 0, thumb_flexor: 0, index: 1.1, middle: 1.1, ring: 1.1, pinky: 1.1 } },
];

function abilityHand(side) {
  const mirror = side === 'left' ? -1 : 1;
  const tip = (body, pos) => ({ body, pos });
  return {
    id: `psyonic_ability_hand_${side}`,
    repo: 'psyonicinc/ability-hand-api',
    dir: 'python/ah_simulators/mujoco_xml',
    src: `hands/abh_${side}_large.xml`,
    xml: `ability_hand_${side}.xml`,
    // Turned about the wrist so the palm faces the studio's default camera.
    mount: { body: 'ability_hand', yaw: 3.14159 },
    title: `PSYONIC Ability Hand (${side})`,
    maker: 'PSYONIC',
    spdx: 'MIT',
    description:
      'Myoelectric prosthetic hand: six motors drive ten joints, each finger curling through a four-bar linkage, ' +
      'with a powered thumb rotator and pressure sensors in every fingertip.',
    tags: ['prosthesis', 'myoelectric', 'multi-articulating', side],
    // Fingertips are the distal mesh points farthest from each joint axis.
    chains: [
      { name: 'index', joints: ['index_mcp', 'index_pip'], tip: tip('index_int_dist', [0.04, -0.022, 0]) },
      { name: 'thumb', joints: ['thumb_cmc', 'thumb_mcp'], tip: tip('thumb_mcp', [0.066, 0.022, 0.004 * mirror]) },
      { name: 'middle', joints: ['middle_mcp', 'middle_pip'], tip: tip('middle_int_dist', [0.04, -0.022, 0]) },
      { name: 'ring', joints: ['ring_mcp', 'ring_pip'], tip: tip('ring_int_dist', [0.04, -0.022, 0]) },
      { name: 'pinky', joints: ['pinky_mcp', 'pinky_pip'], tip: tip('pinky_int_dist', [0.035, -0.019, 0]) },
    ],
    prosthesis: {
      side,
      control: 'myoelectric',
      motors: [
        { name: 'thumb_rotator', label: 'Thumb rotation', range: [-2.09, 0], home: -0.6, joints: [{ joint: 'thumb_cmc' }] },
        { name: 'thumb_flexor', label: 'Thumb', range: [0, 1.91], home: 0.2, joints: [{ joint: 'thumb_mcp' }] },
        abhFinger('index', 'Index', 0.15),
        abhFinger('middle', 'Middle', 0.2),
        abhFinger('ring', 'Ring', 0.25),
        abhFinger('pinky', 'Pinky', 0.3),
      ],
      grips: ABH_GRIPS,
    },
  };
}

// With one synergy the SoftHand only opens and closes; the power grasp stops short of the thumb meeting the index.
const SH_GRIPS = [
  { name: 'open', label: 'Open', motors: { synergy: 0 } },
  { name: 'power', label: 'Power', motors: { synergy: 0.42 } },
];
// The second synergy adds a pinch (thumb and index lead) and a point (ring and little lead, index stays out).
const SH2_GRIPS = [
  { name: 'open', label: 'Open', motors: { synergy: 0.1, slide: 0 } },
  { name: 'power', label: 'Power', motors: { synergy: 0.5, slide: 0 } },
  { name: 'pinch', label: 'Pinch', motors: { synergy: 0.3, slide: -0.6 } },
  { name: 'point', label: 'Point', motors: { synergy: 0.35, slide: 0.7 } },
];

// One tendon through every finger in turn, as in the SoftHands; the route is drawn from the geometry (tendon.mjs).
const TENDON = { route: ['thumb', 'index', 'middle', 'ring', 'little'], width: 0.0006, rgba: '0.95 0.94 0.9 1' };

// Each rolling-contact knuckle is two hinges in the model, so 19 joints become 33.
const SOFT_FINGER = ['abd', 'inner', 'inner_joint_mimic', 'middle', 'middle_joint_mimic', 'outer', 'outer_joint_mimic'];
const SOFT_THUMB = ['abd', 'inner', 'inner_joint_mimic', 'outer', 'outer_joint_mimic'];

function softHand(side) {
  const chain = (name, joints) => ({
    name,
    joints: joints.map((j) => `softhand_${name}_${j.endsWith('_mimic') ? j : `${j}_joint`}`),
    // The far point of the shared fingertip mesh, in each distal link.
    tip: { body: `softhand_${name}_distal_link`, pos: [0.0233, 0.0068, -0.0032] },
  });
  return {
    id: `pisa_iit_softhand_${side}`,
    repo: 'CentroEPiaggio/pisa-iit-soft-hand',
    dir: 'soft_hand_description',
    xacro: {
      package: 'soft_hand_description',
      include: 'model/soft_hand.urdf.xacro',
      instance: `<xacro:soft_hand name="softhand" parent="world" withAdaptiveTransmission="false" useMimicTag="true" left="${side === 'left'}">` +
        '<origin xyz="0 0 0" rpy="0 0 0"/></xacro:soft_hand>',
    },
    // The single motor: every finger joint mimics it (the synergy the tendon imposes in free motion).
    synergy: { joint: 'softhand_synergy_joint', label: 'Hand closure', home: 0.12, hint: 'one tendon closes all five fingers' },
    tendon: TENDON,
    xml: `softhand_${side}.xml`,
    mount: { body: 'softhand_kuka_coupler_bottom', yaw: -1.5708 },
    // The coupler, clamp and base ship see-through blue; the studio shows them as a dark anodised mount.
    recolor: { from: '0 0 0.8 0.9', to: '0.15 0.16 0.18 1' },
    title: `Pisa/IIT SoftHand (${side})`,
    maker: 'Centro E. Piaggio · IIT',
    spdx: 'BSD-3-Clause',
    extraLicense: { file: 'soft_hand_description/meshes/LICENSE', spdx: 'CC-BY-4.0', expect: /CC BY 4\.0/ },
    description:
      'Underactuated soft hand behind the SoftHand Pro prosthesis: one motor pulls a single tendon that closes ' +
      'all 19 rolling-contact joints in a natural synergy, so the fingers wrap around whatever they meet.',
    tags: ['prosthesis', 'underactuated', 'synergy', 'soft', side],
    chains: [
      chain('index', SOFT_FINGER),
      chain('thumb', SOFT_THUMB),
      chain('middle', SOFT_FINGER),
      chain('ring', SOFT_FINGER),
      chain('little', SOFT_FINGER),
    ],
    prosthesis: { side, control: 'myoelectric', grips: SH_GRIPS },
  };
}

const QB_FINGER = ['knuckle', 'proximal', 'proximal_virtual', 'middle', 'middle_virtual', 'distal', 'distal_virtual'];
const QB_THUMB = ['knuckle', 'proximal', 'proximal_virtual', 'distal', 'distal_virtual'];

// qbrobotics' SoftHand 2 Research ("qbhand2m"). Its URDF moves the fingers on the first synergy only: the
// manipulation synergy and the two motor joints are declared but drive no finger, so they stay idle here.
function softHand2(side) {
  const chain = (name, joints) => ({
    name,
    joints: joints.map((j) => `qbhand2m_${name}_${j}_joint`),
    tip: { body: `qbhand2m_${name}_distal_link`, pos: [0.0253, 0.0046, 0] },
  });
  return {
    id: `qb_softhand2_${side}`,
    repo: 'qbrobotics/qbhand-ros',
    dir: 'qb_hand_description',
    xacro: {
      package: 'qb_hand_description',
      include: 'urdf/qbhand.utils.xacro',
      instance: `<xacro:build_hand_2m_from_yaml configuration="qbhand_${side}" namespace="qbhand2m" parent="world" parent_link_suffix="">` +
        '<origin xyz="0 0 0" rpy="0 0 0"/></xacro:build_hand_2m_from_yaml>',
    },
    // Upstream's left thumb reuses the right thumb's abduction axis and swings to the back of the hand.
    flipAxes: side === 'left' ? ['qbhand2m_thumb_knuckle_joint'] : [],
    synergy: { joint: 'qbhand2m_synergy_joint', label: 'Hand closure', home: 0.1, hint: 'both motors pull: all fingers close' },
    // Not in the upstream URDF. Della Santina et al., IEEE T-RO 2018: sliding the tendon (the motors' semi-difference)
    // closes ring and little while thumb and index open, and vice versa. Our linear model of that: each joint moves by
    // gain × its first-synergy share × the finger's weight; the weights grade along the tendon from thumb to little.
    secondSynergy: {
      name: 'slide', label: 'Second synergy', range: [-1, 1], home: 0, gain: 0.5,
      hint: '− thumb & index close · + ring & little close',
      weights: { thumb: -1, index: -0.7, middle: 0, ring: 0.7, little: 1 },
    },
    tendon: TENDON,
    idle: ['qbhand2m_manipulation_joint', 'qbhand2m_motor_1_joint', 'qbhand2m_motor_2_joint'],
    // The palm collides as the convex hull of its visual mesh, which fills the hollow the little finger folds into.
    exclude: [['qbhand2m_palm_link', 'qbhand2m_little_proximal_link']],
    xml: `qb_softhand2_${side}.xml`,
    mount: { body: 'qbhand2m_base_link', yaw: 3.14159 },
    title: `qb SoftHand 2 Research (${side})`,
    maker: 'qbrobotics',
    spdx: 'BSD-3-Clause',
    description:
      'Two-motor Pisa/IIT SoftHand 2: the motors pull the two ends of one tendon, closing all 19 joints together ' +
      'or, pulling against each other, adding a second synergy for precision grasps. The model moves the first synergy.',
    tags: ['prosthesis', 'underactuated', 'synergy', 'soft', 'two-motor', side],
    chains: [
      chain('index', QB_FINGER),
      chain('thumb', QB_THUMB),
      chain('middle', QB_FINGER),
      chain('ring', QB_FINGER),
      chain('little', QB_FINGER),
    ],
    prosthesis: { side, control: 'myoelectric', grips: SH2_GRIPS },
  };
}

// Robot hands from MuJoCo Menagerie: motors come from their actuators, grips from the shared table in actuated.mjs.
// `curl` lists the motors that close each digit; `oppose` the thumb motors' values at full opposition.
const UPRIGHT = [0.5, 0.5, -0.5, 0.5]; // fingers along +x and palm to +z → fingers up, palm to the camera (−y)
const tipAuto = (body) => ({ body, pos: 'auto' });
const menagerie = (hand) => ({
  repo: 'google-deepmind/mujoco_menagerie', licenseInDir: true, actuated: true, src: 'right_hand.xml',
  prosthesis: { side: 'right', control: 'myoelectric', kind: 'dexterous' },
  ...hand,
  tags: ['dexterous', 'robot hand', ...hand.tags],
});

const SHADOW_DIGIT = { FF: 'Index', MF: 'Middle', RF: 'Ring', LF: 'Little', TH: 'Thumb', WR: 'Wrist' };
function shadowHand(side) {
  const p = side === 'right' ? 'rh_' : 'lh_';
  const finger = (name, f, extra = []) => ({
    name, joints: [`${p}WRJ2`, `${p}WRJ1`, ...extra, `${p}${f}J4`, `${p}${f}J3`, `${p}${f}J2`, `${p}${f}J1`], tip: tipAuto(`${p}${f.toLowerCase()}distal`),
  });
  return menagerie({
    id: `shadow_hand_${side}`,
    dir: 'shadow_hand',
    src: `${side}_hand.xml`,
    xml: `studio_${side}_hand.xml`,
    spdx: 'Apache-2.0',
    title: `Shadow Dexterous Hand (${side})`,
    maker: 'Shadow Robot Company',
    description:
      'The 24-joint hand OpenAI taught to solve a Rubik\'s cube (Dactyl) and used in its Gym robotics tasks: 20 motors, ' +
      'a two-axis wrist, and each finger\'s last two joints coupled by one tendon.',
    tags: ['openai', 'tendon-coupled', side],
    mount: { quat: UPRIGHT },
    label: (n) => {
      const [, d, j] = n.match(/^[rl]h_(?:A_)?(FF|MF|RF|LF|TH|WR)J(\d)$/) ?? [];
      return d ? `${SHADOW_DIGIT[d]} ${j === '0' ? 'J1+J2' : `J${j}`}` : n;
    },
    chains: [
      finger('index', 'FF'),
      { name: 'thumb', joints: ['WRJ2', 'WRJ1', 'THJ5', 'THJ4', 'THJ3', 'THJ2', 'THJ1'].map((j) => p + j), tip: tipAuto(`${p}thdistal`) },
      finger('middle', 'MF'),
      finger('ring', 'RF'),
      finger('little', 'LF', [`${p}LFJ5`]),
    ],
    curl: {
      index: [`${p}FFJ3`, `${p}FFJ0`], middle: [`${p}MFJ3`, `${p}MFJ0`], ring: [`${p}RFJ3`, `${p}RFJ0`],
      little: [`${p}LFJ3`, `${p}LFJ0`], thumb: [`${p}THJ2`, `${p}THJ1`],
    },
    oppose: { [`${p}THJ5`]: 0.9, [`${p}THJ4`]: 1.1 },
    // The long thumb reaches the middle finger before the shared table's thumb closes.
    gripTweaks: { power: { thumb: 0.1, oppose: 0.65 }, pinch: { thumb: 0.15, oppose: 0.75 }, tripod: { thumb: 0.15, oppose: 0.75 }, point: { thumb: 0.25, oppose: 0.55 } },
    prosthesis: { side, control: 'myoelectric', kind: 'dexterous' },
  });
}

const LEAP_DIGIT = { if: 'Index', mf: 'Middle', rf: 'Ring', th: 'Thumb' };
const LEAP_JOINT = { mcp: 'MCP', rot: 'spread', pip: 'PIP', dip: 'DIP', cmc: 'CMC', axl: 'axial', ipl: 'IP' };
const leapHand = () => menagerie({
  id: 'leap_hand_right',
  dir: 'leap_hand',
  xml: 'studio_right_hand.xml',
  spdx: 'MIT',
  title: 'LEAP Hand (right)',
  maker: 'Carnegie Mellon University',
  description: 'Low-cost anthropomorphic research hand: 16 Dynamixel motors, with a universal knuckle that lets each finger spread as well as curl.',
  tags: ['research', 'low-cost', 'right'],
  // Its palm body sits 10 cm off the model origin; shift it back over the stage centre.
  mount: { quat: UPRIGHT, pos: [0, 0.1, 0] },
  // At zero the thumb points down past the wrist; a little fold rests it beside the palm.
  open: { th_mcp: 0.6 },
  label: (n) => { const [d, j] = n.split('_'); return `${LEAP_DIGIT[d] ?? d} ${LEAP_JOINT[j] ?? j}`; },
  chains: [
    { name: 'index', joints: ['if_mcp', 'if_rot', 'if_pip', 'if_dip'], tip: tipAuto('if_ds') },
    { name: 'thumb', joints: ['th_cmc', 'th_axl', 'th_mcp', 'th_ipl'], tip: tipAuto('th_ds') },
    { name: 'middle', joints: ['mf_mcp', 'mf_rot', 'mf_pip', 'mf_dip'], tip: tipAuto('mf_ds') },
    { name: 'ring', joints: ['rf_mcp', 'rf_rot', 'rf_pip', 'rf_dip'], tip: tipAuto('rf_ds') },
  ],
  curl: { index: ['if_mcp', 'if_pip', 'if_dip'], middle: ['mf_mcp', 'mf_pip', 'mf_dip'], ring: ['rf_mcp', 'rf_pip', 'rf_dip'], thumb: ['th_mcp', 'th_ipl'] },
  oppose: { th_cmc: 1.0, th_axl: 0.8 },
  // Its joints reach far past a fist (the knuckle bends to 128°), so grips use a smaller share of each range.
  curlScale: 0.6,
});

const ALLEGRO_DIGIT = { ff: 'Index', mf: 'Middle', rf: 'Ring', th: 'Thumb' };
const allegroHand = () => menagerie({
  id: 'allegro_hand_right',
  dir: 'wonik_allegro',
  xml: 'studio_right_hand.xml',
  spdx: 'BSD-2-Clause',
  title: 'Allegro Hand (right)',
  maker: 'Wonik Robotics',
  description: 'Four-fingered research hand with a motor in every one of its 16 joints, a long-time workhorse of in-hand manipulation research.',
  tags: ['research', 'right'],
  mount: { quat: UPRIGHT },
  label: (n) => { const [, d, j] = n.match(/^(ff|mf|rf|th)j(\d)$/) ?? []; return d ? `${ALLEGRO_DIGIT[d]} J${j}` : n; },
  chains: [
    { name: 'index', joints: ['ffj0', 'ffj1', 'ffj2', 'ffj3'], tip: tipAuto('ff_distal') },
    { name: 'thumb', joints: ['thj0', 'thj1', 'thj2', 'thj3'], tip: tipAuto('th_distal') },
    { name: 'middle', joints: ['mfj0', 'mfj1', 'mfj2', 'mfj3'], tip: tipAuto('mf_distal') },
    { name: 'ring', joints: ['rfj0', 'rfj1', 'rfj2', 'rfj3'], tip: tipAuto('rf_distal') },
  ],
  curl: { index: ['ffj1', 'ffj2', 'ffj3'], middle: ['mfj1', 'mfj2', 'mfj3'], ring: ['rfj1', 'rfj2', 'rfj3'], thumb: ['thj2', 'thj3'] },
  oppose: { thj0: 1.3, thj1: 0.9 },
});

const SHARPA_JOINT = { MCP_FE: 'MCP', MCP_AA: 'spread', CMC_FE: 'CMC', CMC_AA: 'CMC spread', CMC: 'CMC', PIP: 'PIP', DIP: 'DIP', IP: 'IP' };
const sharpaWave = () => menagerie({
  id: 'sharpa_wave_right',
  dir: 'sharpa_wave',
  xml: 'studio_right_hand.xml',
  spdx: 'Apache-2.0',
  title: 'Sharpa Wave (right)',
  maker: 'Sharpa Robotics',
  description: 'Five-fingered tactile hand with 22 actuated joints, including a cupping joint for the little finger and a two-axis thumb knuckle.',
  tags: ['tactile', 'right'],
  // Fingers already point up here; the palm faces +x, so a quarter turn brings it round to the camera.
  mount: { quat: [0.70711, 0, 0, -0.70711] },
  label: (n) => {
    const [, d, j] = n.match(/^right_(thumb|index|middle|ring|pinky)_(.+)$/) ?? [];
    return d ? `${d === 'pinky' ? 'Little' : d[0].toUpperCase() + d.slice(1)} ${SHARPA_JOINT[j] ?? j}` : n;
  },
  chains: ['index', 'thumb', 'middle', 'ring', 'pinky'].map((f) => ({
    name: f === 'pinky' ? 'little' : f,
    joints: {
      thumb: ['CMC_FE', 'CMC_AA', 'MCP_FE', 'MCP_AA', 'IP'], pinky: ['CMC', 'MCP_FE', 'MCP_AA', 'PIP', 'DIP'],
    }[f]?.map((j) => `right_${f}_${j}`) ?? ['MCP_FE', 'MCP_AA', 'PIP', 'DIP'].map((j) => `right_${f}_${j}`),
    tip: { site: `right_${f}_fingertip` },
  })),
  curl: {
    index: ['right_index_MCP_FE', 'right_index_PIP', 'right_index_DIP'],
    middle: ['right_middle_MCP_FE', 'right_middle_PIP', 'right_middle_DIP'],
    ring: ['right_ring_MCP_FE', 'right_ring_PIP', 'right_ring_DIP'],
    little: ['right_pinky_MCP_FE', 'right_pinky_PIP', 'right_pinky_DIP'],
    thumb: ['right_thumb_MCP_FE', 'right_thumb_IP'],
  },
  oppose: { right_thumb_CMC_FE: 1.6 },
  gripTweaks: { power: { thumb: 0.1, oppose: 0.65 }, pinch: { thumb: 0.2, oppose: 0.75 }, tripod: { thumb: 0.2, oppose: 0.75 }, point: { thumb: 0.25, oppose: 0.55 } },
});

export const PROSTHESES = [
  abilityHand('right'), abilityHand('left'), softHand('right'), softHand('left'), softHand2('right'), softHand2('left'),
  shadowHand('right'), shadowHand('left'), leapHand(), allegroHand(), sharpaWave(),
];
export const PROSTHESIS_IDS = PROSTHESES.map((p) => p.id);
