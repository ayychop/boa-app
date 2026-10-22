import TrackPlayer from 'react-native-track-player';
import playbackService from './service.native';

// Must run at the entry point, before the app mounts, so the headless service
// exists when Android starts it. Guarded so a native module failure degrades
// to "no background audio" instead of taking down the whole app on launch.
try {
  TrackPlayer.registerPlaybackService(() => playbackService);
} catch (err) {
  console.warn('TrackPlayer.registerPlaybackService failed', err);
}
