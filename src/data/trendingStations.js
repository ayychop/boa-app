// Hand-picked stations for Home's "Trending on BOA Radio": continuous music,
// no talk. Stored by radio-browser station UUID so stream URLs stay current;
// `logo` overrides a listed logo that is dead.
//
// Picked 2026-10-21 by sampling each stream's live ICY "now playing" title a
// minute apart: every pick was broadcasting "Artist - Song" titles (most
// changed track between samples), i.e. music programming rather than
// presenters, news or talk. The app still applies the talk filter and
// test-plays each one at runtime, and tops up from the directory if any die.

export const CURATED_RNB_HIPHOP = [
  // Mariah Carey "We Belong Together" -> Babyface "Never Keeping Secrets"
  { uuid: 'dba1b7bc-6b92-409c-a543-8b42eec25636', name: '100 Hip Hop and RNB FM' },
  // T.I. "Ball" -> Kelis "Caught Out There"
  {
    uuid: 'b5ea4f76-4b5b-4313-b7b7-c07fc3cfc520',
    name: 'Radio WoW Black',
    logo: 'https://www.radiowow.com/wp-content/uploads/2025/03/radio-wow-logo-200x200.png',
  },
  // Shanice "I Love Your Smile"; Donna Summer
  { uuid: 'afb31087-30b4-44c7-8469-b3526d8f3bb5', name: 'Total Soul (UK)' },
  // Desh, Youngfly "Ohmamma"; Ryan Castro "La Villa" (wider urban mix)
  { uuid: '15ad7a63-dd62-479c-8608-c53922dbc8b5', name: 'Base FM' },
  // Backup: music-only, but leans dance-pop (Infernal, Black Eyed Peas).
  { uuid: '23687de7-9621-4e09-b190-1f83fd626906', name: 'RMF 4 Dance & RnB' },
];

// Exactly one of these appears, the first that plays.
export const CURATED_GHANA = [
  // Kuami Eugene "Angela" -> Davido "FIA"
  { uuid: '06d67d5b-00ad-4454-a86d-be41950f856a', name: 'Asenteman Radio' },
  // Continuous DJ mixtapes (Shatta Wale) rather than single tracks
  { uuid: '300c0117-edaf-442a-84dd-39e02b73a7d8', name: 'SHATTA Movement' },
];
