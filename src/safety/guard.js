import { ensureTerms } from './consent';
import { moderate } from './moderation';

// The two things every piece of content goes through before it's saved. The
// API layer calls these, so no screen can skip them:
//
//   guard.text(surface, ...strings)      agreement, then a text check
//   guard.media(surface, image, text)    agreement, then a photo (and caption) check
//   guard.terms()                        the agreement alone (videos, voice notes, GIFs)
//
// Both throw a SafetyError to stop the action; see src/safety/errors.js.

/** Only the agreement. */
export const terms = () => ensureTerms();

/** The agreement, then the text (everything given, joined). */
export async function text(surface, ...parts) {
  await ensureTerms();
  const joined = parts
    .filter((p) => typeof p === 'string' && p.trim())
    .map((p) => p.trim())
    .join('\n');
  if (joined) await moderate({ surface, text: joined });
}

/** A text check without the agreement (profile text at sign-up, where the agreement is part of the form). */
export async function textOnly(surface, ...parts) {
  const joined = parts
    .filter((p) => typeof p === 'string' && p.trim())
    .map((p) => p.trim())
    .join('\n');
  if (joined) await moderate({ surface, text: joined });
}

/** The agreement, then an uploaded photo ({ bucket, path }) and its caption. */
export async function media(surface, image, caption = '') {
  await ensureTerms();
  await moderate({ surface, text: caption, image });
}
