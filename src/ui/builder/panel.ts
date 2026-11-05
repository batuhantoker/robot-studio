/** Robot builder: compose a chain from the joint catalogue; every edit re-validates and rebuilds. */
import { armFit } from '../../cad/assembly/mjcf/mounts';
import { fixedTool, ownTool } from '../../cad/assembly/mjcf/own-tools';
import { bindToolLink, fitTool, fittedTool, twinToolIssue } from '../../app/robots/fitted';
import type { Store } from '../../app/state/store';
import type { LibraryEntry, StudioState, TwinRef } from '../../app/state/types';
import { EFFECTOR_KINDS, EFFECTOR_LIST, isEffectorKind } from '../../core/robot/effectors/kinds';
import { JOINT_KINDS } from '../../core/robot/joints/kinds';
import { addLabel, addableKinds, kindChoices } from '../../core/robot/joints/placement';
import type { EffectorKind } from '../../core/robot/schema/types';
import { h, replace } from '../dom/h';
import { field, numberInput, select, textInput, vecInput } from '../widgets/fields';
import { type Raw, addLink, moveLink, patchLink, rawOf, removeLink } from './edit';
import { linkCard } from './link-card';

const NONE = 'none';

/** A CAD arm's tool: what it already carries, or a picker that compiles the choice into its model. */
function toolSection(store: Store<StudioState>, entry: LibraryEntry | undefined, error: string | null): HTMLElement | null {
  const id = entry?.catalogId;
  const own = id ? ownTool(id) : null;
  const head = h('header', {}, h('span.cap', {}, 'End effector'));
  const fixed = id ? fixedTool(id) : null;
  if (own) return h('div.section', {}, head, h('p.note', {}, `Carries its own ${own.name}. Pick & place opens and closes its jaws.`));
  if (fixed) return h('div.section', {}, head, h('p.note', {}, `Carries its own ${fixed}, which cannot hold anything, so no Pick & place.`));
  if (!id || !armFit(id)) return null;
  const kind = fittedTool(id);
  const pick = select<string>([[NONE, 'None, bare flange'], ...EFFECTOR_LIST.map((e): [string, string] => [e.kind, e.label])], kind ?? NONE,
    (v) => fitTool(store, entry!, isEffectorKind(v) ? v : null));
  const dual = armFit(id)!.mounts.length > 1;
  const says = flangeNote(kind ?? 'flange');
  const failed = error && (/allocate/.test(error) ? 'Not enough memory to compile this tool in. Remove a robot from the stage and try again.' : error);
  return h('div.section', {}, head, field(dual ? 'Each arm' : 'Tool', pick), h('p.note', {}, says), failed ? h('div.error', {}, failed) : null);
}

const flangeNote = (kind: EffectorKind) => {
  const tool = EFFECTOR_KINDS[kind];
  return kind === 'flange' ? 'Nothing on the flange, so no Pick & place. Choose a gripper to fit one.' : `${tool.use}.${tool.grips ? ' Pick & place is ready.' : ' It cannot hold anything, so no Pick & place.'}`;
};

/** A twin's tool: on the real flange, unless its CAD already carries one. */
function twinTool(twin: TwinRef, kind: EffectorKind, pick: (kind: EffectorKind) => void): HTMLElement[] {
  const issue = twinToolIssue(twin);
  if (issue) return [h('p.note', {}, issue)];
  const list = EFFECTOR_LIST.map((e): [EffectorKind, string] => [e.kind, e.kind === 'flange' ? 'None, bare flange' : e.label]);
  return [field('End effector', select(list, kind, pick)), h('p.note', {}, flangeNote(kind))];
}

export function mountBuilder(el: HTMLElement, store: Store<StudioState>, commit: (raw: Raw) => void): void {
  const body = h('div');
  el.append(body);
  bindToolLink(store);
  let open = 0;
  const render = (s: StudioState) => {
    if (!s.draft) {
      replace(body, toolSection(store, s.library.find((e) => e.id === s.activeId), s.draftError), h('div.section', {}, h('header', {}, h('span.cap', {}, 'Builder')),
        h('p.note', {}, 'Imported CAD links and joints are read-only. Make editable keeps this CAD and opens its joints here; or duplicate a preset, or start a new robot.')));
      return;
    }
    const raw = rawOf(s.draft);
    const set = (patch: Record<string, unknown>) => commit({ ...raw, ...patch } as Raw);
    const focus = s.isolate?.startsWith('joint:') ? s.isolate.slice(6) : null;
    const twin = s.library.find((e) => e.id === s.activeId)?.twin;
    const count = s.draft.links.length;
    const effector = select(EFFECTOR_LIST.map((e) => [e.kind, e.label]), s.draft.effector, (kind) => set({ effector: kind }));
    effector.title = EFFECTOR_LIST.find((e) => e.kind === s.draft!.effector)?.use ?? '';
    replace(body,
      h('div.section', {}, h('header', {}, h('span.cap', {}, 'Builder'), h('span.cap.mu', {}, 'SI · shown in mm / °')),
        field('Name', textInput(s.draft.name, (name) => set({ name }))),
        field('Base mm', vecInput(s.draft.base, (base) => set({ base }), { scale: 1000, step: 5, digits: 1 })),
        field('Tool mm', vecInput(s.draft.tool, (tool) => set({ tool }), { scale: 1000, step: 5, digits: 1 })),
        field('Payload kg', numberInput(s.draft.payload_mass, (payload_mass) => set({ payload_mass }), { step: 0.05 })),
        ...(twin ? twinTool(twin, s.draft.effector, (kind) => set({ effector: kind })) : [field('End effector', effector)]),
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
        }, { kinds: kindChoices(link.joint, i, !!twin), moves: !twin, removes: !twin || i === count - 1 }))),
      h('div.section', {}, h('header', {}, h('span.cap', {}, 'Add joint')),
        h('div.row', {}, ...addableKinds(s.draft, !!twin).map((kind) => h('button.tb', {
          title: `${JOINT_KINDS[kind].motion} — ${JOINT_KINDS[kind].useCase}`,
          onclick: () => ((open = kind === 'planar' ? 0 : count), commit(addLink(raw, kind))),
        }, `+ ${addLabel(kind)}`)))),
    );
  };
  store.on(['draft', 'draftError', 'activeId', 'library'], render);
  render(store.state);
}
