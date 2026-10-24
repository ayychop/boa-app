// The Sleep & Meditation Hub's media: real, openly licensed recordings and
// photographs, streamed from Wikimedia Commons and the Internet Archive.
// Every entry keeps its licence, author and source page, and the hub shows
// them under "Credits" (CC BY needs the attribution; the rest get it anyway).
//
// Wikimedia refuses requests that carry OkHttp's default User-Agent (HTTP
// 403), which is what Android's image loader and downloads send unless told
// otherwise, so every media request sends this one.
export const MEDIA_HEADERS = { 'User-Agent': 'BOANetworks/1.0 (Android; +https://boanetworks.com)' };

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
      uri: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/c/c5/Alaskan_Aurora_Time_Lapse_%28SVS15077%29.webm/Alaskan_Aurora_Time_Lapse_%28SVS15077%29.webm.480p.vp9.webm',
      ios: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/c/c5/Alaskan_Aurora_Time_Lapse_%28SVS15077%29.webm/Alaskan_Aurora_Time_Lapse_%28SVS15077%29.webm.360p.mpeg4.mov',
      title: 'Alaskan Aurora Time Lapse',
      author: "NASA's Scientific Visualization Studio / Mike Toillion",
      license: 'Public domain',
      source: 'https://commons.wikimedia.org/wiki/File:Alaskan_Aurora_Time_Lapse_(SVS15077).webm',
    },
    uri: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/64/Starry_sky_foggy_night_%28Unsplash%29.jpg/1280px-Starry_sky_foggy_night_%28Unsplash%29.jpg',
    title: 'Starry sky foggy night',
    author: 'Martin Sattler',
    license: 'CC0 1.0',
    source: 'https://commons.wikimedia.org/wiki/File:Starry_sky_foggy_night_(Unsplash).jpg',
  },
};

export const SOUNDSCAPES = [
  {
    id: 'rain',
    label: 'Rain',
    detail: 'On the window',
    icon: 'rainy-outline',
    scene: 'rain',
    uri: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/4/41/Rain_against_the_window.ogg/Rain_against_the_window.ogg.mp3',
    title: 'Rain against the Window',
    author: 'cori',
    license: 'Public domain',
    source: 'https://commons.wikimedia.org/wiki/File:Rain_against_the_window.ogg',
  },
  {
    id: 'white-noise',
    label: 'Deep sleep',
    detail: 'White noise',
    icon: 'moon-outline',
    scene: 'night',
    uri: 'https://archive.org/download/TenMinutesOfWhiteNoisePinkNoiseAndBrownianNoise/WhiteNoise_64kb.mp3',
    title: 'Ten minutes of white noise',
    author: 'Internet Archive community upload',
    license: 'Public domain',
    source: 'https://archive.org/details/TenMinutesOfWhiteNoisePinkNoiseAndBrownianNoise',
  },
  {
    id: '432hz',
    label: '432 Hz',
    detail: 'Meditation frequency',
    icon: 'pulse-outline',
    scene: 'night',
    uri: 'https://archive.org/download/jamendo-621224/01-2292847-Megis-Deep%20Healing%20432Hz%20_1_.mp3',
    title: 'Deep Healing 432Hz (1)',
    author: 'Megis',
    license: 'CC BY 3.0',
    source: 'https://www.jamendo.com/album/621224',
  },
  {
    id: 'brown-noise',
    label: 'Brown noise',
    detail: 'Low, warm rumble',
    icon: 'water-outline',
    scene: 'night',
    uri: 'https://archive.org/download/TenMinutesOfWhiteNoisePinkNoiseAndBrownianNoise/BrownianNoise_64kb.mp3',
    title: 'Ten minutes of Brownian noise',
    author: 'Internet Archive community upload',
    license: 'Public domain',
    source: 'https://archive.org/details/TenMinutesOfWhiteNoisePinkNoiseAndBrownianNoise',
  },
];

export const soundscapeById = (id) => SOUNDSCAPES.find((s) => s.id === id) ?? null;

// Fade-out timers offered in the hub, in minutes.
export const SLEEP_TIMERS = [15, 30, 45, 60, 90];
