import { useEffect } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { GestureDetector, GestureHandlerRootView, usePanGesture } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';
import { colors, radius, space } from '../theme';

const OPEN = { mass: 1, stiffness: 260, damping: 28 };
const OFFSCREEN = 900;

/**
 * Spring-loaded bottom sheet. Drag it down (or tap outside) to dismiss.
 * `open` toggles it; `onClose` fires once it has fully left the screen.
 */
export default function BottomSheet({ open, onClose, children }) {
  const insets = useSafeAreaInsets();
  const y = useSharedValue(OFFSCREEN);

  useEffect(() => {
    if (open) y.value = withSpring(0, OPEN);
  }, [open, y]);

  const dismiss = () => {
    y.value = withTiming(OFFSCREEN, { duration: 260 }, (done) => done && scheduleOnRN(onClose));
  };

  const pan = usePanGesture({
    activeOffsetY: 6,
    onUpdate: (e) => {
      'worklet';
      // Resist dragging upward; follow the finger downward.
      y.value = e.translationY < 0 ? e.translationY * 0.2 : e.translationY;
    },
    onDeactivate: (e) => {
      'worklet';
      if (e.translationY > 120 || e.velocityY > 900) {
        y.value = withTiming(OFFSCREEN, { duration: 220 }, (done) => done && scheduleOnRN(onClose));
      } else {
        y.value = withSpring(0, { ...OPEN, velocity: e.velocityY });
      }
    },
  });

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: interpolate(y.value, [0, 500], [1, 0], 'clamp') }));

  if (!open) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={dismiss} statusBarTranslucent>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} accessibilityLabel="Close" />
        </Animated.View>
        <GestureDetector gesture={pan}>
          <Animated.View style={[styles.sheet, { paddingBottom: insets.bottom + space.xl }, sheetStyle]}>
            <View style={styles.grabber} />
            {children}
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignSelf: 'center',
    maxWidth: 640,
    width: '100%',
    marginHorizontal: 'auto',
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    paddingTop: space.md,
    overflow: 'hidden',
    boxShadow: '0px -20px 60px rgba(0,0,0,0.6)',
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(243,239,232,0.25)',
    marginBottom: space.md,
  },
});
