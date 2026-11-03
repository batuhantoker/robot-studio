/** Display units: millimetres, degrees, newton-metres; SI stays in the data. */
export const DEG = 180 / Math.PI;

export const num = (v: number, digits = 2) => (Number.isFinite(v) ? v.toFixed(digits) : '∞');
export const mm = (m: number, digits = 1) => num(m * 1000, digits);
export const deg = (rad: number, digits = 1) => num(rad * DEG, digits);
export const sci = (v: number) => (v === 0 ? '0' : Math.abs(v) < 1e-3 || Math.abs(v) >= 1e4 ? v.toExponential(1) : v.toFixed(3));

/** Value in display units for a DOF: degrees for hinges, millimetres for slides. */
export const dofValue = (type: 'hinge' | 'slide', v: number) => (type === 'hinge' ? deg(v) : mm(v));
export const dofUnit = (type: 'hinge' | 'slide') => (type === 'hinge' ? '°' : 'mm');
export const dofScale = (type: 'hinge' | 'slide') => (type === 'hinge' ? DEG : 1000);
