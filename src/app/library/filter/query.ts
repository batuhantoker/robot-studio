/** Search text: free words match name/maker/type/tags; `dof:7`, `dof:6-8`, `dof>12`, `dof<5` bound DOF. */
export interface ParsedQuery {
  words: string[];
  min: number;
  max: number;
}

const DOF_TOKEN = /^dof\s*(:|=|>=|<=|>|<)\s*(\d+)(?:\s*-\s*(\d+))?$/;

export function parseQuery(text: string): ParsedQuery {
  const out: ParsedQuery = { words: [], min: 0, max: Infinity };
  const tokens = text.toLowerCase().replace(/dof\s*([:=<>]=?)\s*/g, 'dof$1').split(/\s+/).filter(Boolean);
  for (const token of tokens) {
    const m = DOF_TOKEN.exec(token);
    if (!m) {
      out.words.push(token);
      continue;
    }
    const [, op, a, b] = m;
    const n = Number(a);
    if (b !== undefined) [out.min, out.max] = [Math.max(out.min, n), Math.min(out.max, Number(b))];
    else if (op === '>') out.min = Math.max(out.min, n + 1);
    else if (op === '>=') out.min = Math.max(out.min, n);
    else if (op === '<') out.max = Math.min(out.max, n - 1);
    else if (op === '<=') out.max = Math.min(out.max, n);
    else [out.min, out.max] = [Math.max(out.min, n), Math.min(out.max, n)];
  }
  return out;
}
