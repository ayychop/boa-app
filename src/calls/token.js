import { supabase } from '../lib/supabase';

// A call's Agora pass, from the agora-token Edge Function
// (supabase/functions/agora-token). The function checks who's asking, then
// signs a token for this channel and this person only, so the App
// Certificate never leaves the server. Returns { appId, token, uid }.
export async function fetchToken(channel) {
  if (!supabase) throw new Error('The Hub is not connected yet.');
  const { data, error } = await supabase.functions.invoke('agora-token', { body: { channel } });
  if (error) {
    const reason = await whyFailed(error);
    console.error('[call] agora-token failed', { channel, ...reason });
    throw new Error(reason.status ? `${reason.message} (${reason.status})` : reason.message);
  }
  if (!data?.appId || !data?.token || !Number.isInteger(data?.uid)) {
    console.error('[call] agora-token answered without a token', { channel, keys: Object.keys(data ?? {}) });
    throw new Error("Couldn't start the video");
  }
  return data;
}

// supabase-js only says "Edge Function returned a non-2xx status code"; the
// function's own { error } and the status are on the response it carries.
async function whyFailed(error) {
  const res = error?.context;
  const status = typeof res?.status === 'number' ? res.status : null;
  let message = error?.message || "Couldn't start the video";
  try {
    const body = await res?.clone?.().json?.();
    if (body?.error) message = String(body.error);
  } catch {
    // Not JSON (a gateway error page): keep supabase-js's message.
  }
  return { status, message };
}
