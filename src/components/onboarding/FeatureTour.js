import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, Extrapolation, FadeIn, interpolate, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import useReducedMotion from '../../hooks/useReducedMotion';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import BoaLogo from '../BoaLogo';
import { Button, Fog, Slate, Viewfinder } from '../ui';
import { haptics } from '../../utils/haptics';
import { colors, fonts, radius, space, type } from '../../theme';

// The welcome tour: five full-screen scenes, swiped like a film reel, each
// lit in its own colour. Shown once per member after their first sign-in
// (api/onboarding.js).
export const SCENES = [
  {
    key: 'radio',
    icon: 'radio',
    kicker: 'BOA Radio',
    title: 'Your sound,',
    flourish: 'live.',
    body: 'Afrobeats, Amapiano, R&B, Gospel and more, from stations hand-picked for music, not talk. In the car too, with Android Auto.',
    glow: '#E2A84B',
  },
  {
    key: 'originals',
    icon: 'film',
    kicker: 'BOA Originals',
    title: 'Stories made',
    flourish: 'by us.',
    body: 'Films, series and podcasts from BOA Networks, in a screening room built for them.',
    glow: '#D9573B',
  },
  {
    key: 'zen',
    icon: 'sparkles',
    kicker: 'Zen Mode',
    title: 'Breathe',
    flourish: 'out.',
    body: 'Soundscapes, a sleep timer and a calm screen for when the day needs to slow down.',
    glow: '#3BB8A4',
  },
  {
    key: 'hub',
    icon: 'people',
    kicker: 'The Creative Hub',
    title: 'Find your',
    flourish: 'people.',
    body: 'A profile that shows your work, and chats with the creatives you want to make things with.',
    glow: '#8C6CF0',
  },
  {
    key: 'casting',
    icon: 'megaphone',
    kicker: 'Casting Board',
    title: 'Get seen,',
    flourish: 'get paid.',
    body: 'Real roles and paid gigs from productions looking for talent like you. Apply in a tap.',
    glow: '#F0B44C',
  },
];

const EASE = Easing.bezier(0.16, 1, 0.3, 1);

// Each scene's colour wash, fading in and out as it slides past.
function Wash({ scene, index, x, width }) {
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(x.value / width, [index - 1, index, index + 1], [0, 1, 0], Extrapolation.CLAMP),
  }));
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      <LinearGradient colors={[`${scene.glow}59`, `${scene.glow}14`, 'transparent']} locations={[0, 0.45, 0.85]} style={StyleSheet.absoluteFill} />
    </Animated.View>
  );
}

