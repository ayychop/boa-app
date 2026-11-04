import { useEffect, useState } from 'react';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Text from '../ScopedText';
import { Button, Slate } from '../ui';
import * as consent from '../../safety/consent';
import * as moderation from '../../safety/moderation';
import { COMMUNITY_RULES, GUIDELINES_URL, PRIVACY_URL, TERMS_URL } from '../../safety/terms';
import { haptics } from '../../utils/haptics';
import { colors, fonts, radius, space, type } from '../../theme';
import { SPRING } from '../../utils/motion';

// The two cards the safety layer (src/safety) puts on screen over everything:
//   * the agreement to the Terms of Service and Community Guidelines, shown
//     the first time someone posts, messages or uploads, and
//   * "Content Violates Guidelines", shown when the content check refuses
//     something before it is posted.
// Mounted once, inside the Hub provider (App.js).

function useStore(subscribe, get) {
  const [value, setValue] = useState(get);
  useEffect(() => {
    setValue(get());
    return subscribe(setValue);
  }, [subscribe, get]);
  return value;
}

const open = (url) => Linking.openURL(url).catch(() => {});

function Glass({ children, testID, width }) {
  const { height } = useWindowDimensions();
  return (
    <View style={styles.center} pointerEvents="box-none">
      <Animated.View entering={ZoomIn.springify().damping(SPRING.damping).stiffness(SPRING.stiffness)} style={[styles.card, { width, maxHeight: height * 0.88 }]} testID={testID}>
        <BlurView intensity={50} tint="dark" experimentalBlurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} />
        <LinearGradient colors={['rgba(226,168,75,0.20)', 'rgba(17,17,19,0.70)', 'rgba(11,11,13,0.94)']} locations={[0, 0.35, 1]} style={StyleSheet.absoluteFill} />
        {children}
      </Animated.View>
    </View>
  );
}

function Backdrop({ onPress }) {
  return (
    <Pressable style={StyleSheet.absoluteFill} onPress={onPress} accessible={false}>
      <BlurView intensity={25} tint="dark" experimentalBlurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(5,5,6,0.62)' }]} />
    </Pressable>
  );
}

