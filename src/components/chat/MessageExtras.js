import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Text from '../ScopedText';
import Animated, { FadeIn, useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withSpring, withTiming, ZoomIn } from 'react-native-reanimated';
import Sticker from './Sticker';
import { describeMessage } from './MessageActions';
import { colors, fonts, radius, space } from '../../theme';

/** Reactions on one message, one chip per emoji: [{ emoji, count, me }], most first. */
export function groupReactions(reactions = [], myId) {
  const byEmoji = new Map();
  for (const r of reactions) {
    const g = byEmoji.get(r.emoji) ?? { emoji: r.emoji, count: 0, me: false };
    g.count += 1;
    if (r.user_id === myId) g.me = true;
    byEmoji.set(r.emoji, g);
  }
  return [...byEmoji.values()].sort((a, b) => b.count - a.count);
}

/**
 * The quoted message at the top of a reply. Tap it to jump to the
 * original. `quoted` is undefined while it isn't loaded, null if deleted.
 */
export function ReplyQuote({ quoted, who, mine, vibe, onPress }) {
  const ink = mine ? vibe.mineText : vibe.theirsText;
  return (
    <Pressable
      onPress={quoted ? onPress : undefined}
      accessibilityRole="button"
      accessibilityLabel={`Reply to ${who}: ${quoted ? describeMessage(quoted) : 'a deleted message'}`}
      style={[styles.quote, { backgroundColor: mine ? 'rgba(0,0,0,0.16)' : 'rgba(255,255,255,0.07)' }]}
      testID="reply-quote"
    >
      <View style={[styles.quoteBar, { backgroundColor: mine ? ink : vibe.accent }]} />
      <View style={{ flexShrink: 1 }}>
        <Text style={[styles.quoteWho, { color: mine ? ink : vibe.accent }]} numberOfLines={1}>
          {who}
        </Text>
        <Text style={[styles.quoteText, { color: ink, opacity: 0.78 }]} numberOfLines={2}>
          {quoted === null ? 'Message deleted' : quoted ? describeMessage(quoted) : 'Earlier message'}
        </Text>
      </View>
    </Pressable>
  );
}

function Chip({ group, vibe, onPress }) {
  const still = useReducedMotion();
  const bump = useSharedValue(1);
  // A count going up gives the chip a little bounce.
  useEffect(() => {
    if (!still) bump.value = withSequence(withTiming(1.25, { duration: 90 }), withSpring(1, { damping: 8, stiffness: 260 }));
  }, [group.count, still, bump]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: bump.value }] }));
  return (
    <Animated.View entering={still ? FadeIn : ZoomIn.springify().damping(10).stiffness(240)} style={style}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${group.emoji} ${group.count}${group.me ? ', yours. Tap to remove' : '. Tap to add yours'}`}
        hitSlop={6}
        style={[styles.chip, group.me && { borderColor: vibe.accentEdge, backgroundColor: 'rgba(32,32,38,0.98)' }]}
        testID={`reaction-chip-${group.emoji}`}
      >
        <Sticker emoji={group.emoji} size={18} />
        {group.count > 1 ? <Text style={styles.count}>{group.count}</Text> : null}
      </Pressable>
    </Animated.View>
  );
}

/** The reaction chips hanging off a bubble's lower edge. onToggle(emoji) adds or takes back yours. */
export function ReactionChips({ reactions, myId, mine, vibe, onToggle }) {
  const groups = groupReactions(reactions, myId);
  if (!groups.length) return null;
  return (
    <View style={[styles.chips, mine ? styles.chipsMine : styles.chipsTheirs]} testID="reaction-chips">
      {groups.map((g) => (
        <Chip key={g.emoji} group={g} vibe={vibe} onPress={() => onToggle(g.me ? null : g.emoji)} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  quote: { flexDirection: 'row', gap: space.sm, borderRadius: radius.md, paddingVertical: 6, paddingRight: space.md, paddingLeft: 0, marginBottom: 6, overflow: 'hidden' },
  quoteBar: { width: 3, borderRadius: 2 },
  quoteWho: { fontFamily: fonts.chatBold, fontSize: 12.5 },
  quoteText: { fontFamily: fonts.chat, fontSize: 13, lineHeight: 17, marginTop: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: -10, zIndex: 2 },
  chipsMine: { justifyContent: 'flex-end', marginRight: space.sm },
  chipsTheirs: { justifyContent: 'flex-start', marginLeft: space.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    height: 26,
    paddingHorizontal: 6,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(22,22,26,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    boxShadow: '0px 4px 12px rgba(0,0,0,0.4)',
  },
  count: { fontFamily: fonts.stamp, fontSize: 11, color: colors.text },
});
