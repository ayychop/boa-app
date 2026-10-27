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

TaskManager.defineTask(CALL_PUSH_TASK, async ({ data, error }) => {
  if (error) return;
  if (AppState.currentState === 'active') return;
  const call = callFromPush(data?.notification?.request?.content?.data ?? data);
  if (call) await ringNotification(call);
});

/** Hands call pushes to the task. Safe to call on every launch. */
export function registerCallPushTask() {
  Notifications.registerTaskAsync?.(CALL_PUSH_TASK)?.catch?.((err) => console.warn('[call] push task not registered', err?.message ?? err));
}
