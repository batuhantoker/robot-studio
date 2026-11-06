/**
 * Keys and mouse for Pilot: WASD (and Q/E) held, Shift for pace, C for the camera, 1–9 for hand moves,
 * I J K L with U O to move a hand, Tab for the other hand, Space to grip, R to rest the hands; pointer-locked look.
 * On a fixed arm the same keys jog the tool: W S A D Q E, Space grips, R goes home, T points the tool down.
 */
const KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ShiftLeft', 'ShiftRight', 'KeyI', 'KeyJ', 'KeyK', 'KeyL', 'KeyU', 'KeyO']);
const PRESSES = new Set(['Tab', 'Space', 'KeyR', 'KeyT']);

const typing = (t: EventTarget | null) => !!(t as HTMLElement | null)?.closest?.('input, select, textarea, [contenteditable]');

export class PilotInput {
  private readonly held = new Set<string>();
  /** Mouse travel since the last read (px): x turns the robot, y tilts the camera. */
  private look = { x: 0, y: 0 };
  /** Dragging looks too: pointer lock can be refused (an embedded or unfocused page). */
  private dragging = false;
  /** Held on-screen hand buttons: (forward, left, up). */
  pad: [number, number, number] = [0, 0, 0];
  /** Touch controls: the stick (x right, y forward, each -1..1), side step (+1 left), and the run toggle. */
  stick = { x: 0, y: 0 };
  side = 0;
  run = false;
  /** A finger looking around in the look-out view. */
  private touch: { id: number; x: number; y: number } | null = null;

  constructor(private readonly canvas: HTMLCanvasElement, private readonly active: () => boolean, onCamera: () => void, private readonly pov: () => boolean,
    onNumber: (n: number) => void = () => undefined, onPress: (code: string) => void = () => undefined) {
    addEventListener('keydown', (e) => {
      if (!this.active() || typing(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.code === 'KeyC' && !e.repeat) onCamera();
      if (/^Digit[1-9]$/.test(e.code) && !e.repeat) onNumber(Number(e.code.slice(5)));
      if (PRESSES.has(e.code)) {
        e.preventDefault();
        if (!e.repeat) onPress(e.code);
        return;
      }
      if (!KEYS.has(e.code) && e.code !== 'KeyC') return;
      e.preventDefault();
      this.held.add(e.code);
    });
    addEventListener('keyup', (e) => this.held.delete(e.code));
    addEventListener('blur', () => this.held.clear());
    canvas.addEventListener('mousedown', () => {
      if (!this.active() || !this.pov()) return;
      this.dragging = true;
      if (document.pointerLockElement !== canvas) canvas.requestPointerLock?.()?.catch?.(() => undefined);
    });
    addEventListener('mouseup', () => (this.dragging = false));
    // Touch has no pointer lock or mouse movement: a finger dragged on the view looks around.
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' || !this.active() || !this.pov()) return;
      this.touch = { id: e.pointerId, x: e.clientX, y: e.clientY };
    });
    addEventListener('pointermove', (e) => {
      const t = this.touch;
      if (!t || e.pointerId !== t.id) return;
      this.look.x += e.clientX - t.x;
      this.look.y += e.clientY - t.y;
      [t.x, t.y] = [e.clientX, e.clientY];
    });
    for (const ev of ['pointerup', 'pointercancel']) addEventListener(ev, (e) => (e as PointerEvent).pointerId === this.touch?.id && (this.touch = null));
    addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== canvas && !this.dragging) return;
      this.look.x += e.movementX;
      this.look.y += e.movementY;
    });
  }

  axis(plus: string, minus: string): number {
    const keys = (this.held.has(plus) ? 1 : 0) - (this.held.has(minus) ? 1 : 0);
    const touch = plus === 'KeyW' ? this.stick.y : plus === 'KeyA' ? -this.stick.x : plus === 'KeyQ' ? this.side : 0;
    return Math.max(-1, Math.min(1, keys + touch));
  }

  /** The hand nudge asked for: (forward, left, up), from the keys and the on-screen pad. */
  hand(): [number, number, number] {
    const k = (a: string, b: string, i: number) => Math.max(-1, Math.min(1, this.axis(a, b) + this.pad[i]));
    return [k('KeyI', 'KeyK', 0), k('KeyJ', 'KeyL', 1), k('KeyU', 'KeyO', 2)];
  }

  get fast(): boolean {
    return this.run || this.held.has('ShiftLeft') || this.held.has('ShiftRight');
  }

  /** Mouse travel (px) since the last call. */
  takeLook(): { x: number; y: number } {
    const out = this.look;
    this.look = { x: 0, y: 0 };
    return out;
  }

  release(): void {
    this.held.clear();
    this.pad = [0, 0, 0];
    this.stick = { x: 0, y: 0 };
    this.side = 0;
    this.touch = null;
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }
}
