import { describe, expect, it } from 'vitest';
import { modelChecker } from '@/physics/collision/from-model';
import { ModelHandle } from '@/physics/model/handle';

// l2's geom starts 5 cm past the elbow, so l1 and l2 are apart at home and only meet when folded.
const ARM = (contype: number) => `<mujoco><default><geom contype="${contype}" conaffinity="${contype}"/></default><worldbody>
  <body name="base"><geom type="cylinder" size="0.05 0.05" pos="0 0 0.05"/>
    <body name="l1" pos="0 0 0.1"><joint type="hinge" axis="0 1 0"/><geom type="capsule" fromto="0 0 0 0.3 0 0" size="0.02"/>
      <body name="l2" pos="0.3 0 0"><joint type="hinge" axis="0 1 0"/><geom type="capsule" fromto="0.05 0 0 0.3 0 0" size="0.02"/></body>
    </body>
  </body></worldbody></mujoco>`;

async function arm(contype = 1) {
  const h = await ModelHandle.fromXml(ARM(contype));
  const c = modelChecker(h, { qposAdr: [0, 1], rest: new Float64Array(2), home: [0, 0], floorZ: 0, tol: 1e-4 });
  return { h, c };
}

describe('imported CAD collides through its own model', () => {
  it('reports a link reaching back into the base', async () => {
    const { h, c } = await arm();
    expect(c.hit([0, 0])).toBeNull();
    const hit = c.hit([0, 2.8]);
    expect(hit && [hit.a, hit.b].sort()).toEqual(['base', 'l2']);
    c.dispose();
    h.dispose();
  });

  it('leaves neighbouring links to the real joint limits, as MuJoCo does', async () => {
    const { h, c } = await arm();
    expect(c.hit([0, -2.8])).toBeNull();
    c.dispose();
    h.dispose();
  });

  it('keeps visible parts above the floor', async () => {
    const { h, c } = await arm();
    expect(c.hit([0.6, 0])).toEqual({ a: 'l1', b: 'floor' });
    c.dispose();
    h.dispose();
  });

  it('says when the model has no collision geometry, and still guards the floor', async () => {
    const { h, c } = await arm(0);
    expect(c.opts.self).toBe(false);
    expect(c.hit([0, 2.8])?.b).toBe('floor');
    c.dispose();
    h.dispose();
  });
});
