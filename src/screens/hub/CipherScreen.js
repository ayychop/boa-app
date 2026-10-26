import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useHub } from '../../context/HubContext';
import { getProfile } from '../../api/hub';
import { kindOf, listLiveRooms, liveFor, openRoom, ROOM_KINDS, roomHeadcounts, roomProblem } from '../../api/cipher';
import { supabase } from '../../lib/supabase';
import { ownChannel } from '../../lib/realtime';
import BottomSheet from '../../components/BottomSheet';
import { Avatar, Chip, Field, PageHeader } from '../../components/kit';
import { Button, PulseDot, Slate } from '../../components/ui';
import { colors, fonts, radius, space, type } from '../../theme';

/** A live room on a frosted card: what kind, its name, who's hosting, how many are in. */
export function RoomCard({ room, host, count, onPress, index = 0 }) {
  const kind = kindOf(room.kind);
  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index, 6) * 50).springify().damping(18)}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${room.title}, ${kind.label}, ${count ?? 0} in the room`}
        style={({ pressed }) => [styles.card, pressed && { transform: [{ scale: 0.98 }] }]}
        testID={`cipher-room-${room.id}`}
      >
        <LinearGradient colors={['rgba(226,168,75,0.16)', 'rgba(120,80,200,0.08)', 'rgba(255,255,255,0.02)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <View style={styles.cardTop}>
          <View style={styles.livePill}>
            <PulseDot color="#FF4D5E" size={6} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
          <View style={styles.kind}>
            <Ionicons name={kind.icon} size={12} color={colors.gold} />
            <Text style={styles.kindText}>{kind.label}</Text>
          </View>
          <View style={{ flex: 1 }} />
          <Ionicons name="headset" size={13} color={colors.textMuted} />
          <Text style={styles.count}>{count ?? 0}</Text>
        </View>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {room.title}
        </Text>
        {room.now_playing ? (
          <View style={styles.spinning}>
            <Ionicons name="disc" size={13} color={colors.gold} />
            <Text style={styles.spinningText} numberOfLines={1}>
              {room.now_playing}
            </Text>
          </View>
        ) : null}
        <View style={styles.cardHost}>
          <Avatar uri={host?.avatar_url} name={host?.display_name || host?.username || '?'} size={28} ring={!!host?.is_boa_star} />
          <Text style={styles.hostName} numberOfLines={1}>
            {host ? host.display_name || `@${host.username}` : 'Host'}
          </Text>
          <Text style={styles.liveFor}>{liveFor(room.started_at)}</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

/** Live rooms and their hosts and headcounts, kept current over Realtime. */
export function useLiveRooms(limit = 30) {
  const [state, setState] = useState({ rooms: [], hosts: {}, counts: {}, status: 'loading', error: null });
  const load = useCallback(async () => {
    try {
      const rooms = await listLiveRooms(limit);
      const [counts, hostRows] = await Promise.all([
        roomHeadcounts(rooms.map((r) => r.id)).catch(() => ({})),
        Promise.all([...new Set(rooms.map((r) => r.host_id))].map((id) => getProfile(id).catch(() => null))),
      ]);
      const hosts = Object.fromEntries(hostRows.filter(Boolean).map((p) => [p.id, p]));
      setState({ rooms, hosts, counts, status: 'ready', error: null });
    } catch (err) {
      setState((s) => ({ ...s, status: 'error', error: err.message }));
    }
  }, [limit]);
  useEffect(() => {
    load();
    if (!supabase) return undefined;
    const channel = ownChannel('hub:cipher:lobby')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_sessions' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'session_participants' }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);
  return { ...state, reload: load };
}

/**
 * The Cipher: live audio rooms on the Hub, free to join. Artists and
 * producers take the mic to play unreleased tracks, freestyle or host a
 * listening party; everyone else pulls up a seat.
 */
export default function CipherScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { userId, profile } = useHub();
  const { rooms, hosts, counts, status, error, reload } = useLiveRooms();
  const [composing, setComposing] = useState(false);
  const [form, setForm] = useState({ title: '', kind: 'listening_party', description: '' });
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const goLive = async () => {
    const problem = roomProblem(form);
    if (problem) return Alert.alert('Almost', problem);
    setBusy(true);
    try {
      const room = await openRoom(userId, form);
      setComposing(false);
      setForm({ title: '', kind: 'listening_party', description: '' });
      navigation.navigate('CipherRoom', { id: room.id });
    } catch (err) {
      Alert.alert("Couldn't go live", err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen} testID="cipher">
      <PageHeader kicker="Creative Hub · Live" title="The Cipher" onBack={() => navigation.goBack()} />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: insets.bottom + space.xxl }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await reload();
              setRefreshing(false);
            }}
            tintColor={colors.gold}
          />
        }
      >
        <View style={styles.hero}>
          <LinearGradient colors={['rgba(255,77,94,0.18)', 'rgba(226,168,75,0.14)', 'rgba(5,5,6,0)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          <View style={styles.heroIcon}>
            <Ionicons name="mic" size={26} color={colors.bg} />
          </View>
          <Text style={styles.heroTitle}>Take the mic.</Text>
          <Text style={styles.heroBody}>Listening parties, freestyles and jam sessions, live with the Hub. Free for everyone, always.</Text>
          <Button label="Go live" icon="radio" onPress={() => setComposing(true)} disabled={!profile || !!profile?.banned_at} style={{ marginTop: space.lg, alignSelf: 'flex-start' }} />
        </View>

        <Slate dot color="#FF4D5E" style={{ marginTop: space.xl, marginBottom: space.md }}>
          {rooms.length ? `${rooms.length} live now` : 'Live now'}
        </Slate>
        {status === 'loading' ? (
          <ActivityIndicator color={colors.gold} style={{ marginTop: space.lg }} />
        ) : status === 'error' ? (
          <Text style={[type.bodyMuted, { textAlign: 'center' }]}>{error}</Text>
        ) : rooms.length === 0 ? (
          <View style={styles.empty} testID="cipher-empty">
            <Ionicons name="radio-outline" size={30} color={colors.gold} />
            <Text style={[type.title, { marginTop: space.md, textAlign: 'center' }]}>The room is quiet</Text>
            <Text style={[type.bodyMuted, { marginTop: space.sm, textAlign: 'center' }]}>Nobody is live right now. Start the first cipher: play the new joint, test a hook, run a freestyle.</Text>
          </View>
        ) : (
          <View style={{ gap: space.md }}>
            {rooms.map((r, i) => (
              <RoomCard key={r.id} room={r} host={hosts[r.host_id]} count={counts[r.id]} index={i} onPress={() => navigation.navigate('CipherRoom', { id: r.id })} />
            ))}
          </View>
        )}
      </ScrollView>

      <BottomSheet open={composing} onClose={() => setComposing(false)} glass>
        <View style={{ paddingHorizontal: space.lg }} testID="cipher-compose">
          <Slate dot color="#FF4D5E">
            Go live
          </Slate>
          <Text style={[type.title, { marginTop: space.sm }]}>Open a room</Text>
          <Field label="Room name" value={form.title} onChangeText={(t) => setForm((f) => ({ ...f, title: t.slice(0, 80) }))} placeholder="Late night listening: the new EP" style={{ marginTop: space.lg }} testID="cipher-title" />
          <Text style={styles.label}>What kind</Text>
          <View style={styles.kinds}>
            {ROOM_KINDS.map((k) => (
              <Chip key={k.id} label={k.label} icon={k.icon} selected={form.kind === k.id} onPress={() => setForm((f) => ({ ...f, kind: k.id }))} />
            ))}
          </View>
          <Field label="About (optional)" value={form.description} onChangeText={(t) => setForm((f) => ({ ...f, description: t.slice(0, 500) }))} placeholder="Bring your headphones." multiline style={{ marginTop: space.lg }} />
          <Button label={busy ? 'Going live' : 'Go live'} icon="radio" onPress={goLive} disabled={busy} style={{ marginTop: space.xl, alignSelf: 'stretch' }} />
        </View>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  hero: { padding: space.xl, borderRadius: radius.xl, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.14)', backgroundColor: 'rgba(18,18,22,0.6)' },
  heroIcon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.gold, boxShadow: '0px 0px 24px rgba(226,168,75,0.6)' },
  heroTitle: { fontFamily: fonts.semibold, fontSize: 30, letterSpacing: -1.2, color: colors.text, marginTop: space.lg },
  heroBody: { fontFamily: fonts.regular, fontSize: 14.5, lineHeight: 21, color: colors.textMuted, marginTop: space.sm },
  card: { padding: space.lg, borderRadius: radius.xl, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.14)', backgroundColor: 'rgba(18,18,22,0.7)' },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: 'rgba(255,77,94,0.16)', borderWidth: 1, borderColor: 'rgba(255,77,94,0.5)' },
  liveText: { fontFamily: fonts.monoMedium, fontSize: 9.5, letterSpacing: 1.6, color: '#FF7A87' },
  kind: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  kindText: { fontFamily: fonts.semibold, fontSize: 12, color: colors.gold },
  count: { fontFamily: fonts.semibold, fontSize: 12.5, color: colors.textMuted },
  cardTitle: { fontFamily: fonts.semibold, fontSize: 19, lineHeight: 24, letterSpacing: -0.5, color: colors.text, marginTop: space.md },
  spinning: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: space.sm },
  spinningText: { fontFamily: fonts.medium, fontSize: 13, color: colors.textMuted, flexShrink: 1 },
  cardHost: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.md },
  hostName: { fontFamily: fonts.semibold, fontSize: 13, color: colors.text, flexShrink: 1 },
  liveFor: { fontFamily: fonts.medium, fontSize: 12, color: colors.textFaint, marginLeft: 'auto' },
  empty: { alignItems: 'center', padding: space.xl, borderRadius: radius.xl, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(226,168,75,0.35)', backgroundColor: 'rgba(18,18,22,0.6)' },
  label: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1.8, textTransform: 'uppercase', color: colors.textMuted, marginTop: space.lg, marginBottom: 8 },
  kinds: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