// The hero: a glass orb holding the scene's icon, inside slow halos.
function Orb({ scene, size, reduceMotion }) {
  const spin = useSharedValue(0);
  const breathe = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) return;
    spin.value = withRepeat(withTiming(1, { duration: 24000, easing: Easing.linear }), -1, false);
    breathe.value = withRepeat(withTiming(1, { duration: 3200, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [reduceMotion, spin, breathe]);
  const ring = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 360}deg` }] }));
  const halo = useAnimatedStyle(() => ({
    opacity: 0.35 + breathe.value * 0.3,
    transform: [{ scale: 1 + breathe.value * 0.06 }],
  }));
  const core = size * 0.52;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={[styles.halo, { width: size, height: size, borderRadius: size / 2, backgroundColor: `${scene.glow}22` }, halo]} />
      <Animated.View style={[styles.ring, { width: size * 0.84, height: size * 0.84, borderRadius: size, borderColor: `${scene.glow}66` }, ring]}>
        <View style={[styles.ringDot, { backgroundColor: scene.glow, shadowColor: scene.glow }]} />
      </Animated.View>
      <View style={[styles.ring, { width: size * 0.68, height: size * 0.68, borderRadius: size, borderColor: 'rgba(243,239,232,0.10)' }]} />
      <View style={[styles.core, { width: core, height: core, borderRadius: core / 2, shadowColor: scene.glow }]}>
        <BlurView intensity={40} tint="dark" experimentalBlurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} />
        <LinearGradient colors={['rgba(243,239,232,0.16)', 'rgba(243,239,232,0.02)']} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={StyleSheet.absoluteFill} />
        <Ionicons name={scene.icon} size={core * 0.42} color={scene.glow} />
      </View>
    </View>
  );
}

function Scene({ scene, index, x, width, height, reduceMotion }) {
  // Parallax: the orb drifts slower than the page, the words a touch faster.
  const orb = useAnimatedStyle(() => {
    const p = x.value / width - index;
    return reduceMotion
      ? { opacity: interpolate(Math.abs(p), [0, 1], [1, 0], Extrapolation.CLAMP) }
      : {
          opacity: interpolate(Math.abs(p), [0, 0.8], [1, 0], Extrapolation.CLAMP),
          transform: [{ translateX: p * width * 0.45 }, { scale: interpolate(Math.abs(p), [0, 1], [1, 0.7], Extrapolation.CLAMP) }],
        };
  });
  const words = useAnimatedStyle(() => {
    const p = x.value / width - index;
    return reduceMotion
      ? { opacity: interpolate(Math.abs(p), [0, 1], [1, 0], Extrapolation.CLAMP) }
      : {
          opacity: interpolate(Math.abs(p), [0, 0.6], [1, 0], Extrapolation.CLAMP),
          transform: [{ translateX: p * -width * 0.18 }],
        };
  });
  const orbSize = Math.min(width * 0.62, height * 0.32, 300);
  return (
    <View style={[styles.scene, { width }]} accessibilityLabel={`${scene.kicker}. ${scene.title} ${scene.flourish} ${scene.body}`}>
      <Animated.View style={[styles.orbWrap, orb]}>
        <Orb scene={scene} size={orbSize} reduceMotion={reduceMotion} />
      </Animated.View>
      <Animated.View style={[styles.card, words]}>
        <BlurView intensity={30} tint="dark" experimentalBlurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, styles.cardTint]} />
        <Slate dot color={scene.glow}>{`${String(index + 1).padStart(2, '0')} / ${String(SCENES.length).padStart(2, '0')} · ${scene.kicker}`}</Slate>
        <Text style={styles.title}>
          {scene.title} <Text style={[styles.flourish, { color: scene.glow }]}>{scene.flourish}</Text>
        </Text>
        <Text style={styles.body}>{scene.body}</Text>
      </Animated.View>
    </View>
  );
}

function Dot({ index, x, width }) {
  const style = useAnimatedStyle(() => {
    const d = Math.abs(x.value / width - index);
    return {
      width: interpolate(d, [0, 1], [26, 7], Extrapolation.CLAMP),
      opacity: interpolate(d, [0, 1], [1, 0.3], Extrapolation.CLAMP),
    };
  });
  return <Animated.View style={[styles.dot, style]} />;
}

/** The welcome tour, full screen. onDone runs on "Let's Go" or Skip. */
export default function FeatureTour({ visible, onDone }) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const x = useSharedValue(0);
  const scroller = useRef(null);
  const [page, setPage] = useState(0);
  const last = page === SCENES.length - 1;
  // The same gutter both sides, whichever side has a cutout or hinge inset.
  const side = Math.max(insets.left, insets.right) + space.xl;

  const onScroll = useAnimatedScrollHandler((e) => {
    x.value = e.contentOffset.x;
  });

  if (!visible) return null;

  const go = (i) => {
    haptics.selection();
    scroller.current?.scrollTo({ x: i * width, animated: !reduceMotion });
    // Tests and reduced motion get no scroll events; keep the page in step.
    setPage(i);
    if (reduceMotion) x.value = i * width;
  };
  const finish = () => {
    haptics.success();
    onDone();
  };

  return (
    <Modal visible transparent={false} animationType="fade" onRequestClose={finish} statusBarTranslucent>
      {/* Exactly the window's width: Android sizes a Modal from the display,
          which on an unfolded Fold can come out wider than the screen and push
          everything centred in it off to the right. */}
      <View style={[styles.screen, { width }]} testID="feature-tour">
        {SCENES.map((s, i) => (
          <Wash key={s.key} scene={s} index={i} x={x} width={width} />
        ))}
        <Fog opacity={0.18} />
        <Viewfinder inset={16} />

        <Animated.View entering={FadeIn.duration(500)} style={[styles.top, { paddingTop: insets.top + space.lg, paddingHorizontal: side }]}>
          <BoaLogo height={22} />
          {!last && (
            <Pressable onPress={finish} hitSlop={14} accessibilityRole="button" accessibilityLabel="Skip the tour">
              <Text style={styles.skip}>Skip</Text>
            </Pressable>
          )}
        </Animated.View>

        <Animated.ScrollView
          ref={scroller}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={16}
          onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
          style={{ flex: 1 }}
        >
          {SCENES.map((s, i) => (
            <Scene key={s.key} scene={s} index={i} x={x} width={width} height={height} reduceMotion={reduceMotion} />
          ))}
        </Animated.ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + space.xl, paddingHorizontal: side }]}>
          <View style={styles.dots}>
            {SCENES.map((s, i) => (
              <Dot key={s.key} index={i} x={x} width={width} />
            ))}
          </View>
          <Button label={last ? "Let's Go" : 'Next'} icon={last ? 'arrow-forward' : undefined} onPress={last ? finish : () => go(page + 1)} testID="feature-tour-next" style={styles.cta} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  skip: { fontFamily: fonts.semibold, fontSize: 14, color: colors.textMuted, letterSpacing: 0.2 },
  scene: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xl, gap: space.xxl },
  orbWrap: { alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute' },
  ring: { position: 'absolute', borderWidth: StyleSheet.hairlineWidth * 2, alignItems: 'center' },
  ringDot: { width: 7, height: 7, borderRadius: 4, marginTop: -3.5, shadowOpacity: 0.9, shadowRadius: 8, elevation: 4 },
  core: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(243,239,232,0.22)',
    shadowOpacity: 0.6,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 0 },
  },
  card: {
    width: '100%',
    maxWidth: 460,
    padding: space.xl,
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    gap: space.md,
  },
  cardTint: { backgroundColor: 'rgba(17,17,19,0.55)' },
  title: { ...type.h1, fontSize: 34, lineHeight: 38 },
  flourish: { fontFamily: fonts.serif, fontSize: 38, letterSpacing: -0.5 },
  body: { ...type.bodyMuted, fontSize: 15.5, lineHeight: 23 },
  footer: { width: '100%', gap: space.xl, alignItems: 'center' },
  dots: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  dot: { height: 7, borderRadius: 4, backgroundColor: colors.text },
  // Full width up to 460 between the gutters, always centred.
  cta: { alignSelf: 'center', width: '100%', maxWidth: 460 },
});
