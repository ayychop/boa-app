import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Panel from '../Panel';
import { listUpcoming, subscribeMine } from '../../api/scheduledCalls';
import { getProfile } from '../../api/hub';
import { openScheduledCall } from '../../calls/openRoom';
import { formatWhen, spokenCountdown, timeOf } from '../../calls/schedule';
import { Avatar } from '../kit';
import { Button } from '../ui';
import { ThreadSkeleton } from '../Skeleton';
import { haptics } from '../../utils/haptics';
import { colors, fonts, radius, space, type } from '../../theme';

const nameOf = (p) => (p ? p.display_name || (p.username ? `@${p.username}` : '') : '');

/**
 * The Schedule tab of the inbox: every call you've set up that hasn't
 * started, soonest first, kept live over Realtime (a call someone books with
 * you appears here by itself; one that's started or cancelled leaves). Tap a
 * row for its countdown, from where the host starts it and everyone joins.
 */
export default function ScheduleList({ userId, onSchedule }) {
  const [rows, setRows] = useState([]);
  const [state, setState] = useState('loading');
  const [people, setPeople] = useState({});
  const asked = useRef(new Set());
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const next = await listUpcoming(userId);
      if (!alive.current) return;
      setRows(next);
      setState('ready');
    } catch {
      if (!alive.current) return;
      setState((s) => (s === 'ready' ? s : 'error'));
    }
  }, [userId]);

  useEffect(() => {
    load();
    return subscribeMine(userId, load);
  }, [userId, load]);

  // Who each call is with: the other side of every row, fetched once each.
  useEffect(() => {
    rows.forEach((r) => {
      const otherId = r.host_id === userId ? r.participant_id : r.host_id;
      if (!otherId || asked.current.has(otherId)) return;
      asked.current.add(otherId);
      getProfile(otherId)
        .then((p) => alive.current && p && setPeople((m) => ({ ...m, [otherId]: p })))
        .catch(() => asked.current.delete(otherId));
    });
  }, [rows, userId]);

  if (state === 'loading') return <ThreadSkeleton />;

  if (state === 'error') {
    return (
      <View style={styles.empty} testID="schedule-error">
        <Ionicons name="cloud-offline-outline" size={28} color={colors.gold} />
        <Text style={[type.title, styles.emptyTitle]}>Couldn't load your schedule</Text>
        <Text style={[type.bodyMuted, styles.emptyBody]}>Check your connection and try again.</Text>
        <Button label="Try again" icon="refresh" onPress={load} style={{ marginTop: space.lg }} />
      </View>
    );
  }

  if (rows.length === 0) {
    return (
      <Panel style={styles.empty} testID="schedule-empty">
        <LinearGradient colors={['rgba(226,168,75,0.14)', 'rgba(255,255,255,0.02)']} style={StyleSheet.absoluteFill} />
        <View style={styles.medallion}>
          <LinearGradient colors={['rgba(246,211,138,0.35)', 'rgba(226,168,75,0.05)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          <Ionicons name="calendar" size={28} color={colors.gold} />
        </View>
        <Text style={[type.title, styles.emptyTitle]}>No calls scheduled</Text>
        <Text style={[type.bodyMuted, styles.emptyBody]}>Open a conversation and tap the calendar to set a time. It will wait for you here, with a countdown.</Text>
        {onSchedule ? <Button label="Pick a conversation" icon="calendar-outline" onPress={onSchedule} style={{ marginTop: space.lg }} /> : null}
      </Panel>
    );
  }

  const now = Date.now();
  return (
    <View testID="schedule-list">
      {rows.map((row, index) => {
        const mine = row.host_id === userId;
        const otherId = mine ? row.participant_id : row.host_id;
        const other = people[otherId];
        const when = timeOf(row);
        const name = nameOf(other) || 'BOA member';
        return (
          <Panel key={row.room_id} index={index} style={styles.slot}>
            <Pressable
              onPress={() => {
                haptics.selection();
                openScheduledCall(row.room_id);
              }}
              accessibilityRole="button"
              accessibilityLabel={`Call with ${name}, ${formatWhen(when, now)}, ${spokenCountdown(when - now)}${mine ? '' : ', you were invited'}`}
              style={({ pressed }) => [styles.row, pressed && { transform: [{ scale: 0.98 }] }]}
              testID={`schedule-row-${row.room_id}`}
            >
              <LinearGradient colors={['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.02)']} style={StyleSheet.absoluteFill} />
              <Avatar uri={other?.avatar_url} name={name} size={48} />
              <View style={styles.body}>
                <Text style={styles.name} numberOfLines={1}>
                  {name}
                </Text>
                <Text style={styles.when} numberOfLines={1}>
                  {formatWhen(when, now)}
                </Text>
                <Text style={styles.sub} numberOfLines={1}>
                  {mine ? 'You will start this call' : 'Invited by them'} · {spokenCountdown(when - now)}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.gold} />
            </Pressable>
          </Panel>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  slot: { marginHorizontal: space.lg, marginBottom: space.sm, borderRadius: radius.xl },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(226,168,75,0.35)',
    backgroundColor: 'rgba(18,18,22,0.6)',
  },
  body: { flex: 1, minWidth: 0 },
  name: { fontFamily: fonts.semibold, fontSize: 15.5, lineHeight: 22, color: colors.text },
  when: { fontFamily: fonts.semibold, fontSize: 13.5, lineHeight: 20, color: colors.gold },
  sub: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 17, color: colors.textMuted },
  empty: {
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
});
