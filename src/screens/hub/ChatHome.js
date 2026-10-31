import { useEffect, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import { useHub } from '../../context/HubContext';
import * as hub from '../../api/hub';
import useConversations from '../../hooks/useConversations';
import { talent as roster } from '../../data/boaContent';
import { Avatar, IconButton, BoaStarBadge, DayOneBadge } from '../../components/kit';
import { Button, Slate } from '../../components/ui';
import DailySpark from '../../components/DailySpark';
import Headshot from '../../components/Headshot';
import { ThreadRow } from './HubChatsScreen';
import ContactSheet from '../../components/hub/ContactSheet';
import ScheduleList from '../../components/hub/ScheduleList';
import Panel from '../../components/Panel';
import { nameFor, useContactBook } from '../../chat/contacts';
import useDayOne from '../../hooks/useDayOne';
import { CardRowSkeleton, ThreadSkeleton } from '../../components/Skeleton';
import { haptics } from '../../utils/haptics';
import { placeLine } from '../../api/dayOne';
import { askForCallWakeUp } from '../../calls/wakeUp';
import { column } from '../../hooks/useLayout';
import { colors, fonts, radius, space, type } from '../../theme';

const roleLabel = (id) => hub.ROLES.find((r) => r.id === id)?.label ?? null;
const nameOf = (p) => p.display_name || `@${p.username}`;

// Large, warm light behind the header: two soft orbs under a dark veil.
function HeroGlow() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[styles.orb, { top: -120, right: -60, backgroundColor: 'rgba(226,168,75,0.30)' }]} />
      <View style={[styles.orb, { top: -40, left: -110, backgroundColor: 'rgba(120,80,200,0.22)' }]} />
      <LinearGradient colors={['rgba(5,5,6,0)', colors.bg]} locations={[0.35, 1]} style={StyleSheet.absoluteFill} />
    </View>
  );
}

function SectionTitle({ kicker, title, action, onAction }) {
  return (
    <View style={styles.sectionHead}>
      <View style={{ flex: 1 }}>
        <Slate>{kicker}</Slate>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {action ? (
        <Pressable onPress={onAction} hitSlop={10} accessibilityRole="button" style={styles.sectionAction}>
          <Text style={styles.sectionActionText}>{action}</Text>
          <Ionicons name="arrow-forward" size={14} color={colors.gold} />
        </Pressable>
      ) : null}
    </View>
  );
}

