import { StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';

// Where the baked-in title starts on the square backdrop (fraction of its
// height). Wide crops stop just above it.
export const BACKDROP_TITLE_TOP = 0.6;
const BACKDROP_TITLE_BOTTOM = 0.67;
// Where the baked-in title ends on the 9:16 poster (fraction of its height).
const POSTER_TITLE_BOTTOM = 0.62;

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
 * Returns the image element, whether the art's own title is visible and, if
 * it is, how far down the frame that title ends (`titleBottom`, in pt).
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
  const posterArt = portrait || !production.backdrop;
  if (posterArt && width / height < 9 / 16) {
    // Narrower than the poster (a folded phone's cover screen): `cover`
    // would cut the title at the sides. Fit the poster to the width instead
    // and fill the rest with a blurred copy of itself.
    const artHeight = (width * 16) / 9;
    const top = (height - artHeight) / 2;
    return {
      titleInFrame: !!production.titleInArt,
      titleBottom: production.titleInArt ? top + POSTER_TITLE_BOTTOM * artHeight : null,
      node: (
        <>
          <Animated.Image source={toSource(art)} resizeMode="cover" blurRadius={24} style={[fillFrame, { opacity: 0.55 }]} />
          <Animated.Image
            source={toSource(art)}
            resizeMode="contain"
            style={[{ position: 'absolute', left: 0, top, width, height: artHeight }, animatedStyle]}
          />
        </>
      ),
    };
  }
  if (posterArt) {
    // `cover` scales to the larger of the two fits and centres the overflow.
    const artHeight = Math.max(height, (width * 16) / 9);
    const titleBottom = production.titleInArt && portrait ? (height - artHeight) / 2 + POSTER_TITLE_BOTTOM * artHeight : null;
    return {
      titleInFrame: !!production.titleInArt,
      titleBottom,
      node: <Animated.Image source={toSource(art)} resizeMode="cover" style={[fillFrame, animatedStyle]} />,
    };
  }
  // Square art in a wide frame: cover by width, then slide it up until the
  // visible window ends above the title (never leaving a gap at the top).
  const top = Math.min(0, height - BACKDROP_TITLE_TOP * width);
  const titleInFrame = height > BACKDROP_TITLE_TOP * width;
  return {
    titleInFrame,
    titleBottom: titleInFrame && production.titleInArt ? top + BACKDROP_TITLE_BOTTOM * width : null,
    node: (
      <Animated.Image
        source={toSource(production.backdrop)}
        resizeMode="cover"
        style={[{ position: 'absolute', left: 0, top, width, height: width }, animatedStyle]}
      />
    ),
  };
}
