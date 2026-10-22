import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useEffect } from 'react';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import BoaLogo from './BoaLogo';
import Smoke from './Smoke';
import { colors, fonts, radius, space, type } from '../theme';

/** Mono, letter-spaced label, optionally led by a gold "recording" dot. */
export function Slate({ children, dot = false, color, style, lines = 1 }) {
  return (
    <View style={[styles.slateRow, style]}>
      {dot && <View style={styles.dot} />}
      <Text style={[type.slate, color && { color }, { flexShrink: 1 }]} numberOfLines={lines}>
        {children}
      </Text>
    </View>
  );
}

/** Camera-viewfinder corner brackets, as framed around the site's hero. */
export function Viewfinder({ inset = 14, size = 14, color = 'rgba(243,239,232,0.45)' }) {
  const arm = { position: 'absolute', width: size, height: size, borderColor: color };
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[arm, { top: inset, left: inset, borderTopWidth: 1, borderLeftWidth: 1 }]} />
      <View style={[arm, { top: inset, right: inset, borderTopWidth: 1, borderRightWidth: 1 }]} />
      <View style={[arm, { bottom: inset, left: inset, borderBottomWidth: 1, borderLeftWidth: 1 }]} />
      <View style={[arm, { bottom: inset, right: inset, borderBottomWidth: 1, borderRightWidth: 1 }]} />
    </View>
  );
}

/**
 * The site's smoke as a quiet overlay. Vector puffs stretched to the frame,
 * so it fills any card edge to edge at any size.
 */
export function Fog({ opacity = 0.35, variant = 0 }) {
  return <Smoke opacity={opacity} variant={variant} />;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Press-to-shrink wrapper so every tappable thing feels physical. */
export function Tappable({ children, style, onPress, scaleTo = 0.96, ...rest }) {
  const scale = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={() => (scale.value = withSpring(scaleTo, { stiffness: 500, damping: 30 }))}
      onPressOut={() => (scale.value = withSpring(1, { stiffness: 340, damping: 18 }))}
      style={[style, anim]}
      {...rest}
    >
      {children}
    </AnimatedPressable>
  );
}

/** Gold, glowing primary button ("Get seen" on the site) and a ghost variant. */
export function Button({ label, icon, onPress, variant = 'primary', disabled, style }) {
  const primary = variant === 'primary';
  return (
    <Tappable
      onPress={disabled ? undefined : onPress}
      disabled={!!disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      style={[styles.button, primary ? styles.primary : styles.ghost, disabled && { opacity: 0.45 }, style]}
    >
      {icon && <Ionicons name={icon} size={17} color={primary ? colors.bg : colors.text} />}
      <Text style={[styles.buttonText, { color: primary ? colors.bg : colors.text }]}>{label}</Text>
    </Tappable>
  );
}

/** "01 · TALENT" index slate + headline, with an optional trailing action. */
export function SectionHeader({ index, kicker, title, action, onAction, style }) {
  return (
    <View style={[styles.section, style]}>
      <View style={{ flex: 1 }}>
        <Slate>{[index, kicker].filter(Boolean).join(' · ')}</Slate>
        <Text style={[type.title, { marginTop: 6 }]}>{title}</Text>
      </View>
      {action && (
        <Pressable onPress={onAction} hitSlop={10} style={({ pressed }) => [styles.action, pressed && { opacity: 0.6 }]}>
          <Text style={styles.actionText}>{action}</Text>
          <Ionicons name="arrow-forward" size={14} color={colors.gold} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  slateRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.gold, boxShadow: '0px 0px 8px rgba(226,168,75,0.9)' },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 46,
    paddingHorizontal: 22,
    borderRadius: radius.pill,
  },
  primary: { backgroundColor: colors.gold, boxShadow: '0px 8px 28px rgba(226,168,75,0.35)' },
  ghost: {
    backgroundColor: 'rgba(243,239,232,0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  buttonText: { fontFamily: fonts.semibold, fontSize: 14.5, letterSpacing: -0.15 },
  section: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: space.xl,
    marginBottom: space.lg,
    gap: space.md,
  },
  action: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingBottom: 3 },
  actionText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.gold },
});

/** Small gold pill: "PREMIUM" next to a name, "HI-FI" on players. */
export function GoldBadge({ label, icon, style }) {
  return (
    <View style={[badgeStyles.badge, style]} accessibilityLabel={label}>
      {icon && <Ionicons name={icon} size={10} color={colors.bg} />}
      <Text style={badgeStyles.badgeText}>{label}</Text>
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: radius.pill,
    backgroundColor: colors.gold,
    boxShadow: '0px 2px 10px rgba(226,168,75,0.45)',
  },
  badgeText: { fontFamily: fonts.monoMedium, fontSize: 9, letterSpacing: 1.3, color: colors.bg },
});

/**
 * The BOA wordmark as a watermark: large, low-opacity, optionally softened.
 * Never takes touches. Position it with `style` (it's absolutely placed).
 */
export function LogoWatermark({ height, opacity = 0.07, blur = 0, color = colors.gold, style }) {
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        { position: 'absolute', opacity },
        // CSS blur on web and Android; iOS has no view blur, where low
        // opacity alone keeps it in the background.
        blur ? { filter: `blur(${blur}px)` } : null,
        style,
      ]}
    >
      <BoaLogo height={height} color={color} />
    </View>
  );
}

const PULSE_EASE = Easing.bezier(0.45, 0, 0.55, 1);

/**
 * The "Vyb" dot: a small glowing light that breathes, with a faint halo ring
 * swelling out of it, like an on-air lamp. Still under Reduce Motion.
 */
export function PulseDot({ color = colors.gold, size = 7, style }) {
  const reduceMotion = useReducedMotion();
  const t = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) return;
    t.value = withRepeat(withTiming(1, { duration: 1800, easing: PULSE_EASE }), -1, true);
  }, [reduceMotion, t]);

  const core = useAnimatedStyle(() => ({ opacity: 1 - t.value * 0.55 }));
  const halo = useAnimatedStyle(() => ({
    opacity: 0.45 * (1 - t.value),
    transform: [{ scale: 1 + t.value * 1.6 }],
  }));

  return (
    <View style={[{ width: size, height: size }, style]} accessibilityElementsHidden importantForAccessibility="no">
      <Animated.View
        style={[StyleSheet.absoluteFill, { borderRadius: size, backgroundColor: color }, halo]}
      />
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { borderRadius: size, backgroundColor: color, boxShadow: `0px 0px ${size * 1.6}px ${color}` },
          core,
        ]}
      />
    </View>
  );
}

/** Empty / waiting state: the BOA mark, a line, and an optional hint. */
export function EmptyState({ title = 'Nothing here yet', body, style }) {
  return (
    <View style={[emptyStyles.wrap, style]}>
      <BoaLogo height={34} color={colors.gold} />
      <Text style={emptyStyles.title}>{title}</Text>
      {body ? <Text style={emptyStyles.body}>{body}</Text> : null}
    </View>
  );
}

const emptyStyles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.xl,
    paddingHorizontal: space.xl,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderStyle: 'dashed',
    opacity: 0.95,
  },
  title: { fontFamily: fonts.semibold, fontSize: 16, color: colors.text, marginTop: space.sm },
  body: { fontFamily: fonts.regular, fontSize: 13.5, lineHeight: 19, color: colors.textMuted, textAlign: 'center', maxWidth: 300 },
});
