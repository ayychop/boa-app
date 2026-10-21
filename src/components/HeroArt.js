import { StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';

// Where the baked-in title starts on the square backdrop (fraction of its
// height). Wide crops stop just above it.
const BACKDROP_TITLE_TOP = 0.6;

export const toSource = (art) => (typeof art === 'string' ? { uri: art } : art ?? null);

// Local require() images carry their pixel size, which react-native-web uses
// as the default width/height unless the style sets one; absoluteFill alone
// would render a 1440x2560 image at full size and show only its corner.
export const fillFrame = [StyleSheet.absoluteFill, { width: '100%', height: '100%' }];

/**
 * Full-bleed key art for a hero-sized frame, always `cover`.
 *
 * - Portrait frames (phones) use the 9:16 poster: it fills almost exactly and
 *   shows the whole title treatment, so `titleInFrame` is true.
 * - Landscape frames use the square backdrop, framed on the street scene with
 *   the baked-in title (and the logos under it) just out of frame, so the
 *   screen sets its own title over it.
 *
 * Returns the image element plus whether the art's own title is visible.
 */
export function heroArt(production, width, height, animatedStyle) {
  const portrait = width < height;
  const art = portrait ? production.poster ?? production.backdrop : production.backdrop ?? production.poster;

  if (!art) {
    return {
      titleInFrame: false,
      node: <Animated.Image source={toSource(production.image)} resizeMode="cover" style={[fillFrame, animatedStyle]} />,
    };
  }
  if (portrait || !production.backdrop) {
    return {
      titleInFrame: !!production.titleInArt,
      node: <Animated.Image source={toSource(art)} resizeMode="cover" style={[fillFrame, animatedStyle]} />,
    };
  }
  // Square art in a wide frame: cover by width, then slide it up until the
  // visible window ends above the title (never leaving a gap at the top).
  const top = Math.min(0, height - BACKDROP_TITLE_TOP * width);
  return {
    titleInFrame: height > BACKDROP_TITLE_TOP * width,
    node: (
      <Animated.Image
        source={toSource(production.backdrop)}
        resizeMode="cover"
        style={[{ position: 'absolute', left: 0, top, width, height: width }, animatedStyle]}
      />
    ),
  };
}
