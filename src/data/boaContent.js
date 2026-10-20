// BOA Network content, taken from boanetworks.com (October 2026).
// Anything the site doesn't publish yet is left null and marked TODO; the UI
// renders designed placeholders for missing artwork and headshots instead of
// stock photos.

export const SITE_URL = 'https://www.boanetworks.com';

export const brand = {
  name: 'BOA Network',
  expansion: 'Best Of All Networks',
  tagline: 'The door is open.',
  mission:
    'BOA Networks is a UK production company dedicated to creating cinematic film and television while casting creative talent from all walks of life.',
  talentPitch: 'Your face belongs on screen.',
  submitUrl: `${SITE_URL}/contact?form=talent`,
  email: 'hello@boanetworks.com',
};

const ytThumb = (id, quality = 'hqdefault') => `https://i.ytimg.com/vi/${id}/${quality}.jpg`;

export const productions = [
  {
    id: 'mind-states-uk',
    title: 'Mind States UK',
    format: 'Series',
    genres: ['Crime', 'Drama', 'Thriller'],
    year: 2026,
    status: 'available',
    featured: true,
    logline:
      'Five friends navigate daily life in Northwest London, juggling pressures from the streets, financial struggles, and differing aspirations for the future. Through flashbacks and personal reflections, Joe examines how their environment shapes his mindset and choices.',
    // No poster on the site yet; the official trailer's thumbnail stands in.
    image: ytThumb('1Luf9F3wl-k', 'maxresdefault'),
    trailerYouTubeId: '1Luf9F3wl-k', // "Mind States UK - Official Trailer"
    // Episode 1 is published on YouTube, not as a video file.
    episodes: [
      {
        id: 'mind-states-uk-ep1',
        title: 'Episode 1',
        youTubeId: 'SnQglPC9S2M',
        videoUrl: null,
        image: ytThumb('SnQglPC9S2M'),
      },
    ],
  },
  {
    id: 'mind-states-ep2',
    title: 'Mind States EP2',
    format: 'Series',
    genres: ['Crime', 'Drama', 'Thriller'],
    year: null,
    status: 'coming-soon',
    logline: null, // TODO: not published on the site yet
    image: null,
    trailerYouTubeId: null,
    episodes: [],
  },
  // The site lists these two as untitled "Coming Soon" slots.
  {
    id: 'mind-states-3',
    title: 'Mind States 3',
    format: 'Series',
    genres: ['Crime', 'Drama', 'Thriller'],
    year: null,
    status: 'coming-soon',
    logline: null, // TODO: not published yet
    image: null,
    trailerYouTubeId: null,
    episodes: [],
  },
  {
    id: 'mind-states-4',
    title: 'Mind States 4',
    format: 'Series',
    genres: ['Crime', 'Drama', 'Thriller'],
    year: null,
    status: 'coming-soon',
    logline: null, // TODO: not published yet
    image: null,
    trailerYouTubeId: null,
    episodes: [],
  },
];

export const showreel = {
  title: 'Mind States UK - Official Trailer',
  youTubeId: '1Luf9F3wl-k',
};

// Order, roles, frame ratios and tints match the roster on /talent.
// The site has no headshots yet (headshot: null).
export const talent = [
  { id: 'sabeian-gilzene', name: 'Sabeian Gilzene', role: 'Actor & Model', ratio: 3 / 4, tint: '#E2A84B' },
  { id: 'jeremy-owusu', name: 'Jeremy Owusu', role: 'Actor & Model', ratio: 2 / 3, tint: '#D9D4C8' },
  { id: 'ngor-yel', name: 'Ngor Yel', role: 'Actor & Model', ratio: 2 / 3, tint: '#D9D4C8' },
  { id: 'tobi-adeyemi', name: 'Tobi Adeyemi', role: 'Model', ratio: 5 / 7, tint: '#9BB36A' },
  { id: 'chan-yel', name: 'Chan Yel', role: 'Actor & Model', ratio: 4 / 5, tint: '#E08AA0' },
  { id: 'prince-boamah', name: 'Prince Boamah', role: 'Actor & Model', ratio: 4 / 5, tint: '#D1513F' },
  { id: 'rebecca-soper', name: 'Rebecca Soper', role: 'Actress & Model', ratio: 3 / 4, tint: '#E2A84B' },
  { id: 'aaron-russell', name: 'Aaron Russell', role: 'Actor & Model', ratio: 3 / 4, tint: '#A6A29B' },
].map((t) => ({
  ...t,
  headshot: null,
  profileUrl: `${SITE_URL}/talent/${t.id}`,
  enquireUrl: `${SITE_URL}/contact?subject=${encodeURIComponent(`Booking enquiry: ${t.name}`)}`,
}));

export const founders = [
  {
    name: 'Joseph Boat',
    role: 'Co-founder',
    quote: 'Talent was never the problem. Access was.',
  },
  {
    name: 'David O',
    role: 'Co-founder',
    quote: 'We are not here to guard the door. We are here to hold it open.',
  },
];

export const featuredProduction = productions.find((p) => p.featured);
