/** Equations of motion and the tracking law the physics mode runs in MuJoCo. */
import { h } from '../../dom/h';
import { tex } from '../tex/format';
import type { MathSection } from './types';

export const dynamicsSection: MathSection = {
  id: 'dynamics',
  title: 'Dynamics & control',
  render() {
    return [
      tex(String.raw`M(q)\,\ddot q + c(q,\dot q) + g(q) + D\dot q = \tau`),
      tex(String.raw`\tau = \operatorname{clip}_{\pm\tau_{\max}}\!\Big(K_p(q^\star - q) + K_d(\dot q^\star - \dot q) + \underbrace{c + g}_{\texttt{qfrc\_bias}}\Big)`),
      h('p.note', {}, 'Physics mode steps MuJoCo (WASM, implicitfast) with this PD + bias-compensation law, exactly as serial-arm-analyze --simulate does: requested vs applied torque, tracking error and saturation are live. Contacts are disabled; inertias are primitive approximations.'),
    ];
  },
};
