import { View } from 'react-native';

// Web: plain HTML5 <video> for direct files (MP4/WebM/HLS-capable browsers).
// Native resolves VideoPlayer.native.js.
export default function VideoPlayer({ uri, poster, width, height }) {
  return (
    <View style={{ width, height, backgroundColor: '#000' }}>
      <video
        src={uri}
        poster={poster || undefined}
        controls
        autoPlay
        playsInline
        style={{ width: '100%', height: '100%', display: 'block', background: '#000' }}
      />
    </View>
  );
}
