/** A labelled row of toggle chips with live counts. */
import { h } from '../dom/h';

export interface ChipOption {
  id: string;
  label: string;
  count: number;
  on: boolean;
}

export function chipRow(title: string, options: ChipOption[], toggle: (id: string) => void): HTMLElement {
  return h('div.chip-row', {},
    h('span.cap.mu', {}, title),
    h('div.chips', {}, ...options.map((o) => h('button.fchip', {
      class: `${o.on ? 'on' : ''} ${o.count === 0 && !o.on ? 'empty' : ''}`,
      onclick: () => toggle(o.id),
    }, o.label, h('i', {}, String(o.count))))));
}
