import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn, FadeInDown, FadeInRight } from 'react-native-reanimated';
import { useHub } from '../../context/HubContext';
import * as hub from '../../api/hub';
import useConversations from '../../hooks/useConversations';
import { talent as roster } from '../../data/boaContent';
import { Avatar, IconButton, BoaStarBadge } from '../../components/kit';
import { Button, Slate } from '../../components/ui';
import DailySpark from '../../components/DailySpark';
import Headshot from '../../components/Headshot';
import { ThreadRow } from './HubChatsScreen';
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
    <Animated.View entering={FadeInRight.delay(Math.min(index, 6) * 60).springify().damping(18)}>
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
        <Text style={styles.personRole} numberOfLines={1}>
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

// BOA's own roster, as tall portrait cards.
function TalentCard({ person, onPress, index }) {
  return (
    <Animated.View entering={FadeInRight.delay(Math.min(index, 6) * 60).springify().damping(18)}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${person.name}, ${person.role}`}
        style={({ pressed }) => [styles.talent, pressed && { transform: [{ scale: 0.97 }] }]}
        testID={`pulse-talent-${person.id}`}
      >
        <Headshot person={person} width={132} ratio={132 / 188} label={false} />
        <LinearGradient colors={['rgba(5,5,6,0)', 'rgba(5,5,6,0.9)']} locations={[0.45, 1]} style={StyleSheet.absoluteFill} />
        <View style={styles.talentText}>
          <Text style={styles.personName} numberOfLines={1}>
            {person.name}
          </Text>
          <Text style={styles.personRole} numberOfLines={1}>
            {person.role}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
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
 * today's Daily Spark, the Community Pulse (members BOA's admins feature,
 * BOA's roster, the newest people on the Hub, and creatives who do what
 * you do) and your
 * conversations. Never an empty page: with no messages yet, the Pulse is
 * where to start.
 */
export default function ChatHome({ navigation, bottomPadding }) {
  const insets = useSafeAreaInsets();
  const { userId, profile, isOnline, blocked } = useHub();
  const { rows, state, error, reload } = useConversations(userId);
  const [pulse, setPulse] = useState({ featured: [], fresh: [], suggested: [], ready: false });

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
  const unread = visible.filter((c) => c.unread).length;

  return (
    <View style={styles.screen} testID="chat-tab">
      <ScrollView
        contentContainerStyle={{ paddingBottom: bottomPadding }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={state === 'refreshing'} onRefresh={() => reload(true)} tintColor={colors.gold} />}
      >
        <View style={[styles.hero, { paddingTop: insets.top + space.lg }]}>
          <HeroGlow />
          <View style={styles.heroRow}>
            <Pressable onPress={() => navigation.navigate('HubProfile')} accessibilityRole="button" accessibilityLabel="Your Hub profile">
              <Avatar uri={profile?.avatar_url} name={profile ? nameOf(profile) : '?'} size={72} ring />
            </Pressable>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Slate dot color={colors.gold}>
                Creative Hub
              </Slate>
              <Text style={styles.heroTitle} accessibilityRole="header">
                Messages
              </Text>
              {profile?.is_boa_star ? <BoaStarBadge size={18} style={{ alignSelf: 'flex-start', marginTop: 6 }} /> : null}
              <Text style={styles.heroSub} numberOfLines={1}>
                {unread ? `${unread} unread` : profile ? `Hi, ${profile.display_name || profile.username}` : ''}
              </Text>
            </View>
            <IconButton icon="search" label="Find talent" onPress={() => navigation.navigate('HubDirectory')} />
          </View>
        </View>

        <Animated.View entering={FadeInDown.delay(80).springify().damping(18)} style={styles.spark}>
          <DailySpark category={profile?.quote_category} hint={profile?.quote_category ? null : 'Choose your kind in Hub settings.'} />
        </Animated.View>

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
        {!pulse.ready && <ActivityIndicator color={colors.gold} style={{ marginTop: space.lg }} />}

        <SectionTitle kicker="Your inbox" title="Conversations" />
        {state === 'loading' ? (
          <ActivityIndicator color={colors.gold} style={{ marginTop: space.lg }} />
        ) : state === 'error' ? (
          <View style={styles.emptyCard}>
            <Ionicons name="cloud-offline-outline" size={28} color={colors.gold} />
            <Text style={[type.title, styles.emptyTitle]}>Couldn't reach the Hub</Text>
            <Text style={[type.bodyMuted, styles.emptyBody]}>{error}</Text>
            <Button label="Try again" icon="refresh" onPress={() => reload(true)} style={{ marginTop: space.lg }} />
          </View>
        ) : visible.length === 0 ? (
          <Animated.View entering={FadeIn.duration(400)} style={styles.emptyCard} testID="chat-empty">
            <LinearGradient colors={['rgba(226,168,75,0.14)', 'rgba(255,255,255,0.02)']} style={StyleSheet.absoluteFill} />
            <Ionicons name="chatbubbles" size={30} color={colors.gold} />
            <Text style={[type.title, styles.emptyTitle]}>Your first conversation is one tap away</Text>
            <Text style={[type.bodyMuted, styles.emptyBody]}>Say hello to someone from the Pulse above, or find the exact creative you need.</Text>
            <Button label="Find talent" icon="people-outline" onPress={() => navigation.navigate('HubDirectory')} style={{ marginTop: space.lg }} />
          </Animated.View>
        ) : (
          visible.map((item, index) => (
            <ThreadRow
              key={item.id}
              conv={item}
              index={index}
              myId={userId}
              online={isOnline(item.otherId)}
              onPress={() => navigation.navigate('HubThread', { id: item.id })}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  hero: { paddingHorizontal: space.xl, paddingBottom: space.lg, overflow: 'hidden' },
  orb: { position: 'absolute', width: 300, height: 300, borderRadius: 150 },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  heroTitle: { fontFamily: fonts.semibold, fontSize: 34, lineHeight: 38, letterSpacing: -1.4, color: colors.text, marginTop: 4 },
  heroSub: { fontFamily: fonts.medium, fontSize: 13, color: colors.textMuted, marginTop: 2 },
  spark: { paddingHorizontal: space.lg, marginTop: -space.md },
  sectionHead: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: space.xl, marginTop: space.xxl, marginBottom: space.md },
  sectionTitle: { fontFamily: fonts.semibold, fontSize: 21, letterSpacing: -0.6, color: colors.text, marginTop: 4 },
  sectionAction: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingBottom: 3 },
  sectionActionText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.gold },
  rowContent: { paddingHorizontal: space.xl, gap: space.md },
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
  personRole: { fontFamily: fonts.medium, fontSize: 12, color: colors.textMuted, marginTop: 2, textAlign: 'center' },
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
  emptyTitle: { marginTop: space.md, textAlign: 'center' },
  emptyBody: { textAlign: 'center', marginTop: space.sm },
});
