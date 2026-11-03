import fs from 'node:fs';
import path from 'node:path';
import { assertExactFile } from '../files/exact-case.mjs';
import { parseXml } from './parse-xml.mjs';

const FILE_ATTRS = {
  mesh: { dir: 'mesh', attrs: ['file'] },
  hfield: { dir: 'mesh', attrs: ['file'] },
  skin: { dir: 'mesh', attrs: ['file'] },
  flexcomp: { dir: 'mesh', attrs: ['file'] },
  texture: { dir: 'texture', attrs: ['file', 'fileright', 'fileleft', 'fileup', 'filedown', 'filefront', 'fileback'] },
};

function toRel(...parts) {
  const rel = path.posix.normalize(path.posix.join(...parts));
  if (rel.startsWith('../') || rel === '..' || path.posix.isAbsolute(rel)) return null;
  return rel;
}

// Every file MuJoCo opens to compile `mainRel`, relative to `root`: the main XML, its includes, then assets.
export function referencedFiles(root, mainRel) {
  const label = (rel) => `${path.basename(root)}/${rel}`;
  const xmls = [mainRel];
  const refs = [];
  const compiler = {};
  const mainDir = path.posix.dirname(mainRel);

  const walk = (el, xmlRel) => {
    for (const child of el.children) {
      if (child.name === 'include') {
        const file = child.attrs.file;
        if (!file) throw new Error(`${label(xmlRel)}: <include> without file`);
        // MuJoCo resolves includes against the including file, falling back to the main file's directory.
        const candidates = [toRel(path.posix.dirname(xmlRel), file), toRel(mainDir, file)].filter(Boolean);
        const rel = candidates.find((c) => fs.existsSync(path.join(root, c)));
        if (!rel) throw new Error(`${label(xmlRel)}: included file ${file} not found`);
        assertExactFile(root, rel, label(xmlRel));
        if (xmls.includes(rel)) throw new Error(`${label(xmlRel)}: ${rel} is included twice`);
        xmls.push(rel);
        walk(parseXml(fs.readFileSync(path.join(root, rel), 'utf8'), label(rel)), rel);
        continue;
      }
      if (child.name === 'model' && child.attrs.file) {
        throw new Error(`${label(xmlRel)}: <model file> sub-models are not supported`);
      }
      if (child.name === 'compiler') {
        for (const key of ['meshdir', 'texturedir', 'assetdir']) {
          if (key in child.attrs) compiler[key] = child.attrs[key];
        }
      }
      const spec = FILE_ATTRS[child.name];
      if (spec) {
        for (const attr of spec.attrs) {
          if (child.attrs[attr]) refs.push({ kind: spec.dir, file: child.attrs[attr], from: xmlRel });
        }
      }
      walk(child, xmlRel);
    }
  };
  walk(parseXml(fs.readFileSync(path.join(root, mainRel), 'utf8'), label(mainRel)), mainRel);

  const dirFor = (kind) => compiler[`${kind}dir`] ?? compiler.assetdir ?? '';
  const assets = [];
  for (const ref of refs) {
    const dir = dirFor(ref.kind);
    if (path.posix.isAbsolute(ref.file) || path.posix.isAbsolute(dir)) {
      throw new Error(`${label(ref.from)}: absolute asset path ${path.posix.join(dir, ref.file)} is not portable`);
    }
    // Asset paths are relative to the main model file regardless of which file declares them.
    const rel = toRel(mainDir, dir, ref.file.replaceAll('\\', '/'));
    if (!rel) throw new Error(`${label(ref.from)}: ${ref.file} resolves outside ${path.basename(root)}/`);
    assertExactFile(root, rel, label(ref.from));
    if (!assets.includes(rel) && !xmls.includes(rel)) assets.push(rel);
  }
  return [...xmls, ...assets];
}
