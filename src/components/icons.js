import Svg, { Circle, Path } from 'react-native-svg';

// Lucide icons (generated with icon-mcp, stroke 1.75) for the places
// Ionicons has nothing that fits: display modes and the sleep timer.
function Icon({ size = 22, color, strokeWidth = 1.75, children }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </Svg>
  );
}

const MOON = 'M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401';

/** Zen mode (lucide "sparkles"). */
export const ZenIcon = (props) => (
  <Icon {...props}>
    <Path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z" />
    <Path d="M20 2v4" />
    <Path d="M22 4h-4" />
    <Circle cx={4} cy={20} r={2} />
  </Icon>
);

/** Sleep timer: a moon, with a star once a timer is set (lucide "moon" / "moon-star"). */
export const MoonIcon = ({ active, ...props }) => (
  <Icon {...props}>
    {active && <Path d="M18 5h4" />}
    {active && <Path d="M20 3v4" />}
    <Path d={MOON} />
  </Icon>
);

export const CheckIcon = (props) => (
  <Icon {...props}>
    <Path d="M20 6 9 17l-5-5" />
  </Icon>
);
