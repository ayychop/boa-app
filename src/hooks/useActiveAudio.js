import { useEffect, useState } from 'react';
import * as ambient from '../audio/ambient';
import * as focus from '../audio/focus';
import { syncMiniKey } from '../audio/miniDismiss';
import { usePlayer } from '../context/PlayerContext';

/**
 * Which audio the app is on, for the mini player and Zen's controls: the
 * Zen soundscape if it was the last thing played (playing or paused) and
 * one is loaded, else the radio or podcast if one is loaded, else nothing.
 * Returns { kind: 'zen' | 'radio' | null, zen: the soundscape state }.
 */
export default function useActiveAudio() {
  const { current } = usePlayer();
  const [zen, setZen] = useState(ambient.getState);
  const [owner, setOwner] = useState(focus.activeOwner);
  useEffect(() => ambient.subscribe(setZen), []);
  useEffect(() => focus.subscribeActive(setOwner), []);
  const zenLoaded = !!zen.id && zen.status !== 'idle';
  const kind = owner === 'zen' && zenLoaded ? 'zen' : current ? 'radio' : zenLoaded ? 'zen' : null;
  // What the mini player would show, so a swiped-away bar knows when something new has started.
  const key = kind === 'zen' ? `zen:${zen.id}` : kind === 'radio' ? `radio:${current?.id ?? ''}` : null;
  useEffect(() => syncMiniKey(key), [key]);
  return { kind, zen };
}
