import { Image, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

const ART = 16 / 9;

/**
 * Production key art that is never cropped into: a blurred, darkened copy
 * fills the frame, and the full 16:9 art sits on top in a panel. Used when the
 * art has its title baked in, so any frame shape (tall hero, 2:3 poster)
 * shows the whole title treatment instead of slicing through it.
 *
 * `letterbox` trims black bars baked into the file (fraction of its height
 * at top and bottom). Panel geometry defaults to full width, centred.
 */
export default function KeyArt({
  uri,
  letterbox = 0,
  width,
  height,
  panelWidth = width,
  panelX = (width - panelWidth) / 2,
  panelY,
  backdropStyle,
}) {
  const panelHeight = Math.round(panelWidth / ART);
  const top = panelY ?? Math.round((height - panelHeight) / 2);
  // The file is taller than the art by the bars; size it so the art fills
  // the panel exactly and shift the top bar out of view.
  const fileHeight = panelHeight / (1 - 2 * letterbox);

  return (
    <View style={[StyleSheet.absoluteFill, styles.clip]} pointerEvents="none">
      <Animated.Image source={{ uri }} resizeMode="cover" blurRadius={22} style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]} />
      <View style={[StyleSheet.absoluteFill, styles.dim]} />
      <View style={[styles.panel, { left: panelX, top, width: panelWidth, height: panelHeight }]}>
        <Image
          source={{ uri }}
          resizeMode="cover"
          style={{ position: 'absolute', left: 0, top: -fileHeight * letterbox, width: panelWidth, height: fileHeight }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  // Oversized so the blur's soft edges stay outside the frame.
  backdrop: { transform: [{ scale: 1.15 }] },
  dim: { backgroundColor: 'rgba(5,5,6,0.55)' },
  panel: { position: 'absolute', overflow: 'hidden', boxShadow: '0px 18px 40px rgba(0,0,0,0.55)' },
});
