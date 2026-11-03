/** Robot builder: compose a chain from the joint catalogue; every edit re-validates and rebuilds. */
import type { Store } from '../../app/state/store';
import type { StudioState } from '../../app/state/types';
import { EFFECTOR_LIST } from '../../core/robot/effectors/kinds';
import { JOINT_KIND_LIST } from '../../core/robot/joints/kinds';
import { h, replace } from '../dom/h';
import { field, numberInput, select, textInput, vecInput } from '../widgets/fields';
import { type Raw, addLink, moveLink, patchLink, rawOf, removeLink } from './edit';
import { linkCard } from './link-card';

export function mountBuilder(el: HTMLElement, store: Store<StudioState>, commit: (raw: Raw) => void): void {
  const body = h('div');
  el.append(body);
  let open = 0;
  const render = (s: StudioState) => {
    if (!s.draft) {
      replace(body, h('div.section', {}, h('header', {}, h('span.cap', {}, 'Builder')),
        h('p.note', {}, 'Imported CAD robots are read-only. Duplicate a preset or start a new robot to compose your own.')));
      return;
    }
    const raw = rawOf(s.draft);
    const set = (patch: Record<string, unknown>) => commit({ ...raw, ...patch } as Raw);
    const focus = s.isolate?.startsWith('joint:') ? s.isolate.slice(6) : null;
    const twin = !!s.library.find((e) => e.id === s.activeId)?.twin;
    const effector = select(EFFECTOR_LIST.map((e) => [e.kind, e.label]), s.draft.effector, (kind) => set({ effector: kind }));
    effector.title = EFFECTOR_LIST.find((e) => e.kind === s.draft!.effector)?.use ?? '';
    replace(body,
      h('div.section', {}, h('header', {}, h('span.cap', {}, 'Builder'), h('span.cap.mu', {}, 'SI · shown in mm / °')),
        field('Name', textInput(s.draft.name, (name) => set({ name }))),
        field('Base mm', vecInput(s.draft.base, (base) => set({ base }), { scale: 1000, step: 5, digits: 1 })),
        field('Tool mm', vecInput(s.draft.tool, (tool) => set({ tool }), { scale: 1000, step: 5, digits: 1 })),
        field('Payload kg', numberInput(s.draft.payload_mass, (payload_mass) => set({ payload_mass }), { step: 0.05 })),
        // A twin keeps its CAD's own hand.
        twin ? null : field('End effector', effector),
        s.draftError ? h('div.error', {}, s.draftError) : null),
      h('div.section', {}, h('header', {}, h('span.cap', {}, 'Joints & links'), h('span.cap.mu', {}, `${s.draft.links.length} links`)),
        ...s.draft.links.map((link, i) => linkCard(link, i, i === open, link.name === focus, {
          change: (patch) => commit(patchLink(raw, i, patch)),
          move: (d) => ((open = i + d), commit(moveLink(raw, i, d))),
          remove: () => commit(removeLink(raw, i)),
          focus: () => {
            open = open === i ? -1 : i;
            store.set({ isolate: `joint:${link.name}` });
            render(store.state);
          },
        }))),
      h('div.section', {}, h('header', {}, h('span.cap', {}, 'Add joint')),
        h('div.row', {}, ...JOINT_KIND_LIST.map((k) => h('button.tb', {
          title: `${k.motion} — ${k.useCase}`,
          onclick: () => ((open = s.draft!.links.length), commit(addLink(raw, k.kind))),
        }, `+ ${k.label}`)))),
    );
  };
  store.on(['draft', 'draftError', 'activeId'], render);
  render(store.state);
}
