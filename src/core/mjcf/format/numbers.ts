/** Python float formatting, so generated MJCF matches `SerialArm.to_mjcf()` byte for byte. */

function splitExponential(text: string): { mantissa: string; exponent: number } {
  const [m, e] = text.split('e');
  return { mantissa: m, exponent: Number(e) };
}

const stripZeros = (s: string) => (s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s);
const exponentText = (e: number) => `e${e < 0 ? '-' : '+'}${String(Math.abs(e)).padStart(2, '0')}`;

/** C's `%.17g`, which Python's `format(x, ".17g")` uses. */
export function formatG17(value: number): string {
  if (value === 0) return Object.is(value, -0) ? '-0' : '0';
  const { mantissa, exponent } = splitExponential(value.toExponential(16));
  if (exponent < -4 || exponent >= 17) return stripZeros(mantissa) + exponentText(exponent);
  return stripZeros(value.toFixed(16 - exponent));
}

/** Python's `str(float)`: shortest round-trip digits, exponent outside [1e-4, 1e16). */
export function pythonFloat(value: number): string {
  if (!Number.isFinite(value)) return value > 0 ? 'inf' : value < 0 ? '-inf' : 'nan';
  if (value === 0) return Object.is(value, -0) ? '-0.0' : '0.0';
  const { mantissa, exponent } = splitExponential(value.toExponential());
  const negative = mantissa.startsWith('-');
  const digits = mantissa.replace('-', '').replace('.', '');
  const sign = negative ? '-' : '';
  if (exponent < -4 || exponent >= 16) {
    const body = digits.length > 1 ? `${digits[0]}.${digits.slice(1)}` : digits;
    return sign + body + exponentText(exponent);
  }
  if (exponent < 0) return `${sign}0.${'0'.repeat(-exponent - 1)}${digits}`;
  const whole = digits.slice(0, exponent + 1).padEnd(exponent + 1, '0');
  const frac = digits.slice(exponent + 1);
  return `${sign}${whole}.${frac || '0'}`;
}

export const g17List = (values: ArrayLike<number>) => Array.from(values, formatG17).join(' ');
