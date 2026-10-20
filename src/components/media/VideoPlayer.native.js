import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '../../theme';

// TODO(native): swap this placeholder for react-native-video, e.g.
//   import Video from 'react-native-video';
//   <Video source={{ uri }} poster={poster} controls resizeMode="contain"
//          style={{ width, height }} />
// (needs a development build). BOA's current episodes are on YouTube and play
// through YouTubePlayer, so this path only matters once direct files exist.
export default function VideoPlayer({ width, height }) {
  return (
    <View style={[styles.box, { width, height }]}>
      <Text style={styles.text}>Native video playback arrives with react-native-video.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#000', padding: 24 },
  text: { fontFamily: fonts.medium, color: colors.textMuted, textAlign: 'center' },
});
