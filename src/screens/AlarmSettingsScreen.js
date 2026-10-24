import { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';
import { createAudioPlayer } from 'expo-audio';
import { newAlarm, useAlarms } from '../context/AlarmContext';
import { useUser } from '../context/UserContext';
import { ALARM_SOUNDS, formatTime, repeatLabel, ringsIn, WEEKDAYS } from '../data/alarms';
import { STATIONS_BY_GENRE } from '../data/radioStations';
import { GENRES } from '../api/radio';
import TimeWheel from '../components/alarms/TimeWheel';
import StationLogo from '../components/StationLogo';
import { Chip, Field, PageHeader, Segmented, Toggle } from '../components/kit';
import { Button, Fog, Slate } from '../components/ui';
import { haptics } from '../utils/haptics';
import { colors, fonts, radius, space, type } from '../theme';

// Stations to wake up to: your library first, then two picks per genre.
function useWakeStations() {
  const { saved } = useUser();
  return useMemo(() => {
    const seen = new Set();
    const out = [];
    const add = (s) => {
      if (!s || seen.has(s.id)) return;
      seen.add(s.id);
      out.push(s);
    };
    saved.forEach(add);
    GENRES.forEach((g) => (STATIONS_BY_GENRE[g.tag] ?? []).slice(0, 2).forEach(add));
    return out;
  }, [saved]);
}

// Plays a few seconds of a wake-up sound.
function usePreview() {
  const p = useRef(null);
  const timer = useRef(null);
  const [playing, setPlaying] = useState(null);
  const stop = () => {
    clearTimeout(timer.current);
    try {
      p.current?.pause();
      p.current?.remove();
    } catch {}
    p.current = null;
    setPlaying(null);
  };
  useEffect(() => stop, []);
  const play = (sound) => {
    stop();
    try {
      p.current = createAudioPlayer(sound.asset);
      p.current.play();
      setPlaying(sound.id);
      timer.current = setTimeout(stop, 6000);
    } catch {}
  };
  return { playing, play, stop };
}

function AlarmCard({ alarm, onEdit, onToggle, index }) {
  const what = alarm.sound?.type === 'station' ? alarm.sound.station?.name : ALARM_SOUNDS.find((s) => s.id === alarm.sound?.id)?.label;
  return (
    <Animated.View entering={FadeInDown.delay(index * 50).springify().damping(18)} exiting={FadeOut} layout={LinearTransition.springify()}>
      <Pressable
        onPress={onEdit}
        accessibilityRole="button"
        accessibilityLabel={`${alarm.name}, ${formatTime(alarm.hour, alarm.minute)}, ${repeatLabel(alarm.days)}. Edit`}
        style={({ pressed }) => [styles.card, !alarm.enabled && { opacity: 0.55 }, pressed && { transform: [{ scale: 0.98 }] }]}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.cardTime}>{formatTime(alarm.hour, alarm.minute)}</Text>
          <Text style={styles.cardName} numberOfLines={1}>
            {alarm.name}
          </Text>
          <Text style={styles.cardMeta} numberOfLines={1}>
            {repeatLabel(alarm.days)} · {what}
          </Text>
          {alarm.enabled ? <Text style={styles.cardWhen}>{ringsIn(alarm)}</Text> : null}
        </View>
        <Toggle value={alarm.enabled} onChange={onToggle} label={`${alarm.name} alarm`} testID={`alarm-toggle-${alarm.id}`} />
      </Pressable>
    </Animated.View>
  );
}

