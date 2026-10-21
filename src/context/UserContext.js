import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { haptics } from '../utils/haptics';

// Everything we remember about this listener on-device: whether they've done
// the vibe check (and what they picked), BOA Premium, and saved stations.
// TODO: move to a real account + payment backend; Premium is a local flag.
const KEY = 'boa:user:v1';
const EMPTY = { onboarded: false, vibes: [], isPremium: false, saved: [] };

const UserContext = createContext(null);

// Only what's needed to play a saved station again later.
const savedShape = (s) => ({
  kind: 'radio',
  id: s.id,
  name: s.name,
  streamUrl: s.streamUrl,
  logo: s.logo ?? null,
  country: s.country ?? null,
  bitrate: s.bitrate ?? null,
  tags: s.tags ?? [],
});

export function UserProvider({ children }) {
  const [user, setUser] = useState(EMPTY);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => raw && setUser({ ...EMPTY, ...JSON.parse(raw) }))
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  // Write-through on every change once the stored copy has been read.
  useEffect(() => {
    if (ready) AsyncStorage.setItem(KEY, JSON.stringify(user)).catch(() => {});
  }, [user, ready]);

  const completeOnboarding = useCallback((vibes) => setUser((u) => ({ ...u, onboarded: true, vibes })), []);

  const subscribe = useCallback(() => {
    haptics.success();
    setUser((u) => ({ ...u, isPremium: true }));
  }, []);

  const cancelPremium = useCallback(() => setUser((u) => ({ ...u, isPremium: false })), []);

  const toggleSaved = useCallback((station) => {
    setUser((u) => {
      const has = u.saved.some((s) => s.id === station.id);
      return { ...u, saved: has ? u.saved.filter((s) => s.id !== station.id) : [savedShape(station), ...u.saved] };
    });
  }, []);

  const value = useMemo(
    () => ({
      ready,
      ...user,
      completeOnboarding,
      subscribe,
      cancelPremium,
      toggleSaved,
      isSaved: (id) => user.saved.some((s) => s.id === id),
    }),
    [ready, user, completeOnboarding, subscribe, cancelPremium, toggleSaved],
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error('useUser must be used inside <UserProvider>');
  return ctx;
}

// Onboarding vibes -> the Radio genre to open on.
export function genreForVibes(vibes) {
  if (vibes?.includes('afrobeats')) return 'afrobeats';
  if (vibes?.includes('rnb-hiphop')) return 'rnb';
  return null;
}
