/**
 * BOA's house rule: no hyphens or dashes in what people read. A dash used as
 * punctuation ("Love Radio - Reggae", "Radio — Jazz") becomes a comma; a hyphen
 * inside a word ("Hi-Fi", "code-switching") becomes a space. Use it on text that
 * arrives from outside the app (station names from the radio directory); text
 * written in the app is simply written without them.
 */
export function plainText(text) {
  if (typeof text !== 'string') return text;
  return text
    .replace(/\s+[-–—]+\s+/g, ', ')
    .replace(/\s*[–—]+\s*/g, ', ')
    .replace(/(?<=[A-Za-z0-9])-(?=[A-Za-z0-9])/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
