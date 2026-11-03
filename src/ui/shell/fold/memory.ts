/** Which panels, sections and bars are folded, remembered across visits. */
const KEY = 'robot-studio.folded.v1';

function load(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

const folded = load();

export const isFolded = (key: string): boolean => folded.has(key);

export function setFolded(key: string, on: boolean): void {
  if (on) folded.add(key);
  else folded.delete(key);
  try {
    localStorage.setItem(KEY, JSON.stringify([...folded]));
  } catch {
    // Storage can be unavailable (private mode); folding still works for this visit.
  }
}
