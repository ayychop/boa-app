import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Text, { FontScope } from '../../components/ScopedText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useHub } from '../../context/HubContext';
import { canMessage, getProfile, MESSAGES_CLOSED, roleLabel, startConversation } from '../../api/hub';
import { compactCount, listPosts, postCounts } from '../../api/posts';
import { listDayOnes, placeLine } from '../../api/dayOne';
import { supabase } from '../../lib/supabase';
import { ownChannel } from '../../lib/realtime';
import { BoaStarBadge, DayOneBadge, Avatar, IconButton, PageHeader } from '../../components/kit';
import { lastSeen, statusLine } from '../../components/hub/hubNav';
import NowPlaying from '../../components/hub/NowPlaying';
import useProfileUpdates from '../../hooks/useProfileUpdates';
import BlockSheet from '../../components/hub/BlockSheet';
import ContactSheet from '../../components/hub/ContactSheet';
import { nameFor, useAlias } from '../../chat/contacts';
import ReportSheet from '../../components/hub/ReportSheet';
import BoaCodeSheet from '../../components/hub/BoaCode';
import ProfileVibeSheet from '../../components/chat/ProfileVibeSheet';
import { GridEmpty, PostGrid, ProfileTabs } from '../../components/profile/PostGrid';
import Favourites from '../../components/profile/Favourites';
import { GoldBadge, LogoWatermark, Tappable } from '../../components/ui';
import { allowedVibe, useProfileVibe } from '../../chat/vibes';
import { usePremiumUnlocked } from '../../context/PremiumContext';
import { useHeadlineFont } from '../../context/FontContext';
import { colors, fonts, radius, space, type } from '../../theme';
import { GridSkeleton, ProfileSkeleton } from '../../components/Skeleton';

// Unfolded and on tablets the profile is a centred column, like a phone's.
const MAX_WIDTH = 720;

const hexToRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const alpha = (hex, a) => {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
};
const luma = (hex) => {
  const [r, g, b] = hexToRgb(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
};
// An accent that stays legible on the app's near-black chrome (the header
// icons, the tab underline). A light vibe's accent can be near-black, so it
// falls back to BOA gold there; the header mesh still carries its colour.
const chromeAccent = (vibe) => (luma(vibe.accent) < 0.22 ? colors.gold : vibe.accent);

/**
 * The stage light behind the header: warm gold from the top right, violet
 * from the left, both soft radial glows that fade to nothing (a solid
 * circle read as a brown blot behind the stats).
 */
function StageLight({ width, height, star }) {
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <RadialGradient id="profile-gold" cx="88%" cy="0%" rx="62%" ry="58%" fx="88%" fy="0%">
          <Stop offset="0" stopColor="#E2A84B" stopOpacity={star ? 0.3 : 0.18} />
          <Stop offset="0.55" stopColor="#E2A84B" stopOpacity={star ? 0.08 : 0.05} />
          <Stop offset="1" stopColor="#E2A84B" stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="profile-violet" cx="0%" cy="18%" rx="55%" ry="45%" fx="0%" fy="18%">
          <Stop offset="0" stopColor="#7850C8" stopOpacity={0.16} />
          <Stop offset="1" stopColor="#7850C8" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect width={width} height={height} fill="url(#profile-violet)" />
      <Rect width={width} height={height} fill="url(#profile-gold)" />
    </Svg>
  );
}

/**
 * The header's backdrop, themed to the chosen Chat Vibe so the Hub matches
 * the thread: the vibe's own diagonal mesh, a couple of its lights as soft
 * glows (or, on the default Noir, the gold-and-violet stage light), and a
 * small, faint BOA mark tinted to the vibe, centred. It fades into
 * the app's black by the lower half, so the name, bio, stats and the grid
 * below stay highly readable over any vibe, light or dark.
 */
