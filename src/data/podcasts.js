// MOCK podcast catalogue for BOA Podcasts. Shows and episode titles are
// placeholders. So that tapping one plays real speech, each episode streams a
// public-domain LibriVox reading from archive.org, picked to loosely match the
// show; `reading` credits it in the player.
// TODO: replace `audioUrl` (and drop `reading`) with real episode files.

// LibriVox recordings are public domain; archive.org serves them with range
// support, so seeking works.
const librivox = (path, title, author) => ({
  audioUrl: `https://archive.org/download/${path}`,
  reading: { title, author, source: 'LibriVox · public domain' },
});

export const podcasts = [
  {
    id: 'the-ends',
    title: 'The Ends Podcast',
    tagline: 'Life, culture and come-ups from Northwest London.',
    category: 'Culture',
    palette: ['#E2A84B', '#3A2508'],
    cover: 'serif',
    episodes: [
      { id: 'the-ends-03', number: 3, title: 'Postcodes Don’t Define You', ...librivox('nonfiction013_librivox/wildflowersofasphalt_howells_bt_64kb.mp3', 'Wild Flowers of the Asphalt', 'William Dean Howells') },
      { id: 'the-ends-02', number: 2, title: 'First Jobs, Real Lessons', ...librivox('nonfiction026_librivox/snf026_whyibelieveinpoverty_bok_jb_64kb.mp3', 'Why I Believe in Poverty', 'Edward Bok') },
      { id: 'the-ends-01', number: 1, title: 'Where We’re From', ...librivox('snf096_2303_librivox/snf096_viewskyline_anonymous_dg_64kb.mp3', 'View of a City Sky Line', 'Anonymous') },
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
      { id: 'afrobeats-banter-12', number: 12, title: 'Summer Anthems Draft', ...librivox('nonfiction064_1904_librivox/snf064_notesonpianos_mackall_dg_64kb.mp3', 'Notes on Pianos', 'Lawton Mackall') },
      { id: 'afrobeats-banter-11', number: 11, title: 'Amapiano vs Afrobeats', ...librivox('nonfiction026_librivox/snf026_slang_giles_nlb_64kb.mp3', 'Slang', 'Herbert A. Giles') },
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
      { id: 'mind-states-bts-02', number: 2, title: 'Casting the Five', ...librivox('nonfiction064_1904_librivox/snf064_artofplay_burgess_cm_64kb.mp3', 'The Art of Playing', 'Gelett Burgess') },
      { id: 'mind-states-bts-01', number: 1, title: 'Building Joe’s World', ...librivox('snf096_2303_librivox/snf096_cradle_gatchell_ak_64kb.mp3', 'The Cradle of the Movies', 'Charles Gatchell') },
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
      { id: 'open-call-05', number: 5, title: 'No Agent, No Problem', ...librivox('nonfiction067_1907_librivox/snf067_srinivasaramanujanlife_neville_ava_64kb.mp3', 'Srinivasa Ramanujan, His Early Life', 'E. H. Neville') },
      { id: 'open-call-04', number: 4, title: 'Self-Tapes That Land', ...librivox('nonfiction013_librivox/towriteornottowrite_rice_cc_64kb.mp3', 'To Write or Not to Write', 'Susan Andrews Rice') },
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
      { id: 'late-night-selectors-08', number: 8, title: 'Slow Jams Only', ...librivox('nonfiction064_1904_librivox/snf064_meditation_howell_cc_64kb.mp3', 'Meditation', 'James Howell') },
      { id: 'late-night-selectors-07', number: 7, title: 'UK Rap’s Golden Hour', ...librivox('nonfiction064_1904_librivox/snf064_mysterycrowds_hearn_qw_64kb.mp3', 'A Mystery of Crowds', 'Lafcadio Hearn') },
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
