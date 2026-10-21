import { View } from 'react-native';

// Web: a privacy-enhanced YouTube embed, as boanetworks.com uses.
// Native resolves YouTubePlayer.native.js (react-native-youtube-iframe).
// YouTube refuses to configure an embed that can't tell which site it's on
// ("Error 153"). A page served with `Referrer-Policy: no-referrer` or
// `same-origin` (common behind proxies and port-forwarders) strips that, so
// the iframe sets its own policy, which overrides the page's for this
// request, and passes the origin explicitly as well.
export default function YouTubePlayer({ videoId, width, height, autoplay = true }) {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const params = new URLSearchParams({
    autoplay: autoplay ? '1' : '0',
    rel: '0',
    modestbranding: '1',
    playsinline: '1',
    enablejsapi: '1',
    origin,
    widget_referrer: origin,
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
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </View>
  );
}
