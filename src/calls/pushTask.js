import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { callFromPush, ringNotification } from './incoming';

// The incoming-call push (supabase/functions/call-push) is data-only on
// Android, so nothing shows until the app does it: this task runs when it
// arrives, with the app in the background or closed (Android starts it for
// the task), and rings the call (src/calls/incoming.js). With the app on
// screen, CallContext rings it on the call screen instead.
//
// Defined when the app's JS loads (index.js), before any UI, as
// expo-task-manager requires.

export const CALL_PUSH_TASK = 'boa-call-push';

//
// On Android the task gets FCM's message, { data: { body, dataString, ... },
// notification: null, ... }: the call is in data, not at the top. (Reading
// the top level was why a phone in a pocket never rang.)
TaskManager.defineTask(CALL_PUSH_TASK, async ({ data, error }) => {
  if (error) {
    console.warn('[call] push task error', error?.message ?? error);
    return;
  }
  if (AppState.currentState === 'active') return;
  const call = callFromPush(data?.notification?.request?.content?.data ?? data?.data ?? data);
  console.log('[call] push task', call ? `ringing ${call.callId}` : 'not a call');
  if (call) await ringNotification(call);
});

/** Hands call pushes to the task. Safe to call on every launch. */
export function registerCallPushTask() {
  Notifications.registerTaskAsync?.(CALL_PUSH_TASK)?.catch?.((err) => console.warn('[call] push task not registered', err?.message ?? err));
}
