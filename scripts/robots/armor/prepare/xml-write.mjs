const escape = (v) =>
  String(v).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

export const element = (name, attrs = {}, children = []) => ({ name, attrs, children });

// Serialises a parse-xml tree (elements and attributes only).
export function writeXml(el, depth = 0) {
  const pad = '  '.repeat(depth);
  const attrs = Object.entries(el.attrs)
    .map(([k, v]) => ` ${k}="${escape(v)}"`)
    .join('');
  if (!el.children.length) return `${pad}<${el.name}${attrs}/>\n`;
  const inner = el.children.map((c) => writeXml(c, depth + 1)).join('');
  return `${pad}<${el.name}${attrs}>\n${inner}${pad}</${el.name}>\n`;
}

export const childrenNamed = (el, name) => el.children.filter((c) => c.name === name);
export const firstChild = (el, name) => el?.children.find((c) => c.name === name);
