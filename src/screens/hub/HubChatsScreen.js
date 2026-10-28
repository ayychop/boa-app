import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useHub } from '../../context/HubContext';
import useConversations from '../../hooks/useConversations';
import useDayOne from '../../hooks/useDayOne';
import { Avatar, IconButton, PageHeader, BoaStarBadge, DayOneBadge } from '../../components/kit';
import { Button } from '../../components/ui';
import NowPlaying from '../../components/hub/NowPlaying';
import { colors, fonts, radius, space, type } from '../../theme';
import { haptics } from '../../utils/haptics';
import { ThreadSkeleton } from '../../components/Skeleton';

/** "14:05" today, "Mon" this week, "12 Oct" before that. */
export function chatTime(iso, now = new Date()) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  if (now - d < 6 * 86400000) return d.toLocaleDateString(undefined, { weekday: 'short' });
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/**
 * One conversation, on frosted glass: a large avatar (gold ring while
 * they're online), their name, the last message and when. Unread threads
 * glow gold at the edge. Rows rise in one after another.
 */
export function ThreadRow({ conv, online, onPress, onLongPress, index, myId, dayOne = false }) {
  const name = conv.other?.display_name || (conv.other?.username ? `@${conv.other.username}` : 'BOA HUB member');
  const preview = `${conv.last_sender_id === myId ? 'You: ' : ''}${conv.last_message_preview ?? ''}`;
  return (
    <Animated.View
      entering={FadeInDown.delay(Math.min(index, 8) * 50)
        .springify()
        .damping(20)}
      layout={LinearTransition.springify().damping(22)}
    >
      <Pressable
        onPress={() => {
          haptics.tap();
          onPress?.();
        }}
        onLongPress={onLongPress}
        delayLongPress={350}
        accessibilityRole="button"
        accessibilityLabel={`${name}${conv.request ? ', message request' : ''}${conv.unread ? ', unread' : ''}${online ? ', online' : ''}: ${preview}`}
        accessibilityHint={onLongPress ? 'Hold for options' : undefined}
        style={({ pressed }) => [styles.row, conv.unread && styles.rowUnread, pressed && { transform: [{ scale: 0.985 }], opacity: 0.92 }]}
        testID={`hub-thread-${conv.id}`}
      >
        <LinearGradient
          colors={conv.unread ? ['rgba(226,168,75,0.16)', 'rgba(226,168,75,0.03)'] : ['rgba(255,255,255,0.07)', 'rgba(255,255,255,0.02)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <Avatar uri={conv.other?.avatar_url} name={name} size={64} online={online} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={styles.line}>
            <Text style={[styles.name, conv.unread && { fontFamily: fonts.bold }, (conv.other?.is_boa_star || dayOne) && { flex: 0, flexShrink: 1 }]} numberOfLines={1}>
              {name}
            </Text>
            {conv.other?.is_boa_star ? <BoaStarBadge size={16} /> : null}
            {dayOne ? <DayOneBadge size={16} label={!conv.other?.is_boa_star} /> : null}
            {conv.other?.is_boa_star || dayOne ? <View style={{ flex: 1 }} /> : null}
            <Text style={[styles.time, conv.unread && { color: colors.gold }]}>{chatTime(conv.last_message_at)}</Text>
          </View>
          <NowPlaying person={conv.other} style={{ marginTop: 2 }} />
          <View style={styles.line}>
            <Text style={[styles.preview, conv.unread && { color: colors.text }]} numberOfLines={2}>
              {preview}
            </Text>
            {conv.unread && <View style={styles.unread} />}
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

/**
 * Your conversations, latest first, kept live as messages arrive. Also the
 * Chat tab's list (`inTab`): no back button, and padded clear of the tab bar.
 */
export default function HubChatsScreen({ navigation, inTab = false, bottomPadding }) {
  const insets = useSafeAreaInsets();
  const { userId, isOnline, blocked } = useHub();
  const { rows, state, error, reload: load } = useConversations(userId);

  const visible = rows.filter((c) => !blocked.has(c.otherId));
  const dayOnes = useDayOne(visible.map((c) => c.otherId));

  return (
    <View style={styles.screen} testID={inTab ? 'chat-tab' : 'hub-chats'}>
      <PageHeader
        kicker="Creative Hub"
        title="Messages"
        onBack={inTab ? undefined : () => navigation.goBack()}
        right={<IconButton icon="people-outline" label="Find talent" onPress={() => navigation.navigate('HubDirectory')} />}
      />
      <FlatList
        data={visible}
        keyExtractor={(c) => c.id}
        renderItem={({ item, index }) => (
          <ThreadRow conv={item} index={index} myId={userId} online={isOnline(item.otherId)} dayOne={dayOnes.has(item.otherId)} onPress={() => navigation.navigate('HubThread', { id: item.id })} />
        )}
        refreshControl={<RefreshControl refreshing={state === 'refreshing'} onRefresh={() => load(true)} tintColor={colors.gold} />}
        contentContainerStyle={{ paddingBottom: bottomPadding ?? insets.bottom + space.xxl, flexGrow: 1 }}
        ListEmptyComponent={
          state === 'loading' ? (
            <ThreadSkeleton rows={5} />
          ) : (
            <View style={styles.empty}>
              <Ionicons name={state === 'error' ? 'cloud-offline-outline' : 'chatbubbles-outline'} size={30} color={colors.gold} />
              <Text style={[type.title, { marginTop: space.md, textAlign: 'center' }]}>{state === 'error' ? "Couldn't reach the Hub" : 'No messages yet'}</Text>
              <Text style={[type.bodyMuted, { textAlign: 'center', marginTop: space.sm }]}>{state === 'error' ? error : 'Find someone in the directory and say hello.'}</Text>
              {state === 'error' ? (
                <Button label="Try again" icon="refresh" onPress={() => load(true)} style={{ marginTop: space.xl }} />
              ) : (
                <Button label="Find talent" icon="people-outline" onPress={() => navigation.navigate('HubDirectory')} style={{ marginTop: space.xl }} />
              )}
            </View>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginHorizontal: space.lg,
    marginBottom: space.sm,
    padding: space.md,
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(18,18,22,0.55)',
  },
  rowUnread: { borderColor: 'rgba(226,168,75,0.55)', boxShadow: '0px 0px 18px rgba(226,168,75,0.18)' },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  name: { fontFamily: fonts.semibold, fontSize: 17, color: colors.text, flex: 1, letterSpacing: -0.2 },
  time: { fontFamily: fonts.mono, fontSize: 10.5, color: colors.textFaint },
  preview: { fontFamily: fonts.medium, fontSize: 13, color: colors.textMuted, flex: 1, marginTop: 3 },
  unread: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.gold, marginTop: 3, boxShadow: '0px 0px 8px rgba(226,168,75,0.8)' },
  empty: { alignItems: 'center', padding: space.xxl, marginTop: space.xxl },
});
