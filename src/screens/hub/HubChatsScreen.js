import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useHub } from '../../context/HubContext';
import { supabase } from '../../lib/supabase';
import { listConversations } from '../../api/hub';
import { Avatar, IconButton, PageHeader } from '../../components/kit';
import { Button } from '../../components/ui';
import { colors, fonts, radius, space, type } from '../../theme';

/** "14:05" today, "Mon" this week, "12 Oct" before that. */
export function chatTime(iso, now = new Date()) {
  if (!iso) return '';
  const d = new Date(iso);
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  if (now - d < 6 * 86400000) return d.toLocaleDateString(undefined, { weekday: 'short' });
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function ThreadRow({ conv, online, onPress, index, myId }) {
  const name = conv.other?.display_name || (conv.other?.username ? `@${conv.other.username}` : 'BOA HUB member');
  const preview = `${conv.last_sender_id === myId ? 'You: ' : ''}${conv.last_message_preview ?? ''}`;
  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index, 8) * 40).springify().damping(20)}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${name}${conv.unread ? ', unread' : ''}: ${preview}`}
        style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceRaised }]}
        testID={`hub-thread-${conv.id}`}
      >
        <Avatar uri={conv.other?.avatar_url} name={name} size={52} online={online} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={styles.line}>
            <Text style={[styles.name, conv.unread && { fontFamily: fonts.bold }]} numberOfLines={1}>
              {name}
            </Text>
            <Text style={[styles.time, conv.unread && { color: colors.gold }]}>{chatTime(conv.last_message_at)}</Text>
          </View>
          <View style={styles.line}>
            <Text style={[styles.preview, conv.unread && { color: colors.text }]} numberOfLines={1}>
              {preview}
            </Text>
            {conv.unread && <View style={styles.unread} />}
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

/** Your conversations, latest first, kept live as messages arrive. */
export default function HubChatsScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { userId, isOnline, blocked } = useHub();
  const [rows, setRows] = useState([]);
  const [state, setState] = useState('loading'); // loading | ready | error | refreshing
  const [error, setError] = useState(null);
  const request = useRef(0);

  const load = useCallback(
    async (refreshing = false) => {
      if (!userId) return;
      const id = ++request.current;
      if (refreshing) setState('refreshing');
      try {
        const next = await listConversations(userId);
        if (id !== request.current) return;
        setRows(next);
        setState('ready');
      } catch (err) {
        if (id !== request.current) return;
        setError(err.message);
        setState('error');
      }
    },
    [userId],
  );

  // Fresh each time the list comes back into view (read receipts change).
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // Any change to one of your threads (a new message moves it to the top).
  useEffect(() => {
    if (!supabase || !userId) return;
    let timer = null;
    const reload = () => {
      clearTimeout(timer);
      timer = setTimeout(() => load(), 300);
    };
    const channel = supabase
      .channel(`hub:chats:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations', filter: `user_a=eq.${userId}` }, reload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations', filter: `user_b=eq.${userId}` }, reload)
      .subscribe();
    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [userId, load]);

  const visible = rows.filter((c) => !blocked.has(c.otherId));

  return (
    <View style={styles.screen} testID="hub-chats">
      <PageHeader
        kicker="Creative Hub"
        title="Messages"
        onBack={() => navigation.goBack()}
        right={<IconButton icon="people-outline" label="Find talent" onPress={() => navigation.navigate('HubDirectory')} />}
      />
      <FlatList
        data={visible}
        keyExtractor={(c) => c.id}
        renderItem={({ item, index }) => (
          <ThreadRow
            conv={item}
            index={index}
            myId={userId}
            online={isOnline(item.otherId)}
            onPress={() => navigation.navigate('HubThread', { id: item.id })}
          />
        )}
        refreshControl={<RefreshControl refreshing={state === 'refreshing'} onRefresh={() => load(true)} tintColor={colors.gold} />}
        contentContainerStyle={{ paddingBottom: insets.bottom + space.xxl, flexGrow: 1 }}
        ListEmptyComponent={
          state === 'loading' ? (
            <ActivityIndicator color={colors.gold} style={{ marginTop: space.xxxl }} />
          ) : (
            <View style={styles.empty}>
              <Ionicons name={state === 'error' ? 'cloud-offline-outline' : 'chatbubbles-outline'} size={30} color={colors.gold} />
              <Text style={[type.title, { marginTop: space.md, textAlign: 'center' }]}>
                {state === 'error' ? "Couldn't reach the Hub" : 'No messages yet'}
              </Text>
              <Text style={[type.bodyMuted, { textAlign: 'center', marginTop: space.sm }]}>
                {state === 'error' ? error : 'Find someone in the directory and say hello.'}
              </Text>
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
    padding: space.md,
    borderRadius: radius.lg,
  },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  name: { fontFamily: fonts.semibold, fontSize: 16, color: colors.text, flex: 1 },
  time: { fontFamily: fonts.mono, fontSize: 10.5, color: colors.textFaint },
  preview: { fontFamily: fonts.medium, fontSize: 13, color: colors.textMuted, flex: 1, marginTop: 3 },
  unread: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.gold, marginTop: 3 },
  empty: { alignItems: 'center', padding: space.xxl, marginTop: space.xxl },
});
