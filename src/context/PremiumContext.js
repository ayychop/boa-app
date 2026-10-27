import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useHub } from './HubContext';
import * as hub from '../api/hub';
import * as eq from '../audio/eq';
import BottomSheet from '../components/BottomSheet';
import PremiumScreen from '../components/premium/PremiumScreen';
import { PRICE } from '../components/premium/price';
import { Button, Slate } from '../components/ui';
import { colors, fonts, radius, space, type } from '../theme';

const PremiumContext = createContext(null);

export const PAYWALL_PITCH = `Upgrade to BOA Premium for unlimited HD Video Calls, Hi-Fi Audio, and exclusive filters. ${PRICE}/month.`;
const NO_ACCESS = { status: 'expired', hasAccess: false, isAdmin: false, trialEndsAt: null };
const cacheKey = (userId) => `boa.premium.v1:${userId}`;

/** "1 day 4 hrs left" / "3 hrs left" / "40 min left" until a trial ends. */
export function trialLeft(endsAt, now = Date.now()) {
  const ms = new Date(endsAt).getTime() - now;
  if (!(ms > 0)) return null;
  const mins = Math.ceil(ms / 60000);
  if (mins < 60) return `${mins} min left`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs === 1 ? '' : 's'} left`;
  const days = Math.floor(hrs / 24);
  const rest = hrs % 24;
  return `${days} day${days === 1 ? '' : 's'}${rest ? ` ${rest} hr${rest === 1 ? '' : 's'}` : ''} left`;
}

/**
 * BOA Premium: who has it, the full Premium screen and the paywall sheet.
 * The database decides (profiles.subscription_status, a 48-hour trial from
 * sign-up, admins always in; see premium_access()); the app only asks.
 * `requirePremium(action, message)` runs the action for members with
 * access and shows the paywall to everyone else.
 */
export function PremiumProvider({ children }) {
  // Admins (the database's list: a confirmed sign-in email in
  // public.admin_users) skip every paywall.
  const { userId, isAdmin } = useHub();
  const [access, setAccess] = useState(NO_ACCESS);
  // Whether the database has answered for this account yet. Until then a
  // Premium action waits for the answer rather than showing the paywall,
  // so an admin opening the app never sees it, even for a moment.
  const [checked, setChecked] = useState(false);
  const [screenOpen, setScreenOpen] = useState(false);
  const [paywall, setPaywall] = useState({ open: false, message: '' });
  const pending = useRef(null);

  const refresh = useCallback(async () => {
    if (!userId) {
      setAccess(NO_ACCESS);
      setChecked(true);
      return;
    }
    // Asked together: the admin check works even before the Premium
    // migration has been run.
    const [answer, admin] = await Promise.all([hub.getPremiumAccess().catch(() => NO_ACCESS), hub.amIAdmin().catch(() => false)]);
    const next = { ...answer, isAdmin: answer.isAdmin || admin, hasAccess: answer.hasAccess || admin };
    setAccess(next);
    setChecked(true);
    AsyncStorage.setItem(cacheKey(userId), JSON.stringify(next)).catch(() => {});
  }, [userId]);

  // The last answer for this account, so the app opens already unlocked.
  useEffect(() => {
    let alive = true;
    setChecked(false);
    setAccess(NO_ACCESS);
    if (userId) {
      AsyncStorage.getItem(cacheKey(userId))
        .then((raw) => alive && raw && setAccess((a) => (a === NO_ACCESS ? { ...NO_ACCESS, ...JSON.parse(raw) } : a)))
        .catch(() => {});
    }
    return () => {
      alive = false;
    };
  }, [userId]);

  useEffect(() => {
    refresh();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && refresh());
    return () => sub.remove();
  }, [refresh]);

  // The moment a trial runs out, ask again (it comes back 'expired').
  useEffect(() => {
    if (access.status !== 'trial' || !access.trialEndsAt) return undefined;
    const ms = new Date(access.trialEndsAt).getTime() - Date.now();
    if (!(ms > 0)) return undefined;
    const t = setTimeout(refresh, Math.min(ms + 1000, 2 ** 31 - 1));
    return () => clearTimeout(t);
  }, [access, refresh]);

  // Admins skip every paywall, even before the database has answered.
  const hasPremium = isAdmin || access.isAdmin || access.hasAccess;
  const openPremium = useCallback(() => setScreenOpen(true), []);

  // Hi-Fi shapes the radio's sound only while you have Premium.
  useEffect(() => eq.setAllowed(hasPremium), [hasPremium]);

  const requirePremium = useCallback(
    (action, message) => {
      if (hasPremium) action();
      else if (!checked) pending.current = { action, message };
      else setPaywall({ open: true, message: message ?? '' });
    },
    [hasPremium, checked],
  );

  // A Premium action tapped while the answer was on its way: run it, or
  // show the paywall, once it's in.
  useEffect(() => {
    const p = pending.current;
    if (!p || (!checked && !hasPremium)) return;
    pending.current = null;
    if (hasPremium) p.action();
    else setPaywall({ open: true, message: p.message ?? '' });
  }, [checked, hasPremium]);

  const value = useMemo(
    () => ({ access, checked, hasPremium, isAdmin: isAdmin || access.isAdmin, openPremium, requirePremium, refreshPremium: refresh }),
    [access, checked, hasPremium, isAdmin, openPremium, requirePremium, refresh],
  );

  const trialOver = !!userId && access.status === 'expired' && !hasPremium;

  return (
    <PremiumContext.Provider value={value}>
      {children}
      <BottomSheet open={paywall.open} onClose={() => setPaywall((p) => ({ ...p, open: false }))}>
        <View style={styles.sheet} testID="premium-paywall">
          {/* Frosted glass with a gold dawn behind it. */}
          <LinearGradient colors={['rgba(226,168,75,0.28)', 'rgba(226,168,75,0.04)', 'rgba(5,5,6,0)']} locations={[0, 0.45, 1]} style={StyleSheet.absoluteFill} />
          <BlurView intensity={30} tint="dark" blurMethod="dimezisBlurView" style={[StyleSheet.absoluteFill, { opacity: 0.6 }]} />
          <Animated.View entering={ZoomIn.springify().damping(12)} style={styles.lock}>
            <LinearGradient colors={['#FFE6A8', colors.gold, colors.goldDeep]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: 32 }]} />
            <Ionicons name="diamond" size={26} color={colors.bg} />
          </Animated.View>
          <Slate dot style={{ marginTop: space.lg }}>
            {trialOver ? 'Your 2-day trial has ended' : 'BOA Premium'}
          </Slate>
          {paywall.message ? <Text style={[type.h1, styles.title]}>{paywall.message}</Text> : null}
          <Animated.View entering={FadeInDown.delay(80).springify().damping(18)} style={styles.glass}>
            <Text style={styles.pitch}>{PAYWALL_PITCH}</Text>
            <View style={styles.perks}>
              {[
                ['videocam', 'HD video calls'],
                ['pulse', 'Hi-Fi audio'],
                ['sparkles', 'Exclusive filters'],
              ].map(([icon, label]) => (
                <View key={label} style={styles.perk}>
                  <Ionicons name={icon} size={14} color={colors.gold} />
                  <Text style={styles.perkText} numberOfLines={1}>
                    {label}
                  </Text>
                </View>
              ))}
            </View>
          </Animated.View>
          <Button
            label={`Upgrade for ${PRICE}/month`}
            icon="diamond"
            onPress={() => {
              setPaywall((p) => ({ ...p, open: false }));
              setScreenOpen(true);
            }}
            style={{ alignSelf: 'stretch', marginTop: space.xl }}
            testID="premium-upgrade"
          />
        </View>
      </BottomSheet>
      <PremiumScreen open={screenOpen} onClose={() => setScreenOpen(false)} />
    </PremiumContext.Provider>
  );
}

export function usePremium() {
  const ctx = useContext(PremiumContext);
  if (!ctx) throw new Error('usePremium must be used inside <PremiumProvider>');
  return ctx;
}

const styles = StyleSheet.create({
  sheet: { alignItems: 'center', paddingHorizontal: space.xl, paddingTop: space.md, paddingBottom: space.md, overflow: 'hidden' },
  lock: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,240,200,0.9)',
    boxShadow: '0px 10px 30px rgba(226,168,75,0.5)',
  },
  title: { textAlign: 'center', marginTop: space.sm },
  glass: {
    alignSelf: 'stretch',
    marginTop: space.lg,
    padding: space.lg,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(246,211,138,0.5)',
    backgroundColor: 'rgba(18,18,22,0.55)',
  },
  pitch: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 22, color: colors.text, textAlign: 'center' },
  perks: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: space.sm, marginTop: space.md },
  perk: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.goldSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(226,168,75,0.5)',
  },
  perkText: { fontFamily: fonts.semibold, fontSize: 12, color: '#F6D38A' },
});

/** The Premium context, or null outside the provider (screens rendered on their own). */
export function usePremiumMaybe() {
  return useContext(PremiumContext);
}

/**
 * Whether Premium-only looks may show. True with Premium, and while the
 * answer is still coming (so a member never sees their vibe flash to the
 * free one at launch), and outside the provider, where there's nothing to
 * check against.
 */
export function usePremiumUnlocked() {
  const ctx = useContext(PremiumContext);
  return !ctx || !ctx.checked || !!ctx.hasPremium;
}

/** Whether this member has BOA Premium; false outside the provider. */
export function useHasPremium() {
  return useContext(PremiumContext)?.hasPremium ?? false;
}
