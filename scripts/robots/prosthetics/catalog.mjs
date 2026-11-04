// Prosthetic hands, each fetched from its maker's repository at a pinned commit and mounted at the wrist.
// `prosthesis.motors` is what the wearer commands: each motor drives its joints as offset + scale · motor.
export const PROSTHETICS_REPOS = {
  'psyonicinc/ability-hand-api': '34c9a9324d3739d976e6de441e56ccefafd0000b',
  'CentroEPiaggio/pisa-iit-soft-hand': '174eebc6e9e33c886cab7995f749830a436de3e8',
  'qbrobotics/qbhand-ros': '13b6e4fcb2adedb6259295a1ee3ee3e90e6c2909',
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

export const PROSTHESES = [
  abilityHand('right'), abilityHand('left'), softHand('right'), softHand('left'), softHand2('right'), softHand2('left'),
];
export const PROSTHESIS_IDS = PROSTHESES.map((p) => p.id);
