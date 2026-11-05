/** Owns one MjModel/MjData pair on the WASM heap; dispose() frees both exactly once. */
import type { MjData, MjModel } from '@mujoco/mujoco';
import { type MainModule, mujoco } from '../runtime/loader';

export class ModelHandle {
  private disposed = false;

  constructor(readonly mj: MainModule, readonly model: MjModel, readonly data: MjData) {}

  static async fromXml(xml: string): Promise<ModelHandle> {
    const mj = await mujoco();
    const model = mj.MjModel.from_xml_string(xml);
    return new ModelHandle(mj, model, new mj.MjData(model));
  }

  /** Compile from files written into MuJoCo's virtual FS under a fresh directory. */
  static async fromFiles(files: Map<string, Uint8Array>, entry: string): Promise<ModelHandle> {
    const mj = await mujoco();
    const root = `/robots/${Math.random().toString(36).slice(2)}`;
    for (const [path, bytes] of files) {
      const full = `${root}/${path}`;
      mj.FS.mkdirTree(full.slice(0, full.lastIndexOf('/')), 0o777);
      mj.FS.writeFile(full, bytes);
    }
    const model = mj.MjModel.from_xml_path(`${root}/${entry}`);
    // The model holds what it needs; left here these copies would sit on the heap for good.
    for (const path of files.keys()) mj.FS.unlink(`${root}/${path}`);
    return new ModelHandle(mj, model, new mj.MjData(model));
  }

  name(type: number, id: number): string {
    return this.mj.mj_id2name(this.model, type, id) ?? '';
  }

  id(type: number, name: string): number {
    return this.mj.mj_name2id(this.model, type, name);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.data.delete();
    this.model.delete();
  }
}
