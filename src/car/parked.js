import { useCallback, useEffect, useState } from 'react';
import { Alert, PermissionsAndroid } from 'react-native';
import * as CarVideo from '../../modules/boa-car-video';

// Video on the car's screen is parked only. useParked() says whether this
// is a car and whether it's parked, live; on a phone it's always "parked".
// playInCar() opens a BOA Original the car's way: a video file in the
// native parked-only player, a YouTube video in the car's YouTube app.
// Anything it can't open falls back to the screening room, which holds its
// picture to the same rule (src/components/media/ScreeningRoom.js).

// Speed and GPS: two more ways to see the car move. Asked once, at the
// first video; without them the car's driving restrictions, parking brake
// and gear still decide.
const CAR_SPEED = 'android.car.permission.CAR_SPEED';
const FINE_LOCATION = PermissionsAndroid.PERMISSIONS?.ACCESS_FINE_LOCATION ?? 'android.permission.ACCESS_FINE_LOCATION';

/** Asks for speed and GPS if not decided. Resolves to whether either was newly granted. */
export async function askCarPermissions() {
  try {
    const want = [];
    for (const p of [CAR_SPEED, FINE_LOCATION]) if (!(await PermissionsAndroid.check(p))) want.push(p);
    if (!want.length) return false;
    const got = await PermissionsAndroid.requestMultiple(want);
    return want.some((p) => got[p] === PermissionsAndroid.RESULTS.GRANTED);
  } catch {
    return false;
  }
}

const PHONE = { car: false, parked: true, reason: null };

/** { car, parked, reason, askPermissions }. Watches the car while mounted. */
export function useParked() {
  const car = CarVideo.isAutomotive();
  const [state, setState] = useState(() => (car ? CarVideo.getParked() : PHONE));
  // Bumped after new permissions, to start watching again with them.
  const [watch, setWatch] = useState(0);
  useEffect(() => {
    if (!car) return undefined;
    return CarVideo.addParkedListener((s) => setState({ parked: !!s?.parked, reason: s?.reason ?? null }));
  }, [car, watch]);
  const askPermissions = useCallback(async () => {
    if (await askCarPermissions()) setWatch((w) => w + 1);
  }, []);
  return car ? { car, ...state, askPermissions } : { ...PHONE, askPermissions };
}

export const PARKED_ONLY = 'BOA Originals play on the car screen only when the car is parked.';

/**
 * Opens a screening ({ production, kind, episode }) the car's way. Resolves
 * true if it's handled (playing natively, in YouTube, or refused because
 * the car isn't parked); false to use the screening room instead.
 */
export async function playInCar({ production, kind, episode }, parked) {
  if (!parked) {
    Alert.alert('Parked only', PARKED_ONLY);
    return true;
  }
  const title = kind === 'trailer' ? `${production.title}: trailer` : `${production.title}: ${episode?.title ?? ''}`;
  const url = kind === 'episode' ? episode?.videoUrl : null;
  if (url) return CarVideo.playVideo(url, title);
  const youTubeId = kind === 'trailer' ? production.trailerYouTubeId : episode?.youTubeId;
  if (youTubeId && (await CarVideo.openYouTube(youTubeId))) return true;
  return false;
}
