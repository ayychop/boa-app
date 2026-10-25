import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useHub } from '../../context/HubContext';
import { getProfile, roleLabel, startConversation } from '../../api/hub';
import { BoaStarBadge, Avatar, IconButton, PageHeader } from '../../components/kit';
import { lastSeen, statusLine } from '../../components/hub/hubNav';
import NowPlaying from '../../components/hub/NowPlaying';
import useProfileUpdates from '../../hooks/useProfileUpdates';
import ReportSheet from '../../components/hub/ReportSheet';
import { Button, Fog, GoldBadge, Slate, Viewfinder } from '../../components/ui';
import { colors, fonts, radius, space, type } from '../../theme';

/** A Hub profile: yours (with Edit) or someone else's (Message, Block, Report). */
export default function HubProfileScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { userId, profile: me, isOnline, blocked, block, unblock } = useHub();
  const id = route.params?.id ?? userId;
  const mine = id === userId;
  const [person, setPerson] = useState(mine ? me : null);
  const [state, setState] = useState(mine ? 'ready' : 'loading');
  const [reporting, setReporting] = useState(null);
  const [opening, setOpening] = useState(false);

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

  const confirmBlock = () =>
    Alert.alert(`Block ${person.display_name || `@${person.username}`}?`, "They won't be able to see your profile or message you, and they won't be told.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Block', style: 'destructive', onPress: () => block(id).catch((e) => Alert.alert('Block failed', e.message)) },
    ]);

  if (state !== 'ready' || !person) {
    return (
      <View style={styles.screen}>
        <PageHeader kicker="Creative Hub" title="Profile" onBack={() => navigation.goBack()} />
        {state === 'loading' ? (
          <ActivityIndicator color={colors.gold} style={{ marginTop: space.xxxl }} />
        ) : (
          <Text style={[type.bodyMuted, { textAlign: 'center', marginTop: space.xxxl }]}>This profile isn't available.</Text>
        )}
      </View>
    );
  }

  const status = statusLine(person);
  return (
    <View style={styles.screen} testID={mine ? 'hub-my-profile' : 'hub-profile'}>
      <PageHeader
        kicker="Creative Hub"
        title={`@${person.username}`}
        onBack={() => navigation.goBack()}
        right={
          mine ? (
            <IconButton icon="settings-outline" label="Hub settings" onPress={() => navigation.navigate('HubSettings')} />
          ) : (
            <IconButton icon="flag-outline" label="Report user" onPress={() => setReporting({ user: person })} testID="hub-report-user" />
          )
        }
      />
      <ScrollView contentContainerStyle={{ padding: space.xl, paddingTop: 0, paddingBottom: insets.bottom + space.xxl }}>
        <Animated.View entering={FadeInDown.springify().damping(18)} style={styles.card}>
          <LinearGradient colors={['rgba(226,168,75,0.22)', 'rgba(226,168,75,0)']} style={StyleSheet.absoluteFill} />
          <Fog opacity={0.22} />
          <Viewfinder inset={12} size={12} />
          <Avatar uri={person.avatar_url} name={person.display_name || person.username} size={112} online={online} ring />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={styles.name}>{person.display_name || `@${person.username}`}</Text>
            {person.is_boa_star ? <BoaStarBadge size={22} /> : null}
          </View>
          <Text style={styles.seen}>{mine ? (person.visible_on_hub ? 'Visible on the Hub' : 'Hidden from the Hub') : lastSeen(person.last_seen_at, online)}</Text>
          {person.open_for_work && <GoldBadge label="OPEN FOR WORK" icon="briefcase" style={{ marginTop: space.md }} />}
          {status ? (
            <Animated.View entering={FadeIn} style={styles.status}>
              <NowPlaying person={person} size="lg" lines={2} />
            </Animated.View>
          ) : null}
        </Animated.View>

        {person.roles.length > 0 && (
          <>
            <Slate style={styles.section}>Roles</Slate>
            <View style={styles.roles}>
              {person.roles.map((r) => (
                <View key={r} style={styles.role}>
                  <Text style={styles.roleText}>{roleLabel(r)}</Text>
                </View>
              ))}
            </View>
          </>
        )}
        {person.bio ? (
          <>
            <Slate style={styles.section}>About</Slate>
            <Text style={type.body}>{person.bio}</Text>
          </>
        ) : null}

        <View style={styles.actions}>
          {mine ? (
            <Button label="Edit profile" icon="create-outline" onPress={() => navigation.navigate('HubSettings')} />
          ) : isBlocked ? (
            <Button label="Unblock" icon="lock-open-outline" variant="ghost" onPress={() => unblock(id).catch(() => {})} />
          ) : (
            <>
              <Button label={opening ? 'Opening' : 'Message'} icon="chatbubble-ellipses" onPress={message} disabled={opening} />
              <Button label="Block" icon="ban-outline" variant="ghost" onPress={confirmBlock} />
            </>
          )}
        </View>
      </ScrollView>
      <ReportSheet target={reporting} onClose={(didBlock) => (setReporting(null), didBlock && navigation.goBack())} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  card: {
    alignItems: 'center',
    padding: space.xl,
    paddingTop: space.xxl,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  name: { fontFamily: fonts.semibold, fontSize: 26, letterSpacing: -0.8, color: colors.text, marginTop: space.lg, textAlign: 'center' },
  seen: { fontFamily: fonts.medium, fontSize: 12.5, color: colors.textFaint, marginTop: 4 },
  status: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: space.lg, paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.pill, backgroundColor: colors.goldSoft },
  statusText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.text, flexShrink: 1 },
  section: { marginTop: space.xl, marginBottom: space.md },
  roles: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  role: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill, borderWidth: 1, borderColor: 'rgba(226,168,75,0.5)' },
  roleText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.gold },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, marginTop: space.xxl },
});
