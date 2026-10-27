# Backlog

Next update.

- **Amapiano ringtone.** A fifth original loop for incoming calls, alongside Hip Hop, R&B, Afrobeats and Bashment. Make it a whole number of bars so it loops cleanly, then:
  1. add `assets/sounds/ringtones/amapiano.wav` and an entry in `RINGTONES` (`src/calls/ringtone.js`);
  2. run `python3 scripts/ringtone-haptics.py > src/calls/ringtoneHaptics.js` so the vibration lands on its log drum and kicks;
  3. add `'amapiano'` to `RINGTONES` in `supabase/functions/call-push/index.ts` and redeploy it.
