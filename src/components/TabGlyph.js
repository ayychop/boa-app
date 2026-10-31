import Svg, { Circle, Defs, G, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

// The bottom bar's icons, drawn for BOA rather than borrowed: one family on
// a 24 grid, a fine 1.6 line with round ends, each with a single signature
// detail (the arched door, the film strip's sprockets, the broadcast arcs,
// the speech dots, the spotlit pair, the moon and its spark, the portrait).
//
// At rest they are line drawings. Active, the body fills with a veil of BOA
// gold and the detail strokes stay crisp, so the selected tab reads as lit,
// not just recoloured. The glow is the glyph's own halo (the same drawing, thickened and
// faint, so it follows the shape) plus TabGlow's edgeless bloom behind it.
// Nothing circular is ever drawn around an icon.

const VEIL = 'rgba(226,168,75,0.22)';
const HALO = '#F6D38A';

const GLYPHS = {
  // A house with an arched door.
  Home: (fill, halo) => (
    <>
      <Path d="M4 10.9 12 4l8 6.9V19a1.6 1.6 0 0 1-1.6 1.6h-3.7v-4.9a2.7 2.7 0 0 0-5.4 0v4.9H5.6A1.6 1.6 0 0 1 4 19z" fill={fill} />
    </>
  ),
  // A film frame with its sprocket rails and a play mark.
  Originals: (fill, halo) => (
    <>
      <Rect x={3.5} y={4.5} width={17} height={15} rx={3.2} fill={fill} />
      <Path d="M7.6 4.5v15M16.4 4.5v15" />
      {!halo && <Path d="M10.7 9.7v4.6l3.7-2.3z" fill="currentColor" stroke="none" />}
    </>
  ),
  // A tuner: the set, its aerial, the speaker and the dial lines.
  Radio: (fill, halo) => (
    <>
      <Path d="M7.2 9.2 16.6 3.8" />
      <Rect x={3} y={9} width={18} height={11.4} rx={3} fill={fill} />
      <Circle cx={8.6} cy={14.7} r={2.5} />
      <Path d="M14 13.2h4M14 16.2h4" />
    </>
  ),
  // A speech bubble with three dots.
  Chat: (fill, halo) => (
    <>
      <Path d="M12 4C7.6 4 4 7.1 4 11c0 2.1.9 3.9 2.5 5.2l-.6 3.3a.5.5 0 0 0 .7.5l3.2-1.7c.6.1 1.3.2 2 .2 4.4 0 8-3.1 8-7S16.4 4 12 4z" fill={fill} />
      {!halo && (
        <G fill="currentColor" stroke="none">
          <Circle cx={8.6} cy={11.2} r={1} />
          <Circle cx={12} cy={11.2} r={1} />
          <Circle cx={15.4} cy={11.2} r={1} />
        </G>
      )}
    </>
  ),
  // Two people in the spotlight: the one in front, and one behind.
  Talent: (fill, halo) => (
    <>
      <Circle cx={9} cy={8.4} r={3.1} fill={fill} />
      <Path d="M3.4 19.8c.5-3.3 2.9-5.1 5.6-5.1s5.1 1.8 5.6 5.1" fill={fill} />
      <Path d="M15.2 5.6a2.7 2.7 0 1 1 .9 5.1" />
      <Path d="M16.2 14.9c2.2.3 4 1.8 4.4 4.9" />
    </>
  ),
  // A crescent moon with a spark.
  Zen: (fill, halo) => (
    <>
      <Path d="M19.6 14.5A8 8 0 0 1 9.5 4.4a8 8 0 1 0 10.1 10.1z" fill={fill} />
      <Path d="M17.2 3.6v3.6M15.4 5.4H19" />
    </>
  ),
  // A portrait.
  Profile: (fill, halo) => (
    <>
      <Circle cx={12} cy={8.2} r={3.7} fill={fill} />
      <Path d="M4.6 20c.6-3.9 3.7-6.1 7.4-6.1s6.8 2.2 7.4 6.1" fill={fill} />
    </>
  ),
};

/**
 * @param {{ name: keyof typeof GLYPHS, size?: number, color: string, focused?: boolean }} props
 * color is the tab's tint (gold when active, faint when not).
 */
export default function TabGlyph({ name, size = 28, color, focused = false }) {
  const glyph = GLYPHS[name] ?? GLYPHS.Home;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} color={color} strokeWidth={focused ? 1.7 : 1.55} strokeLinecap="round" strokeLinejoin="round" testID={`tab-glyph-${name}`}>
      {focused ? (
        <>
          {/* The glow, following the drawing itself: two faint, fat passes. */}
          <G stroke={HALO} strokeOpacity={0.16} strokeWidth={5.2} testID={`tab-glyph-halo-${name}`}>
            {glyph('none', true)}
          </G>
          <G stroke={HALO} strokeOpacity={0.3} strokeWidth={3}>
            {glyph('none', true)}
          </G>
        </>
      ) : null}
      {glyph(focused ? VEIL : 'none', false)}
    </Svg>
  );
}

export const TAB_GLYPHS = Object.keys(GLYPHS);

/** The active tab's bloom: a radial gold fade with no edge (nothing to outline). */
export function TabGlow({ width, height }) {
  return (
    <Svg width={width} height={height} pointerEvents="none">
      <Defs>
        <RadialGradient id="tab-glow" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#F6D38A" stopOpacity={0.4} />
          <Stop offset="0.5" stopColor="#E2A84B" stopOpacity={0.16} />
          <Stop offset="1" stopColor="#E2A84B" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect width={width} height={height} fill="url(#tab-glow)" />
    </Svg>
  );
}
