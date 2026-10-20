// MOCK podcast catalogue for BOA Podcasts. Shows, hosts' framing and episode
// titles are placeholders; the audio is royalty-free sample music from
// SoundHelix so the player, scrubber and lock-screen controls can be tested.
// TODO: replace `audioUrl` with real episode files (MP3/AAC) when recorded.

const sample = (n) => `https://www.soundhelix.com/examples/mp3/SoundHelix-Song-${n}.mp3`;

export const podcasts = [
  {
    id: 'the-ends',
    title: 'The Ends Podcast',
    tagline: 'Life, culture and come-ups from Northwest London.',
    category: 'Culture',
    palette: ['#E2A84B', '#3A2508'],
    cover: 'serif',
    episodes: [
      { id: 'the-ends-03', number: 3, title: 'Postcodes Don’t Define You', audioUrl: sample(1) },
      { id: 'the-ends-02', number: 2, title: 'First Jobs, Real Lessons', audioUrl: sample(2) },
      { id: 'the-ends-01', number: 1, title: 'Where We’re From', audioUrl: sample(3) },
    ],
  },
  {
    id: 'afrobeats-banter',
    title: 'Afrobeats & Banter',
    tagline: 'The week’s biggest tunes, hot takes and zero chill.',
    category: 'Music',
    palette: ['#1ED760', '#06331A'],
    cover: 'stack',
    episodes: [
      { id: 'afrobeats-banter-12', number: 12, title: 'Summer Anthems Draft', audioUrl: sample(4) },
      { id: 'afrobeats-banter-11', number: 11, title: 'Amapiano vs Afrobeats', audioUrl: sample(5) },
    ],
  },
  {
    id: 'mind-states-bts',
    title: 'Mind States: Behind the Scenes',
    tagline: 'How a BOA Original gets made, from open call to final cut.',
    category: 'Film & TV',
    palette: ['#D1513F', '#2B0C08'],
    cover: 'slate',
    episodes: [
      { id: 'mind-states-bts-02', number: 2, title: 'Casting the Five', audioUrl: sample(6) },
      { id: 'mind-states-bts-01', number: 1, title: 'Building Joe’s World', audioUrl: sample(7) },
    ],
  },
  {
    id: 'open-call',
    title: 'Open Call',
    tagline: 'First auditions, big breaks and getting seen without connections.',
    category: 'Careers',
    palette: ['#D9D4C8', '#24221E'],
    cover: 'serif',
    episodes: [
      { id: 'open-call-05', number: 5, title: 'No Agent, No Problem', audioUrl: sample(8) },
      { id: 'open-call-04', number: 4, title: 'Self-Tapes That Land', audioUrl: sample(9) },
    ],
  },
  {
    id: 'late-night-selectors',
    title: 'Late Night Selectors',
    tagline: 'R&B and hip hop after dark, with the stories behind the records.',
    category: 'Music',
    palette: ['#7C3AED', '#1A0B33'],
    cover: 'stack',
    episodes: [
      { id: 'late-night-selectors-08', number: 8, title: 'Slow Jams Only', audioUrl: sample(10) },
      { id: 'late-night-selectors-07', number: 7, title: 'UK Rap’s Golden Hour', audioUrl: sample(11) },
    ],
  },
];

/** Shape an episode as a player item (see audio/engine.js). */
export function episodeItem(podcast, episode) {
  return {
    kind: 'podcast',
    id: episode.id,
    name: episode.title,
    artist: podcast.title,
    streamUrl: episode.audioUrl,
    logo: null,
    podcastId: podcast.id,
    episodeNumber: episode.number,
  };
}

export const podcastById = (id) => podcasts.find((p) => p.id === id);