// A Hub member, on a frosted card: big avatar (gold ring while online),
// name, what they do, and whether they're open for work.
function PersonCard({ person, online, onPress, index }) {
  const role = roleLabel(person.roles?.[0]);
  return (
    <Animated.View
      entering={FadeInRight.delay(Math.min(index, 6) * 60)
        .springify()
        .damping(18)}
    >
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${nameOf(person)}${role ? `, ${role}` : ''}${online ? ', online' : ''}`}
        style={({ pressed }) => [styles.person, pressed && { transform: [{ scale: 0.97 }] }]}
        testID={`pulse-person-${person.id}`}
      >
        <LinearGradient colors={['rgba(255,255,255,0.09)', 'rgba(255,255,255,0.02)']} style={StyleSheet.absoluteFill} />
        <Avatar uri={person.avatar_url} name={nameOf(person)} size={84} online={online} />
        <Text style={styles.personName} numberOfLines={1}>
          {nameOf(person)}
        </Text>
        <Text style={styles.personRole} numberOfLines={2}>
          {role ?? 'Creative'}
        </Text>
        {person.is_boa_star ? <BoaStarBadge size={18} style={{ marginTop: space.sm }} /> : null}
        {person.open_for_work ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>Open for work</Text>
          </View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

// The foot of a talent card kept clear of the initials: the name, up to two
// lines of role, and the space around them.
const TALENT_TEXT = 82;

// BOA's own roster, as tall portrait cards.
function TalentCard({ person, onPress, index }) {
  return (
    <Animated.View
      entering={FadeInRight.delay(Math.min(index, 6) * 60)
        .springify()
        .damping(18)}
    >
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${person.name}, ${person.role}`}
        style={({ pressed }) => [styles.talent, pressed && { transform: [{ scale: 0.97 }] }]}
        testID={`pulse-talent-${person.id}`}
      >
        <Headshot person={person} width={132} ratio={132 / 188} label={false} reserve={TALENT_TEXT} />
        <LinearGradient colors={['rgba(5,5,6,0)', 'rgba(5,5,6,0.9)']} locations={[0.45, 1]} style={StyleSheet.absoluteFill} />
        <View style={styles.talentText}>
          <Text style={styles.personName} numberOfLines={1}>
            {person.name}
          </Text>
          <Text style={styles.personRole} numberOfLines={2}>
            {person.role}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

// A shortcut on dark glass: an icon in a gold ring, a name and a line.
function Tool({ icon, title, detail, onPress, testID, index = 0 }) {
  return (
    <Panel index={index} style={styles.toolSlot}>
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${detail}`}
      style={({ pressed }) => [styles.tool, pressed && { transform: [{ scale: 0.97 }] }]}
      testID={testID}
    >
      <LinearGradient colors={['rgba(255,255,255,0.09)', 'rgba(255,255,255,0.02)']} style={StyleSheet.absoluteFill} />
      <View style={styles.toolIcon}>
        <Ionicons name={icon} size={20} color={colors.gold} />
      </View>
      <Text style={styles.toolTitle} numberOfLines={2}>
        {title}
      </Text>
      <Text style={styles.toolDetail} numberOfLines={3}>
        {detail}
      </Text>
    </Pressable>
    </Panel>
  );
}

// What each filter says when it's empty: never a dead end.
const EMPTY = {
  primary: {
    icon: 'chatbubbles',
    title: 'Your first conversation is one tap away',
    body: 'Say hello to someone from the Pulse above, or find the exact creative you need.',
    action: 'Find talent',
  },
  general: {
    icon: 'albums',
    title: 'Nothing in General',
    body: 'Hold a conversation in Primary and move it here to keep your main inbox for what matters most.',
  },
  requests: {
    icon: 'shield-checkmark',
    title: 'No message requests',
    body: "When someone new writes to you, it waits here. They can't see that you've read it until you accept.",
  },
};

/** Primary, General, Requests and Schedule: a gold pill marks the one you're on. */
function InboxFilters({ value, onChange, counts }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filtersScroll} contentContainerStyle={styles.filters} accessibilityRole="tablist" testID="inbox-filters">
      {hub.INBOX_FILTERS.map((f) => {
        const on = value === f.id;
        const n = counts[f.id] ?? 0;
        return (
          <Pressable
            hitSlop={6}
            key={f.id}
            onPress={() => {
              if (on) return;
              haptics.selection();
              onChange(f.id);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${f.label}${n ? `, ${n} unread` : ''}`}
            style={[styles.filter, on && styles.filterOn]}
            testID={`inbox-filter-${f.id}`}
          >
            {on ? <LinearGradient colors={['#F6D38A', colors.gold]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} /> : null}
            {f.id === 'schedule' ? <Ionicons name="calendar" size={13} color={on ? colors.bg : colors.gold} /> : null}
            <Text style={[styles.filterText, on && styles.filterTextOn]}>{f.label}</Text>
            {n ? (
              <View style={[styles.filterCount, on && styles.filterCountOn]}>
                <Text style={[styles.filterCountText, on && { color: colors.gold }]}>{n > 9 ? '9+' : n}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function Row({ children }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rowContent}>
      {children}
    </ScrollView>
  );
}

/**
 * The Chat tab once you're on the Hub: a cinematic header with you in it,
 * then your conversations straight away (what you open the tab for), then
 * today's Daily Spark and the Community Pulse (members BOA's admins
 * feature, BOA's roster, the newest people on the Hub, and creatives who do
 * what you do). Never an empty page: with no messages yet, the Pulse is
 * where to start.
 */
export default function ChatHome({ navigation, bottomPadding }) {
  const insets = useSafeAreaInsets();
  const { userId, profile, isOnline, blocked, dayOneNews, clearDayOneNews, heartsUnseen = 0 } = useHub();
  const { rows, state, error, reload } = useConversations(userId);
  const [filter, setFilter] = useState('primary');
  const [pulse, setPulse] = useState({ featured: [], fresh: [], suggested: [], ready: false });

  // Where calls live: if this phone would show the next call as a mere
  // notification on a black lock screen, ask once (at most monthly) to let
  // calls light it up. A call missed that way never ends in "ended", so
  // waiting for one would never ask.
  useEffect(() => {
    askForCallWakeUp();
  }, []);
  // Keyed on what the roles are, not on the array itself, so a profile
  // that's re-read (same roles, new object) doesn't fetch the Pulse again.
  const rolesKey = (profile?.roles ?? []).join(',');
  useEffect(() => {
    let alive = true;
    const roles = rolesKey ? rolesKey.split(',') : [];
    Promise.all([
      hub.listFeatured({ excludeId: userId }).catch(() => []),
      hub.listNewMembers({ excludeId: userId }).catch(() => []),
      hub.listSuggested({ roles, excludeId: userId }).catch(() => []),
    ]).then(([featured, fresh, suggested]) => {
      if (!alive) return;
      // Each person once: featured first, then new, then suggested.
      const seen = new Set(featured.map((p) => p.id));
      const newOnes = fresh.filter((p) => !seen.has(p.id));
      newOnes.forEach((p) => seen.add(p.id));
      setPulse({ featured, fresh: newOnes, suggested: suggested.filter((p) => !seen.has(p.id)), ready: true });
    });
    return () => {
      alive = false;
    };
  }, [userId, rolesKey]);

  const visible = rows.filter((c) => !blocked.has(c.otherId));
  const featured = pulse.featured.filter((p) => !blocked.has(p.id));
  const fresh = pulse.fresh.filter((p) => !blocked.has(p.id));
  const suggested = pulse.suggested.filter((p) => !blocked.has(p.id));
  const openPerson = (p) => navigation.navigate('HubProfile', { id: p.id });
  const unread = visible.filter((c) => c.unread && !c.request).length;
  const inFilter = visible.filter((c) => hub.inboxOf(c) === filter);
  // Unread per filter; every request counts, read or not, until you decide.
  const counts = {
    primary: visible.filter((c) => hub.inboxOf(c) === 'primary' && c.unread).length,
    general: visible.filter((c) => hub.inboxOf(c) === 'general' && c.unread).length,
    requests: visible.filter((c) => c.request).length,
  };
  const empty = EMPTY[filter];

  // Hold a conversation: save or rename the contact, or move it between Primary and General.
  const [contact, setContact] = useState(null);
  const book = useContactBook();
  const options = (conv) => {
    haptics.selection();
    const to = conv.folder === 'general' ? 'primary' : 'general';
    const saved = !!book[conv.otherId];
    const buttons = [
      { text: 'Cancel', style: 'cancel' },
      { text: saved ? 'Edit contact name' : 'Save to contacts', onPress: () => setContact({ id: conv.otherId, ...conv.other }) },
    ];
    if (!conv.request) {
      buttons.push({
        text: to === 'general' ? 'Move to General' : 'Move to Primary',
        onPress: () =>
          hub
            .setConversationFolder(conv.id, to)
            .then(() => {
              haptics.success();
              reload(true);
            })
            .catch((err) => Alert.alert("Couldn't move it", err.message)),
      });
    }
    Alert.alert(nameFor(conv.other, book[conv.otherId]?.name, 'Conversation'), undefined, buttons);
  };
  const dayOnes = useDayOne([userId, ...visible.map((c) => c.otherId)]);

  return (
    <View style={styles.screen} testID="chat-tab">
      <ScrollView
        contentContainerStyle={{ paddingBottom: bottomPadding }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={state === 'refreshing'} onRefresh={() => reload(true)} tintColor={colors.gold} />}
      >
        <View style={[styles.hero, { paddingTop: insets.top + space.lg }]}>
          <HeroGlow />
          <View style={[styles.heroRow, column]}>
            <Pressable onPress={() => navigation.navigate('HubProfile')} accessibilityRole="button" accessibilityLabel="Your Hub profile">
              <Avatar uri={profile?.avatar_url} name={profile ? nameOf(profile) : '?'} size={72} ring />
            </Pressable>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Slate dot color={colors.gold}>
                Creative Hub
              </Slate>
              {/* One line on every width: it shrinks before it would wrap. */}
              <Text style={styles.heroTitle} accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} testID="chat-title">
                Messages
              </Text>
              {profile?.is_boa_star || dayOnes.has(userId) ? (
                <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
                  {profile?.is_boa_star ? <BoaStarBadge size={16} /> : null}
                  {dayOnes.has(userId) ? <DayOneBadge size={16} /> : null}
                </View>
              ) : null}
              <Text style={styles.heroSub} numberOfLines={2}>
                {unread ? `${unread} unread` : profile ? `Hi, ${profile.display_name || profile.username}` : ''}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: space.sm, flexShrink: 0 }}>
              <View>
                <IconButton
                  icon={heartsUnseen ? 'heart' : 'heart-outline'}
                  tone={heartsUnseen ? '#FF3B5C' : colors.text}
                  label={heartsUnseen ? `Hearts, ${heartsUnseen} new` : 'Hearts'}
                  onPress={() => navigation.navigate('HubHearts')}
                  testID="chat-hearts"
                />
                {heartsUnseen ? (
                  <View style={styles.heartBadge} pointerEvents="none">
                    <Text style={styles.heartBadgeText}>{heartsUnseen > 9 ? '9+' : heartsUnseen}</Text>
                  </View>
                ) : null}
              </View>
              <IconButton icon="search" label="Find talent" onPress={() => navigation.navigate('HubDirectory')} />
            </View>
          </View>
        </View>

        {/* The light runs edge to edge; everything under it sits in a centred column. */}
        <View style={column}>
        {/* Your conversations first: what you open the tab for. */}
        <SectionTitle kicker="Your inbox" title="Conversations" />
        <InboxFilters value={filter} onChange={setFilter} counts={counts} />
        {filter === 'schedule' ? (
          <ScheduleList userId={userId} onSchedule={() => setFilter('primary')} />
        ) : state === 'loading' ? (
          <ThreadSkeleton />
        ) : state === 'error' ? (
          <View style={styles.emptyCard}>
            <Ionicons name="cloud-offline-outline" size={28} color={colors.gold} />
            <Text style={[type.title, styles.emptyTitle]}>Couldn't reach the Hub</Text>
            <Text style={[type.bodyMuted, styles.emptyBody]}>{error}</Text>
            <Button label="Try again" icon="refresh" onPress={() => reload(true)} style={{ marginTop: space.lg }} />
          </View>
        ) : inFilter.length === 0 ? (
          <Panel key={filter} style={styles.emptyCard} testID={filter === 'primary' && visible.length === 0 ? 'chat-empty' : `inbox-empty-${filter}`}>
            <LinearGradient colors={['rgba(226,168,75,0.14)', 'rgba(255,255,255,0.02)']} style={StyleSheet.absoluteFill} />
            {/* A gold medallion: the icon on a lit coin, not a bare glyph. */}
            <View style={styles.medallion}>
              <LinearGradient colors={['rgba(246,211,138,0.35)', 'rgba(226,168,75,0.05)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
              <Ionicons name={empty.icon} size={28} color={colors.gold} />
            </View>
            <Text style={[type.title, styles.emptyTitle]}>{empty.title}</Text>
            <Text style={[type.bodyMuted, styles.emptyBody]}>{empty.body}</Text>
            {empty.action ? <Button label={empty.action} icon="people-outline" onPress={() => navigation.navigate('HubDirectory')} style={{ marginTop: space.lg }} /> : null}
          </Panel>
        ) : (
          inFilter.map((item, index) => (
            <ThreadRow
              key={item.id}
              conv={item}
              index={index}
              myId={userId}
              online={isOnline(item.otherId)}
              dayOne={dayOnes.has(item.otherId)}
              onPress={() => navigation.navigate('HubThread', { id: item.id })}
              onLongPress={() => options(item)}
            />
          ))
        )}
        {dayOneNews ? (
          <Animated.View entering={FadeInDown.springify().damping(16)} style={styles.dayOneNews} testID="day-one-news">
            <LinearGradient colors={['rgba(246,211,138,0.22)', 'rgba(255,255,255,0.02)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            <DayOneBadge size={18} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.dayOneTitle} numberOfLines={2}>
                You're a Day One for {dayOneNews.label}
              </Text>
              <Text style={styles.dayOneBody}>{placeLine(dayOneNews.rank)}. It's on your profile now.</Text>
            </View>
            <IconButton icon="close" label="Dismiss" onPress={clearDayOneNews} />
          </Animated.View>
        ) : null}

        {/* Today's line, under your conversations. */}
        <Animated.View entering={FadeInDown.delay(80).springify().damping(18)} style={styles.spark}>
          <DailySpark category={profile?.quote_category} hint={profile?.quote_category ? null : 'Choose your kind in Hub settings.'} />
        </Animated.View>

        <SectionTitle kicker="Your studio" title="Show your work, get paid" />
        <View style={styles.tools}>
          <Tool icon="pie-chart" title="Splits" detail="Split sheets and invoices" onPress={() => navigation.navigate('HubSplits')} testID="tool-splits" />
          <Tool index={1} icon="grid" title="Your profile" detail="Posts, reels and badges" onPress={() => navigation.navigate('HubProfile')} testID="tool-profile" />
        </View>

        {featured.length > 0 && (
          <>
            <SectionTitle kicker="Community Pulse" title="Featured by BOA" />
            <Row>
              {featured.map((p, i) => (
                <PersonCard key={p.id} person={p} index={i} online={isOnline(p.id)} onPress={() => openPerson(p)} />
              ))}
            </Row>
          </>
        )}

        <SectionTitle kicker="Community Pulse" title="Featured talent" action="Roster" onAction={() => navigation.navigate('Talent')} />
        <Row>
          {roster.slice(0, 8).map((p, i) => (
            <TalentCard key={p.id} person={p} index={i} onPress={() => navigation.navigate('Talent', { talentId: p.id })} />
          ))}
        </Row>

        {fresh.length > 0 && (
          <>
            <SectionTitle kicker="Community Pulse" title="New on the Hub" action="Directory" onAction={() => navigation.navigate('HubDirectory')} />
            <Row>
              {fresh.map((p, i) => (
                <PersonCard key={p.id} person={p} index={i} online={isOnline(p.id)} onPress={() => openPerson(p)} />
              ))}
            </Row>
          </>
        )}
        {suggested.length > 0 && (
          <>
            <SectionTitle kicker="Community Pulse" title="Creatives for you" />
            <Row>
              {suggested.map((p, i) => (
                <PersonCard key={p.id} person={p} index={i} online={isOnline(p.id)} onPress={() => openPerson(p)} />
              ))}
            </Row>
          </>
        )}
        {!pulse.ready && <CardRowSkeleton />}
        </View>
      </ScrollView>
      <ContactSheet person={contact} onClose={() => setContact(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  hero: { paddingHorizontal: space.lg, paddingBottom: space.lg, overflow: 'hidden' },
  orb: { position: 'absolute', width: 300, height: 300, borderRadius: 150 },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  heroTitle: { fontFamily: fonts.semibold, fontSize: 34, lineHeight: 38, letterSpacing: -1.4, color: colors.text, marginTop: 4, flexShrink: 1 },
  heroSub: { fontFamily: fonts.medium, fontSize: 13, color: colors.textMuted, marginTop: 2 },
  spark: { paddingHorizontal: space.lg, marginTop: space.xl },
  sectionHead: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: space.lg, marginTop: space.xxl, marginBottom: space.md },
  sectionTitle: { fontFamily: fonts.semibold, fontSize: 21, lineHeight: 32, paddingBottom: 6, letterSpacing: -0.6, color: colors.text, marginTop: 4 },
  sectionAction: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingBottom: 8 },
  sectionActionText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.gold },
  rowContent: { paddingHorizontal: space.lg, paddingTop: 6, paddingBottom: 12, gap: space.md },
  person: {
    width: 148,
    alignItems: 'center',
    paddingVertical: space.lg,
    paddingHorizontal: space.sm,
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(18,18,22,0.6)',
  },
  personName: { fontFamily: fonts.semibold, fontSize: 14.5, color: colors.text, marginTop: space.md, maxWidth: 132, textAlign: 'center' },
  personRole: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 16, color: colors.textMuted, marginTop: 2, textAlign: 'center' },
  badge: { marginTop: space.sm, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: 'rgba(226,168,75,0.16)', borderWidth: 1, borderColor: 'rgba(226,168,75,0.5)' },
  badgeText: { fontFamily: fonts.semibold, fontSize: 10.5, color: colors.gold },
  talent: { width: 132, height: 188, borderRadius: radius.xl, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.14)', backgroundColor: colors.surface },
  talentText: { position: 'absolute', left: space.sm, right: space.sm, bottom: space.md, alignItems: 'center' },
  emptyCard: {
    marginHorizontal: space.lg,
    padding: space.xl,
    alignItems: 'center',
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(226,168,75,0.35)',
    backgroundColor: 'rgba(18,18,22,0.6)',
  },
  heartBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF3B5C',
    borderWidth: 2,
    borderColor: colors.bg,
  },
  heartBadgeText: { fontFamily: fonts.bold, fontSize: 10, color: '#fff' },
  tools: { flexDirection: 'row', gap: space.md, paddingHorizontal: space.lg },
  toolSlot: { flex: 1, minWidth: 0, borderRadius: radius.lg },
  tool: {
    padding: space.md,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(18,18,22,0.6)',
  },
  toolIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.goldSoft, borderWidth: 1, borderColor: 'rgba(226,168,75,0.45)' },
  toolTitle: { fontFamily: fonts.semibold, fontSize: 14, color: colors.text, marginTop: space.md },
  toolDetail: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 16, color: colors.textMuted, marginTop: 2 },
  dayOneNews: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginHorizontal: space.lg,
    marginTop: space.xl,
    padding: space.md,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(246,211,138,0.55)',
    backgroundColor: 'rgba(18,18,22,0.7)',
    boxShadow: '0px 0px 24px rgba(246,211,138,0.2)',
  },
  dayOneTitle: { fontFamily: fonts.semibold, fontSize: 14.5, color: colors.text },
  dayOneBody: { fontFamily: fonts.medium, fontSize: 12, color: '#F6D38A', marginTop: 2 },
  emptyTitle: { marginTop: space.md, textAlign: 'center' },
  medallion: {
    width: 64,
    height: 64,
    borderRadius: 32,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(246,211,138,0.55)',
    boxShadow: '0px 0px 24px rgba(226,168,75,0.35)',
  },
  // Four tabs can be wider than a small phone: they scroll sideways rather than squash.
  filtersScroll: { flexGrow: 0, flexShrink: 0, marginBottom: space.md },
  filters: { flexDirection: 'row', gap: space.sm, paddingHorizontal: space.lg, paddingVertical: 4 },
  filter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(18,18,22,0.6)',
  },
  filterOn: { borderColor: 'rgba(246,211,138,0.9)', boxShadow: '0px 0px 16px rgba(226,168,75,0.35)' },
  filterText: { fontFamily: fonts.semibold, fontSize: 13.5, lineHeight: 19, color: colors.textMuted },
  filterTextOn: { color: colors.bg },
  filterCount: { minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.gold },
  filterCountOn: { backgroundColor: colors.bg },
  filterCountText: { fontFamily: fonts.bold, fontSize: 10, color: colors.bg },
  emptyBody: { textAlign: 'center', marginTop: space.sm },
});
