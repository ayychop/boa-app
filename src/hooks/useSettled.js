import { useEffect, useState } from 'react';

/**
 * `value` once it has held for `ms`; a `false` is passed on at once. For
 * things that are costly to build and tear down (a video decoder): a
 * quick on-off-on, such as a thumb tapping the radio's play and pause, never
 * gets as far as building one.
 */
export default function useSettled(value, ms) {
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (!value) {
      setSettled(false);
      return undefined;
    }
    const id = setTimeout(() => setSettled(true), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return value && settled;
}
