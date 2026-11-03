/** LaTeX builders for live numbers. */
import katex from 'katex';

export const n = (v: number, digits = 3) => {
  if (!Number.isFinite(v)) return '\\infty';
  const s = Math.abs(v) < 0.5 * 10 ** -digits ? (0).toFixed(digits) : v.toFixed(digits);
  return s.replace('-', '{-}');
};

export const matrix = (rows: number[][], digits = 3) =>
  `\\begin{bmatrix}${rows.map((r) => r.map((v) => n(v, digits)).join(' & ')).join(' \\\\ ')}\\end{bmatrix}`;

export const column = (v: ArrayLike<number>, digits = 3) => matrix(Array.from(v, (x) => [x]), digits);

export const mat3 = (R: ArrayLike<number>, digits = 3) =>
  matrix([[R[0], R[1], R[2]], [R[3], R[4], R[5]], [R[6], R[7], R[8]]], digits);

export const homogeneous = (R: ArrayLike<number>, p: ArrayLike<number>, digits = 3) =>
  matrix([[R[0], R[1], R[2], p[0]], [R[3], R[4], R[5], p[1]], [R[6], R[7], R[8], p[2]], [0, 0, 0, 1]], digits);

export function tex(source: string, display = true): HTMLElement {
  const el = document.createElement(display ? 'div' : 'span');
  el.innerHTML = katex.renderToString(source, { displayMode: display, throwOnError: false, strict: false });
  return el;
}

/** Escape identifiers for \text{}. */
export const label = (s: string) => `\\text{${s.replace(/_/g, '\\_')}}`;
