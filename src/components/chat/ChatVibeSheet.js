import { StyleSheet, Text, View } from 'react-native';
import { useHub } from '../../context/HubContext';
import useChatVibe from '../../chat/vibes';
import BottomSheet from '../BottomSheet';
import VibePicker from './VibePicker';
import { colors, fonts, space, type } from '../../theme';

/**
 * The chat vibe picker in a sheet. Picking a vibe shows that vibe whole:
 * its own bubbles take over from a Chat Appearance colour, which would
 * otherwise paint every vibe the same.
 */
export default function ChatVibeSheet({ open, onClose }) {
  const { chatTheme, setChatTheme } = useHub();
  const { vibe, setVibe, customColor, setCustomColor } = useChatVibe();
  const pickVibe = (id) => {
    setVibe(id);
    if (chatTheme) setChatTheme?.(null)?.catch?.(() => {});
  };
  const pickCustom = (hex) => {
    setCustomColor(hex);
    if (chatTheme) setChatTheme?.(null)?.catch?.(() => {});
  };
  return (
    <BottomSheet open={open} onClose={onClose} dragAnywhere={false}>
      <View style={styles.sheet} testID="chat-vibe-sheet">
        <Text style={styles.sheetKicker}>Chat vibe</Text>
        <Text style={[type.bodyMuted, { marginBottom: space.lg }]}>How your conversations look. Applies to every chat on this phone.</Text>
        <VibePicker value={vibe.id} onChange={pickVibe} customColor={customColor} onCustomColor={pickCustom} />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheet: { paddingHorizontal: space.lg, paddingBottom: space.sm },
  sheetKicker: { fontFamily: fonts.stamp, fontSize: 11, letterSpacing: 2.4, textTransform: 'uppercase', color: colors.textMuted, marginBottom: space.xs },
});
