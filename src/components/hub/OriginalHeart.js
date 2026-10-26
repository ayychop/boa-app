import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { supabase } from '../../lib/supabase';
import { heart, myHearts, unheart } from '../../api/hearts';
import { HeartButton } from '../HeartBurst';

/**
 * Hearts a BOA Original into your favourites on the Hub. Draws nothing
 * when you aren't signed in to the Hub. (The screening room sits above
 * the Hub's context, so this asks Supabase who's signed in itself.)
 */
export default function OriginalHeart({ production, size = 26 }) {
  const [userId, setUserId] = useState(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!supabase?.auth) return undefined;
    let alive = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        const id = data?.session?.user?.id ?? null;
        if (!alive || !id) return;
        setUserId(id);
        return myHearts(id, 'original', [production.id]).then((set) => alive && setOn(set.has(production.id)));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [production.id]);
  if (!userId) return null;
  return (
    <HeartButton
      on={on}
      size={size}
      label={`Heart ${production.title}`}
      testID="original-heart"
      onPress={async () => {
        const next = !on;
        setOn(next);
        try {
          if (next) await heart(userId, 'original', production.id, { label: production.title });
          else await unheart(userId, 'original', production.id);
        } catch (err) {
          setOn(!next);
          Alert.alert("Couldn't save that", err.message);
        }
      }}
    />
  );
}
