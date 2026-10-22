import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import BottomSheet from './BottomSheet';
import SheetOption from './SheetOption';
import { MoonIcon } from './icons';
import { Slate } from './ui';
import { formatRemaining, SLEEP_OPTIONS, useSleepRemaining, useSleepTimer } from '../context/SleepTimerContext';
import { colors, fonts, radius, space, type } from '../theme';

/** Moon button that opens the sleep timer; gold, with a star, while one runs. */
export function SleepButton({ size = 34, style }) {
  const { active, openMenu } = useSleepTimer();
  return (
    <Pressable
      onPress={openMenu}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={active ? 'Sleep timer on. Change or cancel it' : 'Set a sleep timer'}
      style={({ pressed }) => [
        styles.button,
        { width: size, height: size, borderRadius: size / 2 },
        active && styles.buttonActive,
        pressed && { transform: [{ scale: 0.92 }] },
        style,
      ]}
    >
      <MoonIcon active={active} size={Math.round(size * 0.52)} color={active ? colors.gold : colors.text} />
    </Pressable>
  );
}

function Countdown() {
  const remaining = useSleepRemaining();
  return <Text style={styles.countdown}>{formatRemaining(remaining)}</Text>;
}

export default function SleepTimerMenu({ open, onClose }) {
  const { active, start, cancel } = useSleepTimer();
  return (
    <BottomSheet open={open} onClose={onClose} glass>
      <View style={styles.body}>
        <Slate dot>Sleep timer</Slate>
        {active ? (
          <View style={styles.head}>
            <Text style={type.h1}>Pausing in</Text>
            <Countdown />
          </View>
        ) : (
          <Text style={[type.h1, styles.head]}>
            Drift off to <Text style={type.serif}>BOA.</Text>
          </Text>
        )}
        <Text style={[type.bodyMuted, styles.lede]}>Playback pauses when the timer runs out, and the screen dims.</Text>
        <View style={styles.options}>
          {SLEEP_OPTIONS.map((o) => (
            <SheetOption
              key={o.minutes}
              icon={<MoonIcon size={20} color={colors.text} />}
              label={o.label}
              onPress={() => start(o.minutes)}
            />
          ))}
          {active && (
            <SheetOption
              icon={<Ionicons name="close" size={20} color={colors.text} />}
              label="Turn off timer"
              onPress={cancel}
            />
          )}
        </View>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  button: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(243,239,232,0.1)' },
  buttonActive: { backgroundColor: colors.goldSoft, borderWidth: 1, borderColor: 'rgba(226,168,75,0.45)' },
  body: { paddingHorizontal: space.xl },
  head: { marginTop: space.sm, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  countdown: { fontFamily: fonts.light, fontSize: 34, color: colors.gold, letterSpacing: -1, fontVariant: ['tabular-nums'] },
  lede: { marginTop: space.sm },
  options: { marginTop: space.lg, gap: space.xs, borderRadius: radius.lg },
});
