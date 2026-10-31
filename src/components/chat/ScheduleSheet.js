import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Text from '../ScopedText';
import * as Crypto from 'expo-crypto';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import BottomSheet from '../BottomSheet';
import TimeWheel from '../alarms/TimeWheel';
import { Chip } from '../kit';
import { Button } from '../ui';
import { scheduleCall } from '../../api/scheduledCalls';
import { PLAIN_PREFIX, remindForRow, remindToCall } from '../../calls/reminders';
import { openScheduledCall } from '../../calls/openRoom';
import { atTime, clock, dayOptions, defaultSlot, formatWhen, isSchedulable, newRoomId, quickSlots, reminderAt, roomLink, startOfDay } from '../../calls/schedule';
import { haptics } from '../../utils/haptics';
import { colors, fonts, radius, space, type } from '../../theme';

// "Schedule Call" and "Set Reminder", from the chat's calendar button.
//
//   Schedule Call  a call at a time you pick: it's saved to scheduled_calls
//                  (the other person is a participant), you get a reminder 10
//                  minutes before, and the link goes into the chat as a card
//                  the other person taps to open the countdown.
//   Set Reminder   just a reminder on your phone, 10 minutes before, to make
//                  the call yourself. Nothing is saved or sent.

const MODES = [
  { id: 'call', label: 'Schedule Call', icon: 'videocam-outline', testID: 'schedule-call-button' },
  { id: 'reminder', label: 'Set Reminder', icon: 'notifications-outline', testID: 'set-reminder-button' },
];

const REMINDER_FAILS = {
  denied: 'Notifications are off for BOA, so there will be no reminder. Turn them on in Settings.',
  'too-soon': 'It starts in under 10 minutes, so there was no time for a reminder.',
  failed: "Couldn't set the reminder on this phone.",
};

