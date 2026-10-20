import { View } from 'react-native';

// Web: a privacy-enhanced YouTube embed, as boanetworks.com uses.
// Native resolves YouTubePlayer.native.js (react-native-youtube-iframe).
export default function YouTubePlayer({ videoId, width, height, autoplay = true }) {
  const params = new URLSearchParams({
    autoplay: autoplay ? '1' : '0',
    rel: '0',
    modestbranding: '1',
    playsinline: '1',
  });
  return (
    <View style={{ width, height, backgroundColor: '#000' }}>
      <iframe
        title="BOA Network video"
        src={`https://www.youtube-nocookie.com/embed/${videoId}?${params}`}
        width="100%"
        height="100%"
        style={{ border: 0, display: 'block' }}
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
      />
    </View>
  );
}
