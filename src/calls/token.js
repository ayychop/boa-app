import { supabase } from '../lib/supabase';

// A call's Agora pass, from the agora-token Edge Function
// (supabase/functions/agora-token). The function checks who's asking, then
// signs a token for this channel and this person only, so the App
// Certificate never leaves the server. Returns { appId, token, uid }.
export async function fetchToken(channel) {
  if (!supabase) throw new Error('The Hub is not connected yet.');
  const { data, error } = await supabase.functions.invoke('agora-token', { body: { channel } });
  if (error) throw new Error(error.message || "Couldn't start the video");
  if (!data?.appId || !data?.token || !Number.isInteger(data?.uid)) throw new Error("Couldn't start the video");
  return data;
}