export default function ScheduleSheet({ open, onClose, initialMode = 'call', userId, person, conversationId, onSend }) {
  const name = person?.display_name || (person?.username ? `@${person.username}` : 'them');
  const [mode, setMode] = useState(initialMode);
  const [slot, setSlot] = useState(() => defaultSlot());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);

  // A fresh start each time it opens: the next quarter hour, the asked-for mode.
  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
    setSlot(defaultSlot());
    setBusy(false);
    setError(null);
    setDone(null);
  }, [open, initialMode]);

  const now = Date.now();
  const days = useMemo(() => dayOptions(open ? Date.now() : 0), [open]);
  const quick = useMemo(() => quickSlots(open ? Date.now() : 0), [open]);
  const when = atTime(slot.day, slot.hour, slot.minute);
  const ok = isSchedulable(when, now);
  const remindAt = ok ? reminderAt(when, now) : null;

  const pickQuick = (q) => {
    const d = new Date(q.at);
    setSlot({ day: startOfDay(q.at), hour: d.getHours(), minute: d.getMinutes() });
    setError(null);
  };

  // A quick pick is lit while the wheel sits on its time.
  const isQuick = (q) => {
    const d = new Date(q.at);
    return atTime(startOfDay(q.at), d.getHours(), d.getMinutes()) === when;
  };

  const submit = async () => {
    if (busy) return;
    if (!isSchedulable(when)) {
      setError('Pick a time at least a minute from now.');
      return;
    }
    setBusy(true);
    setError(null);
    haptics.tap();
    try {
      if (mode === 'call') {
        if (!userId || !person?.id) throw new Error('Open a chat with someone to schedule a call.');
        const roomId = newRoomId(Crypto);
        const row = await scheduleCall({ hostId: userId, participantId: person.id, roomId, when });
        const rem = await remindForRow(row, name).catch(() => ({ reason: 'failed' }));
        // The link, as a message: the other person's phone turns it into a card.
        try {
          await onSend?.(`📅 Video call · ${formatWhen(when)}\n${roomLink(roomId)}`);
        } catch {
          // The call is saved either way; the card below can still share it.
        }
        haptics.success();
        setDone({ kind: 'call', roomId, when, reminder: rem.at ? rem.at : null, why: rem.reason });
      } else {
        const rem = await remindToCall({ key: `${PLAIN_PREFIX}${newRoomId(Crypto)}`, when, name, conversationId });
        if (!rem.at) {
          setError(REMINDER_FAILS[rem.reason] ?? REMINDER_FAILS.failed);
          return;
        }
        haptics.success();
        setDone({ kind: 'reminder', when, reminder: rem.at });
      }
    } catch (err) {
      setError(err?.message || 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const close = () => onClose?.();

  return (
    <BottomSheet open={open} onClose={close} dragAnywhere={false}>
      <View style={styles.sheet} testID="schedule-sheet">
        {done ? (
          <Animated.View entering={FadeIn.duration(300)} style={styles.done} testID="schedule-done">
            <View style={styles.tick}>
              <Ionicons name="checkmark" size={28} color={colors.bg} />
            </View>
            <Text style={styles.doneTitle}>{done.kind === 'call' ? 'Call scheduled' : 'Reminder set'}</Text>
            <Text style={styles.doneWhen}>{formatWhen(done.when)}</Text>
            <Text style={styles.doneNote}>
              {done.reminder
                ? `We'll remind you at ${clock(done.reminder)}, 10 minutes before.`
                : done.why
                  ? REMINDER_FAILS[done.why]
                  : ''}
              {done.kind === 'call' ? `${done.reminder || done.why ? ' ' : ''}${name} has the link in the chat.` : ''}
            </Text>
            {done.kind === 'call' ? <Button label="Open countdown" icon="timer-outline" onPress={() => { close(); openScheduledCall(done.roomId); }} style={styles.full} testID="schedule-open" /> : null}
            <Button label="Done" variant="ghost" onPress={close} style={styles.full} testID="schedule-done-button" />
          </Animated.View>
        ) : (
          <>
            <Text style={styles.kicker}>{mode === 'call' ? 'Schedule a call' : 'Remind me to call'}</Text>
            <Text style={styles.sub} numberOfLines={2}>
              {mode === 'call' ? `Pick a time. ${name} gets the link here in the chat.` : `A reminder on this phone, 10 minutes before. ${name} isn't told.`}
            </Text>

            <View style={styles.modes} accessibilityRole="tablist">
              {MODES.map((m) => {
                const on = m.id === mode;
                return (
                  <Pressable
                    key={m.id}
                    onPress={() => {
                      if (on) return;
                      haptics.selection();
                      setMode(m.id);
                      setError(null);
                    }}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={m.label}
                    style={[styles.mode, on && styles.modeOn]}
                    testID={m.testID}
                  >
                    <Ionicons name={m.icon} size={17} color={on ? colors.bg : colors.textMuted} />
                    <Text style={[styles.modeText, on && { color: colors.bg }]}>{m.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
              {quick.map((q) => (
                <Chip key={q.id} label={q.label} selected={isQuick(q)} onPress={() => pickQuick(q)} testID={`schedule-quick-${q.id}`} />
              ))}
            </ScrollView>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
              {days.map((d) => (
                <Chip key={d.id} label={d.label} selected={d.at === slot.day} onPress={() => { setSlot((s) => ({ ...s, day: d.at })); setError(null); }} testID={`schedule-day-${d.id}`} />
              ))}
            </ScrollView>

            <Animated.View entering={FadeInDown.duration(260)} style={styles.wheel}>
              <TimeWheel hour={slot.hour} minute={slot.minute} onChange={(hour, minute) => { setSlot((s) => ({ ...s, hour, minute })); setError(null); }} />
            </Animated.View>

            <Text style={[styles.summary, !ok && { color: '#E5806B' }]} testID="schedule-summary">
              {ok ? `${formatWhen(when)}${remindAt ? `  ·  reminder ${clock(remindAt)}` : ''}` : 'Pick a time at least a minute from now.'}
            </Text>
            {error ? (
              <Text style={styles.error} testID="schedule-error">
                {error}
              </Text>
            ) : null}

            <Button
              label={busy ? 'Saving...' : mode === 'call' ? 'Schedule call' : 'Set reminder'}
              icon={mode === 'call' ? 'calendar-outline' : 'notifications-outline'}
              onPress={submit}
              disabled={busy || !ok}
              style={styles.full}
              testID="schedule-submit"
            />
          </>
        )}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheet: { paddingHorizontal: space.xl, paddingTop: space.sm },
  kicker: { ...type.title, marginBottom: 4 },
  sub: { ...type.bodyMuted, marginBottom: space.lg },
  modes: { flexDirection: 'row', padding: 4, gap: 4, borderRadius: radius.lg, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong, marginBottom: space.lg },
  mode: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, height: 46, borderRadius: radius.md + 2 },
  modeOn: { backgroundColor: colors.gold },
  modeText: { fontFamily: fonts.bold, fontSize: 14, color: colors.textMuted },
  chips: { gap: space.sm, paddingBottom: space.md },
  wheel: { marginTop: space.sm, marginBottom: space.md },
  summary: { fontFamily: fonts.medium, fontSize: 13.5, color: colors.gold, textAlign: 'center', marginBottom: space.md },
  error: { fontFamily: fonts.medium, fontSize: 13, color: '#E5806B', textAlign: 'center', marginBottom: space.md },
  full: { alignSelf: 'stretch', marginTop: space.xs },
  done: { alignItems: 'center', gap: space.sm, paddingVertical: space.lg },
  tick: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center', boxShadow: '0px 0px 24px rgba(226,168,75,0.5)', marginBottom: space.sm },
  doneTitle: { ...type.h1, fontSize: 26 },
  doneWhen: { fontFamily: fonts.mono, fontSize: 12.5, letterSpacing: 1.6, color: colors.gold, textTransform: 'uppercase' },
  doneNote: { ...type.bodyMuted, textAlign: 'center', marginBottom: space.md },
});
