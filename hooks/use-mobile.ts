import * as React from 'react';

const MOBILE_BREAKPOINT = 768;

export function useIsMobile() {
  return React.useSyncExternalStore(
    (notify) => {
      const media = window.matchMedia(
        `(max-width: ${MOBILE_BREAKPOINT - 1}px)`,
      );
      media.addEventListener('change', notify);
      return () => media.removeEventListener('change', notify);
    },
    () => window.innerWidth < MOBILE_BREAKPOINT,
    () => false,
  );
}
