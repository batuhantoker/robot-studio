/** Numeric inputs that commit on change; values are shown in display units and stored in SI. */
import { h } from '../dom/h';

export function numberInput(value: number, onCommit: (v: number) => void, opts: { scale?: number; step?: number; digits?: number } = {}): HTMLInputElement {
  const { scale = 1, step = 1, digits = 3 } = opts;
  const input = h('input.num', { type: 'number', step: String(step), value: String(+(value * scale).toFixed(digits)) });
  input.addEventListener('change', () => {
    const v = Number(input.value);
    if (Number.isFinite(v)) onCommit(v / scale);
  });
  return input;
}

export function vecInput(value: number[], onCommit: (v: number[]) => void, opts: { scale?: number; step?: number; digits?: number } = {}): HTMLElement {
  const current = [...value];
  return h('div.vec', {}, ...current.map((v, i) => numberInput(v, (x) => {
    current[i] = x;
    onCommit([...current]);
  }, opts)));
}

export const field = (label: string, control: HTMLElement) => h('div.field', {}, h('label', {}, label), control);

export function textInput(value: string, onCommit: (v: string) => void): HTMLInputElement {
  const input = h('input.text', { value });
  input.addEventListener('change', () => onCommit(input.value.trim()));
  return input;
}

export function select<T extends string>(options: [T, string][], value: T, onChange: (v: T) => void): HTMLSelectElement {
  const el = h('select', {}, ...options.map(([v, label]) => h('option', { value: v, selected: v === value }, label)));
  el.addEventListener('change', () => onChange(el.value as T));
  return el;
}
