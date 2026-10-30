import Svg, { Path, Rect } from 'react-native-svg';

// The GIF button's icon, drawn as a picture rather than set as text: a rounded
// tag with G, I and F in it, the letters on the tag's exact centre line and a
// stroke apart from its edge, so no font's padding can clip them.
//
// Drawn on a 36 x 24 grid: the tag fills it (1 in from each edge for the
// stroke); the letters are 9 tall, from y 7.5 to y 16.5; G, I and F are laid
// out so the three together are centred on x 18.

/** @param {{ size?: number, color?: string, testID?: string }} props size is the height in points. */
export default function GifIcon({ size = 24, color = '#fff', testID }) {
  const stroke = 2;
  return (
    <Svg width={(size * 36) / 24} height={size} viewBox="0 0 36 24" testID={testID} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Rect x={1.25} y={1.25} width={33.5} height={21.5} rx={6.5} fill="none" stroke={color} strokeWidth={1.8} />
      {/* G: an open ring with its bar. */}
      <Path d="M14.15 9.11 A4.5 4.5 0 1 0 15.2 12 L11.8 12" fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" />
      {/* I */}
      <Path d="M19.6 7.8 L19.6 16.2" fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" />
      {/* F */}
      <Path d="M24.2 16.2 L24.2 7.8 L29.6 7.8 M24.2 11.8 L28.6 11.8" fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
