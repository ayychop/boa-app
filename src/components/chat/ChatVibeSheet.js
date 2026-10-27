import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useHub } from '../../context/HubContext';
import useChatVibe, { isPremiumVibe, MOTION, STATIC } from '../../chat/vibes';
import { usePremiumMaybe } from '../../context/PremiumContext';
import BottomSheet from '../BottomSheet';
import VibePicker from './VibePicker';
import { haptics } from '../../utils/haptics';
import { colors, fonts, radius, space, type } from '../../theme';

const MODES = [
  { id: MOTION, label: 'Motion', detail: 'Light drifts, records turn', icon: 'sparkles' },
  { id: STATIC, label: 'Static', detail: 'The same scene, held still', icon: 'image-outline' },
];

/**
 * The chat vibe picker in a sheet: Motion or Static first, then the vibes.
 * A pick swaps the thread's backdrop at once, behind the sheet. Picking a
 * vibe shows that vibe whole: its own bubbles take over from a Chat
 * Appearance colour, which would otherwise paint every vibe the same.
 */
export default function ChatVibeSheet({ open, onClose }) {
  const { chatTheme, setChatTheme } = useHub();
  const { vibe, setVibe, customColor, setCustomColor, motion, setMotion } = useChatVibe();
  // Premium vibes and Custom: members only. Outside the Premium provider, and
  // until it has answered, nothing is locked.
  const premium = usePremiumMaybe();
  const locked = !!premium && premium.checked && !premium.hasPremium;
  const gate = (id, apply) => (locked && isPremiumVibe(id) ? premium.requirePremium(apply, 'Living chat vibes and your own colour are part of BOA Premium.') : apply());
  const pickVibe = (id) =>
    gate(id, () => {
      setVibe(id);
      if (chatTheme) setChatTheme?.(null)?.catch?.(() => {});
    });
  const pickCustom = (hex) =>
    gate('custom', () => {
      setCustomColor(hex);
      if (chatTheme) setChatTheme?.(null)?.catch?.(() => {});
    });
  const pickMode = (id) => {
    if (id === motion) return;
    haptics.selection();
    setMotion(id);
  };
  return (
    <BottomSheet open={open} onClose={onClose} dragAnywhere={false}>
      <View style={styles.sheet} testID="chat-vibe-sheet">
        <Text style={styles.kicker}>Chat vibe</Text>
        <Text style={[type.bodyMuted, { marginBottom: space.lg }]}>How your conversations look. Applies to every chat on this phone.</Text>
        <View style={styles.modes} accessibilityRole="radiogroup">
          {MODES.map((m) => {
            const on = m.id === motion;
            return (
              <Pressable
                key={m.id}
                onPress={() => pickMode(m.id)}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${m.label}: ${m.detail}`}
                style={({ pressed }) => [styles.mode, on && { borderColor: vibe.accentEdge, backgroundColor: vibe.accentSoft }, pressed && { opacity: 0.8 }]}
                testID={`vibe-mode-${m.id}`}
              >
                <Ionicons name={m.icon} size={16} color={on ? vibe.accent : colors.textMuted} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.modeLabel, on && { color: vibe.accent }]}>{m.label}</Text>
                  <Text style={styles.modeDetail} numberOfLines={1}>
                    {m.detail}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
        <VibePicker value={vibe.id} onChange={pickVibe} customColor={customColor} onCustomColor={pickCustom} locked={locked} />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheet: { paddingHorizontal: space.lg, paddingBottom: space.sm },
  kicker: { fontFamily: fonts.stamp, fontSize: 11, letterSpacing: 2.4, textTransform: 'uppercase', color: colors.textMuted, marginBottom: space.xs },
  modes: { flexDirection: 'row', gap: space.sm, marginBottom: space.lg },
  mode: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm + 2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  modeLabel: { fontFamily: fonts.stamp, fontSize: 12, letterSpacing: 1.6, textTransform: 'uppercase', color: colors.text },
  modeDetail: { fontFamily: fonts.chat, fontSize: 11.5, color: colors.textFaint, marginTop: 1 },
});
