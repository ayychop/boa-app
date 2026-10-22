import { useId } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';

// Soft puffs of smoke on a 100x100 board that is stretched to whatever frame
// it sits in, so it always fills it edge to edge: no tiles, no seams, and
// vector, so never pixelated. Two boards so neighbouring frames don't match.
const BOARDS = [
  [
    { cx: 18, cy: 22, rx: 46, ry: 30, o: 0.55 },
    { cx: 78, cy: 12, rx: 38, ry: 26, o: 0.4 },
    { cx: 60, cy: 52, rx: 52, ry: 34, o: 0.5 },
    { cx: 8, cy: 74, rx: 40, ry: 30, o: 0.45 },
    { cx: 88, cy: 82, rx: 44, ry: 32, o: 0.5 },
    { cx: 42, cy: 96, rx: 50, ry: 22, o: 0.4 },
  ],
  [
    { cx: 70, cy: 20, rx: 48, ry: 28, o: 0.5 },
    { cx: 14, cy: 40, rx: 40, ry: 34, o: 0.45 },
    { cx: 48, cy: 66, rx: 56, ry: 30, o: 0.55 },
    { cx: 92, cy: 58, rx: 36, ry: 30, o: 0.4 },
    { cx: 24, cy: 94, rx: 44, ry: 24, o: 0.45 },
    { cx: 80, cy: 98, rx: 40, ry: 22, o: 0.4 },
  ],
];

/**
 * BOA's smoke, drawn as vector puffs that stretch to fill the parent frame
 * exactly. Pass `variant` to vary the pattern between neighbours.
 */
export default function Smoke({ opacity = 0.3, color = '#D9D4C8', variant = 0, style }) {
  const id = `smoke${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const puffs = BOARDS[variant % BOARDS.length];
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity }, style]}>
      <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={color} stopOpacity={1} />
            <Stop offset="0.45" stopColor={color} stopOpacity={0.45} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        {puffs.map((p, i) => (
          <Ellipse key={i} cx={p.cx} cy={p.cy} rx={p.rx} ry={p.ry} fill={`url(#${id})`} opacity={p.o} />
        ))}
      </Svg>
    </View>
  );
}
