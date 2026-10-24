import { Pressable, StyleSheet, Text } from 'react-native';
import { ZenIcon } from '../icons';
import { useDisplay } from '../../context/DisplayContext';
import { haptics } from '../../utils/haptics';
import { colors, fonts, radius } from '../../theme';

/** Labelled glass pill that starts Zen Mode with its controls. */
export default function ZenButton({ style }) {
  const { enterZen } = useDisplay();
  return (
    <Pressable
      onPress={() => {
        haptics.selection();
        enterZen('active');
      }}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel="Start Zen Mode"
      style={({ pressed }) => [styles.pill, pressed && { transform: [{ scale: 0.94 }], opacity: 0.85 }, style]}
    >
      <ZenIcon size={15} color={colors.gold} />
      <Text style={styles.label}>Zen</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 34,
    paddingHorizontal: 13,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(18,18,22,0.78)',
    borderWidth: 1,
    borderColor: 'rgba(226,168,75,0.45)',
  },
  label: { fontFamily: fonts.semibold, fontSize: 13, color: colors.text, letterSpacing: -0.1 },
});
