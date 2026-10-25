import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { ownChannel } from '../lib/realtime';

/**
 * Calls onUpdate(profile) whenever one of these people's profiles changes
 * (their now-playing status, mostly), live over Supabase Realtime. RLS
 * still applies: only profiles you can see come through.
 */
export default function useProfileUpdates(ids, onUpdate) {
  const handler = useRef(onUpdate);
  handler.current = onUpdate;
  const key = [...new Set(ids.filter(Boolean))].sort().join(',');
  useEffect(() => {
    if (!supabase || !key) return undefined;
    const list = key.split(',');
    // Realtime filters take up to 100 values.
    const filter = list.length === 1 ? `id=eq.${list[0]}` : `id=in.(${list.slice(0, 100).join(',')})`;
    const channel = ownChannel(`hub:profiles:${list.length}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter }, ({ new: p }) => p?.id && handler.current(p))
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [key]);
}
