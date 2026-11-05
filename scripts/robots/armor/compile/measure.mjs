// Lowest world z of the rendered geoms (groups 0-2) at the current pose; mesh vertices are exact.
export function lowestPoint(mj, m, d) {
  let minz = Infinity;
  for (let g = 0; g < m.ngeom; g++) {
    if (m.geom_group[g] > 2) continue;
    const R = d.geom_xmat.subarray(9 * g + 6, 9 * g + 9);
    const z0 = d.geom_xpos[3 * g + 2];
    if (m.geom_type[g] === mj.mjtGeom.mjGEOM_MESH.value) {
      const id = m.geom_dataid[g];
      const v = m.mesh_vert;
      for (let i = m.mesh_vertadr[id], end = i + m.mesh_vertnum[id]; i < end; i++) {
        minz = Math.min(minz, z0 + R[0] * v[3 * i] + R[1] * v[3 * i + 1] + R[2] * v[3 * i + 2]);
      }
    } else {
      const a = m.geom_aabb.subarray(6 * g, 6 * g + 6);
      const zc = z0 + R[0] * a[0] + R[1] * a[1] + R[2] * a[2];
      minz = Math.min(minz, zc - Math.abs(R[0]) * a[3] - Math.abs(R[1]) * a[4] - Math.abs(R[2]) * a[5]);
    }
  }
  return minz;
}

// Body-name pairs whose collision geoms touch at the current pose (worldbody contacts ignored).
export function contactPairs(m, d) {
  const pairs = new Map();
  const contacts = d.contact;
  for (let i = 0; i < d.ncon; i++) {
    const c = contacts.get(i);
    const b1 = m.geom_bodyid[c.geom1];
    const b2 = m.geom_bodyid[c.geom2];
    c.delete?.();
    if (!b1 || !b2) continue;
    const [x, y] = [m.body(b1).name, m.body(b2).name].sort();
    pairs.set(`${x}\n${y}`, [x, y]);
  }
  contacts.delete?.();
  return [...pairs.values()];
}

// What MuJoCo's parent filter drops when the root is free: the root and jointless bodies welded to it, against the bodies
// jointed straight onto them. Compiled without a free joint the root welds to the world, and the filter's world exception
// lets these pairs through. Nothing past those direct children counts.
export function freeRootPairs(m) {
  const collides = new Set();
  for (let g = 0; g < m.ngeom; g++) if (m.geom_contype[g] || m.geom_conaffinity[g]) collides.add(m.geom_bodyid[g]);
  const bodies = Array.from({ length: m.nbody }, (_, b) => b).slice(1);
  const welded = new Set(bodies.filter((b) => m.body_weldid[b] === 0));
  const jointed = bodies.filter((b) => m.body_weldid[b] === b && welded.has(m.body_parentid[b]));
  const pairs = [];
  for (const a of welded) {
    for (const b of jointed) {
      if (collides.has(a) && collides.has(b)) pairs.push([m.body(a).name, m.body(b).name].sort());
    }
  }
  return pairs;
}
