import YoutubeIframe from 'react-native-youtube-iframe';

// The library hosts its player page on a real https origin by default (no
// useLocalHTML), which gives YouTube the referrer it needs; a local HTML
// player in a WebView is what triggers Error 153 on native.

export default function YouTubePlayer({ videoId, width, height, autoplay = true }) {
  return (
    <YoutubeIframe
      videoId={videoId}
      width={width}
      height={height}
      play={autoplay}
      webViewProps={{ allowsInlineMediaPlayback: true }}
      initialPlayerParams={{ rel: false, modestbranding: true }}
    />
  );
}
