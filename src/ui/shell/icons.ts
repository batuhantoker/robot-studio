/** Line icons for the shell: 24×24, stroked in currentColor. */
import type { Mode } from '../../app/state/types';

const svg = (body: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const MODE_ICON: Record<Mode, string> = {
  pose: svg('<path d="M5 20h8M7 20v-3h4v3"/><path d="M9 17l3-7 6 2"/><circle cx="12" cy="10" r="1.3"/><circle cx="18" cy="12" r="1.3"/>'),
  motion: svg('<path d="M4 15c3-7 6 3 9-3s5-4 7-2"/><path d="M4 19h16" opacity=".45"/>'),
  pilot: svg('<circle cx="12" cy="12" r="8"/><path d="M12 4v4M12 16v4M4 12h4M16 12h4"/><circle cx="12" cy="12" r="1.5"/>'),
  task: svg('<path d="M4 20h16"/><rect x="5" y="14" width="5" height="6"/><path d="M15 20v-6M15 8V4M12.5 8h5l-1 3h-3z"/>'),
  ik: svg('<circle cx="17.5" cy="6.5" r="2.5"/><path d="M17.5 2v2M17.5 9v2M13 6.5h2M20 6.5h2"/><path d="M4 20h7M6 20v-3h3v3M7.5 17l3-5 4.5-3"/>'),
  trajectory: svg('<circle cx="5" cy="18" r="2"/><circle cx="19" cy="6" r="2"/><path d="M7 17c5-1 3-8 10-10" stroke-dasharray="2 2.6"/><circle cx="11.5" cy="12" r="1.3"/>'),
  physics: svg('<path d="M12 3v3M12 18v3M3 12h3M18 12h3"/><circle cx="12" cy="12" r="5.5"/><path d="M12 12l3-2"/>'),
  workspace: svg('<path d="M3 19a9 9 0 0 1 18 0"/><path d="M7 19a5 5 0 0 1 10 0" opacity=".55"/><path d="M12 19V9"/><circle cx="12" cy="9" r="1.3"/>'),
};

export const ICON = {
  robots: svg('<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>'),
  build: svg('<path d="M14.5 6.5a3.5 3.5 0 0 0-4.6 4.4L4 16.8V20h3.2l5.9-5.9a3.5 3.5 0 0 0 4.4-4.6l-2.2 2.2-2.4-.6-.6-2.4z"/>'),
  live: svg('<path d="M3 12h4l2.5-6 5 12 2.5-6h4"/>'),
  math: svg('<path d="M5 5h6M8 2v6M14 5h5M5 16l5 5M10 16l-5 5M14 16h5M14 20h5"/>'),
  analysis: svg('<path d="M4 20V4M4 20h16"/><path d="M7 16l4-5 3 3 5-7"/>'),
  view: svg('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>'),
  help: svg('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.6 2.6 0 0 1 5 1c0 1.8-2.5 2.2-2.5 3.8"/><circle cx="12" cy="17.3" r=".6" fill="currentColor"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  chevron: svg('<path d="M7 10l5 5 5-5"/>'),
  left: svg('<path d="M15 6l-6 6 6 6"/>'),
  right: svg('<path d="M9 6l6 6-6 6"/>'),
  play: svg('<path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/>'),
  tour: svg('<circle cx="12" cy="12" r="9"/><path d="M10 8.5v7l5.5-3.5z" fill="currentColor"/>'),
  panel: svg('<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M14.5 4.5v15"/>'),
};

/** An element holding one of the icons above. */
export function icon(markup: string, cls = 'ico'): HTMLElement {
  const el = document.createElement('i');
  el.className = cls;
  el.innerHTML = markup;
  return el;
}
