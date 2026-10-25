import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Keyboard, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useHub } from '../../context/HubContext';
import { supabase } from '../../lib/supabase';
import {
  deleteMessage,
  getConversation,
  isExpired,
  listMessages,
  markRead,
  MEDIA_QUALITY,
  mediaKind,
  mediaProblem,
  sendMedia,
  sendMessage,
  uploadChatMedia,
} from '../../api/hub';
import { setOpenThread } from '../../chat/notifications';
import { Avatar, PageHeader } from '../../components/kit';
import { lastSeen } from '../../components/hub/hubNav';
import ReportSheet from '../../components/hub/ReportSheet';
import NowPlaying from '../../components/hub/NowPlaying';
import useProfileUpdates from '../../hooks/useProfileUpdates';
import AmbientGlow from '../../components/chat/AmbientGlow';
import Composer from '../../components/chat/Composer';
import { MediaTile, MediaViewer, VoiceNote } from '../../components/chat/media';
import { Button } from '../../components/ui';
import { chatTime } from './HubChatsScreen';
import { haptics } from '../../utils/haptics';
import { colors, fonts, radius, space, type } from '../../theme';

const PAGE = 40;
// Disappearing messages are swept from the screen this often.
const EXPIRY_SWEEP_MS = 30000;

// Newest first (the list is inverted), without duplicates: a message can
// arrive both from the send call and from realtime.
function merge(list, incoming) {
  const byId = new Map(list.map((m) => [m.id, m]));
  for (const m of incoming) byId.set(m.id, { ...byId.get(m.id), ...m });
  return [...byId.values()].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

/** The keyboard pushes the composer up: padding on iOS, a shorter screen on Android. */
export const keyboardBehavior = (os = Platform.OS) => (os === 'ios' ? 'padding' : 'height');

/** "23h left" for a disappearing message. */
function timeLeft(expiresAt) {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return null;
  const h = Math.floor(ms / 3600000);
  return h >= 1 ? `${h}h left` : `${Math.max(1, Math.round(ms / 60000))}m left`;
}

// Frosted glass: a translucent fill with a light sheen across the top and a
// fine bright edge, over the ambient glow behind the thread. Yours are warm
// gold glass; theirs are smoky.
function Bubble({ message, mine, seen, onLongPress, onOpenMedia }) {
  const media = message.kind === 'image' || message.kind === 'video';
  const voice = message.kind === 'voice';
  const caption = message.body?.trim();
  const status = message.failed ? 'Not sent · hold to retry' : message.pending ? 'Sending…' : chatTime(message.created_at);
  const left = message.expires_at ? timeLeft(message.expires_at) : null;
  return (
    <Animated.View entering={FadeIn.duration(180)} style={[styles.bubbleRow, mine && { justifyContent: 'flex-end' }]}>
      <Pressable
        onLongPress={onLongPress}
        delayLongPress={350}
        accessibilityHint={mine ? 'Hold to delete' : 'Hold to report'}
        style={[styles.bubble, mine ? styles.mine : styles.theirs, media && styles.mediaBubble, message.pending && !media && { opacity: 0.6 }]}
        testID={`hub-message-${message.id}`}
      >
        <LinearGradient
          colors={mine ? ['rgba(246,206,132,0.96)', 'rgba(214,152,58,0.9)'] : ['rgba(255,255,255,0.13)', 'rgba(255,255,255,0.04)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.4, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View pointerEvents="none" style={[styles.sheen, mine && { backgroundColor: 'rgba(255,255,255,0.28)' }]} />
        {media ? <MediaTile message={message} onOpen={onOpenMedia} /> : null}
        {voice ? <VoiceNote message={message} mine={mine} /> : null}
        {(!media && !voice) || caption ? (
          <Text style={[styles.body, mine && { color: colors.bg }, media && { marginTop: space.sm, paddingHorizontal: space.xs }]}>{message.body}</Text>
        ) : null}
        <Text style={[styles.meta, mine && { color: 'rgba(5,5,6,0.6)' }, media && { paddingHorizontal: space.xs }]}>
          {left ? (
            <>
              <Ionicons name="timer-outline" size={9} /> {left} ·{' '}
            </>
          ) : null}
          {status}
          {seen ? ' · Seen' : ''}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

/** One conversation: messages, photos, videos and voice notes, live in both directions, with read receipts. */
export default function HubThreadScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const id = route.params?.id;
  const { userId, isOnline, blocked, unblock } = useHub();
  const [conv, setConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [state, setState] = useState('loading'); // loading | ready | error
  const [error, setError] = useState(null);
  const [older, setOlder] = useState('idle'); // idle | loading | done
  const [reporting, setReporting] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [keyboard, setKeyboard] = useState(false);
  const alive = useRef(true);
  const list = useRef(null);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // This thread doesn't ring while it's on screen.
  useFocusEffect(
    useCallback(() => {
      setOpenThread(id);
      return () => setOpenThread(null);
    }, [id]),
  );

  // The newest message is at the bottom (offset 0 of the inverted list).
  const toNewest = useCallback(() => list.current?.scrollToOffset?.({ offset: 0, animated: true }), []);

  // With the keyboard up the composer sits right on it (no home-bar gap),
  // and the conversation scrolls to the latest message.
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => {
      setKeyboard(true);
      requestAnimationFrame(toNewest);
    });
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboard(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, [toNewest]);

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

  // What they're playing, live in the header.
  useProfileUpdates(conv?.otherId ? [conv.otherId] : [], (p) =>
    setConv((prev) => (prev ? { ...prev, other: { ...prev.other, ...p } } : prev)),
  );

  // Disappearing messages leave the screen when their 24 hours are up.
  useEffect(() => {
    const t = setInterval(() => {
      setMessages((l) => (l.some((m) => isExpired(m)) ? l.filter((m) => !isExpired(m)) : l));
    }, EXPIRY_SWEEP_MS);
    return () => clearInterval(t);
  }, []);

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
        if (isExpired(m)) return;
        setMessages((l) => merge(l, [m]));
        if (m.sender_id !== userId) {
          haptics.selection();
          markRead(id).catch(() => {});
        }
      })
      // Deletes can't be filtered by thread; only the id comes through.
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, ({ old }) => {
        if (old?.id) setMessages((l) => l.filter((m) => m.id !== old.id));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversations', filter: `id=eq.${id}` }, ({ new: c }) => {
        setConv((prev) => (prev ? { ...prev, ...c, theirReadAt: c[prev.user_a === userId ? 'b_last_read_at' : 'a_last_read_at'] } : prev));
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, userId]);

  // Every send shows straight away ("Sending…"), then swaps for the saved
  // message, or stays with "Not sent · hold to retry".
  const optimistic = (tempId, fields) =>
    setMessages((l) =>
      merge(
        l.filter((m) => m.id !== tempId),
        [{ id: tempId, body: '', kind: 'text', sender_id: userId, created_at: new Date().toISOString(), pending: true, ...fields }],
      ),
    );
  const settle = (tempId, saved) => alive.current && setMessages((l) => merge(l.filter((m) => m.id !== tempId), [saved]));
  const fail = (tempId, title, err) => {
    if (!alive.current) return;
    setMessages((l) => l.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true } : m)));
    Alert.alert(title, err.message);
  };

  const send = async (text, retryId = null) => {
    const body = (text ?? '').trim();
    if (!body) return;
    const tempId = retryId ?? `pending-${Date.now()}`;
    optimistic(tempId, { body });
    haptics.tap();
    toNewest();
    try {
      settle(tempId, await sendMessage(id, body));
    } catch (err) {
      fail(tempId, 'Message not sent', err);
    }
  };

  // Photos, videos and voice notes: uploaded to chat-media, then saved.
  const sendFile = async (file, retryId = null) => {
    const tempId = retryId ?? `pending-${Date.now()}`;
    optimistic(tempId, {
      kind: file.kind,
      localUri: file.uri,
      upload: file,
      media_width: file.width,
      media_height: file.height,
      media_duration_ms: file.durationMs,
      waveform: file.waveform,
    });
    toNewest();
    try {
      const up = await uploadChatMedia(id, userId, file);
      const saved = await sendMedia(id, { ...file, ...up });
      settle(tempId, { ...saved, localUri: file.uri });
    } catch (err) {
      fail(tempId, file.kind === 'voice' ? 'Voice note not sent' : file.kind === 'video' ? 'Video not sent' : 'Photo not sent', err);
    }
  };

  const attach = async () => {
    let res;
    try {
      res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: MEDIA_QUALITY, allowsEditing: false });
    } catch {
      return Alert.alert("Couldn't open your photos", 'Check that BOA can access your photos and videos, then try again.');
    }
    const asset = res?.assets?.[0];
    if (res?.canceled || !asset) return;
    const problem = mediaProblem(asset);
    if (problem) return Alert.alert("Can't send that", problem);
    const kind = mediaKind(asset);
    sendFile({
      kind,
      uri: asset.uri,
      mimeType: asset.mimeType ?? (kind === 'video' ? 'video/mp4' : 'image/jpeg'),
      width: asset.width,
      height: asset.height,
      durationMs: kind === 'video' ? asset.duration ?? null : null,
    });
  };

  const sendVoice = ({ uri, durationMs, waveform }) => sendFile({ kind: 'voice', uri, mimeType: 'audio/mp4', durationMs, waveform });

  const remove = async (message) => {
    try {
      if (!message.failed) await deleteMessage(message.id, message.media_path ?? null);
      setMessages((l) => l.filter((m) => m.id !== message.id));
    } catch (err) {
      Alert.alert("Couldn't delete", err.message);
    }
  };

  const retry = (message) => (message.upload ? sendFile(message.upload, message.id) : send(message.body, message.id));

  const onLongPress = (message) => {
    if (message.pending) return;
    haptics.selection();
    if (message.sender_id === userId) {
      const options = [{ text: 'Cancel', style: 'cancel' }];
      if (message.failed) options.push({ text: 'Try again', onPress: () => retry(message) });
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
  const bottom = keyboard ? 0 : insets.bottom;

  const header = (
    <PageHeader
      kicker={conv ? (online ? 'Online' : lastSeen(other?.last_seen_at, false) || 'Creative Hub') : 'Creative Hub'}
      title={name}
      subtitle={other ? <NowPlaying person={other} style={{ marginTop: 2 }} /> : null}
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
        <AmbientGlow />
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
    <View style={styles.screen} testID="hub-thread">
      <AmbientGlow />
      <KeyboardAvoidingView style={styles.fill} behavior={keyboardBehavior()} testID="hub-thread-keyboard">
        {header}
        <FlatList
          ref={list}
          inverted
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={({ item }) => (
            <Bubble
              message={item}
              mine={item.sender_id === userId}
              seen={item.id === seenId}
              onLongPress={() => onLongPress(item)}
              onOpenMedia={setViewing}
            />
          )}
          onEndReachedThreshold={0.4}
          onEndReached={loadOlder}
          contentContainerStyle={{ paddingHorizontal: space.lg, paddingVertical: space.md, flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
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
          <Composer onSend={(text) => send(text)} onAttach={attach} onVoice={sendVoice} bottomInset={bottom} onFocus={toNewest} />
        )}
      </KeyboardAvoidingView>
      <MediaViewer item={viewing} onClose={() => setViewing(null)} />
      <ReportSheet target={reporting} onClose={(didBlock) => (setReporting(null), didBlock && navigation.goBack())} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  // Above the ambient glow (which sits over the screen's black), transparent.
  fill: { flex: 1, zIndex: 1, backgroundColor: 'transparent' },
  bubbleRow: { flexDirection: 'row', marginVertical: 3 },
  bubble: {
    maxWidth: '80%',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  mediaBubble: { padding: 4, paddingBottom: space.xs },
  mine: {
    borderBottomRightRadius: radius.sm,
    borderColor: 'rgba(255,226,170,0.7)',
  },
  theirs: {
    borderBottomLeftRadius: radius.sm,
    backgroundColor: 'rgba(20,20,24,0.42)',
    borderColor: 'rgba(255,255,255,0.16)',
  },
  // The glass's top edge catching the light.
  sheen: { position: 'absolute', left: 10, right: 10, top: 0, height: StyleSheet.hairlineWidth * 2, backgroundColor: 'rgba(255,255,255,0.22)' },
  body: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 21, color: colors.text },
  meta: { fontFamily: fonts.mono, fontSize: 9.5, color: colors.textFaint, marginTop: 3, alignSelf: 'flex-end' },
  blocked: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: 'rgba(11,11,13,0.8)',
  },
  empty: { alignItems: 'center', padding: space.xxl },
});
