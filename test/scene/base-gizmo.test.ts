import { describe, expect, it } from 'vitest';
import { movedBase } from '@/scene/overlays/base-gizmo';

describe('moving a robot base by a drag in the view', () => {
  it('adds the drag directly when the active robot faces +x', () => {
    expect(movedBase({ x: 1, y: 2, yaw: 0.5 }, 0, 0.3, -0.1, 0.2)).toEqual({ x: 1.3, y: 1.9, yaw: 0.7 });
  });

  it('turns the drag into the stage frame by the active robot\'s yaw', () => {
    const b = movedBase({ x: 0, y: 0, yaw: 0 }, Math.PI / 2, 1, 0, 0);
    expect(b.x).toBeCloseTo(0, 9);
    expect(b.y).toBeCloseTo(1, 9);
  });

  it('keeps the yaw within a half turn either way', () => {
    expect(movedBase({ x: 0, y: 0, yaw: 3 }, 0, 0, 0, 0.5).yaw).toBeCloseTo(3.5 - 2 * Math.PI, 9);
  });
});
