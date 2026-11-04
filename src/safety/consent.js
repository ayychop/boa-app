import { supabase } from '../lib/supabase';
import { SafetyError } from './errors';
import { TERMS_VERSION } from './terms';

// The agreement to the Terms of Service and the Community Guidelines.
//
// Recorded in two places, both written when the person taps "I Agree":
//   * profiles.terms_accepted_at and profiles.terms_version (what the database
//     checks before it lets a post or a message in), and
//   * the sign-in account's user_metadata: terms_accepted, terms_version and
//     terms_accepted_at (so it travels with the account).
//
// Anything that posts, sends a message or uploads media calls ensureTerms()
// first (src/safety/guard.js). If they haven't agreed to the current version,
// the blocking agreement appears (src/components/safety/SafetyHost.js) and
// the action waits for their answer.

const listeners = new Set();
let state = { userId: null, hasProfile: false, accepted: false, version: null };
let pending = null; // { resolve } while the agreement is on screen

const emit = () => listeners.forEach((fn) => fn(getState()));

/** Whether a stored version is the current one or newer (ISO dates sort as text). */
export const isCurrent = (version) => typeof version === 'string' && version >= TERMS_VERSION;

export const getState = () => ({ ...state, open: !!pending });

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Tells this module who is signed in and what they've agreed to. Called by the
 * Hub whenever the account or profile changes. `profile` is their profiles row;
 * `user` is the auth user (for its user_metadata).
 */
export function sync({ user = null, profile = null } = {}) {
  const userId = user?.id ?? profile?.id ?? null;
  const meta = user?.user_metadata ?? {};
  const version = profile?.terms_version ?? (meta.terms_accepted === true ? meta.terms_version : null) ?? null;
  const accepted = !!userId && isCurrent(version);
  if (userId !== state.userId) cancel();
  state = { userId, hasProfile: !!profile, accepted, version };
  // Agreed somewhere else while the agreement was open (onboarding): let go of the wait.
  if (accepted && pending) {
    const done = pending;
    pending = null;
    done.resolve(true);
  }
  emit();
}

export const isAccepted = () => state.accepted;

/** Records the agreement (profile row first: that is what the database checks), then mirrors it into user_metadata. */
export async function accept() {
  if (!supabase) throw new Error('The Creative Hub is not connected yet.');
  const { data } = await supabase.auth.getUser();
  const userId = data?.user?.id ?? state.userId;
  if (!userId) throw new Error('Sign in first.');
  const at = new Date().toISOString();
  const { error } = await supabase.from('profiles').update({ terms_accepted_at: at, terms_version: TERMS_VERSION }).eq('id', userId);
  if (error) throw new Error(`Couldn't save your agreement. ${error.message}`.trim());
  // The metadata copy is best effort: the profile row is the record that counts.
  await supabase.auth.updateUser({ data: { terms_accepted: true, terms_version: TERMS_VERSION, terms_accepted_at: at } }).catch((err) => {
    console.warn('[consent] could not mirror the agreement into user_metadata', String(err?.message ?? err));
  });
  state = { userId, hasProfile: true, accepted: true, version: TERMS_VERSION };
  const done = pending;
  pending = null;
  emit();
  done?.resolve(true);
}

/** They closed the agreement without agreeing. */
export function decline() {
  const done = pending;
  pending = null;
  emit();
  done?.resolve(false);
}

function cancel() {
  const done = pending;
  pending = null;
  done?.resolve(false);
}

/**
 * Resolves once they've agreed to the current Terms; throws a handled
 * SafetyError('terms_declined') if they close the agreement instead. Several
 * actions asking at once share one agreement.
 */
export async function ensureTerms() {
  if (state.accepted) return true;
  // No profile yet means they're still signing up, where the agreement is part
  // of the form (and the database refuses posts and messages without a profile).
  if (!state.hasProfile) return true;
  if (!pending) {
    let resolve;
    const promise = new Promise((r) => (resolve = r));
    pending = { resolve, promise };
    emit();
  }
  const agreed = await pending.promise;
  if (!agreed) throw new SafetyError('terms_declined', 'Agree to the Terms of Service and Community Guidelines to post, message or upload.');
  return true;
}
