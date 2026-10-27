import { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, FadeIn, FadeInDown, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withTiming, ZoomIn } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { usePremium, trialLeft } from '../../context/PremiumContext';
import BoaLogo from '../BoaLogo';
import { Button, Fog, GoldBadge, Slate, Viewfinder } from '../ui';
import { colors, fonts, radius, space, type } from '../../theme';

import { PRICE } from './price';

export { PRICE };

// Only what Premium really unlocks in this build: every line here is a
// gate in the code (calls, the EQ, saving stations, the vibes).
const BENEFITS = [
  { icon: 'videocam', title: 'HD video calls, unlimited', body: '1080p face to face with anyone on the Hub, for as long as you like. Shrink a call and keep using the app.' },
  { icon: 'aperture', title: 'BOA Studio camera', body: 'Six looks from Natural to Cinematic, and real exposure control, done by the camera before your video is sent.' },
  { icon: 'pulse', title: 'Hi-Fi radio with Bass Boost', body: 'Bass, treble and spatial sound, shaped on every station you play.' },
  { icon: 'color-palette', title: 'Living chat vibes', body: 'Midnight Drive, Turntable, Golden Hour and more, in motion, or any colour you like.' },
  { icon: 'heart', title: 'Your station library', body: 'Save the stations you love and find them again in a tap, in the app and in your car.' },
];

const CARD_RATIO = 0.6;

/**
 * The membership card: black with gold foil, the BOA mark, and a slow band
 * of light crossing it every few seconds, like a metal card turned in the
 * hand. Held still with reduced motion.
 */
function MemberCard({ width, member, status }) {
  const still = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (still) return undefined;
    t.value = withRepeat(withDelay(1200, withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.quad) })), -1, false);
    return () => {
      t.value = 0;
    };
  }, [still, t]);
  const sheen = useAnimatedStyle(() => ({ opacity: still ? 0 : 1, transform: [{ translateX: -width + t.value * width * 2 }, { rotate: '18deg' }] }));
  return (
    <Animated.View entering={ZoomIn.springify().damping(16)} style={[styles.card, { width, height: Math.round(width * CARD_RATIO) }]} testID="premium-card">
      <LinearGradient colors={['#1B1710', '#0B0A08', '#14110B']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <LinearGradient colors={['rgba(246,211,138,0.22)', 'rgba(246,211,138,0)']} start={{ x: 0, y: 0 }} end={{ x: 0.7, y: 0.7 }} style={StyleSheet.absoluteFill} />
      <Animated.View pointerEvents="none" style={[styles.sheen, { height: width }, sheen]}>
        <LinearGradient colors={['rgba(255,236,190,0)', 'rgba(255,236,190,0.22)', 'rgba(255,236,190,0)']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
      </Animated.View>
      <View style={styles.cardTop}>
        <BoaLogo height={22} />
        <Ionicons name="diamond" size={18} color={colors.gold} />
      </View>
      <View style={styles.chip} />
      <View style={styles.cardFoot}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.cardKicker}>BEST OF ALL</Text>
          <Text style={styles.cardName} numberOfLines={1}>
            {member}
          </Text>
        </View>
        {status ? <Text style={styles.cardStatus}>{status}</Text> : null}
      </View>
    </Animated.View>
  );
}

