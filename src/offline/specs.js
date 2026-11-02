import { episodeItem } from '../data/podcasts';

/** What to download for a podcast episode (see offline/downloads.js). */
export function audioSpec(podcast, episode) {
  return {
    id: episode.id,
    kind: 'audio',
    title: episode.title,
    subtitle: podcast.title,
    url: episode.audioUrl,
    image: podcast.artwork ?? null,
    // Enough to play it again without the catalogue: the player item itself.
    meta: { podcastId: podcast.id, episodeNumber: episode.number ?? null, duration: episode.duration ?? null, item: episodeItem(podcast, episode) },
  };
}

/**
 * What to download for an Originals episode. Only an episode published as a
 * file (`videoUrl`) can be saved; one that lives on YouTube cannot, so its
 * `url` is empty and the button says it is streaming only.
 */
export function videoSpec(production, episode) {
  return {
    id: episode.id,
    kind: 'video',
    title: episode.title,
    subtitle: production.title,
    url: episode.videoUrl ?? null,
    image: null,
    meta: { productionId: production.id, episodeId: episode.id },
  };
}