function VibeHeader({ vibe, width, height, star }) {
  const noir = vibe.id === 'noir';
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID="profile-vibe-header">
      <LinearGradient colors={vibe.mesh} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      {noir ? (
        <StageLight width={width} height={height} star={star} />
      ) : (
        <>
          <View style={[styles.vibeGlowA, { backgroundColor: vibe.lights[0].color }]} />
          <View style={[styles.vibeGlowB, { backgroundColor: vibe.lights[1].color }]} />
        </>
      )}
      {/* Small, centred and barely there: a mark you notice, not one that shouts.
          Spanning both edges and centring keeps it dead centre at any width.
          Always BOA gold, never the vibe's colour: the wordmark is the brand
          and no theme or vibe ever recolours it. */}
      <LogoWatermark
        height={Math.round(Math.min(width, 520) * 0.16)}
        opacity={vibe.light ? 0.1 : 0.07}
        color={colors.gold}
        style={{ top: Math.round(height * 0.1), left: 0, right: 0, alignItems: 'center' }}
      />
      <LinearGradient colors={['rgba(5,5,6,0)', 'rgba(5,5,6,0.5)', colors.bg]} locations={[0, 0.62, 0.96]} style={StyleSheet.absoluteFill} />
    </View>
  );
}

function Stat({ value, label, onPress, testID, last }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${value} ${label}`}
      style={({ pressed }) => [styles.stat, !last && styles.statDivider, pressed && { opacity: 0.7 }]}
      testID={testID}
    >
      <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {value}
      </Text>
      <Text style={styles.statLabel} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * A full-width action: the main one fills with the vibe's send gradient (gold
 * on Noir, neon on Neon, and so on) over a legible foreground; the rest are
 * dark glass.
 */
function Action({ label, icon, onPress, primary, disabled, testID, send, sendFg, glow }) {
  const fg = primary ? (sendFg ?? colors.bg) : colors.text;
  return (
    <Tappable
      onPress={disabled ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={[styles.action, primary ? styles.actionPrimary : styles.actionGlass, primary && glow ? { boxShadow: `0px 6px 20px ${glow}` } : null, disabled && { opacity: 0.5 }]}
      testID={testID}
    >
      {primary && send ? <LinearGradient colors={send} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} /> : null}
      {!primary ? <LinearGradient colors={['rgba(255,255,255,0.10)', 'rgba(255,255,255,0.03)']} style={StyleSheet.absoluteFill} /> : null}
      {icon ? <Ionicons name={icon} size={16} color={fg} /> : null}
      <Text style={[styles.actionText, { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
    </Tappable>
  );
}

/**
 * A Hub profile, Instagram-style: a cinematic header (the avatar in a
 * glowing gold ring for BOA Stars), name, badges, bio and stats, then the
 * Posts, Reels and Tagged grids. Yours has Edit profile, New post and
 * Splits; someone else's has Message (and Block or Report).
 */
function HubProfileScreenBody({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const width = Math.min(window.width, MAX_WIDTH);
  const headlineFont = useHeadlineFont();
  const { userId, profile: me, isOnline, blocked, unblock } = useHub();
  const id = route.params?.id ?? userId;
  const mine = id === userId;
  const [person, setPerson] = useState(mine ? me : null);
  const [state, setState] = useState(mine ? 'ready' : 'loading');
  const [reporting, setReporting] = useState(null);
  const [opening, setOpening] = useState(false);
  const [tab, setTab] = useState('posts');
  const [grids, setGrids] = useState({});
  const [counts, setCounts] = useState({ posts: 0, reels: 0, tagged: 0 });
  const [dayOnes, setDayOnes] = useState([]);
  const [blocking, setBlocking] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [open, setOpen] = useState(true);
  const [heroH, setHeroH] = useState(420);
  const [codeOpen, setCodeOpen] = useState(false);
  const [vibeOpen, setVibeOpen] = useState(false);
  // Your Contact Book name for them, and the sheet to set it.
  const alias = useAlias(mine ? null : id);
  const [contactOpen, setContactOpen] = useState(false);

  // The Profile Vibe: this profile's own look, separate from the Chat Vibe,
  // so theming the profile never touches how chats look and vice versa (a
  // Premium vibe shows only while Premium is on, else Noir). The header mesh
  // and the accents below all follow it; the BOA wordmark never does.
  const { vibe: savedVibe } = useProfileVibe();
  const vibe = allowedVibe(savedVibe, usePremiumUnlocked());
  const accent = chromeAccent(vibe);
  // The default Noir keeps the app's white header icons; a vibe tints them.
  const iconTone = vibe.id === 'noir' ? colors.text : accent;

  // Whether they take messages from you (their privacy setting): asked of
  // the database, which never says why.
  useEffect(() => {
    if (mine || state !== 'ready') return undefined;
    let alive = true;
    canMessage(id)
      .then((yes) => alive && setOpen(yes))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [id, mine, state]);

  useEffect(() => {
    if (mine) {
      setPerson(me);
      setState('ready');
      return;
    }
    let alive = true;
    getProfile(id)
      .then((p) => {
        if (!alive) return;
        setPerson(p);
        setState(p ? 'ready' : 'gone');
      })
      .catch(() => alive && setState('gone'));
    return () => {
      alive = false;
    };
  }, [id, mine, me]);

  // Their now-playing status (and anything else they change), live.
  useProfileUpdates(mine ? [] : [id], (p) => setPerson((prev) => (prev ? { ...prev, ...p } : prev)));

  const loadTab = useCallback(
    async (which) => {
      try {
        const rows = await listPosts(id, which);
        setGrids((g) => ({ ...g, [which]: { rows, error: null } }));
      } catch (err) {
        setGrids((g) => ({ ...g, [which]: { rows: g[which]?.rows ?? [], error: err.message } }));
      }
    },
    [id],
  );
  const loadCounts = useCallback(
    () =>
      postCounts(id)
        .then(setCounts)
        .catch(() => {}),
    [id],
  );

  useEffect(() => {
    if (state !== 'ready') return;
    loadCounts();
    listDayOnes(id)
      .then(setDayOnes)
      .catch(() => {});
  }, [id, state, loadCounts]);
  useEffect(() => {
    if (state === 'ready' && !grids[tab]) loadTab(tab);
  }, [tab, state, grids, loadTab]);

  // New and deleted posts appear at once, on every grid that shows them.
  useEffect(() => {
    if (!supabase || state !== 'ready') return undefined;
    const refresh = () => {
      setGrids({});
      loadCounts();
    };
    const channel = ownChannel(`hub:posts:${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posts', filter: `author_id=eq.${id}` }, refresh)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, state, loadCounts]);

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([loadTab(tab), loadCounts()]);
    setRefreshing(false);
  };

  const isBlocked = blocked.has(id);
  const online = isOnline(id);

  const message = async () => {
    setOpening(true);
    try {
      const conv = await startConversation(id);
      navigation.navigate('HubThread', { id: conv });
    } catch (err) {
      Alert.alert("Can't message", err.message);
    } finally {
      setOpening(false);
    }
  };

  const confirmBlock = () => setBlocking(person);

  if (state !== 'ready' || !person) {
    return (
      <View style={styles.screen}>
        <PageHeader kicker="Creative Hub" title="Profile" onBack={() => navigation.goBack()} />
        {state === 'loading' ? <ProfileSkeleton width={width} /> : <Text style={[type.bodyMuted, { textAlign: 'center', marginTop: space.xxxl }]}>This profile isn't available.</Text>}
      </View>
    );
  }

  const name = mine ? person.display_name || `@${person.username}` : nameFor(person, alias, `@${person.username}`);
  const status = statusLine(person);
  const roles = person.roles ?? [];
  const star = !!person.is_boa_star;
  const grid = grids[tab];
  const newPost = () => navigation.navigate('HubNewPost');
  const openPost = (p) => navigation.navigate('HubPost', { post: p });

  return (
    <View style={styles.screen} testID={mine ? 'hub-my-profile' : 'hub-profile'}>
      <PageHeader
        kicker="Creative Hub"
        title={`@${person.username}`}
        onBack={() => navigation.goBack()}
        right={
          mine ? (
            <View style={styles.headerActions}>
              <IconButton icon="chatbubbles-outline" label="Messages" onPress={() => navigation.navigate('HubChats')} tone={iconTone} testID="profile-inbox" />
              <IconButton icon="qr-code-outline" label="Your BOA Code" onPress={() => setCodeOpen(true)} tone={iconTone} testID="profile-boa-code" />
              <IconButton icon="add" label="New post" onPress={newPost} tone={iconTone} testID="profile-new-post" />
              <IconButton icon="settings-outline" label="Hub settings" onPress={() => navigation.navigate('HubSettings')} tone={iconTone} />
            </View>
          ) : (
            <IconButton icon="flag-outline" label="Report user" onPress={() => setReporting({ user: person })} testID="hub-report-user" />
          )
        }
      />
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + space.xxl, alignItems: 'center' }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={accent} />}
      >
        <View style={{ width }}>
          <Animated.View entering={FadeInDown.springify().damping(18)} style={styles.hero} onLayout={(e) => setHeroH(Math.round(e.nativeEvent.layout.height))}>
            <VibeHeader vibe={vibe} width={width} height={heroH} star={star} />

            <View style={styles.topRow}>
              <View style={[styles.avatarWrap, star && styles.avatarGlow]} testID={star ? 'profile-star-ring' : undefined}>
                <Avatar uri={person.avatar_url} name={name} size={width < 380 ? 92 : 104} online={online} ring={star} />
              </View>
              <View style={styles.stats} testID="profile-stats">
                <Stat value={compactCount(counts.posts)} label="Posts" onPress={() => setTab('posts')} testID="stat-posts" />
                <Stat value={compactCount(counts.reels)} label="Reels" onPress={() => setTab('reels')} testID="stat-reels" />
                <Stat value={compactCount(dayOnes.length)} label="Day One" testID="stat-day-one" last />
              </View>
            </View>

            <View style={styles.nameRow}>
              <Text style={[styles.name, { fontFamily: headlineFont }]} numberOfLines={2}>
                {name}
              </Text>
            </View>
            {star || dayOnes.length ? (
              <View style={styles.badges}>
                {star ? <BoaStarBadge size={18} /> : null}
                {dayOnes.length ? <DayOneBadge size={18} /> : null}
              </View>
            ) : null}
            {alias ? (
              <Text style={styles.handle} numberOfLines={1} testID="profile-contact-note">
                Saved contact{person.display_name ? ` · ${person.display_name}` : ''}
              </Text>
            ) : null}
            <Text style={styles.handle} numberOfLines={1}>
              @{person.username}
              <Text style={styles.seen}>{`  ·  ${mine ? (person.visible_on_hub ? 'Visible on the Hub' : 'Hidden from the Hub') : lastSeen(person.last_seen_at, online) || 'On the Hub'}`}</Text>
            </Text>
            {roles.length ? (
              <Text style={styles.roles} numberOfLines={2}>
                {roles.map(roleLabel).join('  ·  ')}
              </Text>
            ) : null}
            {person.bio ? (
              <Text style={styles.bio} numberOfLines={6}>
                {person.bio}
              </Text>
            ) : mine ? (
              <Text style={[styles.bio, { color: colors.textFaint }]} onPress={() => navigation.navigate('HubSettings')}>
                Add a bio so people know what you do.
              </Text>
            ) : null}
            {person.open_for_work ? <GoldBadge label="OPEN FOR WORK" icon="briefcase" style={{ marginTop: space.md, alignSelf: 'flex-start' }} /> : null}
            {status ? (
              <Animated.View entering={FadeIn} style={styles.status}>
                <NowPlaying person={person} size="lg" lines={2} />
              </Animated.View>
            ) : null}

            <View style={styles.actions}>
              {mine ? (
                <>
                  <Action label="Edit profile" icon="create-outline" onPress={() => navigation.navigate('HubSettings')} testID="profile-edit" />
                  <Action label="Splits" icon="pie-chart-outline" onPress={() => navigation.navigate('HubSplits')} testID="profile-splits" />
                  <Action label="Profile vibe" icon="color-palette-outline" onPress={() => setVibeOpen(true)} testID="profile-vibe" />
                </>
              ) : isBlocked ? (
                <Action label="Unblock" icon="lock-open-outline" onPress={() => unblock(id).catch(() => {})} />
              ) : (
                <>
                  {open ? (
                    <Action
                      primary
                      label={opening ? 'Opening' : 'Message'}
                      icon="chatbubble-ellipses"
                      onPress={message}
                      disabled={opening}
                      send={vibe.send}
                      sendFg={vibe.sendIcon}
                      glow={alpha(vibe.accent, 0.4)}
                      testID="profile-message"
                    />
                  ) : (
                    <Action label="Messages off" icon="lock-closed-outline" onPress={() => Alert.alert('Messages off', MESSAGES_CLOSED)} testID="profile-messages-off" />
                  )}
                  <Action label={alias ? 'Edit contact' : 'Save contact'} icon={alias ? 'person-circle-outline' : 'person-add-outline'} onPress={() => setContactOpen(true)} testID="profile-contact" />
                  <Action label="Block" icon="ban-outline" onPress={confirmBlock} testID="profile-block" />
                </>
              )}
            </View>
          </Animated.View>

          {dayOnes.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayOnes} testID="profile-day-ones">
              {dayOnes.map((d) => (
                <View key={`${d.kind}:${d.item_id}`} style={[styles.dayOne, { maxWidth: Math.min(260, width - space.lg * 3) }]}>
                  <View style={styles.dayOneIcon}>
                    <Ionicons name={d.kind === 'original' ? 'film' : 'radio'} size={17} color={colors.gold} />
                  </View>
                  <View style={styles.dayOneText}>
                    <Text style={styles.dayOneKicker}>Day One</Text>
                    <Text style={styles.dayOneTitle} numberOfLines={1}>
                      {d.item_label || (d.kind === 'original' ? 'BOA Original' : 'Station')}
                    </Text>
                    <Text style={styles.dayOneRank} numberOfLines={1}>
                      {placeLine(d.rank)}
                    </Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          ) : null}

          <Favourites userId={id} myId={userId} />

          <ProfileTabs value={tab} onChange={setTab} width={width} accent={accent} />
          {!grid ? (
            <GridSkeleton width={width} style={{ marginTop: space.md }} />
          ) : grid.rows.length ? (
            <PostGrid posts={grid.rows} width={width} onOpen={openPost} />
          ) : grid.error ? (
            <Text style={[type.bodyMuted, styles.gridError]}>{grid.error}</Text>
          ) : (
            <GridEmpty tab={tab} mine={mine} onCreate={newPost} />
          )}
        </View>
      </ScrollView>
      {mine ? <BoaCodeSheet open={codeOpen} onClose={() => setCodeOpen(false)} profile={person} /> : null}
      {mine ? <ProfileVibeSheet open={vibeOpen} onClose={() => setVibeOpen(false)} /> : null}
      <ContactSheet person={contactOpen ? person : null} onClose={() => setContactOpen(false)} />
      <BlockSheet person={blocking} onClose={() => setBlocking(null)} />
      <ReportSheet target={reporting} onClose={(didBlock) => (setReporting(null), didBlock && navigation.goBack())} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  headerActions: { flexDirection: 'row', gap: space.sm },
  hero: { paddingHorizontal: space.lg, paddingTop: space.sm, overflow: 'hidden' },
  // Two soft lights in the vibe's own colours, high in the header, standing
  // in for the gold-and-violet stage light on anything but Noir.
  vibeGlowA: { position: 'absolute', top: -50, left: -40, width: 220, height: 220, borderRadius: 110, opacity: 0.55 },
  vibeGlowB: { position: 'absolute', top: -20, right: -50, width: 240, height: 240, borderRadius: 120, opacity: 0.4 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  avatarWrap: { borderRadius: 999 },
  avatarGlow: { boxShadow: '0px 0px 28px rgba(226,168,75,0.7)' },
  // Three equal columns on a dark glass strip, split by hairlines, so the
  // numbers line up however wide they are.
  stats: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingVertical: space.md,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(18,18,22,0.55)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  stat: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
  statDivider: { borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: colors.border },
  statValue: { fontFamily: fonts.bold, fontSize: 20, lineHeight: 24, letterSpacing: -0.5, color: colors.text },
  statLabel: { fontFamily: fonts.medium, fontSize: 12, color: colors.textMuted, marginTop: 2 },
  nameRow: { marginTop: space.lg },
  name: { fontFamily: fonts.semibold, fontSize: 24, lineHeight: 29, letterSpacing: -0.8, color: colors.text },
  badges: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm, marginTop: space.sm + 2 },
  handle: { fontFamily: fonts.semibold, fontSize: 13.5, color: colors.textMuted, marginTop: space.sm },
  seen: { fontFamily: fonts.medium, color: colors.textFaint },
  roles: { fontFamily: fonts.mono, fontSize: 10.5, letterSpacing: 1.6, textTransform: 'uppercase', color: colors.gold, marginTop: space.md, lineHeight: 16 },
  bio: { fontFamily: fonts.medium, fontSize: 14.5, lineHeight: 21, color: colors.text, marginTop: space.sm },
  status: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    alignSelf: 'flex-start',
    maxWidth: '100%',
    marginTop: space.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.goldSoft,
  },
  actions: { flexDirection: 'row', gap: space.sm, marginTop: space.lg },
  action: { flex: 1, height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: radius.md, overflow: 'hidden', paddingHorizontal: space.md },
  actionPrimary: { backgroundColor: colors.gold, boxShadow: '0px 6px 20px rgba(226,168,75,0.35)' },
  actionGlass: { backgroundColor: 'rgba(18,18,22,0.7)', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong },
  actionText: { fontFamily: fonts.semibold, fontSize: 14, flexShrink: 1 },
  // Accolade cards: where you were a Day One, each one legible on two lines,
  // a gold mark set off from the name and its place. Premium, not a crammed pill.
  dayOnes: { paddingHorizontal: space.lg, gap: space.sm + 2, paddingTop: space.md },
  dayOne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingLeft: space.sm + 2,
    paddingRight: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(246,211,138,0.5)',
    // A deeper, less transparent card so the gold text and the rank read
    // cleanly over any vibe behind it: a premium plaque, not a faint tint.
    backgroundColor: 'rgba(24,20,12,0.9)',
    boxShadow: '0px 6px 20px rgba(0,0,0,0.45)',
  },
  dayOneIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(226,168,75,0.2)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(246,211,138,0.6)',
  },
  dayOneText: { flexShrink: 1 },
  // Legible accolade text: a brighter gold kicker, a bigger title, and a rank
  // in warm off-white rather than a muted grey that got lost on the plaque.
  dayOneKicker: { fontFamily: fonts.monoMedium, fontSize: 9.5, letterSpacing: 1.6, textTransform: 'uppercase', color: '#F6D38A' },
  dayOneTitle: { fontFamily: fonts.semibold, fontSize: 15.5, lineHeight: 20, letterSpacing: -0.3, color: colors.text, marginTop: 3 },
  dayOneRank: { fontFamily: fonts.medium, fontSize: 12.5, color: 'rgba(243,239,232,0.82)', marginTop: 2 },
  gridError: { textAlign: 'center', marginTop: space.xxl, paddingHorizontal: space.lg },
});

/** The member's chosen typeface dresses this page (and the other scoped pages), nothing else. */
export default function HubProfileScreen(props) {
  return (
    <FontScope>
      <HubProfileScreenBody {...props} />
    </FontScope>
  );
}