/** Full-screen BOA Premium pitch, and where your trial or membership stands. */
export default function PremiumScreen({ open, onClose }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { hasPremium: isPremium, access, isAdmin } = usePremium();
  const [justJoined, setJustJoined] = useState(false);
  const standing = isAdmin
    ? 'BOA admin: everything is unlocked'
    : access.status === 'active'
      ? 'Your membership is active'
      : access.status === 'trial'
        ? `Free trial · ${trialLeft(access.trialEndsAt) ?? 'ending now'}`
        : null;
  if (!open) return null;

  const close = () => {
    setJustJoined(false);
    onClose();
  };
  const contentWidth = Math.min(width - space.xl * 2, 520);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={close} statusBarTranslucent>
      <View style={styles.screen}>
        {/* A warm gold aura over the charcoal: the only gold-lit screen in the app. */}
        <LinearGradient colors={['rgba(226,168,75,0.32)', 'rgba(226,168,75,0.06)', colors.bg]} locations={[0, 0.4, 0.8]} style={StyleSheet.absoluteFill} />
        <Fog opacity={0.22} />
        <Viewfinder inset={16} />
        <ScrollView contentContainerStyle={{ alignItems: 'center', paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.xxl }}>
          <View style={[styles.topBar, { width: contentWidth }]}>
            <BoaLogo height={26} />
            <Pressable onPress={close} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close Premium" style={styles.close}>
              <Ionicons name="close" size={22} color={colors.text} />
            </Pressable>
          </View>

          {justJoined ? (
            <Animated.View entering={FadeIn.duration(300)} style={[styles.done, { width: contentWidth }]}>
              <Animated.View entering={ZoomIn.springify().damping(11)} style={styles.crown}>
                <Ionicons name="diamond" size={36} color={colors.bg} />
              </Animated.View>
              <Text style={[type.display, { textAlign: 'center', marginTop: space.xl }]}>
                You're <Text style={type.serif}>Premium.</Text>
              </Text>
              <Text style={[type.bodyMuted, { textAlign: 'center', marginTop: space.md }]}>HD calls, BOA Studio, Hi-Fi and living vibes are on. Look for the gold badge.</Text>
              <Button label="Start listening" icon="arrow-forward" onPress={close} style={{ marginTop: space.xl, alignSelf: 'stretch' }} />
            </Animated.View>
          ) : (
            <View style={{ width: contentWidth }}>
              <Animated.View entering={FadeInDown.springify().damping(18)}>
                <View style={styles.titleRow}>
                  <Slate dot>BOA Premium</Slate>
                  {isPremium && <GoldBadge label={access.status === 'trial' && !isAdmin ? 'TRIAL' : 'ACTIVE'} icon="checkmark" />}
                </View>
                <Text style={[type.display, styles.headline]}>
                  The <Text style={type.serif}>best</Text> of all networks.
                </Text>
                <Text style={[type.bodyMuted, { marginTop: space.md }]}>The members' side of BOA: HD calls, a studio camera, Hi-Fi radio and chats that come alive.</Text>
              </Animated.View>
              <View style={{ marginTop: space.xl, alignItems: 'center' }}>
                <MemberCard width={contentWidth} member={isPremium ? 'BOA PREMIUM MEMBER' : 'BOA PREMIUM'} status={isPremium ? (access.status === 'trial' && !isAdmin ? 'TRIAL' : 'ACTIVE') : null} />
              </View>

              <View style={styles.benefits}>
                {BENEFITS.map((b, i) => (
                  <Animated.View
                    key={b.title}
                    entering={FadeInDown.delay(80 + i * 60)
                      .springify()
                      .damping(18)}
                    style={styles.benefit}
                  >
                    <View style={styles.benefitIcon}>
                      <Ionicons name={b.icon} size={18} color={colors.gold} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.benefitTitle}>{b.title}</Text>
                      <Text style={styles.benefitBody}>{b.body}</Text>
                    </View>
                  </Animated.View>
                ))}
              </View>

              {isPremium ? (
                <>
                  <Button label={standing ?? "You're a Premium member"} icon="checkmark" variant="ghost" disabled style={{ marginTop: space.xl, alignSelf: 'stretch' }} />
                  {access.status === 'trial' && !isAdmin ? <Text style={styles.fineText}>After the trial, BOA Premium is {PRICE}/month.</Text> : null}
                </>
              ) : (
                <Animated.View entering={FadeInDown.delay(420).springify().damping(18)}>
                  <View style={styles.priceCard}>
                    <Text style={styles.price}>{PRICE}</Text>
                    <Text style={styles.per}>/ month</Text>
                    <Text style={styles.priceNote}>Cancel any time</Text>
                  </View>
                  <Button
                    label={`Subscribe for ${PRICE}/month`}
                    icon="diamond"
                    onPress={() =>
                      // TODO: Google Play Billing / App Store checkout. Until
                      // then a membership is switched on from the Admin Portal.
                      Alert.alert('Checkout opens soon', `In-app payments aren't switched on in this build yet. BOA Premium will be ${PRICE}/month.`)
                    }
                    style={{ alignSelf: 'stretch' }}
                    testID="premium-subscribe"
                  />
                  <Text style={styles.fineText}>{access.status === 'expired' ? 'Your 2-day free trial has ended.' : 'Every new member gets a 2-day free trial.'}</Text>
                </Animated.View>
              )}
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, overflow: 'hidden' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.xxl },
  close: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(243,239,232,0.1)' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  headline: { marginTop: space.md },
  benefits: { marginTop: space.xl, gap: space.md },
  benefit: {
    flexDirection: 'row',
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(243,239,232,0.05)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  benefitIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.goldSoft, borderWidth: 1, borderColor: 'rgba(226,168,75,0.45)' },
  card: {
    borderRadius: 22,
    overflow: 'hidden',
    padding: space.lg,
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: 'rgba(246,211,138,0.6)',
    boxShadow: '0px 18px 50px rgba(0,0,0,0.6), 0px 0px 30px rgba(226,168,75,0.25)',
  },
  sheen: { position: 'absolute', top: '-50%', left: 0, width: '45%' },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chip: { width: 38, height: 28, borderRadius: 6, backgroundColor: 'rgba(226,168,75,0.55)', borderWidth: 1, borderColor: 'rgba(255,236,190,0.7)' },
  cardFoot: { flexDirection: 'row', alignItems: 'flex-end', gap: space.md },
  cardKicker: { fontFamily: fonts.mono, fontSize: 9.5, letterSpacing: 3, color: 'rgba(246,211,138,0.85)' },
  cardName: { fontFamily: fonts.semibold, fontSize: 17, letterSpacing: 1.2, color: colors.text, marginTop: 4 },
  cardStatus: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 2, color: colors.gold },
  benefitTitle: { fontFamily: fonts.semibold, fontSize: 15.5, color: colors.text },
  benefitBody: { fontFamily: fonts.regular, fontSize: 13.5, lineHeight: 19, color: colors.textMuted, marginTop: 2 },
  priceCard: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: space.xl, marginBottom: space.lg, flexWrap: 'wrap' },
  price: { fontFamily: fonts.bold, fontSize: 40, letterSpacing: -1.5, color: colors.text },
  per: { fontFamily: fonts.medium, fontSize: 16, color: colors.textMuted },
  priceNote: { fontFamily: fonts.mono, fontSize: 10.5, letterSpacing: 1.6, textTransform: 'uppercase', color: colors.gold, marginLeft: 'auto' },
  fine: { alignSelf: 'center', marginTop: space.md, paddingVertical: 6 },
  fineText: { fontFamily: fonts.medium, fontSize: 11.5, color: colors.textFaint, textAlign: 'center', marginTop: space.md },
  done: { alignItems: 'center', paddingTop: space.xxl },
  crown: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.gold,
    boxShadow: '0px 12px 40px rgba(226,168,75,0.55)',
  },
});
