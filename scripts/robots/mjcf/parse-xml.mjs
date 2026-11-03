// Minimal XML reader: elements and attributes only; returns the #document node.
export function parseXmlTree(text, label) {
  const root = { name: '#document', attrs: {}, children: [] };
  const stack = [root];
  const startTag = /<([A-Za-z_][\w.:-]*)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/y;
  const endTag = /<\/([A-Za-z_][\w.:-]*)\s*>/y;
  const attrRe = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  const skip = [
    ['<!--', '-->'],
    ['<?', '?>'],
    ['<![CDATA[', ']]>'],
    ['<!', '>'],
  ];
  let i = 0;
  outer: while (true) {
    const lt = text.indexOf('<', i);
    if (lt < 0) break;
    for (const [open, close] of skip) {
      if (text.startsWith(open, lt)) {
        const end = text.indexOf(close, lt + open.length);
        if (end < 0) throw new Error(`${label}: unterminated ${open}`);
        i = end + close.length;
        continue outer;
      }
    }
    endTag.lastIndex = lt;
    let match = endTag.exec(text);
    if (match) {
      const open = stack.pop();
      if (!open || open === root || open.name !== match[1]) {
        throw new Error(`${label}: unexpected </${match[1]}>`);
      }
      i = endTag.lastIndex;
      continue;
    }
    startTag.lastIndex = lt;
    match = startTag.exec(text);
    if (!match) throw new Error(`${label}: malformed tag near offset ${lt}`);
    const el = { name: match[1], attrs: {}, children: [] };
    for (const [, key, dq, sq] of match[2].matchAll(attrRe)) el.attrs[key] = decodeEntities(dq ?? sq);
    stack.at(-1).children.push(el);
    if (!match[3]) stack.push(el);
    i = startTag.lastIndex;
  }
  if (stack.length !== 1) throw new Error(`${label}: unclosed <${stack.at(-1).name}>`);
  return root;
}

export function parseXml(text, label) {
  const top = parseXmlTree(text, label).children.filter((c) => c.name === 'mujoco');
  if (top.length !== 1) throw new Error(`${label}: expected a single <mujoco> root element`);
  return top[0];
}

function decodeEntities(value) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  return value.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (whole, ent) => {
    if (ent[0] === '#') {
      return String.fromCodePoint(ent[1].toLowerCase() === 'x' ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10));
    }
    return named[ent] ?? whole;
  });
}
