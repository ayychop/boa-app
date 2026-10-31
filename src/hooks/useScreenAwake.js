import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { addScreenListener, isScreenOn } from '../../modules/boa-screen';
import { safely } from '../utils/safely';

const isActive = (state) => state === 'active';

/**
 * Whether anyone could be looking at the app right now: it is the app in
 * front (AppState 'active') and the screen is lit. The two arrive separately
 * and in either order when the power button is pressed, so both must hold.
 *
 * Video decoders and surfaces are only ever alive while this is true: a
 * decoder started for a screen that is off (or an app that is no longer in
 * front) is exactly what crashed Zen when the screensaver opened.
 */
export default function useScreenAwake() {
  const [awake, setAwake] = useState(() => isActive(AppState.currentState) && isScreenOn());

  useEffect(() => {
    let appOn = isActive(AppState.currentState);
    let screenOn = isScreenOn();
    let alive = true;
    const update = () => {
      if (alive) setAwake(appOn && screenOn);
    };
    const appSub = safely('AppState listener', () =>
      AppState.addEventListener('change', (next) => {
        appOn = isActive(next);
        update();
      }),
    );
    const offScreen = safely('screen listener', () =>
      addScreenListener((state) => {
        if (state === 'off') screenOn = false;
        else if (state === 'on' || state === 'unlocked') screenOn = true;
        else return;
        update();
      }),
    );
    update();
    return () => {
      alive = false;
      safely('AppState remove', () => appSub?.remove());
      safely('screen listener remove', () => offScreen?.());
    };
  }, []);

  return awake;
}
