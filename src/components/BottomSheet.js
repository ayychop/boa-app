import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { GestureDetector, GestureHandlerRootView, usePanGesture } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';
import { colors, radius, space } from '../theme';

const OPEN = { mass: 1, stiffness: 260, damping: 28 };
const OFFSCREEN = 900;

/**
 * Spring-loaded bottom sheet. Drag it down (or tap outside) to dismiss.
 * `open` toggles it (closing always animates out); `onClose` asks the parent
 * to set `open` to false.
 * Forms pass `dragAnywhere={false}` so only the handle drags, leaving
 * scrolling and text selection to the content.
 */
export default function BottomSheet({ open, onClose, children, dragAnywhere = true }) {
  const insets = useSafeAreaInsets();
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
          style={styles.avoider}
          pointerEvents="box-none"
        >
          {dragAnywhere ? (
            <GestureDetector gesture={pan}>
              <Animated.View style={[styles.sheet, { paddingBottom: insets.bottom + space.xl }, sheetStyle]}>
                <View style={styles.grabber} />
                {children}
              </Animated.View>
            </GestureDetector>
          ) : (
            <Animated.View style={[styles.sheet, { paddingBottom: insets.bottom + space.lg }, sheetStyle]}>
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

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(0,0,0,0.6)' },
  avoider: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  sheet: {
    maxWidth: 640,
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
