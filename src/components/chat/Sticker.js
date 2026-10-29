import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import { stickerUrl } from '../../chat/stickers';

// Builds made before expo-image was added don't have it: plain emoji there.
const Image = requireOptionalNativeModule('ExpoImage') ? require('expo-image').Image : null;

/**
 * One animated emoji. The plain emoji shows straight away and the
 * animation fades in over it once it's loaded (or stays plain offline).
 */
export default function Sticker({ emoji, size = 32, animate = true, style, testID }) {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <View style={[{ width: size, height: size }, styles.box, style]} testID={testID} accessible accessibilityLabel={emoji}>
      {!ready ? (
        <Text style={{ fontSize: size * 0.78, lineHeight: size, textAlign: 'center' }} allowFontScaling={false}>
          {emoji}
        </Text>
      ) : null}
      {Image && animate && !failed ? (
        <Image
          source={{ uri: stickerUrl(emoji) }}
          style={StyleSheet.absoluteFill}
          contentFit="contain"
          cachePolicy="disk"
          transition={120}
          autoplay
          recyclingKey={emoji}
          onLoad={() => setReady(true)}
          onError={() => setFailed(true)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center' },
});
