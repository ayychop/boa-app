import { Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '../kit';
import { useHubMaybe } from '../../context/HubContext';
import { goToTab } from '../../navigation/ref';
import { haptics } from '../../utils/haptics';
import { colors } from '../../theme';

export const SHORTCUT_SIZE = 38;

/**
 * A small round avatar in the corner of Home's header: one tap to your
 * Profile, without going through the tab bar. Your Hub photo when you have
 * one, your initials otherwise, and a plain person mark before you've joined.
 */
export default function ProfileShortcut({ style }) {
  const hub = useHubMaybe();
  const profile = hub?.profile ?? null;
  const name = profile?.display_name || profile?.username || null;
  return (
    <Pressable
      onPress={() => {
        haptics.selection();
        goToTab('Profile');
      }}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel="Your profile"
      testID="home-profile-shortcut"
      style={({ pressed }) => [styles.wrap, pressed && { transform: [{ scale: 0.92 }], opacity: 0.85 }, style]}
    >
      {name || profile?.avatar_url ? (
        <Avatar uri={profile?.avatar_url ?? null} name={name ?? '?'} size={SHORTCUT_SIZE} ring />
      ) : (
        <Ionicons name="person-circle" size={SHORTCUT_SIZE} color={colors.gold} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: SHORTCUT_SIZE,
    height: SHORTCUT_SIZE,
    borderRadius: SHORTCUT_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    // A little dark glass behind it, so it reads over any key art.
    backgroundColor: 'rgba(18,18,22,0.55)',
  },
});
