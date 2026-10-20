import YoutubeIframe from 'react-native-youtube-iframe';

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
