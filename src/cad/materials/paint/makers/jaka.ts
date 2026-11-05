/** JAKA Robotics. It publishes no paint codes: colours are read from its own images. */
import type { Coat, PaintRule, PaintScheme } from '../table';

const WHITE: Coat = { color: '#ededed', finish: 'plastic' };
const ALLOY: Coat = { color: '#c4c6c8', finish: 'aluminium' };
const STEEL: Coat = { color: '#b9bcbd', finish: 'steel' };
// Paint, not metal: a metal finish mirrors the dark floor and the bright tube reads black.
const TUBE: Coat = { color: '#cdcfd1', finish: 'paint' };
// The large white discs on the joint ends, each with a red logo that is not applied.
const CAP: Coat = { color: '#e6e7e8', finish: 'plastic' };

type Box = [[number, number, number], [number, number, number]];
type Cap = [string, Box[0], Box[1]];
const redArm = (color: string, upper: RegExp, a: Box, fore: RegExp, b: Box, caps: Cap[], cuts: Box[] = []): PaintScheme => {
  const parts: PaintRule[] = [
    { at: 'base', coat: ALLOY },
    { at: 'tip', coat: STEEL },
    { name: upper, within: { surfaces: a }, coat: TUBE },
    { name: fore, within: { surfaces: b }, coat: TUBE },
    ...caps.map(([link, min, max]): PaintRule => ({ name: new RegExp(`^${link}$`), within: { surfaces: [min, max] }, coat: CAP })),
    ...cuts.map((box): PaintRule => ({ name: upper, within: { box }, coat: CAP })),
  ];
  return { body: { color, finish: 'paint' }, parts };
};

export const JAKA: Record<string, PaintScheme> = {
  'armor-jaka-zu': redArm('#a3505a', /^Link2$/, [[0.07, -0.065, -0.21], [0.36, 0.065, -0.08]], /^Link3$/, [[-0.065, -0.065, -0.07], [0.32, 0.065, 0.045]], [['Link1', [-0.064, -0.065, 0.04], [0.064, 0.063, 0.08]], ['Link2', [-0.065, -0.064, -0.225], [0.063, 0.064, -0.184]], ['Link2', [0.367, -0.064, -0.225], [0.495, 0.064, -0.184]], ['Link3', [0.325, -0.044, 0.026], [0.413, 0.044, 0.06]], ['Link4', [-0.044, 0.027, -0.044], [0.044, 0.06, 0.044]]]),
  'armor-jaka-s': redArm('#a95255', /^Link_02$/, [[0.07, -0.065, -0.21], [0.36, 0.065, -0.08]], /^Link_03$/, [[-0.065, -0.065, -0.07], [0.32, 0.065, 0.045]], [['Link_01', [-0.064, -0.065, 0.04], [0.064, 0.063, 0.08]], ['Link_02', [-0.065, -0.064, -0.225], [0.063, 0.064, -0.184]], ['Link_02', [0.367, -0.064, -0.225], [0.495, 0.064, -0.184]], ['Link_03', [0.325, -0.044, 0.026], [0.413, 0.044, 0.059]], ['Link_04', [-0.044, 0.027, -0.044], [0.044, 0.06, 0.044]], ['Link_06', [-0.044, -0.043, -0.053], [0.043, 0.044, -0.011]]]),
  'armor-jaka-a': redArm('#982d34', /^J2$/, [[0.08, -0.06, -0.2], [0.35, 0.06, -0.085]], /^J3$/, [[0.075, -0.045, -0.05], [0.31, 0.045, 0.045]], [['J1', [-0.064, -0.065, 0.04], [0.064, 0.063, 0.08]], ['J2', [0.367, -0.064, -0.225], [0.495, 0.064, -0.184]], ['J2', [-0.065, -0.064, -0.225], [0.063, 0.064, -0.184]], ['J3', [0.325, -0.044, 0.025], [0.413, 0.044, 0.058]], ['J4', [-0.044, 0.027, -0.044], [0.044, 0.06, 0.044]]]),
  // Estimate: from siblings Pro 5 and Pro 16, not a Pro 7. Its end dishes are fused to the housing, so a straight cut.
  'armor-jaka-pro': redArm('#a3505a', /^Link_2$/, [[0.07, -0.065, -0.21], [0.29, 0.065, -0.08]], /^Link_3$/, [[-0.065, -0.065, -0.07], [0.255, 0.065, 0.045]], [], [[[-0.07, -0.07, -0.226], [0.07, 0.07, -0.187]], [[0.29, -0.07, -0.226], [0.43, 0.07, -0.187]]]),
  // Estimate: from RoboDK's image, not JAKA's.
  'armor-jaka-c': { body: WHITE, parts: [{ at: 'base', coat: { color: '#b0b3b6', finish: 'paint' } }] },
  'armor-jaka-k1': { body: { color: '#868686', finish: 'anodized' }, parts: [{ name: /_tool$/, coat: STEEL }] },
  'armor-jaka-lumi': { body: WHITE, parts: [{ name: /^wheel_/, coat: { color: '#4a4a49', finish: 'rubber' } }, { name: /^link_at$/, coat: STEEL }] },
  // Lifted above the photo's #ddd6c3 so the render reaches it.
  'armor-jaka-pi': { body: { color: '#efe9db', finish: 'plastic' } },
};
