import { useSyncExternalStore } from 'react';

/** Below Tailwind's `lg` breakpoint the room switches to the single-panel layout. */
const MOBILE_QUERY = '(max-width: 1023px)';

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(MOBILE_QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(MOBILE_QUERY).matches);
}
