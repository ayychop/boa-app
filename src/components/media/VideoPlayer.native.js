import { View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';

// A direct video file, played by expo-video: a downloaded episode (a file://
// on the phone, so it plays in Flight Mode) or an episode published as a file.
// Starts playing when it opens, with the system's own controls. Mount it with
// a `key` of the file so a different file starts fresh.
export default function VideoPlayer({ uri, width, height }) {
  const player = useVideoPlayer({ uri }, (p) => {
    p.loop = false;
    p.play();
  });
  return (
    <View style={{ width, height, backgroundColor: '#000' }}>
      <VideoView player={player} nativeControls contentFit="contain" allowsFullscreen allowsPictureInPicture={false} style={{ width: '100%', height: '100%' }} testID="screening-video" />
    </View>
  );
}
