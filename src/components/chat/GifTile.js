import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Text from '../ScopedText';
import { requireOptionalNativeModule } from 'expo';
import { isGifUrl } from '../../chat/gifs';
import { colors, fonts, radius } from '../../theme';

// Builds made before expo-image was added don't have it; a GIF needs it to move.
const Image = requireOptionalNativeModule('ExpoImage') ? require('expo-image').Image : null;

const MAX_W = 250;
const MAX_H = 320;

/** The size a GIF is laid out at before it loads: its own shape, inside the thread's limits. */
export function gifSize(width, height, limit = MAX_W) {
  const w = Number(width) > 0 ? Number(width) : 200;
  const h = Number(height) > 0 ? Number(height) : 200;
  const scale = Math.min(Math.min(limit, MAX_W) / w, MAX_H / h);
  return { width: Math.max(80, Math.round(w * scale)), height: Math.max(80, Math.round(h * scale)) };
}

/** A GIF in the thread: rounded, its own shape, a soft placeholder until it loads. */
export default function GifTile({ message, maxWidth }) {
  const [failed, setFailed] = useState(false);
  const size = gifSize(message.media_width, message.media_height, maxWidth ?? MAX_W);
  const ok = isGifUrl(message.body) && Image && !failed;
  return (
    <View style={[styles.box, size]} accessible accessibilityRole="image" accessibilityLabel="GIF" testID="gif-tile">
      {ok ? (
        <Image source={{ uri: message.body }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="disk" autoplay transition={160} onError={() => setFailed(true)} />
      ) : (
        <View style={styles.missing}>
          <Text style={styles.missingText}>GIF</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: radius.lg, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.07)' },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  missingText: { fontFamily: fonts.chatBold, fontSize: 14, color: colors.textFaint },
});
