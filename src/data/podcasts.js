// BOA Podcasts: real, English-language shows on mindset, mood, self-love,
// motivation, conspiracies and technology.
//
// Episodes are the shows' own published audio, taken from each public RSS
// feed (found via the Apple Podcasts directory) on 2026-10-21: the latest
// full-length episodes (no trailers or clips under 5 minutes). Every audio
// URL was confirmed to serve audio/mpeg and to load in a browser, and every
// show's feed is marked English and not explicit. Cover art is each show's
// own artwork from the directory.
//
// `sample: true` on an episode marks placeholder audio (e.g. a LibriVox
// reading); the player labels those "Sample Episode". None are needed now.
// TODO: refresh episodes from `feed` periodically (or fetch at runtime via a
// small server, since most feeds don't allow browser CORS).

export const podcasts = [
  {
    id: "the-mindset-mentor",
    title: "The Mindset Mentor",
    author: "Rob Dial",
    category: "Mindset",
    tagline: "Short, practical episodes on mindset, habits and building the life you want.",
    artwork: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts221/v4/c5/3f/5a/c53f5af0-c80f-33d2-d6d9-4b06ce6ef201/mza_13907836517287185196.jpg/600x600bb.jpg",
    feed: "https://feeds.simplecast.com/rpKQEwel",
    palette: ["#F09D0D", "#302108"],
    cover: "serif",
    episodes: [
      { id: "the-mindset-mentor-1", number: 3, title: "How to build a future you actually want", duration: 1206, audioUrl: "https://stitcher.simplecastaudio.com/9299aa39-5f7c-4acf-bc53-4fd18b421982/episodes/7253bc80-6581-424a-9982-3546048d642c/audio/128/default.mp3?aid=rss_feed&awCollectionId=9299aa39-5f7c-4acf-bc53-4fd18b421982&awEpisodeId=7253bc80-6581-424a-9982-3546048d642c&feed=rpKQEwel" },
      { id: "the-mindset-mentor-2", number: 2, title: "7 Habits That Changed My Life After 30", duration: 939, audioUrl: "https://stitcher.simplecastaudio.com/9299aa39-5f7c-4acf-bc53-4fd18b421982/episodes/0275c94d-6b43-4b08-8bb5-04ccd5ef4a21/audio/128/default.mp3?aid=rss_feed&awCollectionId=9299aa39-5f7c-4acf-bc53-4fd18b421982&awEpisodeId=0275c94d-6b43-4b08-8bb5-04ccd5ef4a21&feed=rpKQEwel" },
      { id: "the-mindset-mentor-3", number: 1, title: "How to Spot a Narcissist", duration: 1086, audioUrl: "https://stitcher.simplecastaudio.com/9299aa39-5f7c-4acf-bc53-4fd18b421982/episodes/82ec457f-9e84-477d-a8fb-d8a0b2e65fc7/audio/128/default.mp3?aid=rss_feed&awCollectionId=9299aa39-5f7c-4acf-bc53-4fd18b421982&awEpisodeId=82ec457f-9e84-477d-a8fb-d8a0b2e65fc7&feed=rpKQEwel" },
    ],
  },
  {
    id: "the-happiness-lab",
    title: "The Happiness Lab",
    author: "Dr. Laurie Santos",
    category: "Mood Boosters",
    tagline: "A Yale psychologist on the science of feeling better, one habit at a time.",
    artwork: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts211/v4/67/02/d7/6702d7b4-5dff-4a0a-8e91-54be0a8a7660/mza_15418537704194950179.jpg/600x600bb.jpg",
    feed: "https://www.omnycontent.com/d/playlist/e73c998e-6e60-432f-8610-ae210140c5b1/96c5c41e-0bc8-4661-b184-ae32006cd726/d623ef0b-3fee-4c26-b815-ae32006cd739/podcast.rss",
    palette: ["#D9F547", "#293008"],
    cover: "serif",
    episodes: [
      { id: "the-happiness-lab-1", number: 3, title: "Why Happiness Experts Still Struggle to Be Happy with Dr. Ethan Kross", duration: 3167, audioUrl: "https://pdrl.fm/e76c46/podtrac.com/pts/redirect.mp3/pscrb.fm/rss/p/tracking.swap.fm/track/SxlTEPDY7xDg35RXkASs/traffic.omny.fm/d/clips/e73c998e-6e60-432f-8610-ae210140c5b1/96c5c41e-0bc8-4661-b184-ae32006cd726/8cb1910d-ce4a-41cb-a219-b4e800146a2a/audio.mp3?utm_source=Podcast&in_playlist=d623ef0b-3fee-4c26-b815-ae32006cd739" },
      { id: "the-happiness-lab-2", number: 2, title: "What Gets Lost When We Text Instead of Talk with Dr. Nick Epley", duration: 2699, audioUrl: "https://pdrl.fm/e76c46/podtrac.com/pts/redirect.mp3/pscrb.fm/rss/p/tracking.swap.fm/track/SxlTEPDY7xDg35RXkASs/traffic.omny.fm/d/clips/e73c998e-6e60-432f-8610-ae210140c5b1/96c5c41e-0bc8-4661-b184-ae32006cd726/fd14e389-8e82-48ae-b4fe-b4de00f1ef28/audio.mp3?utm_source=Podcast&in_playlist=d623ef0b-3fee-4c26-b815-ae32006cd739" },
      { id: "the-happiness-lab-3", number: 1, title: "Finding the Magic in Everyday Life with Thoreau and Eric Weiner", duration: 2029, audioUrl: "https://pdrl.fm/e76c46/podtrac.com/pts/redirect.mp3/pscrb.fm/rss/p/tracking.swap.fm/track/SxlTEPDY7xDg35RXkASs/traffic.omny.fm/d/clips/e73c998e-6e60-432f-8610-ae210140c5b1/96c5c41e-0bc8-4661-b184-ae32006cd726/8ad77115-72d1-4faa-a4f1-b4d7013cf0aa/audio.mp3?utm_source=Podcast&in_playlist=d623ef0b-3fee-4c26-b815-ae32006cd739" },
    ],
  },
  {
    id: "the-self-love-club",
    title: "The Self-Love Club",
    author: "Bel Crawford",
    category: "Self-Love",
    tagline: "Honest conversations about self-worth, mental health and being kinder to yourself.",
    artwork: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts115/v4/a6/4b/1f/a64b1f04-845a-5b3d-27dd-ec9c750ecea0/mza_605019204600654337.png/600x600bb.jpg",
    feed: "https://feeds.acast.com/public/shows/62c384b821f14c00123d0029",
    palette: ["#F20DC5", "#300828"],
    cover: "serif",
    episodes: [
      { id: "the-self-love-club-1", number: 3, title: "Life updates: Surprise! I'm having a baby! (and other updates)", duration: 1479, audioUrl: "https://sphinx.acast.com/p/open/s/62c384b821f14c00123d0029/e/66e151527fb05edbd0b93880/media.mp3" },
      { id: "the-self-love-club-2", number: 2, title: "Ask a Psychotherapist (re-release)", duration: 2696, audioUrl: "https://sphinx.acast.com/p/open/s/62c384b821f14c00123d0029/e/664ab19b67992a0012a3ce1c/media.mp3" },
      { id: "the-self-love-club-3", number: 1, title: "Normalising conversations about mental health with Mitch James", duration: 2936, audioUrl: "https://sphinx.acast.com/p/open/s/62c384b821f14c00123d0029/e/662dc4bb3bcafa001231c5b0/media.mp3" },
    ],
  },
  {
    id: "the-daily-stoic",
    title: "The Daily Stoic",
    author: "Ryan Holiday",
    category: "Motivation",
    tagline: "Daily lessons from Stoic philosophy for discipline, focus and resilience.",
    artwork: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts211/v4/00/4b/cd/004bcd1b-3036-86ae-2394-e3ac6798cace/mza_2488584016134530967.jpeg/600x600bb.jpg",
    feed: "https://feeds.acast.com/public/shows/6abacdd76ffb28f8d6775e00",
    palette: ["#EC4E55", "#30080A"],
    cover: "serif",
    episodes: [
      { id: "the-daily-stoic-1", number: 3, title: "It Started Small (Who Would Imagine It Would Make This Far?) | Matt Choi’s Daily Stoic Practice", duration: 705, audioUrl: "https://sphinx.acast.com/p/open/s/6abacdd76ffb28f8d6775e00/e/6ad65bdef3cdf8b6c87ecab2/media.mp3" },
      { id: "the-daily-stoic-2", number: 2, title: "This is How You Die Before Your Time", duration: 800, audioUrl: "https://sphinx.acast.com/p/open/s/6abacdd76ffb28f8d6775e00/e/6ad530aede67d865c16a2384/media.mp3" },
      { id: "the-daily-stoic-3", number: 1, title: "The Top 10 Most Popular Passages From The Daily Stoic", duration: 1105, audioUrl: "https://sphinx.acast.com/p/open/s/6abacdd76ffb28f8d6775e00/e/6ad23b1cb42995f876be68f3/media.mp3" },
    ],
  },
  {
    id: "hidden-brain",
    title: "Hidden Brain",
    author: "Shankar Vedantam",
    category: "Mind & Behaviour",
    tagline: "The unconscious patterns that drive how we think, feel and choose.",
    artwork: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts221/v4/e2/18/b8/e218b838-b790-3a33-441f-c3772d9abbbf/mza_6896085647855199484.jpg/600x600bb.jpg",
    feed: "https://feeds.simplecast.com/kwWc0lhf",
    palette: ["#2758CE", "#09142F"],
    cover: "serif",
    episodes: [
      { id: "hidden-brain-1", number: 3, title: "Do You Have Trouble Sleeping?", duration: 5442, audioUrl: "https://mgln.ai/e/2/dts.podtrac.com/redirect.mp3/stitcher.simplecastaudio.com/df179a36-a022-41e3-bf7c-b7a4efc6f51e/episodes/4316fd53-1cac-4e04-ae81-44caa56d6c76/audio/128/default.mp3?aid=rss_feed&awCollectionId=df179a36-a022-41e3-bf7c-b7a4efc6f51e&awEpisodeId=4316fd53-1cac-4e04-ae81-44caa56d6c76&feed=kwWc0lhf" },
      { id: "hidden-brain-2", number: 2, title: "Why Am I Unhappy?", duration: 5639, audioUrl: "https://mgln.ai/e/2/dts.podtrac.com/redirect.mp3/stitcher.simplecastaudio.com/df179a36-a022-41e3-bf7c-b7a4efc6f51e/episodes/99f68276-72af-4365-90ea-c300b48bd191/audio/128/default.mp3?aid=rss_feed&awCollectionId=df179a36-a022-41e3-bf7c-b7a4efc6f51e&awEpisodeId=99f68276-72af-4365-90ea-c300b48bd191&feed=kwWc0lhf" },
      { id: "hidden-brain-3", number: 1, title: "When Bad Things Happen to Good People", duration: 5542, audioUrl: "https://mgln.ai/e/2/dts.podtrac.com/redirect.mp3/stitcher.simplecastaudio.com/df179a36-a022-41e3-bf7c-b7a4efc6f51e/episodes/2c5ab0a6-9726-4927-8374-88d6d7af0383/audio/128/default.mp3?aid=rss_feed&awCollectionId=df179a36-a022-41e3-bf7c-b7a4efc6f51e&awEpisodeId=2c5ab0a6-9726-4927-8374-88d6d7af0383&feed=kwWc0lhf" },
    ],
  },
  {
    id: "stuff-they-dont-want-you-to-know",
    title: "Stuff They Don't Want You To Know",
    author: "iHeartPodcasts",
    category: "Conspiracies",
    tagline: "Conspiracy theories and strange news, examined with healthy scepticism.",
    artwork: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts221/v4/b3/f6/d7/b3f6d733-0924-1923-d33e-c0e0a8b6486d/mza_12499946169636574274.jpg/600x600bb.jpg",
    feed: "https://www.omnycontent.com/d/playlist/e73c998e-6e60-432f-8610-ae210140c5b1/2e824128-fbd5-4c9e-9a57-ae2f0056b0c4/66d98a23-900c-44b0-a40b-ae2f0056b0db/podcast.rss",
    palette: ["#ED0D0D", "#300808"],
    cover: "serif",
    episodes: [
      { id: "stuff-they-dont-want-you-to-know-1", number: 3, title: "CLASSIC: What is the Jersey Devil?", duration: 3737, audioUrl: "https://podtrac.com/pts/redirect.mp3/traffic.omny.fm/d/clips/e73c998e-6e60-432f-8610-ae210140c5b1/2e824128-fbd5-4c9e-9a57-ae2f0056b0c4/85d323ff-aa32-40a1-af31-b4e801513b90/audio.mp3?utm_source=Podcast&in_playlist=66d98a23-900c-44b0-a40b-ae2f0056b0db" },
      { id: "stuff-they-dont-want-you-to-know-2", number: 2, title: "Strange News: Russian Plague, New Dinosaurs, Bank of America and More", duration: 3501, audioUrl: "https://podtrac.com/pts/redirect.mp3/traffic.omny.fm/d/clips/e73c998e-6e60-432f-8610-ae210140c5b1/2e824128-fbd5-4c9e-9a57-ae2f0056b0c4/6235a414-916d-4b3e-861d-b4e80101559c/audio.mp3?utm_source=Podcast&in_playlist=66d98a23-900c-44b0-a40b-ae2f0056b0db" },
      { id: "stuff-they-dont-want-you-to-know-3", number: 1, title: "October Surprise: A Live Q&A on Virgin Voyages", duration: 1970, audioUrl: "https://podtrac.com/pts/redirect.mp3/traffic.omny.fm/d/clips/e73c998e-6e60-432f-8610-ae210140c5b1/2e824128-fbd5-4c9e-9a57-ae2f0056b0c4/5cd9c633-a242-481d-8a5a-b4e5013f8f32/audio.mp3?utm_source=Podcast&in_playlist=66d98a23-900c-44b0-a40b-ae2f0056b0db" },
    ],
  },
  {
    id: "hard-fork",
    title: "Hard Fork",
    author: "The New York Times",
    category: "Technology",
    tagline: "Kevin Roose and Casey Newton on the fast-moving future of tech and A.I.",
    artwork: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts221/v4/de/c5/20/dec52092-6be0-9007-875c-6aa8e690a905/mza_12490014444602578825.jpg/600x600bb.jpg",
    feed: "https://feeds.simplecast.com/6HKOhNgS",
    palette: ["#EEF42A", "#2F3008"],
    cover: "serif",
    episodes: [
      { id: "hard-fork-1", number: 2, title: "Why No One Can Look Away From Elizabeth Holmes", duration: 4035, audioUrl: "https://dts.podtrac.com/redirect.mp3/pdst.fm/e/pfx.vpixl.com/6qj4J/pscrb.fm/rss/p/tracking.swap.fm/track/4jdbJYYRKqK96EGqOzQb/nyt.simplecastaudio.com/3e43d072-f8a5-430f-bc8e-4c70aafdf3c7/episodes/5bac6bdc-16f3-4aed-b41d-01192f69dae9/audio/128/default.mp3?aid=rss_feed&awCollectionId=3e43d072-f8a5-430f-bc8e-4c70aafdf3c7&awEpisodeId=5bac6bdc-16f3-4aed-b41d-01192f69dae9&feed=6HKOhNgS" },
      { id: "hard-fork-2", number: 1, title: "Anthropic’s Quest to Give A.I. Morals", duration: 2660, audioUrl: "https://dts.podtrac.com/redirect.mp3/pdst.fm/e/pfx.vpixl.com/6qj4J/pscrb.fm/rss/p/tracking.swap.fm/track/4jdbJYYRKqK96EGqOzQb/nyt.simplecastaudio.com/3e43d072-f8a5-430f-bc8e-4c70aafdf3c7/episodes/05ad1bfb-bd47-4120-a5fa-98c2f4787a3d/audio/128/default.mp3?aid=rss_feed&awCollectionId=3e43d072-f8a5-430f-bc8e-4c70aafdf3c7&awEpisodeId=05ad1bfb-bd47-4120-a5fa-98c2f4787a3d&feed=6HKOhNgS" },
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
    duration: episode.duration,
    logo: podcast.artwork ?? null,
    podcastId: podcast.id,
    episodeNumber: episode.number,
  };
}

export const podcastById = (id) => podcasts.find((p) => p.id === id);
