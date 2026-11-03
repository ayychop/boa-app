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
    // High-res key art supplied by BOA. Both carry the "MIND STATES UK" title
    // treatment (and BOA / YouTube marks along the bottom edge).
    poster: require('../../assets/images/mind-states-poster.jpg'), // 1440x2560, 9:16: portrait cards
    backdrop: require('../../assets/images/mind-states-backdrop.jpg'), // 1080x1080: hero and landscape
    titleInArt: true,
    trailerYouTubeId: '1Luf9F3wl-k', // "Mind States UK, Official Trailer"
    // Episode 1 is published on YouTube, not as a video file.
    episodes: [
      {
        id: 'mind-states-uk-ep1',
        title: 'Episode 1',
        youTubeId: 'SnQglPC9S2M',
        videoUrl: null,
        image: require('../../assets/images/mind-states-backdrop.jpg'),
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
    id: 'mind-states-ep3',
    title: 'Mind States EP3',
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
    id: 'mind-states-ep4',
    title: 'Mind States EP4',
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
  title: 'Mind States UK, Official Trailer',
  youTubeId: '1Luf9F3wl-k',
};

// Order, roles, frame ratios and tints match the roster on /talent.
// Real photos (assets/talent, cropped to cover from the middle) for everyone
// who has sent one; the rest keep the initials placeholder (headshot: null).
// Bios are the website's own words, verbatim.
const PHOTOS = {
  'sabeian-gilzene': require('../../assets/talent/sabeian-gilzene.jpg'),
  'jeremy-owusu': require('../../assets/talent/jeremy-owusu.jpg'),
  'ngor-yel': require('../../assets/talent/ngor-yel.jpg'),
  'prince-boamah': require('../../assets/talent/prince-boamah.jpg'),
  'rebecca-soper': require('../../assets/talent/rebecca-soper.jpg'),
  'phillip-quartey': require('../../assets/talent/phillip-quartey.jpg'),
};

export const talent = [
  { id: 'sabeian-gilzene', name: 'Sabeian Gilzene', role: 'Actor & Model', ratio: 3 / 4, tint: '#E2A84B', bio: "Sabeian Gilzene is a 6ft5 Actor and model from the UK with Caribbean roots. He is an amazing model and Actor, very professional on set, and looks to one day make his own TV shows and movies." },
  { id: 'jeremy-benson', name: 'Jeremy Benson', role: 'Actor & Model', ratio: 2 / 3, tint: '#D9D4C8', bio: "Jeremy Benson is up and coming, learning the ropes of acting and the whole creative portfolio that comes with it. He will soon be hosting his own channel, which will have activities and explorations inside it. He is very confident, ready at fast speed, and gets his scenes right, if not on the first attempt, then the second." },
  { id: 'jeremy-owusu', name: 'Jeremy Owusu', role: 'Actor & Model', ratio: 2 / 3, tint: '#D9D4C8', bio: "Jeremy Owusu is an Actor and model who is confident, a comedian, and brings joy and good energy into the room. He still has a quiet, cool, observant profile about himself. He enjoys football a lot, is excellent at code switching, and showcases this on camera." },
  { id: 'ngor-yel', name: 'Ngor Yel', role: 'Actor & Model', ratio: 2 / 3, tint: '#D9D4C8', bio: "Ngor Yel is an Actor and model who is professional on set and ready to do whatever it takes to make sure the scene is right. A great basketball player and athlete, he is also a daytime teacher, making him excellent at code switching." },
  { id: 'chan-yel', name: 'Chan Yel', role: 'Actor & Model', ratio: 4 / 5, tint: '#E08AA0', bio: "Chan Yel is an amazing Actor and model who takes his craft seriously. He is very good at basketball, specialises in urban content, and would be great for thriller roles both inside and outside the urban scene. He is athletic and has the perfect muscular build, not too big and not too small." },
  { id: 'prince-boamah', name: 'Prince Boamah', role: 'Actor & Model', ratio: 4 / 5, tint: '#D1513F', bio: "Prince Boamah is an emerging creative with a passion for storytelling, film and bringing meaningful characters to life. Driven by creativity, ambition and a desire to grow, he is focused on developing his craft and exploring opportunities within the entertainment industry. With a genuine appreciation for authentic stories and the power of film to connect people, Prince brings dedication, personality and a fresh perspective to every project he is part of. His journey is rooted in resilience, self expression and the belief that every story deserves to be told. As he continues to build his experience, Prince aims to create work that resonates with audiences, challenges perspectives and leaves a lasting impression." },
  { id: 'rebecca-soper', name: 'Rebecca Soper', role: 'Actress & Model', ratio: 3 / 4, tint: '#E2A84B', bio: "Rebecca Soper is a London based actor, drama facilitator and Youth Violence Intervention Specialist. She trained at Intermission Youth Theatre, Identity Drama School, the National Youth Theatre and London School of Dramatic Arts. Her acting credits include Shakespeare's Globe, the Royal Court Theatre, film and voiceover work, including Netflix productions. Alongside acting, Rebecca uses drama and storytelling to raise awareness of youth violence, exploitation, identity and belonging, working with young people across schools, youth theatres and prison settings to inspire meaningful change." },
  { id: 'phillip-quartey', name: 'Phillip Quartey', role: 'Actor & Model', ratio: 3 / 4, tint: '#5CB8E6', bio: "Phillip Quartey is an Actor and Model from London. Standing at 6ft2, he is confident, an amazing dancer, and is always ready for the call. He is also a great athlete, especially in football." },
].map((t) => ({
  ...t,
  bio: t.bio ?? null,
  headshot: PHOTOS[t.id] ?? null,
  profileUrl: `${SITE_URL}/talent/${t.id}`,
  enquireUrl: `${SITE_URL}/contact?subject=${encodeURIComponent(`Booking enquiry: ${t.name}`)}`,
}));

export const founders = [
  {
    name: 'Joseph Boat',
    role: 'Cofounder',
    headshot: require('../../assets/talent/joseph-boat.jpg'),
    tint: '#E2A84B',
    quote: 'Talent was never the problem. Access was.',
    bio: "A confident leader who is always looking for ways for all of us to win. My goal is to create chances and opportunities for people who the door has been closed on and not given a chance, yet they are talented and have what it takes, they just need exposure. Profile is charismatic and a people's person, great at networking in any environment. Inside I am shy, but on the outside I portray a very confident, assertive demeanour. Overall, walk with love.",
  },
  {
    name: 'David O',
    role: 'Cofounder',
    headshot: require('../../assets/talent/david-o.jpg'),
    tint: '#E2A84B',
    quote: 'We are not here to guard the door. We are here to hold it open.',
    bio: "Very observant, quiet and reserved in profile, yet very thoughtful and one of the most helpful, outgoing people you'll meet. He is technically and creatively up to date, good with all equipment and setup. He has done everything creatively from a camera and editing standpoint, so he is well experienced.",
  },
];

export const featuredProduction = productions.find((p) => p.featured);
