import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { chainFromSpec } from '@/core/chain/model/from-spec';
import { toMjcf } from '@/core/mjcf/writer/serial-arm';
import { pythonIncompatibility, toStudioDict } from '@/core/robot/io/export';
import { parseRobot } from '@/core/robot/schema/parse';
import { ModelHandle } from '@/physics/model/handle';
import { OBJ, arrays } from '@/physics/runtime/arrays';

const arm = () => JSON.parse(fs.readFileSync('presets/studio/planar_2r.json', 'utf8'));
const measured = () => {
  const raw = arm();
  raw.links[0].com = [0.1, 0, 0.02];
  raw.links[0].inertia = [0.02, 0.03, 0.04];
  return raw;
};

describe('measured mass properties', () => {
  it('survive the studio format', () => {
    const spec = parseRobot(measured());
    const again = parseRobot(toStudioDict(spec));
    expect(again.links[0].com).toEqual([0.1, 0, 0.02]);
    expect(again.links[0].inertia).toEqual([0.02, 0.03, 0.04]);
    expect(again.links[1].com).toBeUndefined();
  });

  it('are refused by the Python package, which only knows capsules', () => {
    expect(pythonIncompatibility(parseRobot(measured()))).toMatch(/measured inertia/);
    expect(pythonIncompatibility(parseRobot(arm()))).toBeNull();
  });

  it('come as a pair, and must be a body', () => {
    const half = arm();
    half.links[0].com = [0, 0, 0];
    expect(() => parseRobot(half)).toThrow(/go together/);
    const impossible = measured();
    impossible.links[0].inertia = [0.01, 0.01, 0.5];
    expect(() => parseRobot(impossible)).toThrow(/principal inertias/);
    const negative = measured();
    negative.links[0].inertia = [0, 0.1, 0.1];
    expect(() => parseRobot(negative)).toThrow(/principal inertias/);
  });

  it('reach MuJoCo for that link, and leave the others to their capsules', async () => {
    const spec = parseRobot(measured());
    const plain = await ModelHandle.fromXml(toMjcf(parseRobot(arm())));
    const h = await ModelHandle.fromXml(toMjcf(spec));
    try {
      const m = arrays(h.model), p = arrays(plain.model), a = h.id(OBJ.body, 'body_0'), b = h.id(OBJ.body, 'body_1');
      [0.1, 0, 0.02].forEach((v, k) => expect(m.body_ipos[3 * a + k]).toBeCloseTo(v, 12));
      [0, 1, 2].forEach((k) => expect(m.body_inertia[3 * a + k]).toBeCloseTo(spec.links[0].inertia![k], 12));
      [0, 1, 2].forEach((k) => expect(m.body_inertia[3 * b + k]).toBeCloseTo(p.body_inertia[3 * b + k], 12));
    } finally {
      plain.dispose();
      h.dispose();
    }
  });

  it('move the chain\'s centre of mass with them', () => {
    expect(chainFromSpec(parseRobot(measured())).masses[0].com).toEqual([0.1, 0, 0.02]);
  });

  it('leave a spec without them as it was', () => {
    const xml = toMjcf(parseRobot(arm()));
    expect(xml).toContain('inertiafromgeom="true"');
    expect(xml).not.toContain('<inertial');
  });
});
