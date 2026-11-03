/** Strict JSON input: duplicate keys are rejected like SerialArm.from_json. */
import { parseRobot } from './parse';
import { type RobotSpec, SpecError } from './types';

function skipString(text: string, start: number): number {
  let j = start + 1;
  while (j < text.length && text[j] !== '"') j += text[j] === '\\' ? 2 : 1;
  return j + 1;
}

/** JSON.parse silently keeps the last duplicate, so track keys per object. */
export function findDuplicateKey(text: string): string | null {
  const scopes: (Set<string> | null)[] = [];
  let expectKey = false;
  for (let i = 0; i < text.length;) {
    const ch = text[i];
    if (ch === '"') {
      const end = skipString(text, i);
      const scope = scopes[scopes.length - 1];
      if (expectKey && scope) {
        let k = end;
        while (/\s/.test(text[k] ?? '')) k++;
        if (text[k] === ':') {
          const key = JSON.parse(text.slice(i, end)) as string;
          if (scope.has(key)) return key;
          scope.add(key);
          expectKey = false;
        }
      }
      i = end;
      continue;
    }
    if (ch === '{') { scopes.push(new Set()); expectKey = true; }
    else if (ch === '[') scopes.push(null);
    else if (ch === '}' || ch === ']') scopes.pop();
    else if (ch === ',' && scopes[scopes.length - 1]) expectKey = true;
    i++;
  }
  return null;
}

export function parseRobotJson(text: string): RobotSpec {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new SpecError(`invalid JSON: ${(error as Error).message}`);
  }
  const duplicate = findDuplicateKey(text);
  if (duplicate) throw new SpecError(`duplicate JSON key: ${duplicate}`);
  return parseRobot(value);
}
