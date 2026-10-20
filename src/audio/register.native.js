import TrackPlayer from 'react-native-track-player';
import playbackService from './service.native';

TrackPlayer.registerPlaybackService(() => playbackService);
