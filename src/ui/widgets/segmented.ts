/** A row of mutually exclusive buttons. */
import { h } from '../dom/h';

export interface Segmented<T extends string> {
  el: HTMLElement;
  set(value: T): void;
}

export function segmented<T extends string>(options: [T, string][], value: T, onChange: (v: T) => void): Segmented<T> {
  const buttons = options.map(([v, label]) => h('button.tb', { onclick: () => onChange(v), dataset: { v } }, label));
  const el = h('div.seg', {}, ...buttons);
  const set = (v: T) => buttons.forEach((b) => b.classList.toggle('on', b.dataset.v === v));
  set(value);
  return { el, set };
}

export function toggle(label: string, on: boolean, onChange: (v: boolean) => void): HTMLButtonElement {
  const b = h('button.tb', { onclick: () => onChange(!b.classList.contains('on')) }, label);
  b.classList.toggle('on', on);
  return b;
}
