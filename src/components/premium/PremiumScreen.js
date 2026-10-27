import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { usePremium, trialLeft } from '../../context/PremiumContext';
import BoaLogo from '../BoaLogo';
import { Button, Fog, GoldBadge, Slate, Viewfinder } from '../ui';
import { colors, fonts, radius, space, type } from '../../theme';

import { PRICE } from './price';

export { PRICE };

const BENEFITS = [
  { icon: 'videocam', title: 'Unlimited HD video calls', body: 'Face to face with anyone on the Hub, as long as you like.' },
  { icon: 'sparkles', title: 'Exclusive filters', body: 'Brightness, Smooth Skin, Tone, Clarity and Saturation, done by the camera in 1080p.' },
  { icon: 'heart', title: 'Save playlists & stations', body: 'Build your own library of stations and come back to it any time.' },
  { icon: 'ban', title: 'Ad-free', body: 'No interruptions between you and the music.' },
  { icon: 'pulse', title: 'Hi-Fi audio', body: 'Bass, treble and spatial sound on every station, and the best streams we can find.' },
  { icon: 'flash', title: 'Early access', body: 'New BOA Originals and episodes before anyone else.' },
  { icon: 'cloud-download', title: 'Offline downloads', body: 'Take podcasts and episodes with you, no signal needed.' },
];

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
        <LinearGradient
          colors={['rgba(226,168,75,0.32)', 'rgba(226,168,75,0.06)', colors.bg]}
          locations={[0, 0.4, 0.8]}
          style={StyleSheet.absoluteFill}
        />
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
              <Text style={[type.bodyMuted, { textAlign: 'center', marginTop: space.md }]}>
                Saving, Hi-Fi and early access are on. Look for the gold badge.
              </Text>
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
                <Text style={[type.bodyMuted, { marginTop: space.md }]}>Everything in BOA, with nothing in the way.</Text>
              </Animated.View>

              <View style={styles.benefits}>
                {BENEFITS.map((b, i) => (
                  <Animated.View key={b.title} entering={FadeInDown.delay(80 + i * 60).springify().damping(18)} style={styles.benefit}>
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
                  {access.status === 'trial' && !isAdmin ? (
                    <Text style={styles.fineText}>After the trial, BOA Premium is {PRICE}/month.</Text>
                  ) : null}
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
  benefitIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.goldSoft },
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
