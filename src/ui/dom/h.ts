/** Minimal element builder: h('div.cls', { onclick }, child, …). */
type Child = Node | string | number | null | undefined | false;
type Props = Record<string, unknown> & { style?: Partial<CSSStyleDeclaration> | string; dataset?: Record<string, string> };

export function h<K extends keyof HTMLElementTagNameMap>(spec: K | `${K}.${string}`, props: Props = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const [tag, ...classes] = spec.split('.') as [K, ...string[]];
  const el = document.createElement(tag);
  if (classes.length) el.className = classes.join(' ');
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'style') {
      if (typeof value === 'string') el.style.cssText = value;
      else Object.assign(el.style, value);
    } else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key.startsWith('on')) el.addEventListener(key.slice(2), value as EventListener);
    else if (key === 'class') el.className += ` ${value}`;
    else if (key in el) (el as unknown as Record<string, unknown>)[key] = value;
    else el.setAttribute(key, String(value));
  }
  append(el, ...children);
  return el;
}

export function append(el: HTMLElement, ...children: Child[]): HTMLElement {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function replace(el: HTMLElement, ...children: Child[]): HTMLElement {
  el.replaceChildren();
  return append(el, ...children);
}
