# BOA HUB security

How the app and its Supabase backend are protected, and the rules every change has to follow.

## The one rule about keys

**The `service_role` key must never be in the frontend.** Not in the app's code, `app.json`, `app.config.js`, `eas.json`, an `EXPO_PUBLIC_*` variable, or any file that ships in the APK.

- The service role key bypasses Row Level Security completely. Anything in an APK can be extracted, however well it is obfuscated, so a key in the app is a key anyone can have.
- The app only ever holds the **anon key** (`EXPO_PUBLIC_SUPABASE_ANON_KEY`, see `src/lib/supabase.js`). The anon key is safe to ship *because* RLS limits it to what each signed-in user is allowed to do.
- The same goes for every other server secret: `AGORA_APP_CERTIFICATE`, `PUSH_WEBHOOK_SECRET`, the Firebase admin SDK JSON and the FCM v1 key. They live in Supabase Edge Function secrets or EAS credentials, never in the repo. (The `*firebase-adminsdk*.json` file at the repo root is gitignored. Keep it that way.)

## Sensitive operations go through Edge Functions

Anything that needs a secret, or must not be decided by the phone, runs in an Edge Function (`supabase/functions/`), which checks who is asking (`auth.getUser()`) before doing anything:

| Function | Why it's server side |
| --- | --- |
| `agora-token` | Signs call tokens with the App Certificate; refuses banned users. |
| `delete-user` | Deleting an account needs admin rights. |
| `message-push`, `call-push` | Sending pushes needs the FCM credentials and the webhook secret. |

Admin actions inside the database use `security definer` functions that check `admin_users` first. The app never decides on its own that someone is an admin, a Premium member or allowed to see something; the database does.

## Row Level Security

RLS is enabled on **every table in the `public` schema** (audited against `supabase/migrations/` on 2026-10-27). With RLS on, any operation without a matching policy is **denied**. So a missing policy is deliberate: that operation isn't allowed from the app at all.

| Table | SELECT | INSERT | UPDATE | DELETE | Notes |
| --- | :-: | :-: | :-: | :-: | --- |
| `admin_users` | - | - | - | - | No client access. Read only by `security definer` functions. |
| `applications` | yes | yes | yes | yes | |
| `blocks` | yes | yes | - | yes | Blocks are added or removed, never edited. |
| `casting_calls` | yes | yes | yes | yes | |
| `conversations` | yes | - | - | - | Created through an RPC that checks message privacy and blocks. |
| `day_one_claims` | yes | - | - | - | Claimed through an RPC, so the first 1,000 can't be faked. |
| `hearts` | - | yes | - | yes | No SELECT: heart counts are never exposed. |
| `invoices` | yes | yes | yes | yes | |
| `live_sessions` | yes | yes | yes | - | |
| `messages` | yes | yes | - | yes | Messages can't be edited after sending. |
| `posts` | yes | yes | yes | yes | |
| `profiles` | yes | yes | yes | - | Deleted only through `delete_my_account()` (your own) or the admin `delete-user` function. |
| `push_tokens` | yes | yes | yes | yes | Own tokens only. |
| `reports` | yes | yes | yes | - | |
| `session_participants` | yes | yes | yes | - | |
| `split_parties` | yes | yes | yes | yes | |
| `split_sheets` | yes | yes | yes | yes | |
| `trending_stations` | yes | yes | yes | yes | |

"yes" means a policy exists for that operation; each one restricts rows to the caller (`auth.uid()`), their conversations, or public data, as written in the migration that creates it.

Outside `public`:

- **`private` schema** (`push_settings`, `set_push_function`): every privilege is revoked from `public`, `anon` and `authenticated`, and the schema is not exposed through the API. No client can reach it.
- **Realtime** (`realtime.messages`): call ringing uses private channels. Only the owner of a `boa-call:<uid>` inbox can listen to it, and only people allowed to reach them can ring it (`20261027120000_private_call_ringing.sql`).
- **Storage** (`storage.objects`): uploads, replacements and deletes are limited to the user's own folder.

### Rules for new tables

1. `alter table ... enable row level security;` in the same migration that creates the table.
2. A policy for each operation the app needs, and nothing more. Prefer `using (... = (select auth.uid()))` style checks.
3. Never add `using (true)` for INSERT, UPDATE or DELETE.
4. Update the table above.

### Checking the live database

Migrations are run by hand in the SQL editor, so the live database can drift from this repo. Run this in the Supabase SQL editor; both queries should return **no rows**:

```sql
-- Tables in exposed schemas with RLS switched off.
select schemaname, tablename
from pg_tables
where schemaname = 'public' and not rowsecurity;

-- Tables with RLS on but no policies at all (fine only for admin_users).
select t.tablename
from pg_tables t
left join pg_policies p on p.schemaname = t.schemaname and p.tablename = t.tablename
where t.schemaname = 'public'
group by t.tablename
having count(p.policyname) = 0 and t.tablename <> 'admin_users';
```

## App hardening

**Obfuscation.** Release builds (which includes EAS `preview` APKs) run R8: Java and Kotlin code is shrunk and renamed. It's switched on by `enableMinifyInReleaseBuilds` in the `expo-build-properties` plugin in `app.json`. (`enableProguardInReleaseBuilds` and `enableR8InReleaseBuilds` are also set, but Expo SDK 58 doesn't read them; `enableMinifyInReleaseBuilds` is the one that counts.) The keep rules are in `extraProguardRules` in the same place, because `android/` is generated at build time and gitignored, so a hand-edited `proguard-rules.pro` would be thrown away. JavaScript ships as Hermes bytecode, Expo's default engine.

If a release build crashes on launch with a `ClassNotFoundException` or `NoSuchMethodError`, a native class was renamed or removed: add a `-keep` rule for it. Setting `enableMinifyInReleaseBuilds` to `false` is the quick way back.

**Runtime tripwires.** `src/security/integrity.js` checks once per launch for root or jailbreak, hooking frameworks (Frida, Xposed), emulators, an attached debugger, mock locations, USB debugging and Developer options (using `jail-monkey` and `expo-device`). For now it **only logs** (`console.warn('[security] device integrity', ...)`) and never blocks or crashes. `checkDevice()` returns every result with a severity, ready for a kill switch to act on later. USB debugging and Developer options are common on testers' phones, so they're `low` and shouldn't block anyone on their own.

Obfuscation and tripwires only slow an attacker down. The real protection is that the app holds no secrets and the server checks everything, as above.

## Reporting a problem

Found a security issue? Email the BOA team instead of opening a public issue.