function Editor({ initial, onDone, onDelete, isNew }) {
  const { save } = useAlarms();
  const stations = useWakeStations();
  const preview = usePreview();
  const [a, setA] = useState(initial);
  const set = (patch) => setA((x) => ({ ...x, ...patch }));
  const mode = a.sound?.type === 'station' ? 'station' : 'tone';
  const toggleDay = (day) => set({ days: a.days.includes(day) ? a.days.filter((d) => d !== day) : [...a.days, day].sort() });

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.editor} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeIn.duration(300)}>
          <TimeWheel hour={a.hour} minute={a.minute} onChange={(hour, minute) => set({ hour, minute })} />
          <Text style={styles.ringsIn}>{ringsIn({ ...a, enabled: true })}</Text>
        </Animated.View>

        <Field
          label="Alarm name"
          value={a.name}
          onChangeText={(name) => set({ name: name.slice(0, 40) })}
          placeholder="Wake up"
          maxLength={40}
          returnKeyType="done"
          testID="alarm-name"
          style={{ marginTop: space.xl }}
        />

        <Slate style={styles.section}>Repeat</Slate>
        <View style={styles.days}>
          {WEEKDAYS.map((w) => {
            const on = a.days.includes(w.day);
            return (
              <Pressable
                key={w.day}
                onPress={() => {
                  haptics.selection();
                  toggleDay(w.day);
                }}
                accessibilityRole="checkbox"
                accessibilityLabel={w.label}
                accessibilityState={{ checked: on }}
                style={[styles.day, on && styles.dayOn]}
              >
                <Text style={[styles.dayText, on && { color: colors.bg }]}>{w.short}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.repeatLabel}>{repeatLabel(a.days)}</Text>

        <Slate style={styles.section}>Wake up to</Slate>
        <Segmented
          value={mode}
          onChange={(m) => {
            preview.stop();
            set({ sound: m === 'tone' ? { type: 'tone', id: 'bowl' } : { type: 'station', station: stations[0] } });
          }}
          options={[
            { id: 'tone', label: 'A sound', icon: 'musical-notes-outline' },
            { id: 'station', label: 'BOA Radio', icon: 'radio-outline' },
          ]}
        />

        {mode === 'tone' ? (
          <View style={styles.list}>
            {ALARM_SOUNDS.map((s) => {
              const on = a.sound?.id === s.id;
              return (
                <Pressable
                  key={s.id}
                  onPress={() => {
                    haptics.selection();
                    set({ sound: { type: 'tone', id: s.id } });
                    preview.play(s);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={`${s.label}. ${s.detail}. Plays a preview`}
                  testID={`alarm-sound-${s.id}`}
                  style={[styles.option, on && styles.optionOn]}
                >
                  <View style={[styles.optionIcon, on && { backgroundColor: colors.gold }]}>
                    <Ionicons name={preview.playing === s.id ? 'volume-high' : s.icon} size={18} color={on ? colors.bg : colors.gold} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.optionTitle}>{s.label}</Text>
                    <Text style={styles.optionDetail}>{s.detail}</Text>
                  </View>
                  {on ? <Ionicons name="checkmark-circle" size={22} color={colors.gold} /> : null}
                </Pressable>
              );
            })}
          </View>
        ) : (
          <View style={styles.list}>
            <Text style={styles.note}>The station tunes in when the alarm goes off; a soft chime rings first in case the phone is offline.</Text>
            {stations.map((st) => {
              const on = a.sound?.station?.id === st.id;
              return (
                <Pressable
                  key={st.id}
                  onPress={() => {
                    haptics.selection();
                    set({ sound: { type: 'station', station: st } });
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={`Wake up to ${st.name}`}
                  style={[styles.option, on && styles.optionOn]}
                >
                  <StationLogo station={st} size={36} rounded={18} fit="cover" />
                  <Text style={[styles.optionTitle, { flex: 1 }]} numberOfLines={1}>
                    {st.name}
                  </Text>
                  {on ? <Ionicons name="checkmark-circle" size={22} color={colors.gold} /> : null}
                </Pressable>
              );
            })}
          </View>
        )}

        <View style={styles.actions}>
          <Button
            label={isNew ? 'Save alarm' : 'Save changes'}
            icon="checkmark"
            onPress={() => {
              preview.stop();
              save({ ...a, name: a.name.trim() || 'Wake up', enabled: true });
              haptics.success();
              onDone();
            }}
          />
          {!isNew && <Button label="Delete" icon="trash-outline" variant="ghost" onPress={onDelete} />}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/**
 * Alarm Settings, opened from Profile's Zen Mode: your alarms, each with a
 * name, a time, the days it repeats and what it wakes you to (one of three
 * sounds, or a BOA Radio station).
 */
export default function AlarmSettingsScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { alarms, toggle, remove, permission, askPermission } = useAlarms();
  const [editing, setEditing] = useState(null); // { alarm, isNew }

  if (editing) {
    return (
      <View style={styles.screen} testID="alarm-editor">
        <PageHeader
          kicker="Zen Mode"
          title={editing.isNew ? 'New alarm' : 'Edit alarm'}
          backIcon="close"
          onBack={() => setEditing(null)}
        />
        <Editor
          initial={editing.alarm}
          isNew={editing.isNew}
          onDone={() => setEditing(null)}
          onDelete={() => {
            remove(editing.alarm.id);
            setEditing(null);
          }}
        />
      </View>
    );
  }

  const sorted = [...alarms].sort((x, y) => x.hour * 60 + x.minute - (y.hour * 60 + y.minute));
  return (
    <View style={styles.screen} testID="alarm-settings">
      <PageHeader
        kicker="Zen Mode"
        title="Alarm Settings"
        onBack={() => navigation.goBack()}
        right={
          <Pressable
            onPress={() => setEditing({ alarm: newAlarm(), isNew: true })}
            accessibilityRole="button"
            accessibilityLabel="New alarm"
            testID="alarm-new"
            style={({ pressed }) => [styles.add, pressed && { transform: [{ scale: 0.92 }] }]}
          >
            <Ionicons name="add" size={22} color={colors.bg} />
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={{ padding: space.xl, paddingTop: space.sm, paddingBottom: insets.bottom + space.xxl, gap: space.md }}>
        {permission === 'denied' && (
          <Pressable onPress={askPermission} style={styles.warn} accessibilityRole="button">
            <Ionicons name="notifications-off-outline" size={18} color={colors.gold} />
            <Text style={styles.warnText}>Notifications are off, so alarms only ring while BOA is open. Turn them on in Settings.</Text>
          </Pressable>
        )}
        {sorted.length ? (
          sorted.map((al, i) => (
            <AlarmCard key={al.id} index={i} alarm={al} onToggle={() => toggle(al.id)} onEdit={() => setEditing({ alarm: al, isNew: false })} />
          ))
        ) : (
          <View style={styles.empty}>
            <Fog opacity={0.25} />
            <Ionicons name="alarm-outline" size={34} color={colors.gold} />
            <Text style={[type.title, { marginTop: space.md, textAlign: 'center' }]}>Wake up to BOA</Text>
            <Text style={[type.bodyMuted, { textAlign: 'center', marginTop: space.sm }]}>
              Set an alarm with a gentle sound, or wake up to your favourite station.
            </Text>
            <Button label="New alarm" icon="add" onPress={() => setEditing({ alarm: newAlarm(), isNew: true })} style={{ marginTop: space.md }} />
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  add: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  cardTime: { fontFamily: fonts.extralight, fontSize: 46, lineHeight: 50, letterSpacing: -2, color: colors.text, fontVariant: ['tabular-nums'] },
  cardName: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
  cardMeta: { fontFamily: fonts.medium, fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
  cardWhen: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1.4, color: colors.gold, marginTop: 6, textTransform: 'uppercase' },
  empty: { alignItems: 'center', padding: space.xl, borderRadius: radius.xl, overflow: 'hidden', backgroundColor: colors.surface, marginTop: space.lg },
  warn: { flexDirection: 'row', gap: space.sm, alignItems: 'center', padding: space.md, borderRadius: radius.md, backgroundColor: colors.goldSoft },
  warnText: { flex: 1, fontFamily: fonts.medium, fontSize: 12.5, color: colors.text },
  editor: { padding: space.xl, paddingTop: 0, paddingBottom: space.xxxl },
  ringsIn: { textAlign: 'center', fontFamily: fonts.mono, fontSize: 11, letterSpacing: 1.6, color: colors.gold, marginTop: space.sm, textTransform: 'uppercase' },
  section: { marginTop: space.xl, marginBottom: space.md },
  days: { flexDirection: 'row', justifyContent: 'space-between' },
  day: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dayOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  dayText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.text },
  repeatLabel: { fontFamily: fonts.medium, fontSize: 12.5, color: colors.textFaint, marginTop: space.sm },
  list: { gap: space.sm, marginTop: space.md },
  note: { fontFamily: fonts.medium, fontSize: 12.5, color: colors.textFaint, marginBottom: space.xs },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  optionOn: { borderColor: 'rgba(226,168,75,0.8)', backgroundColor: colors.goldSoft },
  optionIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceRaised },
  optionTitle: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
  optionDetail: { fontFamily: fonts.medium, fontSize: 12, color: colors.textFaint, marginTop: 2 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, marginTop: space.xxl },
});
