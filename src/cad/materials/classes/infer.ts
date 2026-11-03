/**
 * Guess a part's material from its colour and name. URDF/MJCF colours are authored in sRGB:
 * saturated → paint, near-white → plastic shell, mid grey → metal, near-black → anodized/rubber.
 */
import type { MaterialClass } from './types';

const NAME_RULES: [RegExp, MaterialClass][] = [
  [/tire|tyre|rubber|pad|sole|grip|bumper|track|belt|cable|wire|hose/, 'rubber'],
  [/glass|lens|visor|lidar|window/, 'glass'],
  [/screw|bolt|nut|shaft|axle|bearing|spring|pin\b|rod/, 'steel'],
  [/pcb|board|circuit|chip/, 'electronics'],
  [/copper|brass|coil|winding/, 'copper'],
];

export function inferMaterial(rgba: ArrayLike<number>, name = ''): MaterialClass {
  const [r, g, b, a = 1] = [rgba[0], rgba[1], rgba[2], rgba[3]];
  if (a < 0.95) return 'glass';
  const lower = name.toLowerCase();
  for (const [re, cls] of NAME_RULES) if (re.test(lower)) return cls === 'rubber' && r + g + b > 2.1 ? 'plastic' : cls;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const sat = max > 0 ? (max - min) / max : 0;
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  if (sat > 0.35 && max > 0.25) return 'paint';
  if (lum < 0.13) return /wheel|foot|toe/.test(lower) ? 'rubber' : 'anodized';
  if (lum > 0.62) return 'plastic';
  return 'aluminium';
}
