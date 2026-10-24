import { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { founders, SITE_URL } from '../data/boaContent';
import { useForms } from '../context/FormsContext';
import { useUser } from '../context/UserContext';
import { usePremium } from '../context/PremiumContext';
import { usePlayer } from '../context/PlayerContext';
import { PRICE } from '../components/premium/PremiumScreen';
import StationLogo from '../components/StationLogo';
import { VIBES } from './OnboardingScreen';
import BoaLogo from '../components/BoaLogo';
import { Button, EmptyState, Fog, GoldBadge, LogoWatermark, Slate, Tappable, Viewfinder } from '../components/ui';
import useBottomSpace from '../hooks/useBottomSpace';
import useLayout from '../hooks/useLayout';
import { useZen } from '../context/ZenContext';
import WidgetSettings from '../components/widget/WidgetSettings';
import CreditsSheet from '../components/zen/CreditsSheet';
import { colors, fonts, radius, space, type } from '../theme';
import { useOpenHub } from '../components/hub/hubNav';

// No accounts yet, so the profile has a placeholder name.
const LISTENER_NAME = 'BOA Listener';

const GRID_GAP = 12;

const KIND_LABEL = { getSeen: 'Talent application', contact: 'Message to BOA' };

function when(iso) {
  return new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function ProfileScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const bottom = useBottomSpace(space.xxl);
  const forms = useForms();
  const user = useUser();
  const player = usePlayer();
  const { openPremium } = usePremium();

  // Grouped lists, as on a phone; wide screens turn each list into a grid
  // of tiles (two columns, three once there's room).
  const { width, wide } = useLayout();
  const { openZen } = useZen();
  const openHub = useOpenHub();
  const [widgetOpen, setWidgetOpen] = useState(false);
  const [creditsOpen, setCreditsOpen] = useState(false);
  const inner = Math.min(width, 1100) - space.xl * 2;
  const columns = inner >= 960 ? 3 : 2;
  const tileWidth = Math.floor((inner - GRID_GAP * (columns - 1)) / columns);
  const list = wide ? styles.grid : styles.list;
  const row = wide ? [styles.link, styles.tile, { width: tileWidth }] : styles.link;

  const actions = [
    { icon: 'sparkles-outline', label: 'Zen Mode', detail: 'Sleep sounds, timer and screensaver', onPress: () => openZen(false) },
    { icon: 'people-circle-outline', label: 'Creative Hub', detail: 'Find talent and message creatives', onPress: () => openHub() },
    { icon: 'alarm-outline', label: 'Alarms', detail: 'Wake up to a sound or a station', onPress: () => navigation.navigate('AlarmSettings') },
    { icon: 'ribbon-outline', label: 'Credits', detail: "Zen's sounds, videos and photos", onPress: () => setCreditsOpen(true) },
    { icon: 'apps-outline', label: 'Home screen widget', detail: 'Colour and transparency', onPress: () => setWidgetOpen(true) },
    { icon: 'person-add-outline', label: 'Get seen', detail: 'Submit as talent', onPress: forms.openGetSeen },
    { icon: 'chatbubble-ellipses-outline', label: 'Contact BOA', detail: 'Bookings, press, hello', onPress: () => forms.openContact() },
    // Still on the website until the access page has in-app content.
    { icon: 'key-outline', label: 'How access works', detail: 'boanetworks.com', onPress: () => Linking.openURL(`${SITE_URL}/access`), external: true },
  ];

  return (
    <View style={styles.screen}>
      <ScrollView testID="profile-scroll" contentContainerStyle={[styles.content, wide && styles.contentWide, { paddingTop: insets.top + space.xxl, paddingBottom: bottom }]}>
        <View style={styles.card}>
          <Fog opacity={0.28} />
          {/* Big wordmark behind the avatar: the profile sits on the brand. */}
          <LogoWatermark height={136} opacity={0.06} style={{ left: -30, top: 70 }} />
          <Viewfinder inset={12} size={12} />
          <BoaLogo height={34} />
          <View style={styles.identity}>
            <View style={[styles.avatar, user.isPremium && styles.avatarPremium]}>
              <Ionicons name="person" size={26} color={user.isPremium ? colors.bg : colors.textMuted} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={styles.nameRow}>
                <Text style={styles.name} numberOfLines={1}>
                  {LISTENER_NAME}
                </Text>
                {user.isPremium && <GoldBadge label="PREMIUM" icon="diamond" />}
              </View>
              <Text style={styles.nameSub}>Sign-in is on its way · saved on this device</Text>
            </View>
          </View>
          {user.vibes.length > 0 && (
            <View style={styles.vibes}>
              {user.vibes.map((v) => (
                <View key={v} style={styles.vibe}>
                  <Text style={styles.vibeText}>{VIBES.find((x) => x.id === v)?.label ?? v}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {user.isPremium ? (
          <Pressable onPress={openPremium} accessibilityRole="button" style={({ pressed }) => [styles.premiumActive, pressed && { opacity: 0.85 }]}>
            <Ionicons name="diamond" size={18} color={colors.gold} />
            <View style={{ flex: 1 }}>
              <Text style={styles.linkText}>BOA Premium is active</Text>
              <Text style={styles.linkDetail}>Saving, Hi-Fi, early access and downloads unlocked</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
          </Pressable>
        ) : (
          <Tappable onPress={openPremium} accessibilityRole="button" accessibilityLabel="Go Premium" style={styles.banner}>
            <LinearGradient
              colors={[colors.gold, '#C98A2E', colors.goldDeep]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <Fog opacity={0.18} />
            <View style={styles.bannerIcon}>
              <Ionicons name="diamond" size={22} color={colors.gold} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.bannerKicker}>BOA PREMIUM · {PRICE}/MONTH</Text>
              <Text style={styles.bannerTitle}>Go Premium</Text>
              <Text style={styles.bannerBody}>Save stations, Hi-Fi audio, ad-free, early access.</Text>
            </View>
            <Ionicons name="arrow-forward" size={20} color={colors.bg} />
          </Tappable>
        )}

        <Slate style={{ marginTop: space.xxl, marginBottom: space.md }}>My Library</Slate>
        {user.saved.length ? (
          <View style={list}>
            {user.saved.map((station) => (
              <Pressable
                key={station.id}
                onPress={() => {
                  player.play(station, user.saved);
                  navigation.navigate('Radio', { station });
                }}
                accessibilityRole="button"
                accessibilityLabel={`Play ${station.name}`}
                style={({ pressed }) => [row, pressed && { backgroundColor: colors.surfaceRaised }]}
              >
                <StationLogo station={station} size={40} rounded={20} fit="cover" />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.linkText} numberOfLines={1}>
                    {station.name}
                  </Text>
                  <Text style={styles.linkDetail} numberOfLines={1}>
                    {[station.country, station.bitrate ? `${station.bitrate} kbps` : null].filter(Boolean).join(' · ') || 'Live radio'}
                  </Text>
                </View>
                {player.current?.id === station.id && player.isPlaying ? (
                  <Ionicons name="pulse" size={18} color={colors.gold} />
                ) : (
                  <Ionicons name="play-circle-outline" size={22} color={colors.textMuted} />
                )}
              </Pressable>
            ))}
          </View>
        ) : (
          <EmptyState
            body={
              user.isPremium
                ? 'Tap the heart next to a station on Radio to save it here.'
                : 'Save your favourite stations with BOA Premium.'
            }
          />
        )}

        <Slate style={{ marginTop: space.xxl, marginBottom: space.md }}>BOA</Slate>
        <View style={list}>
          {actions.map((a) => (
            <Pressable
              key={a.label}
              onPress={a.onPress}
              accessibilityRole={a.external ? 'link' : 'button'}
              style={({ pressed }) => [row, pressed && { backgroundColor: colors.surfaceRaised }]}
            >
              <Ionicons name={a.icon} size={19} color={colors.gold} />
              <View style={{ flex: 1 }}>
                <Text style={styles.linkText}>{a.label}</Text>
                <Text style={styles.linkDetail}>{a.detail}</Text>
              </View>
              <Ionicons name={a.external ? 'open-outline' : 'chevron-forward'} size={16} color={colors.textFaint} />
            </Pressable>
          ))}
        </View>

        {forms.submissions.length > 0 && (
          <>
            <Slate style={{ marginTop: space.xxl, marginBottom: space.md }}>Your submissions</Slate>
            <View style={list}>
              {forms.submissions.map((sub) => (
                <View key={sub.id} style={row}>
                  <Ionicons name="checkmark-circle" size={19} color={colors.live} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.linkText}>{KIND_LABEL[sub.kind]}</Text>
                    <Text style={styles.linkDetail} numberOfLines={1}>
                      {[sub.values.subject, sub.values.email].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <Text style={styles.linkDetail}>{when(sub.at)}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        <Slate style={{ marginTop: space.xxl }}>The founders</Slate>
        <View style={wide && styles.quotes}>
          {founders.map((f) => (
            <View key={f.name} style={[styles.quote, wide && { width: (inner - space.xl) / 2 }]}>
              <Text style={styles.quoteText}>“{f.quote}”</Text>
              <Slate style={{ marginTop: space.md }}>
                {f.name} · {f.role}
              </Slate>
            </View>
          ))}
        </View>

        <Button label="Get seen" icon="arrow-forward" onPress={forms.openGetSeen} style={{ marginTop: space.xl, alignSelf: 'flex-start' }} />
        <Slate style={{ marginTop: space.xxl, opacity: 0.6 }}>© 2026 BOA Network · Made in the United Kingdom</Slate>
      </ScrollView>
      <WidgetSettings open={widgetOpen} onClose={() => setWidgetOpen(false)} />
      <CreditsSheet open={creditsOpen} onClose={() => setCreditsOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: space.xl, maxWidth: 720, width: '100%', alignSelf: 'center' },
  contentWide: { maxWidth: 1100 },
  card: {
    padding: space.xl,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  identity: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.xl },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  avatarPremium: { backgroundColor: colors.gold, borderColor: colors.gold, boxShadow: '0px 6px 20px rgba(226,168,75,0.45)' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  name: { fontFamily: fonts.semibold, fontSize: 22, letterSpacing: -0.6, color: colors.text, flexShrink: 1 },
  nameSub: { fontFamily: fonts.medium, fontSize: 12, color: colors.textFaint, marginTop: 3 },
  vibes: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: space.lg },
  vibe: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: colors.goldSoft },
  vibeText: { fontFamily: fonts.semibold, fontSize: 12, color: colors.gold },
  banner: {
    marginTop: space.xl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.lg,
    overflow: 'hidden',
    boxShadow: '0px 12px 34px rgba(226,168,75,0.3)',
  },
  bannerIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  bannerKicker: { fontFamily: fonts.monoMedium, fontSize: 9.5, letterSpacing: 1.4, color: 'rgba(5,5,6,0.7)' },
  bannerTitle: { fontFamily: fonts.bold, fontSize: 20, letterSpacing: -0.5, color: colors.bg, marginTop: 2 },
  bannerBody: { fontFamily: fonts.medium, fontSize: 12.5, color: 'rgba(5,5,6,0.75)', marginTop: 2 },
  premiumActive: {
    marginTop: space.xl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(226,168,75,0.45)',
    backgroundColor: colors.goldSoft,
  },
  list: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP },
  tile: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  quotes: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.xl },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    minHeight: 62,
    paddingVertical: 10,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  linkText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
  linkDetail: { fontFamily: fonts.medium, fontSize: 12, color: colors.textFaint, marginTop: 2 },
  quote: { marginTop: space.lg, paddingLeft: space.lg, borderLeftWidth: 2, borderLeftColor: colors.gold },
  quoteText: { fontFamily: fonts.serif, fontSize: 24, lineHeight: 30, color: colors.text },
});
