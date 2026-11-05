/** Which tool each catalog arm wears. Saved in the browser; a `?robot=…&tool=…` link applies on top, so it can be shared. */
import { armFit } from '../../cad/assembly/mjcf/mounts';
import { fixedTool, ownTool } from '../../cad/assembly/mjcf/own-tools';
import { isEffectorKind } from '../../core/robot/effectors/kinds';
import type { EffectorKind } from '../../core/robot/schema/types';
import { loadTools, saveTools } from '../library/storage';
import type { Store } from '../state/store';
import type { LibraryEntry, StudioState, TwinRef } from '../state/types';

const tools = loadTools();

const params = () => (typeof location === 'undefined' ? null : new URLSearchParams(location.search));

function applyLink(): void {
  const q = params();
  const id = q?.get('robot')?.replace(/^cad:/, '');
  const kind = q?.get('tool');
  if (!id || !kind) return;
  if (isEffectorKind(kind)) tools[id] = kind;
  else if (kind === 'none') delete tools[id];
}
applyLink();

/** An arm that carries its own tool, or that no mount is known for, takes none. */
export const fittedTool = (catalogId: string): EffectorKind | null => (ownTool(catalogId) || !armFit(catalogId) ? null : tools[catalogId] ?? null);

/** Why a twin takes no tool, or null when one fits its flange. */
export function twinToolIssue(t: TwinRef): string | null {
  const carried = ownTool(t.catalogId)?.name ?? fixedTool(t.catalogId);
  if (carried) return `Carries its own ${carried}, kept as part of the CAD. Pick & place needs the original arm.`;
  return armFit(t.catalogId)?.mounts.some((m) => m.limb === t.chainIndex) ? null : 'This limb has no measured tool mount, so no tool fits it.';
}

/** Keeps the address a link to what is shown: a lone fitted robot reloads as it is, and a stage comes back from its own save. */
function writeLink(s: StudioState): void {
  const q = params();
  if (!q) return;
  const entry = s.library.find((e) => e.id === s.activeId);
  const kind = entry?.catalogId ? fittedTool(entry.catalogId) : null;
  if (kind && s.scene.length === 1) {
    q.set('robot', entry!.id);
    q.set('tool', kind);
  } else if (q.has('tool')) {
    q.delete('tool');
    q.delete('robot');
  } else return;
  const search = q.toString().replaceAll('%3A', ':');
  history.replaceState(null, '', `${location.pathname}${search ? `?${search}` : ''}${location.hash}`);
}

/** After a load: the tool that really compiled, so a failed refit doesn't leave the choice pointing at a tool that isn't there. */
export function settleTool(store: Store<StudioState>, catalogId: string, kind: EffectorKind | null): void {
  if (fittedTool(catalogId) === kind) return;
  if (kind) tools[catalogId] = kind;
  else delete tools[catalogId];
  saveTools(tools);
  store.set({ library: [...store.state.library] });
  writeLink(store.state);
}

/** A new entry object makes every placement of this robot reload with the tool compiled in. */
export function fitTool(store: Store<StudioState>, entry: LibraryEntry, kind: EffectorKind | null): void {
  if (!entry.catalogId) return;
  if (kind) tools[entry.catalogId] = kind;
  else delete tools[entry.catalogId];
  saveTools(tools);
  store.set({ library: store.state.library.map((e) => (e === entry ? { ...e } : e)) });
  writeLink(store.state);
}

export const bindToolLink = (store: Store<StudioState>) => store.on(['activeId', 'scene'], writeLink);
