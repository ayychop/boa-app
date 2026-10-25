import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '../kit';
import { colors, fonts, space } from '../../theme';

const AVATAR = 42;

/**
 * The thread's header, on frosted glass that the conversation scrolls under:
 * back, their avatar, their name (with a badge) over the live status line,
 * and the vibe button. Avatar and the name block share one centre line.
 * On Android the blur needs `blurTarget`, the view holding what's behind.
 */
export default function ThreadHeader({ name, person, online, badge, status, vibe, blurTarget, onBack, onProfile, onVibe, onLayout }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.wrap, { paddingTop: insets.top + space.sm }]} onLayout={onLayout} testID="thread-header">
      <BlurView intensity={50} tint="dark" blurMethod="dimezisBlurView" blurTarget={blurTarget} style={StyleSheet.absoluteFill} />
      {/* The glass's tint, which is also its look wherever blur isn't drawn. */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: vibe.bar }]} />
      <LinearGradient colors={['rgba(255,255,255,0.07)', 'rgba(255,255,255,0)']} style={StyleSheet.absoluteFill} pointerEvents="none" />
      <View style={styles.row}>
        <Pressable onPress={onBack} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back" style={({ pressed }) => [styles.icon, pressed && styles.pressed]}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <Pressable
          onPress={onProfile}
          disabled={!onProfile}
          accessibilityRole="button"
          accessibilityLabel={`View ${name}'s profile`}
          style={({ pressed }) => [styles.who, pressed && { opacity: 0.75 }]}
        >
          {person ? <Avatar uri={person.avatar_url} name={name} size={AVATAR} online={online} /> : <View style={styles.avatarSpace} />}
          <View style={styles.text}>
            <View style={styles.nameRow}>
              <Text style={styles.name} numberOfLines={1} accessibilityRole="header">
                {name}
              </Text>
              {badge}
            </View>
            {status}
          </View>
        </Pressable>
        {onVibe ? (
          <Pressable onPress={onVibe} hitSlop={8} accessibilityRole="button" accessibilityLabel="Chat vibe" style={({ pressed }) => [styles.vibe, { borderColor: vibe.accentEdge, backgroundColor: vibe.accentSoft }, pressed && styles.pressed]} testID="thread-vibe">
            <Ionicons name="color-palette-outline" size={18} color={vibe.accent} />
          </Pressable>
        ) : null}
      </View>
      <View style={[styles.edge, { backgroundColor: vibe.accentEdge }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 2, overflow: 'hidden', paddingBottom: space.sm + 2 },
  row: { flexDirection: 'row', alignItems: 'center', paddingLeft: space.xs, paddingRight: space.md, gap: space.xs },
  icon: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.6, transform: [{ scale: 0.94 }] },
  who: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: space.md },
  avatarSpace: { width: AVATAR, height: AVATAR },
  // A fixed height keeps the name block centred on the avatar whether or
  // not there's a status line under the name.
  text: { flex: 1, minWidth: 0, minHeight: AVATAR, justifyContent: 'center' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
  name: { flexShrink: 1, fontFamily: fonts.chatBold, fontSize: 17, lineHeight: 22, letterSpacing: -0.3, color: colors.text },
  vibe: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  // A fine line of the vibe's light along the glass's lower edge.
  edge: { position: 'absolute', left: 0, right: 0, bottom: 0, height: StyleSheet.hairlineWidth, opacity: 0.45 },
});
