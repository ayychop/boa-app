import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { GestureDetector, GestureHandlerRootView, usePanGesture } from 'react-native-gesture-handler';
import { BlurView } from 'expo-blur';
import { scheduleOnRN } from 'react-native-worklets';
import useLayout from '../hooks/useLayout';
import { colors, radius, space } from '../theme';
import { SPRING } from '../utils/motion';

const OPEN = SPRING;
const OFFSCREEN = 900;

/**
 * Spring-loaded bottom sheet. Drag it down (or tap outside) to dismiss.
 * `open` toggles it (closing always animates out); `onClose` asks the parent
 * to set `open` to false.
 * Forms pass `dragAnywhere={false}` so only the handle drags, leaving
 * scrolling and text selection to the content.
 * On wide screens (tablets, unfolded foldables) it rises to the centre as a
 * card instead of stretching along the bottom edge.
 * `glass` swaps the solid panel for frosted dark glass, for short menus.
 */
export default function BottomSheet({ open, onClose, children, dragAnywhere = true, glass = false }) {
  const insets = useSafeAreaInsets();
  const { wide } = useLayout();
  // A centred card clears the home indicator on its own.
  const bottomPad = wide ? space.xl : insets.bottom + (dragAnywhere ? space.xl : space.lg);
  const y = useSharedValue(OFFSCREEN);
  const [mounted, setMounted] = useState(open);

  useEffect(() => {
    if (open) {
      setMounted(true);
      y.value = withSpring(0, OPEN);
    } else {
      y.value = withTiming(OFFSCREEN, { duration: 240 }, (done) => done && scheduleOnRN(setMounted, false));
    }
  }, [open, y]);

  const dismiss = () => onClose();

  const pan = usePanGesture({
    activeOffsetY: 6,
    onUpdate: (e) => {
      'worklet';
      // Resist dragging upward; follow the finger downward.
      y.value = e.translationY < 0 ? e.translationY * 0.2 : e.translationY;
    },
    onDeactivate: (e) => {
      'worklet';
      if (e.translationY > 120 || e.velocityY > 900) scheduleOnRN(onClose);
      else y.value = withSpring(0, { ...OPEN, velocity: e.velocityY });
    },
  });

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: interpolate(y.value, [0, 500], [1, 0], 'clamp') }));

  if (!mounted) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={dismiss} statusBarTranslucent>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} accessibilityLabel="Close" />
        </Animated.View>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={[styles.avoider, wide && styles.avoiderWide]}
          pointerEvents="box-none"
        >
          {dragAnywhere ? (
            <GestureDetector gesture={pan}>
              <Animated.View style={[styles.sheet, wide && styles.card, glass && styles.glass, { paddingBottom: bottomPad }, sheetStyle]}>
                {glass && <Glass />}
                <View style={styles.grabber} />
                {children}
              </Animated.View>
            </GestureDetector>
          ) : (
            <Animated.View style={[styles.sheet, wide && styles.card, glass && styles.glass, { paddingBottom: bottomPad }, sheetStyle]}>
              {glass && <Glass />}
              <GestureDetector gesture={pan}>
                <View style={styles.handleZone}>
                  <View style={styles.grabber} />
                </View>
              </GestureDetector>
              {children}
            </Animated.View>
          )}
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
}

function Glass() {
  return (
    <>
      <BlurView intensity={90} tint="dark" experimentalBlurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} />
      <View pointerEvents="none" style={styles.glassTint} />
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(0,0,0,0.6)' },
  avoider: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  avoiderWide: { justifyContent: 'center', padding: space.xl },
  sheet: {
    maxWidth: 600,
    width: '100%',
    maxHeight: '92%',
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    paddingTop: space.md,
    overflow: 'hidden',
    boxShadow: '0px -20px 60px rgba(0,0,0,0.6)',
  },
  card: { maxHeight: '100%', borderRadius: radius.xl, boxShadow: '0px 30px 80px rgba(0,0,0,0.6)' },
  glass: { backgroundColor: 'transparent', borderColor: 'rgba(255,255,255,0.16)' },
  // Dense enough to read on its own: Android doesn't always draw the blur.
  glassTint: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(14,14,17,0.9)' },
  // Taller than the grabber itself so it's easy to catch.
  handleZone: { marginTop: -space.md, paddingTop: space.md, cursor: 'grab' },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(243,239,232,0.25)',
    marginBottom: space.md,
  },
});
