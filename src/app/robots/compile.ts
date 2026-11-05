/**
 * Compiles a catalog robot from files that stay put in MuJoCo's file system. Its mesh cache is keyed on path and
 * write time, so refitting a tool rewrites only the XML: tens of milliseconds, and no second copy of every mesh on the heap.
 */
import { ModelHandle } from '../../physics/model/handle';
import { mujoco } from '../../physics/runtime/loader';

/** Size of each asset already in place. A fetched-again copy is the same file, and rewriting it would drop it from the cache. */
const written = new Map<string, number>();

export async function compileRobot(id: string, files: Map<string, Uint8Array>, entry: string): Promise<ModelHandle> {
  const mj = await mujoco();
  const root = `/catalog/${id}`;
  for (const [path, bytes] of files) {
    const full = `${root}/${path}`;
    if (!path.endsWith('.xml') && written.get(full) === bytes.length) continue;
    mj.FS.mkdirTree(full.slice(0, full.lastIndexOf('/')), 0o777);
    mj.FS.writeFile(full, bytes);
    written.set(full, bytes.length);
  }
  const model = mj.MjModel.from_xml_path(`${root}/${entry}`);
  return new ModelHandle(mj, model, new mj.MjData(model));
}
