/** The isolated module's bill of parts: a button for every part, grouped by layer. */
import type * as THREE from 'three';
import type { Assembly } from '../../cad/assembly/types';
import { moduleOf } from '../../cad/assembly/types';
import { type Layer, partOf } from '../../cad/common/part';
import type { Store } from '../../app/state/store';
import type { StudioState } from '../../app/state/types';
import { h, replace } from '../dom/h';

const LAYER_LABEL: Record<Layer, string> = {
  housing: 'Housing', structure: 'Structure', drive: 'Drive', bearing: 'Bearing', fastener: 'Fastener', sensor: 'Sensing', cable: 'Cabling', kinematic: 'Kinematic',
};

export function mountPartsCard(el: HTMLElement, store: Store<StudioState>, assembly: () => Assembly | null, flash: (o: THREE.Object3D) => void): void {
  const card = h('div.pn.parts', { style: 'display:none' });
  const chips = h('div.row', { style: 'max-width:520px' });
  el.append(h('div', { style: 'display:flex;flex-direction:column;gap:8px;align-items:flex-start' }, chips, card));
  const render = (s: StudioState) => {
    const a = assembly();
    if (!a) return;
    replace(chips, ...a.modules.slice(0, 40).map((m) => h('button.tb', {
      class: s.isolate === m.id ? 'on' : '',
      onclick: () => store.set({ isolate: s.isolate === m.id ? null : m.id }),
    }, m.label)));
    const mod = a.modules.find((m) => m.id === s.isolate);
    if (!mod) {
      card.style.display = 'none';
      return;
    }
    const parts: THREE.Object3D[] = [];
    a.root.traverse((o) => partOf(o) && moduleOf(o) === mod.id && parts.push(o));
    const byLayer = new Map<Layer, THREE.Object3D[]>();
    for (const p of parts) byLayer.set(partOf(p)!.layer, [...(byLayer.get(partOf(p)!.layer) ?? []), p]);
    card.style.display = '';
    replace(card,
      h('div.row.spread', {}, h('b', { style: 'font-size:13px' }, mod.label), h('span.chip.accent', {}, mod.kind)),
      h('p.note', {}, `${parts.length} parts · click one to find it · raise Explode to open the module`),
      ...[...byLayer].map(([layer, list]) => h('div', { style: 'margin-top:8px' },
        h('div.cap.mu', {}, LAYER_LABEL[layer]),
        ...list.map((p) => h('div.part', { onclick: () => flash(p) }, h('b', {}, partOf(p)!.label), h('span.mu.mono', {}, (p as THREE.InstancedMesh).isInstancedMesh ? `×${(p as THREE.InstancedMesh).count}` : ''))))),
    );
  };
  store.on(['isolate', 'sessionVersion'], render);
  render(store.state);
}
