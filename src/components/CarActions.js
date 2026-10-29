import { useCallback, useEffect, useState } from 'react';
import { useUser } from '../context/UserContext';
import { usePremium } from '../context/PremiumContext';
import { useHub } from '../context/HubContext';
import { hypeStation, myRecentHype } from '../api/hype';
import * as car from '../audio/car';
import { likeStation } from '../audio/liked';

/**
 * The heart and the fire on the car's now playing screen. The heart is
 * your saved stations (which HubContext syncs to your favourites on the
 * Hub); saving is Premium, so the car only offers it to members. The fire
 * is Hype, once a station a day, for anyone signed in. Draws nothing.
 */
export default function CarActions() {
  const { isSaved, toggleSaved } = useUser();
  const { hasPremium } = usePremium();
  const { userId } = useHub();
  // isSaved is new with every change to your saved stations, so the car's
  // heart follows a save or unsave made on the phone too.
  // Hearting a station in the car makes it your last loved one too (Profile).
  const toggle = useCallback(
    (item) => {
      if (!isSaved(item.id)) likeStation(item, 'heart');
      return toggleSaved(item);
    },
    [isSaved, toggleSaved],
  );
  useEffect(() => (hasPremium ? car.attachFavourites({ isSaved, toggle }) : undefined), [hasPremium, isSaved, toggle]);

  // The stations you've fired today, so the car's fire shows as done.
  const [fired, setFired] = useState(() => new Set());
  useEffect(() => {
    let alive = true;
    setFired(new Set());
    if (userId) myRecentHype(userId).then((ids) => alive && setFired(ids));
    return () => {
      alive = false;
    };
  }, [userId]);
  const hyped = useCallback((id) => fired.has(id), [fired]);
  const fire = useCallback((item) => {
    setFired((s) => new Set(s).add(item.id));
    hypeStation(item.id);
    likeStation(item, 'fire', { hype: false });
  }, []);
  useEffect(() => (userId ? car.attachHype({ hyped, fire }) : undefined), [userId, hyped, fire]);
  return null;
}
