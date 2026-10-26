import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { dayOneHolders } from '../api/dayOne';

/**
 * The ids (of these people) who hold a Day One badge. Starts empty and
 * fills in once the database answers; stays empty if it can't.
 */
export default function useDayOne(ids) {
  const key = [...new Set(ids.filter(Boolean))].sort().join(',');
  const [holders, setHolders] = useState(() => new Set());
  useEffect(() => {
    if (!supabase || !key) return undefined;
    let alive = true;
    dayOneHolders(key.split(','))
      .then((set) => alive && setHolders(set))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [key]);
  return holders;
}
