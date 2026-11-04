/** Open a panel tab from anywhere: a side panel on desktop, a bottom sheet on phones. */
export type PanelTab = 'robots' | 'build' | 'live' | 'math' | 'analysis';

const EVENT = 'studio:reveal';

export const reveal = (tab: PanelTab): void => void dispatchEvent(new CustomEvent<PanelTab>(EVENT, { detail: tab }));

export function onReveal(fn: (tab: PanelTab) => void): void {
  addEventListener(EVENT, (e) => fn((e as CustomEvent<PanelTab>).detail));
}

export const sideOf = (tab: PanelTab): 'left' | 'right' => (tab === 'robots' || tab === 'build' ? 'left' : 'right');
