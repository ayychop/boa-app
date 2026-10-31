import { Pressable, StyleSheet, View } from 'react-native';
import Text from '../ScopedText';
import { Ionicons } from '@expo/vector-icons';
import { openScheduledCall } from '../../calls/openRoom';
import { haptics } from '../../utils/haptics';
import { colors, fonts, radius, space } from '../../theme';

/**
 * A scheduled-call link in a chat, as a card instead of a raw address: the
 * time it was set for, and one tap to the countdown (which turns into the
 * call when the host starts it). `text` is the message without its link.
 */
export default function CallInvite({ roomId, text, mine, vibe }) {
  const ink = mine ? vibe.mineText : vibe.theirsText;
  const open = () => {
    haptics.tap();
    openScheduledCall(roomId);
  };
  return (
    <Pressable onPress={open} accessibilityRole="button" accessibilityLabel={`Open scheduled call. ${text}`} style={({ pressed }) => [styles.card, pressed && { opacity: 0.8 }]} testID={`call-invite-${roomId}`}>
      <View style={styles.icon}>
        <Ionicons name="videocam" size={18} color={colors.bg} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, { color: ink }]} numberOfLines={2}>
          {text || 'Scheduled call'}
        </Text>
        <Text style={styles.open}>Open countdown</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.gold} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 4, minWidth: 220 },
  icon: { width: 38, height: 38, borderRadius: radius.md, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: fonts.semibold, fontSize: 14.5, lineHeight: 20 },
  open: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1.6, textTransform: 'uppercase', color: colors.gold, marginTop: 3 },
});