/** The blocking agreement: a checkbox and "I Agree". Tapping outside does nothing. */
function TermsCard() {
  const { open: visible } = useStore(consent.subscribe, consent.getState);
  const { width } = useWindowDimensions();
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (visible) {
      setChecked(false);
      setBusy(false);
      setError(null);
    }
  }, [visible]);
  if (!visible) return null;

  const agree = async () => {
    if (!checked || busy) return;
    setBusy(true);
    setError(null);
    try {
      await consent.accept();
      haptics.success();
    } catch (err) {
      setError(err.message || "Couldn't save your agreement. Try again.");
      setBusy(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={consent.decline} statusBarTranslucent>
      <Backdrop />
      <Glass width={Math.min(width - space.xl * 2, 460)} testID="terms-gate">
        <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={styles.pad} showsVerticalScrollIndicator={false}>
          <View style={styles.badge}>
            <Ionicons name="shield-checkmark" size={22} color={colors.gold} />
          </View>
          <Slate dot style={{ marginTop: space.lg }}>
            Before you post
          </Slate>
          <Text style={styles.title}>Terms of Service and Community Guidelines</Text>
          <Text style={[type.bodyMuted, { marginTop: space.sm }]}>BOA HUB is a community of creatives. To post, send a message or upload anything, please agree to how we keep it safe.</Text>
          <View style={styles.rules}>
            {COMMUNITY_RULES.map((rule) => (
              <View key={rule} style={styles.rule}>
                <Ionicons name="checkmark" size={14} color={colors.gold} style={{ marginTop: 3 }} />
                <Text style={styles.ruleText}>{rule}</Text>
              </View>
            ))}
          </View>
          <View style={styles.links}>
            <Pressable onPress={() => open(TERMS_URL)} hitSlop={8} accessibilityRole="link" testID="terms-link">
              <Text style={styles.link}>Terms of Service</Text>
            </Pressable>
            <Pressable onPress={() => open(GUIDELINES_URL)} hitSlop={8} accessibilityRole="link" testID="guidelines-link">
              <Text style={styles.link}>Community Guidelines</Text>
            </Pressable>
            <Pressable onPress={() => open(PRIVACY_URL)} hitSlop={8} accessibilityRole="link" testID="privacy-link">
              <Text style={styles.link}>Privacy Policy</Text>
            </Pressable>
          </View>
          <Pressable
            onPress={() => {
              haptics.selection();
              setChecked((c) => !c);
            }}
            hitSlop={8}
            accessibilityRole="checkbox"
            accessibilityState={{ checked }}
            testID="terms-checkbox"
            style={styles.agree}
          >
            <View style={[styles.box, checked && styles.boxOn]}>{checked && <Ionicons name="checkmark" size={16} color={colors.bg} />}</View>
            <Text style={styles.agreeText}>I have read and agree to the Terms of Service and the Community Guidelines.</Text>
          </Pressable>
          {error ? (
            <Text style={styles.error} testID="terms-error">
              {error}
            </Text>
          ) : null}
        </ScrollView>
        <Animated.View entering={FadeIn.delay(200)} style={styles.footer}>
          <Button label={busy ? 'Saving' : 'I Agree'} icon="checkmark" disabled={!checked || busy} onPress={agree} testID="terms-agree" />
          <Pressable onPress={consent.decline} hitSlop={10} accessibilityRole="button" style={styles.notNow} testID="terms-decline">
            <Text style={styles.notNowText}>Not now</Text>
          </Pressable>
        </Animated.View>
      </Glass>
    </Modal>
  );
}

/** "Content Violates Guidelines": what was refused and why, with a way to read the rules. */
function ViolationCard() {
  const violation = useStore(moderation.subscribe, moderation.getViolation);
  const { width } = useWindowDimensions();
  useEffect(() => {
    if (violation) haptics.warning?.();
  }, [violation]);
  if (!violation) return null;
  const what = moderation.describeCategories(violation.categories);
  const where = { avatar: 'photo', profile: 'profile', message: 'message', post: 'post', casting: 'listing' }[violation.surface] ?? 'content';

  return (
    <Modal visible transparent animationType="fade" onRequestClose={moderation.dismissViolation} statusBarTranslucent>
      <Backdrop onPress={moderation.dismissViolation} />
      <Glass width={Math.min(width - space.xl * 2, 420)} testID="violation-card">
        <View style={styles.pad}>
          <View style={[styles.badge, styles.badgeDanger]}>
            <Ionicons name="shield-half" size={22} color="#FF8A8A" />
          </View>
          <Slate dot color="#FF8A8A" style={{ marginTop: space.lg }}>
            Not posted
          </Slate>
          <Text style={styles.title}>Content Violates Guidelines</Text>
          <Text style={[type.bodyMuted, { marginTop: space.sm }]} testID="violation-detail">
            {what
              ? `Your ${where} looks like it contains ${what}, which isn't allowed on BOA HUB, so it wasn't sent.`
              : `Your ${where} doesn't meet the BOA HUB Community Guidelines, so it wasn't sent.`}
          </Text>
          <Text style={[type.bodyMuted, { marginTop: space.sm }]}>Change it and try again. Repeated breaches can lead to your account being removed.</Text>
        </View>
        <View style={styles.footer}>
          <Button label="Got it" onPress={moderation.dismissViolation} testID="violation-ok" />
          <Pressable onPress={() => open(GUIDELINES_URL)} hitSlop={10} accessibilityRole="link" style={styles.notNow} testID="violation-guidelines">
            <Text style={styles.link}>Read the Community Guidelines</Text>
          </Pressable>
        </View>
      </Glass>
    </Modal>
  );
}

export default function SafetyHost() {
  return (
    <>
      <TermsCard />
      <ViolationCard />
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { borderRadius: radius.xl, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong, backgroundColor: 'rgba(11,11,13,0.6)' },
  pad: { padding: space.xl },
  badge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.goldSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(226,168,75,0.3)',
  },
  badgeDanger: { backgroundColor: 'rgba(255,107,107,0.12)', borderColor: 'rgba(255,107,107,0.35)' },
  title: { ...type.title, fontSize: 24, lineHeight: 29, marginTop: space.sm },
  rules: { gap: space.sm, marginTop: space.lg },
  rule: { flexDirection: 'row', gap: space.sm },
  ruleText: { flex: 1, fontFamily: fonts.medium, fontSize: 14, lineHeight: 20, color: colors.text },
  links: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.lg, rowGap: space.sm, marginTop: space.lg },
  link: { fontFamily: fonts.semibold, fontSize: 13, color: colors.gold, textDecorationLine: 'underline' },
  agree: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.xl },
  box: { width: 26, height: 26, borderRadius: 8, borderWidth: 1.5, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  agreeText: { flex: 1, fontFamily: fonts.medium, fontSize: 14, lineHeight: 20, color: colors.text },
  error: { fontFamily: fonts.medium, fontSize: 13, color: '#FF8A8A', marginTop: space.md },
  footer: { padding: space.xl, paddingTop: space.md },
  notNow: { alignItems: 'center', paddingTop: space.lg },
  notNowText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.textMuted },
});
