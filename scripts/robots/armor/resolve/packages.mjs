import fs from 'node:fs';
import path from 'node:path';

// Every file under each root (skipping .git), as absolute paths.
export function listFiles(roots) {
  const files = [];
  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ent.name === '.git') continue;
      const abs = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(abs);
      else if (ent.isFile()) files.push(abs);
    }
  };
  for (const root of roots) if (fs.existsSync(root)) walk(root);
  return files;
}

// ROS package name -> directory, from package.xml files, with directory names as a fallback.
export function packageMap(files, roots) {
  const map = new Map();
  for (const file of files.filter((f) => path.basename(f) === 'package.xml')) {
    const name = /<name>\s*([^<\s]+)\s*<\/name>/.exec(fs.readFileSync(file, 'utf8'))?.[1];
    if (name && !map.has(name)) map.set(name, path.dirname(file));
  }
  const dirs = new Set(files.map((f) => path.dirname(f)));
  for (const dir of [...dirs].sort((a, b) => a.length - b.length)) {
    for (let d = dir; !roots.includes(d) && d.length > 1; d = path.dirname(d)) {
      const name = path.basename(d);
      if (!map.has(name)) map.set(name, d);
    }
  }
  return map;
}
