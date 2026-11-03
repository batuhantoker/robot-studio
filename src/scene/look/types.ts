/** How surfaces are shown: realistic studio, matte clay, technical drawing, or material classes. */
export type Look = 'studio' | 'clay' | 'technical' | 'materials';

export const LOOKS: [Look, string][] = [['studio', 'Studio'], ['clay', 'Clay'], ['technical', 'Technical'], ['materials', 'Materials']];

/** Ink outline strength per look. */
export const INK_OPACITY: Record<Look, number> = { studio: 0.2, clay: 0.1, technical: 0.75, materials: 0.3 };
