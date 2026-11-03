/** Keys and mouse for Pilot: WASD (and Q/E) held, Shift for pace, C for the camera, 1–9 for hand moves, pointer-locked look. */
const KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ShiftLeft', 'ShiftRight']);

const typing = (t: EventTarget | null) => !!(t as HTMLElement | null)?.closest?.('input, select, textarea, [contenteditable]');

export class PilotInput {
  private readonly held = new Set<string>();
  /** Mouse travel since the last read (px): x turns the robot, y tilts the camera. */
  private look = { x: 0, y: 0 };
  /** Dragging looks too: pointer lock can be refused (an embedded or unfocused page). */
  private dragging = false;

  constructor(private readonly canvas: HTMLCanvasElement, private readonly active: () => boolean, onCamera: () => void, private readonly pov: () => boolean,
    onNumber: (n: number) => void = () => undefined) {
    addEventListener('keydown', (e) => {
      if (!this.active() || typing(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.code === 'KeyC' && !e.repeat) onCamera();
      if (/^Digit[1-9]$/.test(e.code) && !e.repeat) onNumber(Number(e.code.slice(5)));
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
    addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== canvas && !this.dragging) return;
      this.look.x += e.movementX;
      this.look.y += e.movementY;
    });
  }

  axis(plus: string, minus: string): number {
    return (this.held.has(plus) ? 1 : 0) - (this.held.has(minus) ? 1 : 0);
  }

  get fast(): boolean {
    return this.held.has('ShiftLeft') || this.held.has('ShiftRight');
  }

  /** Mouse travel (px) since the last call. */
  takeLook(): { x: number; y: number } {
    const out = this.look;
    this.look = { x: 0, y: 0 };
    return out;
  }

  release(): void {
    this.held.clear();
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }
}
