import { supabase } from '../lib/supabase';
import { SafetyError } from './errors';

// Asks the moderate-content Edge Function (supabase/functions/moderate-content)
// whether text or an already uploaded photo is fit to post, before it's saved.
//
// If the check says no, the person sees the "Content Violates Guidelines" card
// (src/components/safety/SafetyHost.js) and a handled SafetyError stops the
// action. If the check itself can't be done (no connection, the provider is
// down) the action does NOT go ahead: an unhandled SafetyError('unavailable')
// carries a plain message for the screen to show.

const listeners = new Set();
let shown = null; // { surface, categories } while the card is on screen

export const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
export const getViolation = () => shown;
export function showViolation(surface, categories = []) {
  shown = { surface, categories };
  listeners.forEach((fn) => fn(shown));
}
export function dismissViolation() {
  shown = null;
  listeners.forEach((fn) => fn(null));
}

/** Words for the categories the check returns. */
export const CATEGORY_LABELS = {
  harassment: 'harassment or bullying',
  hate: 'hateful content',
  sexual: 'nudity or sexual content',
  violence: 'violent or graphic content',
  self_harm: 'self harm',
  illicit: 'illegal activity',
};
export const describeCategories = (categories = []) => {
  const names = [...new Set(categories.map((c) => CATEGORY_LABELS[c]).filter(Boolean))];
  if (!names.length) return null;
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
};

const UNAVAILABLE = "We couldn't check that right now, so it wasn't sent. Check your connection and try again.";

/**
 * Checks `text` and/or an uploaded photo (`image: { bucket, path }`).
 * Resolves with { allowed: true } or throws a SafetyError. Nothing to check
 * (no text, no photo) is allowed at once.
 */
export async function moderate({ surface, text = '', image = null }) {
  const body = typeof text === 'string' ? text.trim() : '';
  if (!body && !image) return { allowed: true, empty: true };
  if (!supabase) throw new Error('The Creative Hub is not connected yet.');
  let res;
  try {
    res = await supabase.functions.invoke('moderate-content', { body: { surface, ...(body ? { text: body } : {}), ...(image ? { image } : {}) } });
  } catch (err) {
    throw new SafetyError('unavailable', UNAVAILABLE, { cause: err });
  }
  if (res.error) {
    const detail = await res.error.context?.json?.().catch(() => null);
    // A refusal for a reason the person should read (banned, not their file, rate limited).
    const status = res.error.context?.status;
    if (status === 429) throw new SafetyError('unavailable', 'Too many tries in a row. Wait a moment and try again.');
    if (status === 403 && detail?.error) throw new SafetyError('unavailable', detail.error);
    throw new SafetyError('unavailable', UNAVAILABLE, { cause: res.error });
  }
  const out = res.data ?? {};
  if (out.allowed === false) {
    showViolation(surface, out.categories ?? []);
    throw new SafetyError('violation', 'This content violates the Community Guidelines.', { categories: out.categories ?? [] });
  }
  if (out.skipped) console.warn('[moderation] the content check is not configured on the server:', out.skipped);
  return { allowed: true };
}
