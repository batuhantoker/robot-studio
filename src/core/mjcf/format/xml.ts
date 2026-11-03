/** A minimal ElementTree: insertion-ordered attributes, `ET.indent` layout, ` />` empty tags. */

export interface XmlNode {
  tag: string;
  attrs: [string, string][];
  children: XmlNode[];
}

export function node(tag: string, attrs: Record<string, string> = {}): XmlNode {
  return { tag, attrs: Object.entries(attrs), children: [] };
}

export function child(parent: XmlNode, tag: string, attrs: Record<string, string> = {}): XmlNode {
  const n = node(tag, attrs);
  parent.children.push(n);
  return n;
}

const ESCAPES: Record<string, string> = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\n': '&#10;', '\r': '&#13;', '\t': '&#09;',
};
const escapeAttr = (v: string) => v.replace(/[&<>"\n\r\t]/g, (c) => ESCAPES[c]);

export function serialize(n: XmlNode, level = 0): string {
  const pad = '  '.repeat(level);
  const attrs = n.attrs.map(([k, v]) => ` ${k}="${escapeAttr(v)}"`).join('');
  if (!n.children.length) return `<${n.tag}${attrs} />`;
  const inner = n.children.map((c) => `\n${pad}  ${serialize(c, level + 1)}`).join('');
  return `<${n.tag}${attrs}>${inner}\n${pad}</${n.tag}>`;
}
