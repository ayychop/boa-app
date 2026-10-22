import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CheckIcon } from './icons';
import { haptics } from '../utils/haptics';
import { colors, fonts, radius, space } from '../theme';

/** One choice in a glass menu sheet: icon, label, detail, a check when chosen. */
export default function SheetOption({ icon, label, detail, selected, onPress }) {
  return (
    <Pressable
      onPress={() => {
        haptics.selection();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      style={({ pressed }) => [styles.row, selected && styles.rowSelected, pressed && { opacity: 0.75 }]}
    >
      <View style={[styles.icon, selected && styles.iconSelected]}>{icon}</View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.label}>{label}</Text>
        {detail ? (
          <Text style={styles.detail} numberOfLines={2}>
            {detail}
          </Text>
        ) : null}
      </View>
      {selected && <CheckIcon size={20} color={colors.gold} strokeWidth={2.25} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 64,
    paddingHorizontal: space.md,
    paddingVertical: 10,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  rowSelected: { backgroundColor: 'rgba(226,168,75,0.1)', borderColor: 'rgba(226,168,75,0.35)' },
  icon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(243,239,232,0.08)',
  },
  iconSelected: { backgroundColor: colors.goldSoft },
  label: { fontFamily: fonts.semibold, fontSize: 16, color: colors.text, letterSpacing: -0.2 },
  detail: { fontFamily: fonts.medium, fontSize: 12.5, color: colors.textFaint, marginTop: 2 },
});
