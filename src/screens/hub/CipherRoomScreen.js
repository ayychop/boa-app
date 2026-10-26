import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { ZoomIn, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useHub } from '../../context/HubContext';
import { getProfile } from '../../api/hub';
import * as cipher from '../../api/cipher';
import { supabase } from '../../lib/supabase';
import { ownChannel } from '../../lib/realtime';
import { Avatar, BoaStarBadge, Field, IconButton, PageHeader } from '../../components/kit';
import BottomSheet from '../../components/BottomSheet';
import { Button, PulseDot, Slate } from '../../components/ui';
import { haptics } from '../../utils/haptics';
import { colors, fonts, radius, space, type } from '../../theme';

const REACTIONS = ['🔥', '💯', '🙌', '🎶', '😮'];
const RED = '#FF4D5E';

// A soft gold halo that breathes behind whoever has their mic open.
function MicHalo({ size }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration: 1400 }), -1, true);
  }, [t]);
  const style = useAnimatedStyle(() => ({ opacity: 0.35 + t.value * 0.45, transform: [{ scale: 1 + t.value * 0.08 }] }));
  return <Animated.View pointerEvents="none" style={[styles.halo, { width: size + 16, height: size + 16, borderRadius: (size + 16) / 2, top: -8, left: -8 }, style]} />;
}

function Seat({ person, seat, size, onPress, me }) {
  const name = person ? person.display_name || `@${person.username}` : '...';
  const live = seat.role !== 'listener' && !seat.muted;
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={`${name}${seat.role === 'host' ? ', host' : ''}${seat.hand_raised ? ', hand raised' : ''}`} style={[styles.seat, { width: size + 24 }]} testID={`seat-${seat.user_id}`}>
      <View style={{ width: size, height: size }}>
        {live ? <MicHalo size={size} /> : null}
        <Avatar uri={person?.avatar_url} name={name} size={size} ring={seat.role === 'host' || !!person?.is_boa_star} />
        {seat.role !== 'listener' ? (
          <View style={[styles.micBadge, live && styles.micBadgeLive]}>
            <Ionicons name={seat.muted ? 'mic-off' : 'mic'} size={11} color={live ? colors.bg : colors.textMuted} />
          </View>
        ) : null}
        {seat.hand_raised ? (
          <Animated.View entering={ZoomIn} style={styles.hand}>
            <Text style={{ fontSize: 13 }}>✋</Text>
          </Animated.View>
        ) : null}
      </View>
      <Text style={styles.seatName} numberOfLines={1}>
        {me ? 'You' : name}
      </Text>
      {seat.role === 'host' ? <Text style={styles.seatRole}>HOST</Text> : seat.role === 'speaker' ? <Text style={styles.seatRole}>ON THE MIC</Text> : null}
    </Pressable>
  );
}

// A reaction floats up from the bottom and fades, on everyone's phone.
function Floater({ emoji, x }) {
  const y = useSharedValue(0);
  useEffect(() => {
    y.value = withTiming(1, { duration: 2200 });
  }, [y]);
  const style = useAnimatedStyle(() => ({ opacity: 1 - y.value, transform: [{ translateY: -y.value * 260 }, { scale: 1 + y.value * 0.4 }] }));
  return <Animated.Text style={[styles.floater, { left: x }, style]}>{emoji}</Animated.Text>;
}

