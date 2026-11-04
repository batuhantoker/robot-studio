// Routes a tendon-driven hand's single tendon as a MuJoCo spatial tendon over sites. Neither upstream model has
// one (URDF cannot say it), so the path is drawn from the geometry: in series through the fingers, up the palm side
// of each finger on one side and back down the other, with both ends on the palm near the wrist.
const sub = (a, b) => a.map((v, i) => v - b[i]);
const add = (a, b) => a.map((v, i) => v + b[i]);
const scale = (a, s) => a.map((v) => v * s);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => scale(a, 1 / Math.hypot(...a));
const mean = (pts) => scale(pts.reduce(add, [0, 0, 0]), 1 / pts.length);

export function routeTendon(mj, m, hand) {
  const d = new mj.MjData(m);
  try {
    mj.mj_forward(m, d);
    return route(mj, m, d, hand);
  } finally {
    d.delete();
  }
}

function route(mj, m, d, hand) {
  const id = (type, name) => {
    const i = mj.mj_name2id(m, type, name);
    if (i < 0) throw new Error(`prosthesis ${hand.id} tendon: no ${name}`);
    return i;
  };
  const BODY = mj.mjtObj.mjOBJ_BODY.value, JOINT = mj.mjtObj.mjOBJ_JOINT.value;
  const v3 = (arr, i) => [arr[3 * i], arr[3 * i + 1], arr[3 * i + 2]];
  const rot = (b) => Array.from(d.xmat.slice(9 * b, 9 * b + 9));
  const toWorld = (b, p) => { const r = rot(b); return add(v3(d.xpos, b), [0, 1, 2].map((k) => r[3 * k] * p[0] + r[3 * k + 1] * p[1] + r[3 * k + 2] * p[2])); };
  const toLocal = (b, p) => { const r = rot(b), q = sub(p, v3(d.xpos, b)); return [0, 1, 2].map((k) => r[k] * q[0] + r[3 + k] * q[1] + r[6 + k] * q[2]); };
  // World vertices of a body's visual meshes at the open pose.
  const verts = (b) => {
    const out = [];
    for (let g = 0; g < m.ngeom; g++) {
      if (m.geom_bodyid[g] !== b || m.geom_type[g] !== 7 || m.geom_group[g] !== 1) continue;
      const mesh = m.geom_dataid[g], r = d.geom_xmat.slice(9 * g, 9 * g + 9), p = v3(d.geom_xpos, g);
      for (let v = 0; v < m.mesh_vertnum[mesh]; v++) {
        const x = v3(m.mesh_vert, m.mesh_vertadr[mesh] + v);
        out.push(add(p, [0, 1, 2].map((k) => r[3 * k] * x[0] + r[3 * k + 1] * x[1] + r[3 * k + 2] * x[2])));
      }
    }
    return out;
  };
  const extent = (pts, o, dir) => { const s = pts.map((p) => dot(sub(p, o), dir)); return [Math.min(...s), Math.max(...s)]; };

  const bodyName = (b) => { let s = ''; for (let i = m.name_bodyadr[b]; m.names[i]; i++) s += String.fromCharCode(m.names[i]); return s; };
  const sites = [];
  const site = (b, name, world) => (sites.push({ body: bodyName(b), name, pos: toLocal(b, world) }), name);

  const fingers = hand.tendon.route.map((name) => {
    const chain = hand.chains.find((c) => c.name === name);
    const bodies = [...new Set(chain.joints.map((j) => m.jnt_bodyid[id(JOINT, j)]))].filter((b) => verts(b).length);
    // In a straight finger every flexion hinge shares this axis; closing turns the finger towards axis × length.
    const axis = unit(v3(d.xaxis, id(JOINT, chain.joints[1])));
    const tipBody = id(BODY, chain.tip.body);
    const tip = toWorld(tipBody, chain.tip.pos);
    // At the open pose a digit is straight, so its last link shares the link before's direction (the tip point
    // is the rounded pad's extreme, off the digit's axis).
    const dirs = bodies.map((b, i) => (i + 1 < bodies.length ? unit(sub(v3(d.xpos, bodies[i + 1]), v3(d.xpos, b))) : null));
    dirs[dirs.length - 1] = dirs.length > 1 ? dirs[dirs.length - 2] : unit(sub(tip, v3(d.xpos, bodies[0])));
    const links = bodies.map((b, i) => {
      const o = v3(d.xpos, b);
      const along = dirs[i];
      const palm = unit(cross(axis, along));
      const pts = verts(b);
      const [s0, s1] = extent(pts, o, along), [p0, p1] = extent(pts, o, palm);
      return { b, o, along, palm, s0, s1, depth: p1 - 0.2 * (p1 - p0) };
    });
    // One channel per digit: the same depth and strand spacing in every link, so the cable runs straight.
    const depth = Math.min(...links.map((k) => k.depth)), side = 0.0025;
    const at = (k, f, sign) => add(add(add(k.o, scale(k.along, k.s0 + f * (k.s1 - k.s0))), scale(k.palm, depth)), scale(axis, sign * side));
    // The tendon enters and leaves each digit through its base joint, inside the palm, never across open air.
    const parent = m.body_parentid[bodies[0]];
    const base = links[0];
    const root = (dir) => site(parent, `tendon_${name}_root_${dir > 0 ? 'in' : 'out'}`, add(add(base.o, scale(base.palm, 0.5 * depth)), scale(axis, dir * side)));
    const up = [root(1)], down = [root(-1)];
    links.forEach((k, i) => {
      // A long first link (the thumb's metacarpal) needs two stops to stay inside it.
      const long = k.s1 - k.s0 > 0.02;
      const stops = i === links.length - 1 ? [0.25, 0.7] : i === 0 && !long ? [0.5] : [0.25, 0.75];
      stops.forEach((f, j) => {
        up.push(site(k.b, `tendon_${name}_up${i}${j}`, at(k, f, 1)));
        down.unshift(site(k.b, `tendon_${name}_down${i}${j}`, at(k, f, -1)));
      });
    });
    const last = links.at(-1);
    const turn = site(last.b, `tendon_${name}_turn`, at(last, 0.88, 0));
    return { path: [...up, turn, ...down], first: links[0], parent };
  });

  // Both ends sit in the palm near the wrist, where the motor (or motors) pull.
  const palm = fingers[0].parent;
  const pts = verts(palm);
  const centre = mean(pts);
  const along = unit(mean(fingers.filter((_, i) => hand.tendon.route[i] !== 'thumb').map((f) => f.first.along)));
  const normal = unit(mean(fingers.map((f) => f.first.palm)));
  const across = unit(cross(normal, along));
  const [s0, s1] = extent(pts, centre, along), [p0, p1] = extent(pts, centre, normal);
  const motor = (name, side) => site(palm, name, add(add(add(centre, scale(along, s0 + 0.2 * (s1 - s0))), scale(normal, p1 - 0.35 * (p1 - p0))), scale(across, side * 0.012)));
  const path = [motor('tendon_motor_a', 1), ...fingers.flatMap((f) => f.path), motor('tendon_motor_b', -1)];
  return { sites, path };
}

// The routed tendon written into the studio MJCF: one <site> per stop, and the spatial tendon through them.
export function withTendon(xml, { sites, path }, look) {
  let out = xml;
  for (const s of sites) {
    const open = new RegExp(`(<body name="${s.body}"[^>]*>)`);
    if (!open.test(out)) throw new Error(`tendon: no body ${s.body}`);
    out = out.replace(open, `$1\n<site name="${s.name}" pos="${s.pos.map((v) => +v.toFixed(5)).join(' ')}" size="0.001" group="5"/>`);
  }
  const stops = path.map((n) => `      <site site="${n}"/>`).join('\n');
  const tendon = `  <tendon>\n    <spatial name="tendon" width="${look.width}" rgba="${look.rgba}">\n${stops}\n    </spatial>\n  </tendon>\n`;
  return out.replace(/<\/mujoco>\s*$/, `${tendon}</mujoco>\n`);
}
