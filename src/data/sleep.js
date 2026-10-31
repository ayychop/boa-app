// The Sleep & Meditation Hub's media: real, openly licensed recordings and
// photographs, streamed from Wikimedia Commons and the Internet Archive, and
// BOA's own generated tones and noise (bundled with the app).
// Every entry keeps its licence, author and source page, and the hub shows
// them under "Credits" (CC BY needs the attribution; the rest get it anyway).
//
// Wikimedia refuses requests that carry OkHttp's default User-Agent (HTTP
// 403), which is what Android's image loader and downloads send unless told
// otherwise, so every media request sends this one.
export const MEDIA_HEADERS = { 'User-Agent': 'BOANetworks/1.0 (Android; +https://boanetworks.com)' };

// Every kind of sound has a room of its own: rain on a window, a dark
// starry night for deep sleep, an aurora for the frequencies, a fire for
// nature. Videos are 1080p wherever Commons has it (the rain is 720p, its
// original).
//
// Each scene is a looping video (muted, played from the cache) over a still
// photograph that shows until the video's first frame, and stays if the
// video can't play. Android and the web get Commons' VP9 WebM; iOS, which
// can't play WebM, its QuickTime transcode.
export const SCENES = {
  rain: {
    id: 'rain',
    video: {
      uri: 'https://upload.wikimedia.org/wikipedia/commons/9/95/Raindrops_against_the_window_in_the_night_city%2C_Las_Palmas.webm',
      ios: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/9/95/Raindrops_against_the_window_in_the_night_city%2C_Las_Palmas.webm/Raindrops_against_the_window_in_the_night_city%2C_Las_Palmas.webm.360p.mpeg4.mov',
      title: 'Raindrops against the window in the night city, Las Palmas',
      author: 'slavikfi (Vjatseslav Robtsenkov)',
      license: 'CC0 1.0',
      source: 'https://commons.wikimedia.org/wiki/File:Raindrops_against_the_window_in_the_night_city,_Las_Palmas.webm',
    },
    uri: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9c/Rain_on_window_%28Unsplash%29.jpg/1280px-Rain_on_window_%28Unsplash%29.jpg',
    title: 'Rain on window',
    author: 'Francesco Gallarotti',
    license: 'CC0 1.0',
    source: 'https://commons.wikimedia.org/wiki/File:Rain_on_window_(Unsplash).jpg',
  },
  night: {
    id: 'night',
    video: {
      uri: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/a/a1/Starry_sky_with_North_Star_circled.webm/Starry_sky_with_North_Star_circled.webm.1080p.vp9.webm',
      ios: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/a/a1/Starry_sky_with_North_Star_circled.webm/Starry_sky_with_North_Star_circled.webm.360p.mpeg4.mov',
      title: 'Starry sky with North Star circled',
      author: 'Thomas Bresson',
      license: 'CC BY 3.0',
      source: 'https://commons.wikimedia.org/wiki/File:Starry_sky_with_North_Star_circled.webm',
    },
    uri: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/64/Starry_sky_foggy_night_%28Unsplash%29.jpg/1280px-Starry_sky_foggy_night_%28Unsplash%29.jpg',
    title: 'Starry sky foggy night',
    author: 'Martin Sattler',
    license: 'CC0 1.0',
    source: 'https://commons.wikimedia.org/wiki/File:Starry_sky_foggy_night_(Unsplash).jpg',
  },
  aurora: {
    id: 'aurora',
    video: {
      uri: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/c/c5/Alaskan_Aurora_Time_Lapse_%28SVS15077%29.webm/Alaskan_Aurora_Time_Lapse_%28SVS15077%29.webm.1080p.vp9.webm',
      ios: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/c/c5/Alaskan_Aurora_Time_Lapse_%28SVS15077%29.webm/Alaskan_Aurora_Time_Lapse_%28SVS15077%29.webm.360p.mpeg4.mov',
      title: 'Alaskan Aurora Time Lapse',
      author: "NASA's Scientific Visualization Studio / Mike Toillion",
      license: 'Public domain',
      source: 'https://commons.wikimedia.org/wiki/File:Alaskan_Aurora_Time_Lapse_(SVS15077).webm',
    },
    uri: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/bf/Colorful_aurora_borealis_%28Unsplash%29.jpg/1280px-Colorful_aurora_borealis_%28Unsplash%29.jpg',
    title: 'Colorful aurora borealis',
    author: 'Alan Labisch',
    license: 'CC0 1.0',
    source: 'https://commons.wikimedia.org/wiki/File:Colorful_aurora_borealis_(Unsplash).jpg',
  },
  fire: {
    id: 'fire',
    // Filmed upright at 1080 x 1920, so it fills a phone screen sharp.
    video: {
      uri: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/9/97/Fire_Pit_in_Denmark%2C_Western_Australia%2C_2026.webm/Fire_Pit_in_Denmark%2C_Western_Australia%2C_2026.webm.1080p.vp9.webm',
      ios: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/9/97/Fire_Pit_in_Denmark%2C_Western_Australia%2C_2026.webm/Fire_Pit_in_Denmark%2C_Western_Australia%2C_2026.webm.360p.mpeg4.mov',
      title: 'Fire Pit in Denmark, Western Australia',
      author: 'Aliceinthealice',
      license: 'CC0 1.0',
      source: 'https://commons.wikimedia.org/wiki/File:Fire_Pit_in_Denmark,_Western_Australia,_2026.webm',
    },
    uri: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1d/Glowing_Embers_%28Unsplash%29.jpg/1280px-Glowing_Embers_%28Unsplash%29.jpg',
    title: 'Glowing Embers',
    author: 'Peter Forster',
    license: 'CC0 1.0',
    source: 'https://commons.wikimedia.org/wiki/File:Glowing_Embers_(Unsplash).jpg',
  },
  // Four more night skies for the Zen screensaver (screensavers.js), each in
  // the same spirit as the two originals: dark, unhurried time-lapse, stars
  // over a black horizon, nothing bright, nothing with writing on it. Their
  // photograph is the video's own first frame, so the hand-over is seamless.
  milkyway: {
    id: 'milkyway',
    video: {
      uri: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/d/d2/Milky_Way_Time-Lapse_Rework.webm/Milky_Way_Time-Lapse_Rework.webm.1080p.vp9.webm',
      ios: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/d/d2/Milky_Way_Time-Lapse_Rework.webm/Milky_Way_Time-Lapse_Rework.webm.360p.mpeg4.mov',
      title: 'Milky Way Time-Lapse Rework',
      author: 'GaryP',
      license: 'CC BY 3.0',
      source: 'https://commons.wikimedia.org/wiki/File:Milky_Way_Time-Lapse_Rework.webm',
    },
    uri: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d2/Milky_Way_Time-Lapse_Rework.webm/1280px--Milky_Way_Time-Lapse_Rework.webm.jpg',
    title: 'Milky Way Time-Lapse Rework (first frame)',
    author: 'GaryP',
    license: 'CC BY 3.0',
    source: 'https://commons.wikimedia.org/wiki/File:Milky_Way_Time-Lapse_Rework.webm',
  },
  joshua: {
    id: 'joshua',
    video: {
      uri: 'https://upload.wikimedia.org/wikipedia/commons/9/92/Milky_Way_over_a_Joshua_tree_%2830865856965%29.webm',
      ios: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/9/92/Milky_Way_over_a_Joshua_tree_%2830865856965%29.webm/Milky_Way_over_a_Joshua_tree_%2830865856965%29.webm.360p.mpeg4.mov',
      title: 'Milky Way over a Joshua tree',
      author: 'Joshua Tree National Park',
      license: 'Public domain',
      source: 'https://commons.wikimedia.org/wiki/File:Milky_Way_over_a_Joshua_tree_(30865856965).webm',
    },
    uri: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/92/Milky_Way_over_a_Joshua_tree_%2830865856965%29.webm/1280px--Milky_Way_over_a_Joshua_tree_%2830865856965%29.webm.jpg',
    title: 'Milky Way over a Joshua tree (first frame)',
    author: 'Joshua Tree National Park',
    license: 'Public domain',
    source: 'https://commons.wikimedia.org/wiki/File:Milky_Way_over_a_Joshua_tree_(30865856965).webm',
  },
  desert: {
    id: 'desert',
    video: {
      uri: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/5/57/Skull_Rock_Trail_at_night_%2830230498613%29.webm/Skull_Rock_Trail_at_night_%2830230498613%29.webm.1080p.vp9.webm',
      ios: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/5/57/Skull_Rock_Trail_at_night_%2830230498613%29.webm/Skull_Rock_Trail_at_night_%2830230498613%29.webm.360p.mpeg4.mov',
      title: 'Skull Rock Trail at night',
      author: 'Joshua Tree National Park',
      license: 'Public domain',
      source: 'https://commons.wikimedia.org/wiki/File:Skull_Rock_Trail_at_night_(30230498613).webm',
    },
    uri: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/57/Skull_Rock_Trail_at_night_%2830230498613%29.webm/1280px--Skull_Rock_Trail_at_night_%2830230498613%29.webm.jpg',
    title: 'Skull Rock Trail at night (first frame)',
    author: 'Joshua Tree National Park',
    license: 'Public domain',
    source: 'https://commons.wikimedia.org/wiki/File:Skull_Rock_Trail_at_night_(30230498613).webm',
  },
  startrails: {
    id: 'startrails',
    video: {
      uri: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/6/64/Monument_Valley_Star_Trails_%28Video%29.webm/Monument_Valley_Star_Trails_%28Video%29.webm.1080p.vp9.webm',
      ios: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/6/64/Monument_Valley_Star_Trails_%28Video%29.webm/Monument_Valley_Star_Trails_%28Video%29.webm.360p.mpeg4.mov',
      title: 'Monument Valley Star Trails',
      author: 'Eric Kilby',
      license: 'CC BY-SA 2.0',
      source: 'https://commons.wikimedia.org/wiki/File:Monument_Valley_Star_Trails_(Video).webm',
    },
    uri: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/64/Monument_Valley_Star_Trails_%28Video%29.webm/1280px--Monument_Valley_Star_Trails_%28Video%29.webm.jpg',
    title: 'Monument Valley Star Trails (first frame)',
    author: 'Eric Kilby',
    license: 'CC BY-SA 2.0',
    source: 'https://commons.wikimedia.org/wiki/File:Monument_Valley_Star_Trails_(Video).webm',
  },
};

