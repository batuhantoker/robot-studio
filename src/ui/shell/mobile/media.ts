/** The phone layout (portrait or landscape): one breakpoint shared by CSS and code (`html.mobile`). */
export const MOBILE_QUERY = '(max-width: 760px), (max-height: 500px)';

const query = matchMedia(MOBILE_QUERY);

export const isMobile = (): boolean => query.matches;

export function onMobileChange(fn: (mobile: boolean) => void): void {
  query.addEventListener('change', () => fn(query.matches));
}

document.documentElement.classList.toggle('mobile', query.matches);
onMobileChange((m) => document.documentElement.classList.toggle('mobile', m));
