/** Which panels, sections and bars the user folded or opened, remembered across visits. */
const KEY = 'robot-studio.folded.v1';

function load(): Map<string, boolean> {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, boolean> | string[];
    // The first format stored only folded keys.
    return new Map(Array.isArray(raw) ? raw.map((k) => [k, true]) : Object.entries(raw));
  } catch {
    return new Map();
  }
}

const choices = load();

/** The user's choice for this key, else `fallback` (a block's own default). */
export const isFolded = (key: string, fallback = false): boolean => choices.get(key) ?? fallback;

export function setFolded(key: string, on: boolean): void {
  choices.set(key, on);
  try {
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(choices)));
  } catch {
    // Storage can be unavailable (private mode); folding still works for this visit.
  }
}
