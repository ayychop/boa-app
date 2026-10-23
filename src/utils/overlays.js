import { useEffect } from 'react';

// How many full-screen layers (sheets, the screening room, the podcast
// player, Premium) are up. Zen Mode draws under native modals, so the idle
// screensaver waits until they have all closed.
let open = 0;

/** Counts this layer as open while `active`. */
export function useOverlay(active) {
  useEffect(() => {
    if (!active) return;
    open += 1;
    return () => {
      open -= 1;
    };
  }, [active]);
}

export const overlayOpen = () => open > 0;
