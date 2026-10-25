import { useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import { useHub } from '../../context/HubContext';

/**
 * Opens a Creative Hub page, or the welcome flow first (setup notice,
 * sign-in, onboarding) when the listener isn't ready for it yet; the
 * welcome flow then carries on to the page they asked for.
 */
export function useOpenHub() {
  const navigation = useNavigation();
  const { stage } = useHub();
  return useCallback(
    (page = 'HubDirectory', params) => {
      if (stage === 'ready') navigation.navigate(page, params);
      else navigation.navigate('HubWelcome', { next: page, nextParams: params });
    },
    [navigation, stage],
  );
}

/** "Online", "Active 5 min ago", "Active yesterday". */
export function lastSeen(iso, online) {
  if (online) return 'Online';
  if (!iso) return '';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 2) return 'Active just now';
  if (mins < 60) return `Active ${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `Active ${hrs} hr ago`;
  const days = Math.round(hrs / 24);
  return days === 1 ? 'Active yesterday' : `Active ${days} days ago`;
}

// A status not re-stamped for this long is from a phone that stopped
// without saying so (the app re-stamps every 15 minutes while it plays).
export const STATUS_STALE_MS = 40 * 60 * 1000;

const STATUS_VERB = { listening: 'Listening to', watching: 'Watching', zen: 'In the Zen Zone:' };

/** The now-playing line ("Listening to Capital Xtra", "In the Zen Zone: Rain"), or null. */
export function statusLine(p, now = Date.now()) {
  if (!p?.status_kind || !p.status_text || !STATUS_VERB[p.status_kind]) return null;
  if (p.status_updated_at && now - new Date(p.status_updated_at).getTime() > STATUS_STALE_MS) return null;
  return `${STATUS_VERB[p.status_kind]} ${p.status_text}`;
}
