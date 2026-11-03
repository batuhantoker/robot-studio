/** Backdrops, floors and settings: one definition drives the viewport, its light rig, and rendered video. */
import { ENVIRONMENTS, type EnvironmentId } from './environment';

export type BackdropId = 'studio' | 'white' | 'dusk' | 'dark' | 'blueprint';
export type FloorId = 'grid' | 'seamless' | 'polished' | 'tiles' | 'none';

export interface Surroundings {
  backdrop: BackdropId;
  floor: FloorId;
  environment: EnvironmentId;
}

export interface Backdrop {
  label: string;
  /** Vertical gradient behind the scene. */
  top: string;
  bottom: string;
  /** Floor tone under the robot; it fades out into the backdrop. */
  floor: string;
  grid: string;
  /** Darkness of cast shadows on the floor, 0..1. */
  shadow: number;
  sky: string;
  ground: string;
  hemi: number;
  key: string;
  keyIntensity: number;
  rim: string;
  rimIntensity: number;
  /** Strength of the room reflections on metal and paint. */
  env: number;
  /** Light text and lines read on it. */
  dark: boolean;
}

export const BACKDROPS: Record<BackdropId, Backdrop> = {
  studio: {
    label: 'Studio', top: '#f3f4f6', bottom: '#e3e6ea', floor: '#e4e6ea', grid: '#c4c8cd', shadow: 0.24,
    sky: '#ffffff', ground: '#c9ccd2', hemi: 1.1, key: '#ffffff', keyIntensity: 2.2, rim: '#dfe7ff', rimIntensity: 0.6, env: 0.6, dark: false,
  },
  white: {
    label: 'Cyclorama', top: '#ffffff', bottom: '#f1f2f4', floor: '#f6f7f8', grid: '#dfe2e6', shadow: 0.2,
    sky: '#ffffff', ground: '#e6e8eb', hemi: 1.25, key: '#ffffff', keyIntensity: 2.0, rim: '#ffffff', rimIntensity: 0.5, env: 0.7, dark: false,
  },
  dusk: {
    label: 'Dusk', top: '#aebfd4', bottom: '#f0d9c4', floor: '#e8d5c3', grid: '#cfb7a1', shadow: 0.3,
    sky: '#dfe8f5', ground: '#d6bea6', hemi: 1.0, key: '#ffe1bf', keyIntensity: 2.4, rim: '#b8ceff', rimIntensity: 0.9, env: 0.6, dark: false,
  },
  dark: {
    label: 'Dark', top: '#30343b', bottom: '#111317', floor: '#1d2025', grid: '#363c45', shadow: 0.6,
    sky: '#cdd6e8', ground: '#1f2227', hemi: 0.55, key: '#ffffff', keyIntensity: 2.7, rim: '#9fbaff', rimIntensity: 1.5, env: 0.45, dark: true,
  },
  blueprint: {
    label: 'Blueprint', top: '#21508a', bottom: '#0e2746', floor: '#173a64', grid: '#4475ad', shadow: 0.45,
    sky: '#dce8ff', ground: '#15304f', hemi: 0.8, key: '#ffffff', keyIntensity: 2.3, rim: '#a2c6ff', rimIntensity: 1.1, env: 0.5, dark: true,
  },
};

export const FLOORS: [FloorId, string][] = [['grid', 'Grid'], ['seamless', 'Seamless'], ['polished', 'Polished'], ['tiles', 'Tiles'], ['none', 'None']];

export const DEFAULT_SURROUNDINGS: Surroundings = { backdrop: 'studio', floor: 'grid', environment: 'open' };

/** The backdrop as a CSS gradient, as the scene draws it (shown until the first frame, and in swatches). */
export const backdropCss = (b: Backdrop): string => `linear-gradient(180deg, ${b.top} 0%, ${b.bottom} 100%)`;

const KEY = 'robot-studio:surroundings';

export function loadSurroundings(): Surroundings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Surroundings> | null;
    const backdrop = raw?.backdrop && raw.backdrop in BACKDROPS ? raw.backdrop : DEFAULT_SURROUNDINGS.backdrop;
    const floor = FLOORS.some(([f]) => f === raw?.floor) ? raw!.floor! : DEFAULT_SURROUNDINGS.floor;
    const environment = ENVIRONMENTS.some(([e]) => e === raw?.environment) ? raw!.environment! : DEFAULT_SURROUNDINGS.environment;
    return { backdrop, floor, environment };
  } catch {
    return { ...DEFAULT_SURROUNDINGS };
  }
}

export function saveSurroundings(s: Surroundings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Private mode or full storage: the choice just doesn't persist.
  }
}
