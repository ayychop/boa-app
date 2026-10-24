import 'react-native-url-polyfill/auto';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// The BOA HUB Supabase project: the Creative Hub's database (profiles,
// messages, reports), its auth (email and password), avatar storage and
// presence. Its address and public anon key come from the environment,
// never from the source:
//
//   .env.local (not committed; copy .env.example)
//   EXPO_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
//   EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key>
//
// The anon key is meant to ship in the app; row level security
// (supabase/migrations) is what keeps each listener's data private. Never
// put the service_role key here.
//
// Until both are set, `supabase` is null and the Hub shows a setup notice
// instead of failing; the rest of the app is unaffected.
const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();

const PLACEHOLDER = /your-project|<|>|^$/i;
export const isConfigured = !!url && !!anonKey && !PLACEHOLDER.test(url) && !PLACEHOLDER.test(anonKey);

export const supabase = isConfigured
  ? createClient(url, anonKey, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        // OAuth comes back through the app's network.boa:// link (see api/hub.js).
        detectSessionInUrl: Platform.OS === 'web',
        flowType: 'pkce',
      },
      realtime: { params: { eventsPerSecond: 10 } },
    })
  : null;

/** The project's host, for the setup notice and logs (never the key). */
export const projectHost = (() => {
  try {
    return isConfigured ? new URL(url).host : null;
  } catch {
    return null;
  }
})();
