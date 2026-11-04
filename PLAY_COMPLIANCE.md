# BOA HUB: Google Play compliance

What the app does in code, what the Play Console still needs, and how to deploy it.

## Deploy steps (in this order)

1. Build and release the new app (`npx eas-cli@latest build --platform android --profile production`).
2. `supabase functions deploy moderate-content delete-account`
3. `supabase secrets set OPENAI_API_KEY=<key>` (without it the content check allows everything and logs a warning; with it set, it blocks).
4. `supabase db push` (runs `20261104180000_play_compliance.sql`) **after** the new app is live: older builds cannot record the Terms agreement, and the database refuses posts and messages without it.
5. Publish these pages on the site: `/terms`, `/community-guidelines`, `/privacy`, `/delete-account`.

## UGC safety

| Requirement | In the app |
| --- | --- |
| Terms before posting, messaging or uploading | `src/safety/consent.js` and the blocking card in `src/components/safety/SafetyHost.js`. Stored in `profiles.terms_version` and `user_metadata.terms_accepted`. The API layer calls the guard, and the database refuses posts and messages without it. |
| Report | Flag on every profile, post and message, with a reason list, into `public.reports` (`ReportSheet`). |
| Block | Block User on every profile; blocked people vanish from chats, directory, hearts, casting board and, through row level security, their profile and posts. |
| Moderation | `moderate-content` Edge Function (OpenAI `omni-moderation-latest`) checks text and photos before posting; a refusal shows "Content Violates Guidelines". Provider failure blocks the post. Videos and voice notes are covered by reporting. |

## Account deletion

In app: Hub settings, Delete Account, type DELETE. Web: `https://www.boanetworks.com/delete-account`.

The web page signs the member in with Supabase Auth (same email and password) and posts:

```
POST https://<project>.supabase.co/functions/v1/delete-account
Authorization: Bearer <session access_token>
apikey: <anon key>
Content-Type: application/json

{ "confirm": "DELETE" }
```

CORS allows `https://www.boanetworks.com` and `https://boanetworks.com`. Erased: sign in, profile, posts, conversations and chat history (both sides), media files, admin entry. Kept: reports other people filed about them, with the person removed.

## Target API level

`targetSdkVersion` 36, `compileSdkVersion` 37 (Expo SDK 58 defaults, pinned in `app.json`).

## Permissions (Play Console declarations)

| Permission | Why |
| --- | --- |
| MODIFY_AUDIO_SETTINGS | Radio and call audio routing |
| FOREGROUND_SERVICE, FOREGROUND_SERVICE_MEDIA_PLAYBACK | Radio and alarm playback |
| FOREGROUND_SERVICE_PHONE_CALL, FOREGROUND_SERVICE_MICROPHONE, MANAGE_OWN_CALLS | BOA calls |
| POST_NOTIFICATIONS | Messages, calls, alarms |
| USE_FULL_SCREEN_INTENT | Alarm and incoming call screens (declare as alarm and calling app) |
| SCHEDULE_EXACT_ALARM | Alarm clock (declare as alarm app) |
| VIBRATE, WAKE_LOCK, RECEIVE_BOOT_COMPLETED | Alarm, call ringing, restoring alarms after restart |
| ACCESS_COARSE_LOCATION | Local weather (approximate only) |
| CAMERA, RECORD_AUDIO | Video calls, photos, voice notes |

Removed: REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, ACCESS_FINE_LOCATION, READ/WRITE_EXTERNAL_STORAGE, READ_MEDIA_*, READ_PHONE_STATE, SYSTEM_ALERT_WINDOW (all blocked in `app.json`).

## Data safety (what the app collects)

| Data | Package or service | Purpose | Shared |
| --- | --- | --- | --- |
| Email, user id | Supabase Auth | Account | No |
| Profile, posts, messages, photos, voice notes | Supabase (`@supabase/supabase-js`) | App functionality | Text and photos go to OpenAI Moderation to check them |
| Push token, device platform | `expo-notifications` | Message and call notifications | No |
| Approximate location | `expo-location` | Local weather, not stored | No |
| Audio and video (live) | `react-native-agora` | Calls, not recorded | Agora (processor) |
| Photos and videos you pick or take | `expo-image-picker` | Posts, avatar, chat | Supabase |
| Microphone | `expo-audio` | Voice notes | Supabase |
| Crash and device integrity signals | `jail-monkey`, `expo-device`, `expo-application` | Security, on device | No |

Encrypted in transit; deletion in app and on the web.

## AI content

No generative AI in BOA HUB. "Enhance" is a beauty and colour filter on the live camera, not generated content. If generated content is ever added it must be labelled in the UI.