// Four kinds of sound, six sounds each. Tapping a kind plays its first
// sound (or the one you last chose there); the other five are a tap away.
// Recordings stream and are cached on the phone; BOA's generated tones and
// noise (assets/sounds/zen, sample-exact 16 s loops) are bundled.
export const ZEN_CATEGORIES = [
  {
    id: 'rain',
    label: 'Rain',
    icon: 'rainy-outline',
    // Deep blue, like rain at night.
    tone: '#2F6BFF',
    scene: 'rain',
    sounds: [
      {
        id: 'rain',
        label: 'On the window',
        detail: 'Soft rain on glass',
        uri: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/4/41/Rain_against_the_window.ogg/Rain_against_the_window.ogg.mp3',
        title: 'Rain against the Window',
        author: 'cori',
        license: 'Public domain',
        source: 'https://commons.wikimedia.org/wiki/File:Rain_against_the_window.ogg',
      },
      {
        id: 'rain-calm',
        label: 'Calm rain',
        detail: 'Steady and gentle',
        uri: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/c/cf/Calm_rain.wav/Calm_rain.wav.mp3',
        title: 'Calm rain',
        author: 'Zuvji',
        license: 'CC BY-SA 4.0',
        source: 'https://commons.wikimedia.org/wiki/File:Calm_rain.wav',
      },
      {
        id: 'rain-heavy',
        label: 'Heavy rain',
        detail: 'A summer downpour',
        uri: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/c/cb/Heavy_rain_in_Glenshaw%2C_PA.ogg/Heavy_rain_in_Glenshaw%2C_PA.ogg.mp3',
        title: 'Heavy rain in Glenshaw, PA',
        author: 'Sage Ross',
        license: 'CC BY-SA 3.0',
        source: 'https://commons.wikimedia.org/wiki/File:Heavy_rain_in_Glenshaw,_PA.ogg',
      },
      {
        id: 'rain-leaves',
        label: 'On the leaves',
        detail: 'Rain in the trees',
        uri: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/9/92/Rain_on_leaves_%28Gravity_Sound%29.wav/Rain_on_leaves_%28Gravity_Sound%29.wav.mp3',
        title: 'Rain on leaves',
        author: 'Gravity Sound',
        license: 'CC BY 4.0',
        source: 'https://commons.wikimedia.org/wiki/File:Rain_on_leaves_(Gravity_Sound).wav',
      },
      {
        id: 'rain-storm',
        label: 'Thunderstorm',
        detail: 'Thunder in the woods',
        uri: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/c/ce/Summer_thunderstorm_in_the_woods.ogg/Summer_thunderstorm_in_the_woods.ogg.mp3',
        title: 'Summer thunderstorm in the woods',
        author: 'Serg Childed',
        license: 'CC BY-SA 4.0',
        source: 'https://commons.wikimedia.org/wiki/File:Summer_thunderstorm_in_the_woods.ogg',
      },
      {
        id: 'rain-roof',
        label: 'Canvas roof',
        detail: 'Rain on a soft top',
        uri: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/4/45/Dion-Bouton%2C_regen_op_het_linnen_autodak_-_SoundCloud_-_Beeld_en_Geluid.ogg/Dion-Bouton%2C_regen_op_het_linnen_autodak_-_SoundCloud_-_Beeld_en_Geluid.ogg.mp3',
        title: 'Dion-Bouton, regen op het linnen autodak',
        author: 'Beeld en Geluid',
        license: 'CC BY-SA 3.0',
        source: 'https://commons.wikimedia.org/wiki/File:Dion-Bouton,_regen_op_het_linnen_autodak_-_SoundCloud_-_Beeld_en_Geluid.ogg',
      },
    ],
  },
  {
    id: 'sleep',
    label: 'Deep sleep',
    icon: 'moon-outline',
    // Violet, for the deepest sleep.
    tone: '#8B5CF6',
    scene: 'night',
    sounds: [
      {
        id: 'white-noise',
        label: 'White noise',
        detail: 'Even and bright',
        uri: 'https://archive.org/download/TenMinutesOfWhiteNoisePinkNoiseAndBrownianNoise/WhiteNoise_64kb.mp3',
        title: 'Ten minutes of white noise',
        author: 'Internet Archive community upload',
        license: 'Public domain',
        source: 'https://archive.org/details/TenMinutesOfWhiteNoisePinkNoiseAndBrownianNoise',
      },
      {
        id: 'pink-noise',
        label: 'Pink noise',
        detail: 'Softer, like steady rain',
        asset: require('../../assets/sounds/zen/noise-pink.wav'),
        title: 'Pink noise',
        author: 'BOA Networks',
        license: 'CC0 1.0',
        source: null,
      },
      {
        id: 'brown-noise',
        label: 'Brown noise',
        detail: 'Low, warm rumble',
        uri: 'https://archive.org/download/TenMinutesOfWhiteNoisePinkNoiseAndBrownianNoise/BrownianNoise_64kb.mp3',
        title: 'Ten minutes of Brownian noise',
        author: 'Internet Archive community upload',
        license: 'Public domain',
        source: 'https://archive.org/details/TenMinutesOfWhiteNoisePinkNoiseAndBrownianNoise',
      },
      {
        id: 'deep-brown',
        label: 'Deep brown',
        detail: 'The lowest rumble',
        asset: require('../../assets/sounds/zen/noise-deep.wav'),
        title: 'Deep brown noise',
        author: 'BOA Networks',
        license: 'CC0 1.0',
        source: null,
      },
      {
        id: 'soft-hush',
        label: 'Soft hush',
        detail: 'Pink, with the edge off',
        asset: require('../../assets/sounds/zen/noise-soft.wav'),
        title: 'Soft hush (filtered pink noise)',
        author: 'BOA Networks',
        license: 'CC0 1.0',
        source: null,
      },
      {
        id: 'cabin',
        label: 'Night flight',
        detail: 'A cabin at altitude',
        asset: require('../../assets/sounds/zen/noise-cabin.wav'),
        title: 'Night flight (cabin noise)',
        author: 'BOA Networks',
        license: 'CC0 1.0',
        source: null,
      },
    ],
  },
  {
    id: 'frequencies',
    label: 'Frequencies',
    icon: 'pulse-outline',
    // BOA gold.
    tone: '#E2A84B',
    scene: 'aurora',
    sounds: [
      {
        id: '432hz',
        label: '432 Hz',
        detail: 'Deep healing',
        uri: 'https://archive.org/download/jamendo-621224/01-2292847-Megis-Deep%20Healing%20432Hz%20_1_.mp3',
        title: 'Deep Healing 432Hz (1)',
        author: 'Megis',
        license: 'CC BY 3.0',
        source: 'https://www.jamendo.com/album/621224',
      },
      {
        id: '396hz',
        label: '396 Hz',
        detail: 'Letting go',
        asset: require('../../assets/sounds/zen/tone-396.wav'),
        title: '396 Hz tone',
        author: 'BOA Networks',
        license: 'CC0 1.0',
        source: null,
      },
      {
        id: '417hz',
        label: '417 Hz',
        detail: 'A fresh start',
        asset: require('../../assets/sounds/zen/tone-417.wav'),
        title: '417 Hz tone',
        author: 'BOA Networks',
        license: 'CC0 1.0',
        source: null,
      },
      {
        id: '528hz',
        label: '528 Hz',
        detail: 'Calm and clarity',
        asset: require('../../assets/sounds/zen/tone-528.wav'),
        title: '528 Hz tone',
        author: 'BOA Networks',
        license: 'CC0 1.0',
        source: null,
      },
      {
        id: '639hz',
        label: '639 Hz',
        detail: 'Connection',
        asset: require('../../assets/sounds/zen/tone-639.wav'),
        title: '639 Hz tone',
        author: 'BOA Networks',
        license: 'CC0 1.0',
        source: null,
      },
      {
        id: '741hz',
        label: '741 Hz',
        detail: 'Focus',
        asset: require('../../assets/sounds/zen/tone-741.wav'),
        title: '741 Hz tone',
        author: 'BOA Networks',
        license: 'CC0 1.0',
        source: null,
      },
    ],
  },
  {
    id: 'nature',
    label: 'Nature',
    icon: 'leaf-outline',
    // Firelight.
    tone: '#D9772B',
    scene: 'fire',
    sounds: [
      {
        id: 'campfire',
        label: 'Campfire',
        detail: 'Crackling logs',
        uri: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/b/b1/Campfire_sound_ambience.ogg/Campfire_sound_ambience.ogg.mp3',
        title: 'Campfire sound ambience',
        author: 'Glaneur de sons',
        license: 'CC BY 3.0',
        source: 'https://commons.wikimedia.org/wiki/File:Campfire_sound_ambience.ogg',
      },
      {
        id: 'ocean',
        label: 'Ocean waves',
        detail: 'A tropical shore',
        uri: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/6/64/Ocean_Waves_on_a_Tropical_Beach.ogg/Ocean_Waves_on_a_Tropical_Beach.ogg.mp3',
        title: 'Ocean Waves on a Tropical Beach',
        author: 'Jarrod Stanley',
        license: 'CC0 1.0',
        source: 'https://commons.wikimedia.org/wiki/File:Ocean_Waves_on_a_Tropical_Beach.ogg',
      },
      {
        id: 'stream',
        label: 'Mountain stream',
        detail: 'Water over stones',
        uri: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/5/54/433589_jackthemurray_stream-river-water-up-close.wav/433589_jackthemurray_stream-river-water-up-close.wav.mp3',
        title: 'Stream, river water up close',
        author: 'jackthemurray',
        license: 'CC0 1.0',
        source: 'https://commons.wikimedia.org/wiki/File:433589_jackthemurray_stream-river-water-up-close.wav',
      },
      {
        id: 'birds',
        label: 'Forest birds',
        detail: 'Morning in the trees',
        uri: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/8/8e/Birds_in_mixed_forest.wav/Birds_in_mixed_forest.wav.mp3',
        title: 'Birds in mixed forest',
        author: 'De Auditieve Dienst',
        license: 'CC BY-SA 3.0 NL',
        source: 'https://commons.wikimedia.org/wiki/File:Birds_in_mixed_forest.wav',
      },
      {
        id: 'pond',
        label: 'Pond at dusk',
        detail: 'Frogs and reeds',
        uri: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/f/fe/Nature_sounds_ambience_in_a_Dordogne_pond.ogg/Nature_sounds_ambience_in_a_Dordogne_pond.ogg.mp3',
        title: 'Nature sounds ambience in a Dordogne pond',
        author: 'Glaneur de sons',
        license: 'CC BY 3.0',
        source: 'https://commons.wikimedia.org/wiki/File:Nature_sounds_ambience_in_a_Dordogne_pond.ogg',
      },
      {
        id: 'wind',
        label: 'Coastal wind',
        detail: 'A storm on the hill',
        uri: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/6/63/Killiney_Hill_Storm_Floris_20250804_1537.ogg/Killiney_Hill_Storm_Floris_20250804_1537.ogg.mp3',
        title: 'Killiney Hill, Storm Floris',
        author: 'Karlunun',
        license: 'CC0 1.0',
        source: 'https://commons.wikimedia.org/wiki/File:Killiney_Hill_Storm_Floris_20250804_1537.ogg',
      },
    ],
  },
];

// Every sound, flat, each knowing its kind and room.
export const SOUNDSCAPES = ZEN_CATEGORIES.flatMap((c) => c.sounds.map((s) => ({ ...s, category: c.id, scene: c.scene, tone: c.tone, icon: c.icon })));

export const soundscapeById = (id) => SOUNDSCAPES.find((s) => s.id === id) ?? null;
export const categoryById = (id) => ZEN_CATEGORIES.find((c) => c.id === id) ?? null;
/** The kind a sound belongs to. */
export const categoryOf = (soundId) => categoryById(soundscapeById(soundId)?.category);

// Fade-out timers offered in the hub, in minutes.
export const SLEEP_TIMERS = [15, 30, 45, 60, 90];