/** A Cipher room: the stage, the audience, raised hands, reactions, and what's spinning. */
export default function CipherRoomScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { userId } = useHub();
  const id = route.params?.id;
  const [room, setRoom] = useState(null);
  const [seats, setSeats] = useState([]);
  const [people, setPeople] = useState({});
  const [status, setStatus] = useState('loading');
  const [floaters, setFloaters] = useState([]);
  const [manage, setManage] = useState(null); // a seat the host tapped
  const [editing, setEditing] = useState(null); // now-spinning text being edited
  const broadcast = useRef(null);
  const asked = useRef(new Set());

  const loadSeats = useCallback(async () => {
    try {
      const rows = await cipher.listParticipants(id);
      setSeats(rows);
      rows
        .map((r) => r.user_id)
        .filter((uid) => !asked.current.has(uid))
        .forEach((uid) => {
          asked.current.add(uid);
          getProfile(uid)
            .then((p) => p && setPeople((m) => ({ ...m, [uid]: p })))
            .catch(() => {});
        });
    } catch {}
  }, [id]);

  // Take a seat on the way in; leave it on the way out.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await cipher.getRoom(id);
        if (!alive) return;
        if (!r || r.status !== 'live') {
          setRoom(r);
          setStatus('ended');
          return;
        }
        setRoom(r);
        await cipher.joinRoom(id, userId);
        await loadSeats();
        if (alive) setStatus('ready');
      } catch (err) {
        if (alive) setStatus('error');
        Alert.alert("Couldn't join", err.message);
      }
    })();
    return () => {
      alive = false;
      cipher.leaveRoom(id, userId).catch(() => {});
    };
  }, [id, userId, loadSeats]);

  // The room and its seats, live; reactions over a broadcast channel.
  useEffect(() => {
    if (!supabase || !id) return undefined;
    const changes = ownChannel(`hub:cipher:${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'live_sessions', filter: `id=eq.${id}` }, ({ new: r }) => {
        if (!r) return;
        setRoom(r);
        if (r.status === 'ended') setStatus('ended');
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'session_participants', filter: `session_id=eq.${id}` }, loadSeats)
      .subscribe();
    // A broadcast topic is the room itself, so every phone in it shares the name.
    const room = supabase.channel(`cipher-reactions:${id}`, { config: { broadcast: { self: true } } });
    room.on('broadcast', { event: 'react' }, ({ payload }) => {
      if (!REACTIONS.includes(payload?.emoji)) return;
      const key = `${Date.now()}-${Math.random()}`;
      setFloaters((f) => [...f.slice(-14), { key, emoji: payload.emoji, x: 24 + Math.random() * Math.max(80, width - 120) }]);
      setTimeout(() => setFloaters((f) => f.filter((x) => x.key !== key)), 2400);
    });
    room.subscribe();
    broadcast.current = room;
    return () => {
      supabase.removeChannel(changes);
      supabase.removeChannel(room);
      broadcast.current = null;
    };
  }, [id, loadSeats, width]);

  const mine = seats.find((s) => s.user_id === userId);
  const isHost = room?.host_id === userId;
  const { stage, audience, hands } = cipher.arrange(seats);

  const act = (fn) => async (...args) => {
    try {
      haptics.selection();
      await fn(...args);
      await loadSeats();
    } catch (err) {
      Alert.alert("Couldn't do that", err.message);
    }
  };
  const toggleHand = act(() => cipher.raiseHand(id, userId, !mine?.hand_raised));
  const toggleMic = act(() => cipher.setMuted(id, userId, !mine?.muted));
  const stepDown = act(() => cipher.setRole(id, userId, 'listener'));
  const react = (emoji) => {
    haptics.tap();
    broadcast.current?.send({ type: 'broadcast', event: 'react', payload: { emoji } });
  };
  const leave = () => navigation.goBack();
  const end = () =>
    Alert.alert('End the room?', 'Everyone in it is sent back to the lobby.', [
      { text: 'Keep going', style: 'cancel' },
      {
        text: 'End room',
        style: 'destructive',
        onPress: () =>
          cipher
            .endRoom(id)
            .then(() => navigation.goBack())
            .catch((e) => Alert.alert("Couldn't end it", e.message)),
      },
    ]);

  if (status === 'loading') {
    return (
      <View style={styles.screen}>
        <PageHeader kicker="The Cipher" title="Joining" backIcon="chevron-down" onBack={leave} />
        <ActivityIndicator color={colors.gold} style={{ marginTop: space.xxxl }} />
      </View>
    );
  }
  if (status !== 'ready') {
    return (
      <View style={styles.screen} testID="cipher-room-ended">
        <PageHeader kicker="The Cipher" title={room?.title ?? 'Room'} backIcon="chevron-down" onBack={leave} />
        <View style={styles.ended}>
          <Ionicons name="radio-outline" size={34} color={colors.gold} />
          <Text style={[type.title, { marginTop: space.md, textAlign: 'center' }]}>{status === 'ended' ? 'This room has ended' : "Couldn't open this room"}</Text>
          <Text style={[type.bodyMuted, { marginTop: space.sm, textAlign: 'center' }]}>Catch the next one in the lobby.</Text>
          <Button label="Back to the lobby" icon="arrow-back" onPress={leave} style={{ marginTop: space.lg }} />
        </View>
      </View>
    );
  }

  const kind = cipher.kindOf(room.kind);
  const seatSize = width < 380 ? 64 : 76;

  return (
    <View style={styles.screen} testID="cipher-room">
      <LinearGradient colors={['rgba(226,168,75,0.14)', 'rgba(120,80,200,0.10)', colors.bg]} locations={[0, 0.35, 0.8]} style={StyleSheet.absoluteFill} />
      <PageHeader
        kicker={`The Cipher · ${kind.label}`}
        title={room.title}
        backIcon="chevron-down"
        onBack={leave}
        right={
          <View style={styles.livePill}>
            <PulseDot color={RED} size={6} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        }
      />
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: 140 + insets.bottom }}>
        <Text style={styles.meta}>
          {cipher.liveFor(room.started_at)} · {seats.length} in the room
        </Text>
        {room.description ? <Text style={[type.bodyMuted, { marginTop: space.sm }]}>{room.description}</Text> : null}

        {/* Now spinning: a glass card the host writes on. */}
        <Pressable onPress={isHost ? () => setEditing(room.now_playing ?? '') : undefined} disabled={!isHost} accessibilityRole={isHost ? 'button' : undefined} accessibilityLabel={isHost ? 'Set what is spinning' : undefined} style={styles.spin} testID="cipher-now-spinning">
          <LinearGradient colors={['rgba(255,255,255,0.10)', 'rgba(255,255,255,0.03)']} style={StyleSheet.absoluteFill} />
          <View style={styles.spinDisc}>
            <Ionicons name="disc" size={22} color={colors.bg} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Slate>Now spinning</Slate>
            <Text style={styles.spinText} numberOfLines={2}>
              {room.now_playing || (isHost ? 'Tap to say what you are playing' : 'Waiting on the host')}
            </Text>
          </View>
          {isHost ? <Ionicons name="create-outline" size={18} color={colors.textMuted} /> : null}
        </Pressable>

        <Slate dot color={colors.gold} style={styles.section}>
          On stage
        </Slate>
        <View style={styles.grid}>
          {stage.map((s) => (
            <Seat key={s.user_id} seat={s} person={people[s.user_id]} size={seatSize} me={s.user_id === userId} onPress={isHost && s.user_id !== userId ? () => setManage(s) : undefined} />
          ))}
        </View>

        {isHost && hands.length ? (
          <>
            <Slate dot color={RED} style={styles.section}>
              {`Hands up · ${hands.length}`}
            </Slate>
            {hands.map((h) => (
              <View key={h.user_id} style={styles.handRow}>
                <Avatar uri={people[h.user_id]?.avatar_url} name={people[h.user_id]?.display_name || '?'} size={36} />
                <Text style={styles.handName} numberOfLines={1}>
                  {people[h.user_id]?.display_name || `@${people[h.user_id]?.username ?? ''}`}
                </Text>
                <Button label="Bring up" icon="mic" onPress={act(() => cipher.setRole(id, h.user_id, 'speaker'))} />
              </View>
            ))}
          </>
        ) : null}

        <Slate style={styles.section}>{`In the room · ${audience.length}`}</Slate>
        {audience.length ? (
          <View style={styles.grid}>
            {audience.map((s) => (
              <Seat key={s.user_id} seat={s} person={people[s.user_id]} size={Math.round(seatSize * 0.75)} me={s.user_id === userId} onPress={isHost ? () => setManage(s) : undefined} />
            ))}
          </View>
        ) : (
          <Text style={type.bodyMuted}>Share the room: the first listeners are on their way.</Text>
        )}
        <Text style={styles.note}>Free to join. Live voice is rolling out: the stage, the mic queue, reactions and Now Spinning are live now.</Text>
      </ScrollView>

      {floaters.map((f) => (
        <Floater key={f.key} emoji={f.emoji} x={f.x} />
      ))}

      {/* The controls: dark glass, clear of the gesture bar. */}
      <View style={[styles.dock, { paddingBottom: Math.max(insets.bottom, space.md) + space.sm }]}>
        <View style={styles.reactions}>
          {REACTIONS.map((e) => (
            <Pressable key={e} onPress={() => react(e)} accessibilityRole="button" accessibilityLabel={`React ${e}`} hitSlop={6} style={({ pressed }) => [styles.reaction, pressed && { transform: [{ scale: 0.88 }] }]}>
              <Text style={{ fontSize: 20 }}>{e}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.controls}>
          <Pressable onPress={leave} accessibilityRole="button" accessibilityLabel="Leave quietly" style={({ pressed }) => [styles.leave, pressed && { opacity: 0.8 }]} testID="cipher-leave">
            <Text style={styles.leaveText}>Leave quietly</Text>
          </Pressable>
          <View style={{ flex: 1 }} />
          {mine?.role === 'listener' ? (
            <IconButton icon={mine.hand_raised ? 'hand-left' : 'hand-left-outline'} label={mine.hand_raised ? 'Lower hand' : 'Raise hand'} onPress={toggleHand} filled={mine.hand_raised} testID="cipher-hand" />
          ) : mine ? (
            <>
              {mine.role === 'speaker' ? <IconButton icon="arrow-down" label="Leave the stage" onPress={stepDown} /> : null}
              <IconButton icon={mine.muted ? 'mic-off' : 'mic'} label={mine.muted ? 'Open your mic' : 'Mute'} onPress={toggleMic} filled={!mine.muted} testID="cipher-mic" />
            </>
          ) : null}
          {isHost ? (
            <Pressable onPress={end} accessibilityRole="button" accessibilityLabel="End room" style={({ pressed }) => [styles.end, pressed && { transform: [{ scale: 0.96 }] }]} testID="cipher-end">
              <Text style={styles.endText}>End</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <BottomSheet open={!!manage} onClose={() => setManage(null)} glass>
        {manage ? (
          <View style={{ paddingHorizontal: space.lg, gap: space.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
              <Avatar uri={people[manage.user_id]?.avatar_url} name={people[manage.user_id]?.display_name || '?'} size={48} />
              <Text style={[type.title, { flexShrink: 1 }]} numberOfLines={1}>
                {people[manage.user_id]?.display_name || `@${people[manage.user_id]?.username ?? ''}`}
              </Text>
              {people[manage.user_id]?.is_boa_star ? <BoaStarBadge size={16} /> : null}
            </View>
            {manage.role === 'listener' ? (
              <Button label="Bring up to the mic" icon="mic" onPress={() => (setManage(null), act(() => cipher.setRole(id, manage.user_id, 'speaker'))())} />
            ) : (
              <Button label="Move to the audience" icon="arrow-down" variant="ghost" onPress={() => (setManage(null), act(() => cipher.setRole(id, manage.user_id, 'listener'))())} />
            )}
            <Button label="View profile" icon="person-outline" variant="ghost" onPress={() => (setManage(null), navigation.navigate('HubProfile', { id: manage.user_id }))} />
          </View>
        ) : null}
      </BottomSheet>

      <BottomSheet open={editing !== null} onClose={() => setEditing(null)} glass>
        <View style={{ paddingHorizontal: space.lg }}>
          <Field label="Now spinning" value={editing ?? ''} onChangeText={(t) => setEditing(t.slice(0, 120))} placeholder="Unreleased: Night Bus (demo)" autoFocus />
          <Button
            label="Update"
            icon="disc"
            onPress={() => {
              const text = editing ?? '';
              setEditing(null);
              cipher.setNowSpinning(id, text).catch((e) => Alert.alert("Couldn't update", e.message));
            }}
            style={{ marginTop: space.lg, alignSelf: 'stretch' }}
          />
        </View>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, height: 30, borderRadius: radius.pill, backgroundColor: 'rgba(255,77,94,0.16)', borderWidth: 1, borderColor: 'rgba(255,77,94,0.5)' },
  liveText: { fontFamily: fonts.monoMedium, fontSize: 10, letterSpacing: 1.6, color: '#FF7A87' },
  meta: { fontFamily: fonts.medium, fontSize: 13, color: colors.textMuted },
  spin: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.lg, padding: space.md, borderRadius: radius.lg, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.18)', backgroundColor: 'rgba(18,18,22,0.6)' },
  spinDisc: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.gold, boxShadow: '0px 0px 18px rgba(226,168,75,0.55)' },
  spinText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text, marginTop: 3 },
  section: { marginTop: space.xl, marginBottom: space.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  seat: { alignItems: 'center', paddingVertical: space.xs },
  halo: { position: 'absolute', borderWidth: 2, borderColor: colors.gold, boxShadow: '0px 0px 18px rgba(226,168,75,0.7)' },
  micBadge: { position: 'absolute', right: -2, bottom: -2, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceRaised, borderWidth: 2, borderColor: colors.bg },
  micBadgeLive: { backgroundColor: colors.gold },
  hand: { position: 'absolute', left: -4, top: -4, width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.borderStrong },
  seatName: { fontFamily: fonts.semibold, fontSize: 12.5, color: colors.text, marginTop: 6, maxWidth: '100%' },
  seatRole: { fontFamily: fonts.mono, fontSize: 8.5, letterSpacing: 1.2, color: colors.gold, marginTop: 2 },
  handRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  handName: { fontFamily: fonts.semibold, fontSize: 14.5, color: colors.text, flex: 1 },
  note: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 18, color: colors.textFaint, marginTop: space.xl },
  floater: { position: 'absolute', bottom: 150, fontSize: 30 },
  dock: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: space.lg, paddingTop: space.md, backgroundColor: 'rgba(8,8,10,0.92)', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderStrong },
  reactions: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: space.md },
  reaction: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.06)' },
  controls: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  leave: { height: 44, paddingHorizontal: space.lg, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong },
  leaveText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.text },
  end: { height: 44, paddingHorizontal: space.xl, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(40,8,12,0.85)', borderWidth: 1, borderColor: 'rgba(255,77,94,0.7)', boxShadow: '0px 0px 18px rgba(255,77,94,0.45)' },
  endText: { fontFamily: fonts.bold, fontSize: 14, color: '#FF7A87', letterSpacing: 0.3 },
});
