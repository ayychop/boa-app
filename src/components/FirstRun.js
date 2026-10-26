import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useHub } from '../context/HubContext';
import { hasSeenTour, markTourSeen } from '../api/onboarding';
import { LAST_SEEN_KEY, WHATS_NEW, shouldShowWhatsNew } from '../lib/whats-new';
import FeatureTour from './onboarding/FeatureTour';
import WhatsNewModal from './WhatsNewModal';

/**
 * What shows over the app once: the welcome tour after a member's first
 * sign-in, and "What's New" after an update. Never both at once; the tour
 * goes first. freshInstall: this launch began with the vibe check.
 */
export default function FirstRun({ freshInstall }) {
  const { stage, userId } = useHub();
  const [tour, setTour] = useState(false);
  const [whatsNew, setWhatsNew] = useState(false);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(LAST_SEEN_KEY)
      .catch(() => null)
      .then((seen) => {
        if (!alive) return;
        if (shouldShowWhatsNew(seen, WHATS_NEW.version, freshInstall)) setWhatsNew(true);
        // A fresh install starts on this version's notes, already read.
        else if (seen == null) AsyncStorage.setItem(LAST_SEEN_KEY, WHATS_NEW.version).catch(() => {});
      });
    return () => {
      alive = false;
    };
  }, [freshInstall]);

  useEffect(() => {
    if (stage !== 'ready' || !userId) return undefined;
    let alive = true;
    hasSeenTour(userId).then((seen) => alive && seen === false && setTour(true));
    return () => {
      alive = false;
    };
  }, [stage, userId]);

  const finishTour = useCallback(() => {
    setTour(false);
    markTourSeen(userId);
  }, [userId]);

  const closeWhatsNew = useCallback(() => {
    setWhatsNew(false);
    AsyncStorage.setItem(LAST_SEEN_KEY, WHATS_NEW.version).catch(() => {});
  }, []);

  return (
    <>
      <FeatureTour visible={tour} onDone={finishTour} />
      <WhatsNewModal visible={whatsNew && !tour} onClose={closeWhatsNew} />
    </>
  );
}
