/** What the build bakes: every preset with design data. A robot with none is one being edited, and meshes live as a draft. */
import { buildSpecAssembly } from '../../cad/assembly/spec/build';
import { encodeBake, recordBake, specKey } from '../../cad/parts/castings/bake';
import { PRESETS } from './load';

export function bakePresets(onEach: (id: string, ms: number) => void): { key: string; data: Uint8Array }[] {
  return PRESETS.filter((p) => p.spec.design).map(({ id, spec }) => {
    const start = performance.now();
    const data = encodeBake(recordBake(spec, () => buildSpecAssembly(spec).dispose()));
    onEach(id, performance.now() - start);
    return { key: specKey(spec), data };
  });
}
