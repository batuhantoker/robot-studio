/** In the Materials look: which material classes this robot is made of, with part counts. */
import type { Assembly } from '../../cad/assembly/types';
import { partOf } from '../../cad/common/part';
import { MATERIAL_INFO, type MaterialClass } from '../../cad/materials/classes/types';
import type { Store } from '../../app/state/store';
import type { StudioState } from '../../app/state/types';
import { h, replace } from '../dom/h';

export function mountMaterialLegend(el: HTMLElement, store: Store<StudioState>, assembly: () => Assembly | null): void {
  const card = h('div.pn.legend', { style: 'display:none', dataset: { foldPhone: '' } });
  el.append(card);
  const render = (s: StudioState) => {
    const a = assembly();
    if (s.look !== 'materials' || !a) {
      card.style.display = 'none';
      return;
    }
    const counts = new Map<MaterialClass, number>();
    a.root.traverse((o) => {
      const meta = partOf(o);
      if (meta && meta.layer !== 'kinematic') counts.set(meta.material, (counts.get(meta.material) ?? 0) + 1);
    });
    card.style.display = '';
    replace(card, h('div.cap', { style: 'margin-bottom:6px' }, 'Materials'),
      ...[...counts].sort((x, y) => y[1] - x[1]).map(([cls, n]) => h('div.legend-row', {},
        h('i', { style: `background:${MATERIAL_INFO[cls].swatch}` }), h('span', {}, MATERIAL_INFO[cls].label), h('span.mu.mono', {}, String(n)))),
      h('p.note', { style: 'margin-top:6px' }, 'Imported CAD carries only colours; classes are inferred from colour and part names.'));
  };
  store.on(['look', 'sessionVersion'], render);
  render(store.state);
}
