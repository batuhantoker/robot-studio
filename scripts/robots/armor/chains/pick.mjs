const MAX_CHAINS = 8;
const EE = /tool|flange|tcp|(^|_)ee(_|$)|end_?eff|effector|gripper|grasp|hand|palm|wrist|tip|foot|toe|sole|ankle|wheel/i;
const LEG = /foot|toe|sole|ankle|calf|shank|knee|leg/i;
const LEFT = /(^|[^a-z])(l|left|lf|fl)([^a-z]|$)|left/i;
const FRONT_LEFT = /(^|[^a-z])(fl|lf)([^a-z]|$)|front_?left|left_?front/i;

const key = (c) => c.joints.join('\n');
const named = (c) => ({ name: c.name, joints: c.joints, tip: { body: c.body, pos: [0, 0, 0] } });
const better = (a, b) => (EE.test(a.body) !== EE.test(b.body) ? EE.test(a.body) : a.depth > b.depth);

function commonPrefix(lists) {
  const out = [];
  for (let i = 0; lists.every((l) => i < l.length && l[i] === lists[0][i]); i++) out.push(lists[0][i]);
  return out;
}

const STRONG_EE = /tool0|tool_?frame|flange|tcp|(^|_)ee(_|$)|ee_?link|end_?eff|effector|attachment/i;
const most = (list, score) => list.reduce((a, b) => (score(b) > score(a) ? b : a));
const rank = (c) => c.joints.length * 4 + (LEFT.test(c.body) ? 2 : 0) + (EE.test(c.body) ? 1 : 0);

// Legs for legged robots; else the longest named tool frame (or longest chain), cut back to the trunk
// its gripper fingers share (siblings that only diverge in their last two joints).
function defaultChain(cands, jointBody, category) {
  if (category === 'legged' || category === 'humanoid') {
    const legs = cands.filter((c) => LEG.test(c.body));
    const legRank = (c) => c.joints.length * 4 + (FRONT_LEFT.test(c.body) ? 2 : 0) + (LEFT.test(c.body) ? 1 : 0);
    if (legs.length) return most(legs, legRank);
  }
  const tools = cands.filter((c) => STRONG_EE.test(c.body));
  const pool = tools.length ? tools : cands;
  const longest = most(pool, rank);
  const n = longest.joints.length;
  const siblings = pool.filter((c) => c !== longest && c.joints.length >= n - 1 && commonPrefix([c.joints, longest.joints]).length >= n - 2);
  if (!siblings.length || n < 3) return longest;
  const trunk = commonPrefix([longest, ...siblings].map((c) => c.joints));
  if (!trunk.length) return longest;
  const exact = cands.filter((c) => c.joints.length === trunk.length && commonPrefix([c.joints, trunk]).length === trunk.length);
  return exact.length ? most(exact, rank) : { joints: trunk, body: jointBody.get(trunk.at(-1)), depth: 0 };
}

// Default chain plus up to MAX_CHAINS distinct chains (default first), greedily covering new joints.
export function pickChains({ candidates, jointBody }, category, limit = MAX_CHAINS) {
  const byKey = new Map();
  for (const c of candidates) if (!byKey.has(key(c)) || better(c, byKey.get(key(c)))) byKey.set(key(c), c);
  const cands = [...byKey.values()];
  if (!cands.length) return { chain: null, chains: [] };

  const first = defaultChain(cands, jointBody, category);
  const chosen = [first];
  const covered = new Set(first.joints);
  const rest = cands
    .filter((c) => key(c) !== key(first))
    .sort((a, b) => EE.test(b.body) - EE.test(a.body) || b.joints.length - a.joints.length);
  for (const c of rest) {
    if (chosen.length >= limit) break;
    if (c.joints.some((j) => !covered.has(j))) {
      chosen.push(c);
      c.joints.forEach((j) => covered.add(j));
    }
  }
  for (const c of rest) if (chosen.length < limit && !chosen.includes(c) && EE.test(c.body)) chosen.push(c);
  const chains = chosen.map((c) => named({ ...c, name: c.body }));
  return { chain: { joints: first.joints, tip: chains[0].tip }, chains };
}
