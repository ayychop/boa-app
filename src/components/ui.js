import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Asset } from 'expo-asset';
import { colors, fonts, radius, space, type } from '../theme';

const fog = require('../../assets/fog.png');

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

/** The site's fog texture (a 256px tile), as a quiet overlay. */
export function Fog({ opacity = 0.35 }) {
  if (Platform.OS === 'web') {
    // react-native-web draws resizeMode="repeat" as a single tile; use CSS.
    const { uri } = Asset.fromModule(fog);
    return (
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          opacity,
          pointerEvents: 'none',
          backgroundImage: `url(${uri})`,
          backgroundRepeat: 'repeat',
          backgroundSize: '256px 256px',
        }}
      />
    );
  }
  return <Image source={fog} resizeMode="repeat" style={[StyleSheet.absoluteFill, { opacity }]} pointerEvents="none" />;
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
