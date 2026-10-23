import { useEffect } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import BottomSheet from '../BottomSheet';
import SheetOption from '../SheetOption';
import { ExpandIcon, SplitIcon, ZenIcon } from '../icons';
import { Slate } from '../ui';
import { useDisplay } from '../../context/DisplayContext';
import useLayout from '../../hooks/useLayout';
import { colors, fonts, space, type } from '../../theme';

// Room the display pill takes in the top-right corner on unfolded screens:
// headers keep their right-hand content this far clear of it, and panes that
// start under it leave this much space above.
export const DISPLAY_BUTTON_WIDTH = 112;
export const DISPLAY_BUTTON_SPACE = 56;
// The first time the button appears in a session it glows a few times, so
// unfolding the phone shows you where Split View lives.
let introduced = false;

/**
 * Top-right glass pill on unfolded screens (foldables, tablets, phones on
 * their side): the current layout, tap to change it or start Zen Mode.
 * Elevated on Android so native screens can never draw over it.
 */
export function DisplayButton() {
  const { unfolded, split, zen, openMenu } = useDisplay();
  const insets = useSafeAreaInsets();
  const { side } = useLayout();
  const reduceMotion = useReducedMotion();
  const glow = useSharedValue(0);
  const visible = unfolded && !zen;

  useEffect(() => {
    if (!visible || introduced) return;
    introduced = true;
    glow.value = reduceMotion
      ? withDelay(600, withSequence(withTiming(1, { duration: 400 }), withTiming(0, { duration: 1200 })))
      : withDelay(800, withRepeat(withSequence(withTiming(1, { duration: 600 }), withTiming(0, { duration: 900 })), 3, false));
    return () => cancelAnimation(glow);
  }, [visible, reduceMotion, glow]);

  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value }));

  if (!visible) return null;
  const Icon = split ? SplitIcon : ExpandIcon;
  return (
    <View pointerEvents="box-none" style={[styles.anchor, { top: insets.top + space.md, right: side + space.lg }]}>
      <Animated.View pointerEvents="none" style={[styles.glow, glowStyle]} />
      <Pressable
        onPress={openMenu}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`Display mode: ${split ? 'Split View' : 'Full Screen'}. Change`}
        style={({ pressed }) => [styles.button, pressed && { transform: [{ scale: 0.95 }] }]}
      >
        {Platform.OS === 'android' ? null : (
          <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
        )}
        <View style={styles.tint} />
        <Icon size={17} color={split ? colors.gold : colors.text} />
        <Text style={[styles.label, split && { color: colors.gold }]}>{split ? 'Split' : 'Full'}</Text>
      </Pressable>
    </View>
  );
}

const ZEN_AFTER_CLOSE = 360;

export default function DisplayMenu({ open, onClose }) {
  const { layout, setLayout, enterZen } = useDisplay();
  const choose = (next) => {
    setLayout(next);
    onClose();
  };
  return (
    <BottomSheet open={open} onClose={onClose} glass>
      <View style={styles.body}>
        <Slate dot>Display</Slate>
        <Text style={[type.h1, styles.title]}>
          Make the most of <Text style={type.serif}>the big screen.</Text>
        </Text>
        <View style={styles.options}>
          <SheetOption
            icon={<ExpandIcon size={20} color={layout === 'full' ? colors.gold : colors.text} />}
            label="Full Screen"
            detail="One column, edge to edge. The default."
            selected={layout === 'full'}
            onPress={() => choose('full')}
          />
          <SheetOption
            icon={<SplitIcon size={20} color={layout === 'split' ? colors.gold : colors.text} />}
            label="Split View"
            detail="Two panes side by side, split at the fold."
            selected={layout === 'split'}
            onPress={() => choose('split')}
          />
          <SheetOption
            icon={<ZenIcon size={20} color={colors.text} />}
            label="Zen Mode"
            detail="A screensaver: the time and what's playing. Tap to wake."
            onPress={() => {
              onClose();
              // Zen Mode starts once this sheet's window has fully closed
              // (its slide-out takes 240ms), never while both are on screen.
              setTimeout(enterZen, ZEN_AFTER_CLOSE);
            }}
          />
        </View>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  anchor: { position: 'absolute', zIndex: 50, elevation: 12 },
  glow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 20,
    boxShadow: '0px 0px 0px 1px rgba(226,168,75,0.7), 0px 0px 22px rgba(226,168,75,0.55)',
  },
  button: {
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 14,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  tint: {
    ...StyleSheet.absoluteFillObject,
    // Android has no live blur here, so its frosting is a little denser.
    backgroundColor: Platform.OS === 'android' ? 'rgba(18,18,22,0.82)' : 'rgba(18,18,22,0.35)',
  },
  label: { fontFamily: fonts.semibold, fontSize: 13, color: colors.text, letterSpacing: -0.1 },
  body: { paddingHorizontal: space.xl },
  title: { marginTop: space.sm },
  options: { marginTop: space.lg, gap: space.xs },
});
