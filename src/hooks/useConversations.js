import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { listConversations } from '../api/hub';

/**
 * Your conversations, latest first, kept live as messages arrive (any
 * change to one of your threads reloads the list) and fresh each time the
 * screen comes back into view (read receipts change).
 * Returns { rows, state: 'loading' | 'ready' | 'error' | 'refreshing', error, reload }.
 */
export default function useConversations(userId) {
  const [rows, setRows] = useState([]);
  const [state, setState] = useState('loading');
  const [error, setError] = useState(null);
  const request = useRef(0);

  const load = useCallback(
    async (refreshing = false) => {
      if (!userId) return;
      const id = ++request.current;
      if (refreshing) setState('refreshing');
      try {
        const next = await listConversations(userId);
        if (id !== request.current) return;
        setRows(next);
        setState('ready');
      } catch (err) {
        if (id !== request.current) return;
        setError(err.message);
        setState('error');
      }
    },
    [userId],
  );

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useEffect(() => {
    if (!supabase || !userId) return;
    let timer = null;
    const reload = () => {
      clearTimeout(timer);
      timer = setTimeout(() => load(), 300);
    };
    const channel = supabase
      .channel(`hub:chats:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations', filter: `user_a=eq.${userId}` }, reload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations', filter: `user_b=eq.${userId}` }, reload)
      .subscribe();
    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [userId, load]);

  return { rows, state, error, reload: load };
}
