import { StyleSheet, Text, View } from 'react-native';
import { isPremiumVibe, useProfileVibe } from '../../chat/vibes';
import { usePremiumMaybe } from '../../context/PremiumContext';
import BottomSheet from '../BottomSheet';
import VibePicker from './VibePicker';
import { colors, fonts, space, type } from '../../theme';

/**
 * The Profile Vibe picker in a sheet. It themes only the Hub profile header,
 * separate from the Chat Vibe: picking one here never changes how your chats
 * look, and the BOA wordmark and the app's gold-and-black chrome stay exactly
 * as they are whatever you choose.
 */
export default function ProfileVibeSheet({ open, onClose }) {
  const { vibe, setVibe, customColor, setCustomColor } = useProfileVibe();
  // Premium vibes and Custom: members only. Outside the Premium provider, and
  // until it has answered, nothing is locked.
  const premium = usePremiumMaybe();
  const locked = !!premium && premium.checked && !premium.hasPremium;
  const gate = (id, apply) => (locked && isPremiumVibe(id) ? premium.requirePremium(apply, 'Living profile vibes and your own colour are part of BOA Premium.') : apply());
  const pickVibe = (id) => gate(id, () => setVibe(id));
  const pickCustom = (hex) => gate('custom', () => setCustomColor(hex));
  return (
    <BottomSheet open={open} onClose={onClose} dragAnywhere={false}>
      <View style={styles.sheet} testID="profile-vibe-sheet">
        <Text style={styles.kicker}>Profile vibe</Text>
        <Text style={[type.bodyMuted, { marginBottom: space.lg }]}>The colours of your profile header. Separate from your chat vibe, and the BOA wordmark never changes.</Text>
        <VibePicker value={vibe.id} onChange={pickVibe} customColor={customColor} onCustomColor={pickCustom} locked={locked} />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheet: { paddingHorizontal: space.lg, paddingBottom: space.sm },
  kicker: { fontFamily: fonts.stamp, fontSize: 11, letterSpacing: 2.4, textTransform: 'uppercase', color: colors.textMuted, marginBottom: space.xs },
});
