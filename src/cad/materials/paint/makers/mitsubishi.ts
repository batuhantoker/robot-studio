/** Mitsubishi Electric. Casting colours are from each robot's own manual; rear blocks and motors read from its catalogue photo. */
import type { Coat, PaintRule, PaintScheme } from '../table';

// "Light gray (Equivalent to Munsell: 0.6B7.6/0.2, PANTONE: 428C)", via the renotation table.
const LIGHT_GRAY: Coat = { color: '#bbbebe', finish: 'paint' };
// "Off-white (Equivalent to Munsell: 10GY9/1)".
const OFF_WHITE: Coat = { color: '#dbe6d9', finish: 'paint' };
const STEEL: Coat = { color: '#a7abae', finish: 'steel' };
const SLATE: Coat = { color: '#50595f', finish: 'anodized' };
const BLACK: Coat = { color: '#3a3b3e', finish: 'anodized' };
const BRASS: Coat = { color: '#c0a47c', finish: 'anodized' };

const FLANGE: PaintRule = { name: /hand_flange$/, coat: STEEL };
const SHAFT: PaintRule = { name: /shaft$/, coat: STEEL };

// The RV-4FR and RV-4FRL share a base. Its rear block is fused to it, but ends at a clean plane in the mesh.
const RV4: PaintScheme = {
  body: LIGHT_GRAY,
  parts: [FLANGE, { at: 'base', within: { box: [[-0.3, -0.2, -0.01], [-0.1, 0.2, 0.2]] }, coat: SLATE }],
};

export const MITSUBISHI: Record<string, PaintScheme> = {
  // The arched conduit is not in the model: only its two black ports are.
  'armor-mitsubishi-rh6crh6020': {
    body: LIGHT_GRAY,
    parts: [
      SHAFT,
      { name: /_shaft$/, within: { surfaces: [[-0.02, -0.02, 0.028], [0.02, 0.02, 0.043]] }, coat: BRASS },
      { name: /_shaft$/, within: { surfaces: [[-0.02, -0.02, 0.397], [0.02, 0.02, 0.412]] }, coat: BRASS },
      { name: /_no2arm$/, within: { surfaces: [[-0.03, -0.03, 0.395], [0.03, 0.03, 0.475]] }, coat: BLACK },
      { at: 'base', within: { surfaces: [[-0.135, -0.025, 0.165], [-0.085, 0.025, 0.215]] }, coat: BLACK },
      { at: 'base', within: { surfaces: [[-0.075, -0.075, 0.168], [0.075, 0.075, 0.18]] }, coat: STEEL },
    ],
  },
  'armor-mitsubishi-rh6frh5520': {
    body: LIGHT_GRAY,
    parts: [
      SHAFT,
      { name: /_shaft$/, within: { surfaces: [[-0.021, -0.021, 0.055], [0.021, 0.021, 0.087]] }, coat: BRASS },
      { name: /_no2arm$/, within: { surfaces: [[0.07, -0.07, 0.41], [0.29, 0.07, 0.43]] }, coat: BLACK },
      { at: 'base', within: { surfaces: [[-0.095, -0.095, 0.32], [0.095, 0.095, 0.345]] }, coat: STEEL },
    ],
  },
  'armor-mitsubishi-rv13frl': {
    body: LIGHT_GRAY,
    parts: [FLANGE, { at: 'base', within: { surfaces: [[-0.31, -0.2, -0.01], [-0.15, 0.2, 0.21]] }, coat: SLATE }],
  },
  'armor-mitsubishi-rv2fr': {
    body: LIGHT_GRAY,
    parts: [FLANGE, { at: 'base', within: { surfaces: [[-0.16, -0.07, 0.06], [-0.085, 0.07, 0.14]] }, coat: SLATE }],
  },
  'armor-mitsubishi-rv4fr': RV4,
  'armor-mitsubishi-rv4frl': RV4,
  // The status ring shows one of six colours; lime is the one on the maker's cover.
  'armor-mitsubishi-rv5as': {
    body: LIGHT_GRAY,
    parts: [FLANGE, { name: /_forearm$/, within: { surfaces: [[-0.07, -0.085, 0.227], [0.075, 0.085, 0.243]] }, coat: { color: '#8dfd06', finish: 'plastic' } }],
  },
  'armor-mitsubishi-rv7frl': {
    body: LIGHT_GRAY,
    parts: [FLANGE, { at: 'base', within: { box: [[-0.3, -0.2, -0.01], [-0.124, 0.2, 0.23]] }, coat: SLATE }],
  },
  'armor-mitsubishi-rv80fr': {
    body: OFF_WHITE,
    parts: [
      FLANGE,
      { name: /_shoulder$/, within: { surfaces: [[0.03, 0.02, 0.55], [0.3, 0.27, 0.83]] }, coat: BLACK },
      { name: /_shoulder$/, within: { surfaces: [[-0.21, -0.005, 0.416], [0.02, 0.225, 0.665]] }, coat: BLACK },
    ],
  },
  'armor-mitsubishi-rv8crl': { body: LIGHT_GRAY, parts: [FLANGE] },
};
