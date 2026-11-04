// What a person agrees to before they post, message or upload, and where the
// full text lives. Bump TERMS_VERSION when the Terms or the Community
// Guidelines change in a way people must accept again, and raise the date in
// supabase/migrations/20261104180000_play_compliance.sql to match.

export const TERMS_VERSION = '2026-11-04';

const SITE = 'https://www.boanetworks.com';
export const TERMS_URL = `${SITE}/terms`;
export const GUIDELINES_URL = `${SITE}/community-guidelines`;
export const PRIVACY_URL = `${SITE}/privacy`;
// The web page where anyone can ask for their account to be deleted, signed in
// with the same email and password. It calls the delete-account Edge Function.
export const DELETE_ACCOUNT_URL = `${SITE}/delete-account`;

// The plain-language rules shown in the agreement.
export const COMMUNITY_RULES = [
  'Be respectful. No harassment, bullying, threats or hate.',
  'No nudity or sexual content, and nothing involving anyone under 18.',
  'No violence, self harm, scams, spam or anything illegal.',
  'Only post things you have the right to share.',
  'Anything you post or send can be reported, and BOA can remove it and remove accounts that break these rules.',
];
