import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useHub } from '../../context/HubContext';
import { supabase } from '../../lib/supabase';
import { deleteMessage, getConversation, listMessages, markRead, sendMessage } from '../../api/hub';
import { Avatar, IconButton, PageHeader } from '../../components/kit';
import { lastSeen } from '../../components/hub/hubNav';
import ReportSheet from '../../components/hub/ReportSheet';
import { Button } from '../../components/ui';
import { chatTime } from './HubChatsScreen';
import { haptics } from '../../utils/haptics';
import { colors, fonts, radius, space, type } from '../../theme';

const MAX_LENGTH = 2000;
const PAGE = 40;

// Newest first (the list is inverted), without duplicates: a message can
// arrive both from the send call and from realtime.
function merge(list, incoming) {
  const byId = new Map(list.map((m) => [m.id, m]));
  for (const m of incoming) byId.set(m.id, { ...byId.get(m.id), ...m });
  return [...byId.values()].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

function Bubble({ message, mine, seen, onLongPress }) {
  return (
    <Animated.View entering={FadeIn.duration(180)} style={[styles.bubbleRow, mine && { justifyContent: 'flex-end' }]}>
      <Pressable
        onLongPress={onLongPress}
        delayLongPress={350}
        accessibilityHint={mine ? 'Hold to delete' : 'Hold to report'}
        style={[styles.bubble, mine ? styles.mine : styles.theirs, message.pending && { opacity: 0.6 }]}
        testID={`hub-message-${message.id}`}
      >
        <Text style={[styles.body, mine && { color: colors.bg }]}>{message.body}</Text>
        <Text style={[styles.meta, mine && { color: 'rgba(5,5,6,0.6)' }]}>
          {message.failed ? 'Not sent · hold to retry' : message.pending ? 'Sending…' : chatTime(message.created_at)}
          {seen ? ' · Seen' : ''}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

/** One conversation: messages live in both directions, with read receipts. */
export default function HubThreadScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const id = route.params?.id;
  const { userId, isOnline, blocked, unblock } = useHub();
  const [conv, setConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [state, setState] = useState('loading'); // loading | ready | error
  const [error, setError] = useState(null);
  const [older, setOlder] = useState('idle'); // idle | loading | done
  const [draft, setDraft] = useState('');
  const [reporting, setReporting] = useState(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    setState('loading');
    try {
      const [c, page] = await Promise.all([getConversation(id, userId), listMessages(id, null, PAGE)]);
      if (!alive.current) return;
      setConv(c);
      setMessages(page);
      setOlder(page.length < PAGE ? 'done' : 'idle');
      setState('ready');
      markRead(id).catch(() => {});
    } catch (err) {
      if (!alive.current) return;
      setError(err.message);
      setState('error');
    }
  }, [id, userId]);

  useEffect(() => {
    if (id && userId) load();
  }, [id, userId, load]);

  const loadOlder = async () => {
    const oldest = messages.filter((m) => !m.pending && !m.failed).at(-1);
    if (older !== 'idle' || !oldest) return;
    setOlder('loading');
    try {
      const page = await listMessages(id, oldest.created_at, PAGE);
      if (!alive.current) return;
      setMessages((m) => merge(m, page));
      setOlder(page.length < PAGE ? 'done' : 'idle');
    } catch {
      if (alive.current) setOlder('idle');
    }
  };

  // New and deleted messages, and the other person's read receipt.
  useEffect(() => {
    if (!supabase || !id || !userId) return;
    const channel = supabase
      .channel(`hub:thread:${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${id}` }, ({ new: m }) => {
        setMessages((list) => merge(list, [m]));
        if (m.sender_id !== userId) {
          haptics.selection();
          markRead(id).catch(() => {});
        }
      })
      // Deletes can't be filtered by thread; only the id comes through.
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, ({ old }) => {
        if (old?.id) setMessages((list) => list.filter((m) => m.id !== old.id));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversations', filter: `id=eq.${id}` }, ({ new: c }) => {
        setConv((prev) => (prev ? { ...prev, ...c, theirReadAt: c[prev.user_a === userId ? 'b_last_read_at' : 'a_last_read_at'] } : prev));
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, userId]);

  // Shows straight away as "Sending…", then swaps for the saved message.
  const send = async (text = draft, retryId = null) => {
    const body = text.trim();
    if (!body) return;
    const tempId = retryId ?? `pending-${Date.now()}`;
    if (!retryId) setDraft('');
    setMessages((list) =>
      merge(
        list.filter((m) => m.id !== tempId),
        [{ id: tempId, body, sender_id: userId, created_at: new Date().toISOString(), pending: true }],
      ),
    );
    haptics.tap();
    try {
      const saved = await sendMessage(id, body);
      if (!alive.current) return;
      setMessages((list) => merge(list.filter((m) => m.id !== tempId), [saved]));
    } catch (err) {
      if (!alive.current) return;
      setMessages((list) => list.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true } : m)));
      Alert.alert('Message not sent', err.message);
    }
  };

  const remove = async (message) => {
    try {
      if (!message.failed) await deleteMessage(message.id);
      setMessages((list) => list.filter((m) => m.id !== message.id));
    } catch (err) {
      Alert.alert("Couldn't delete", err.message);
    }
  };

  const onLongPress = (message) => {
    if (message.pending) return;
    haptics.selection();
    if (message.sender_id === userId) {
      const options = [{ text: 'Cancel', style: 'cancel' }];
      if (message.failed) options.push({ text: 'Try again', onPress: () => send(message.body, message.id) });
      options.push({ text: 'Delete', style: 'destructive', onPress: () => remove(message) });
      Alert.alert(message.failed ? 'Not sent' : 'Delete this message?', message.failed ? undefined : 'It will be removed for both of you.', options);
    } else {
      Alert.alert('Message', undefined, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Report', style: 'destructive', onPress: () => setReporting({ message, user: conv?.other ?? { id: message.sender_id } }) },
      ]);
    }
  };

  const other = conv?.other;
  const name = other?.display_name || (other?.username ? `@${other.username}` : 'Conversation');
  const online = conv ? isOnline(conv.otherId) : false;
  const isBlocked = conv ? blocked.has(conv.otherId) : false;
  // "Seen" goes under your latest message once they've read it.
  const lastMine = messages.find((m) => m.sender_id === userId && !m.pending && !m.failed);
  const seenId = lastMine && conv?.theirReadAt && new Date(conv.theirReadAt) >= new Date(lastMine.created_at) ? lastMine.id : null;

  const header = (
    <PageHeader
      kicker={conv ? (online ? 'Online' : lastSeen(other?.last_seen_at, false) || 'Creative Hub') : 'Creative Hub'}
      title={name}
      onBack={() => navigation.goBack()}
      right={
        conv && other ? (
          <Pressable
            onPress={() => navigation.navigate('HubProfile', { id: conv.otherId })}
            accessibilityRole="button"
            accessibilityLabel={`View ${name}'s profile`}
          >
            <Avatar uri={other.avatar_url} name={name} size={40} online={online} />
          </Pressable>
        ) : undefined
      }
    />
  );

  if (state !== 'ready') {
    return (
      <View style={styles.screen} testID="hub-thread">
        {header}
        {state === 'loading' ? (
          <ActivityIndicator color={colors.gold} style={{ marginTop: space.xxxl }} />
        ) : (
          <View style={styles.empty}>
            <Ionicons name="cloud-offline-outline" size={30} color={colors.gold} />
            <Text style={[type.title, { marginTop: space.md, textAlign: 'center' }]}>Couldn't open this conversation</Text>
            <Text style={[type.bodyMuted, { textAlign: 'center', marginTop: space.sm }]}>{error}</Text>
            <Button label="Try again" icon="refresh" onPress={load} style={{ marginTop: space.xl }} />
          </View>
        )}
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined} testID="hub-thread">
      {header}
      <FlatList
        inverted
        data={messages}
        keyExtractor={(m) => m.id}
        renderItem={({ item }) => (
          <Bubble message={item} mine={item.sender_id === userId} seen={item.id === seenId} onLongPress={() => onLongPress(item)} />
        )}
        onEndReachedThreshold={0.4}
        onEndReached={loadOlder}
        contentContainerStyle={{ paddingHorizontal: space.lg, paddingVertical: space.md, flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        ListFooterComponent={older === 'loading' ? <ActivityIndicator color={colors.gold} style={{ margin: space.lg }} /> : null}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={[type.bodyMuted, { textAlign: 'center' }]}>Say hello to {name}.</Text>
          </View>
        }
      />
      {isBlocked ? (
        <View style={[styles.blocked, { paddingBottom: insets.bottom + space.md }]}>
          <Text style={[type.bodyMuted, { flex: 1 }]}>You've blocked {name}. Unblock them to send messages.</Text>
          <Button label="Unblock" variant="ghost" onPress={() => unblock(conv.otherId).catch((e) => Alert.alert('Unblock failed', e.message))} />
        </View>
      ) : (
        <View style={[styles.composer, { paddingBottom: insets.bottom + space.sm }]}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Message"
            placeholderTextColor={colors.textFaint}
            selectionColor={colors.gold}
            multiline
            maxLength={MAX_LENGTH}
            style={styles.input}
            accessibilityLabel="Message"
            testID="hub-composer"
          />
          <IconButton icon="arrow-up" label="Send" filled onPress={() => send()} testID="hub-send" />
        </View>
      )}
      <ReportSheet target={reporting} onClose={(didBlock) => (setReporting(null), didBlock && navigation.goBack())} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  bubbleRow: { flexDirection: 'row', marginVertical: 3 },
  bubble: { maxWidth: '80%', paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.lg },
  mine: { backgroundColor: colors.gold, borderBottomRightRadius: radius.sm },
  theirs: {
    backgroundColor: colors.surfaceRaised,
    borderBottomLeftRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  body: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 21, color: colors.text },
  meta: { fontFamily: fonts.mono, fontSize: 9.5, color: colors.textFaint, marginTop: 3, alignSelf: 'flex-end' },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.bgElevated,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    minHeight: 40,
    paddingHorizontal: space.md,
    paddingVertical: 10,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    color: colors.text,
    fontFamily: fonts.medium,
    fontSize: 15,
  },
  blocked: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  empty: { alignItems: 'center', padding: space.xxl },
});
