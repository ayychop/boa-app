import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Keyboard, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurTargetView } from 'expo-blur';
import * as ImagePicker from 'expo-image-picker';
import Animated, { withSpring, withTiming } from 'react-native-reanimated';
import { useHub } from '../../context/HubContext';
import { supabase } from '../../lib/supabase';
import { ownChannel } from '../../lib/realtime';
import {
  canMessage,
  deleteMessage,
  discardViewOnce,
  getConversation,
  isExpired,
  listMessages,
  markRead,
  MEDIA_QUALITY,
  mediaKind,
  mediaProblem,
  openViewOnce,
  sendMedia,
  sendMessage,
  uploadChatMedia,
} from '../../api/hub';
import { setOpenThread } from '../../chat/notifications';
import { openTyping, TYPING_HOLD_MS } from '../../chat/typing';
import { BoaStarBadge, DayOneBadge } from '../../components/kit';
import useDayOne from '../../hooks/useDayOne';
import { lastSeen, statusLine } from '../../components/hub/hubNav';
import ReportSheet from '../../components/hub/ReportSheet';
import NowPlaying from '../../components/hub/NowPlaying';
import useProfileUpdates from '../../hooks/useProfileUpdates';
import AmbientGlow from '../../components/chat/AmbientGlow';
import Composer from '../../components/chat/Composer';
import TypingIndicator, { TypingDots } from '../../components/chat/TypingIndicator';
import ThreadHeader from '../../components/chat/ThreadHeader';
import VibePicker from '../../components/chat/VibePicker';
import BottomSheet from '../../components/BottomSheet';
import useChatVibe, { vibeById } from '../../chat/vibes';
import { MediaTile, MediaViewer, VoiceNote } from '../../components/chat/media';
import { SendMediaSheet, ViewOnceTile, ViewOnceViewer } from '../../components/chat/ViewOnce';
import { Button, PulseDot } from '../../components/ui';
import ErrorBoundary from '../../components/ErrorBoundary';
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

// A new message slides in from its own side (yours from the right, theirs
// from the left), rising a touch from just under full size and settling on
// a soft spring as it fades in. Messages already there when the thread
// opens don't animate.
const RISE_SPRING = { damping: 16, stiffness: 220, mass: 0.7 };
const slideIn = (dx) => () => {
  'worklet';
  return {
    initialValues: { opacity: 0, transform: [{ translateX: dx }, { translateY: 10 }, { scale: 0.92 }] },
    animations: {
      opacity: withTiming(1, { duration: 200 }),
      transform: [{ translateX: withSpring(0, RISE_SPRING) }, { translateY: withSpring(0, RISE_SPRING) }, { scale: withSpring(1, RISE_SPRING) }],
    },
  };
};
export const riseMine = slideIn(28);
export const riseTheirs = slideIn(-28);

// Frosted glass: a translucent fill in the vibe's colours with a light sheen
// across the top and a fine bright edge, over the backdrop. Yours are the
// vibe's gradient glass; theirs are smoky glass with a solid tint under the
// gradient, so they read on any backdrop, blur or no blur.
// View-once files this phone has already cleared from Storage.
const discarded = new Set();

function Bubble({ message, mine, seen, fresh, vibe, onLongPress, onOpenMedia, onOpenOnce, opening }) {
  const once = !!message.view_once && (message.kind === 'image' || message.kind === 'video');
  const media = !once && (message.kind === 'image' || message.kind === 'video');
  const voice = message.kind === 'voice';
  const caption = message.body?.trim();
  const status = message.failed ? 'Not sent · hold to retry' : message.pending ? 'Sending…' : chatTime(message.created_at);
  const left = message.expires_at ? timeLeft(message.expires_at) : null;
  return (
    <Animated.View entering={fresh ? (mine ? riseMine : riseTheirs) : undefined} style={[styles.bubbleRow, mine && { justifyContent: 'flex-end' }]} testID={fresh ? `hub-message-fresh-${message.id}` : undefined}>
      <Pressable
        onLongPress={onLongPress}
        delayLongPress={350}
        accessibilityHint={mine ? 'Hold to delete' : 'Hold to report'}
        style={[
          styles.bubble,
          mine ? [styles.mine, { borderColor: vibe.mineEdge }, vibe.mineGlow && { boxShadow: vibe.mineGlow }] : [styles.theirs, { backgroundColor: vibe.theirsFill, borderColor: vibe.theirsEdge }],
          media && styles.mediaBubble,
          message.pending && !media && { opacity: 0.6 },
        ]}
        testID={`hub-message-${message.id}`}
      >
        <LinearGradient
          colors={mine ? vibe.mine : vibe.theirs}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View pointerEvents="none" style={[styles.sheen, mine && { backgroundColor: 'rgba(255,255,255,0.28)' }]} />
        {media ? <MediaTile message={message} onOpen={onOpenMedia} /> : null}
        {once ? <ViewOnceTile message={message} mine={mine} onOpen={onOpenOnce} opening={opening} accent={mine ? vibe.mineText : vibe.accent} textColor={mine ? vibe.mineText : colors.text} /> : null}
        {voice ? <VoiceNote message={message} mine={mine} /> : null}
        {(!media && !voice && !once) || (caption && !once) ? (
          <Text style={[styles.body, mine && { color: vibe.mineText }, media && { marginTop: space.sm, paddingHorizontal: space.xs }]}>{message.body}</Text>
        ) : null}
        <Text style={[styles.meta, mine && { color: vibe.mineMeta }, media && { paddingHorizontal: space.xs }]}>
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

/**
 * The live line under their name, most telling first: typing, then what
 * they're playing, then "Online in the Hub", then when they were last about.
 */
function HeaderStatus({ person, online, typing, accent }) {
  if (typing) {
    return (
      <View style={styles.status} testID="thread-status-typing">
        <TypingDots size={4} color={accent} />
        <Text style={[styles.statusText, { color: accent }]}>typing</Text>
      </View>
    );
  }
  if (statusLine(person)) return <NowPlaying person={person} style={{ marginTop: 2 }} />;
  if (online) {
    return (
      <View style={styles.status} testID="thread-status-online">
        <PulseDot color={colors.live} size={6} />
        <Text style={[styles.statusText, { color: colors.text }]}>Online in the Hub</Text>
      </View>
    );
  }
  const seen = lastSeen(person?.last_seen_at, false);
  return seen ? (
    <Text style={[styles.statusText, styles.statusFaint]} testID="thread-status-seen">
      {seen}
    </Text>
  ) : null;
}

/** One conversation: messages, photos, videos and voice notes, live in both directions, with read receipts. */
function Thread({ navigation, route }) {
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
  // A picked photo or video waiting on the send sheet, and its View once switch.
  const [picked, setPicked] = useState(null);
  const [viewOnce, setViewOnce] = useState(false);
  // The view-once message being opened, and the one open full screen.
  const [openingId, setOpeningId] = useState(null);
  const [once, setOnce] = useState(null);
  const [keyboard, setKeyboard] = useState(false);
  const [theyType, setTheyType] = useState(false);
  const [picking, setPicking] = useState(false);
  // The header and composer float over the conversation on glass, so the
  // list keeps their heights clear at its ends.
  const [headerH, setHeaderH] = useState(insets.top + 60);
  const [composerH, setComposerH] = useState(64);
  const { vibe, setVibe } = useChatVibe();
  // What the glass blurs on Android: the backdrop and the messages.
  const behind = useRef(null);
  const alive = useRef(true);
  const list = useRef(null);
  const typing = useRef(null);
  // Messages already on screen; anything new gets the entrance.
  const known = useRef(new Set());
  const know = (rows) => rows.forEach((m) => m?.id && known.current.add(m.id));

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
      know(page);
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
    else if (!id) {
      setError("This conversation wasn't found.");
      setState('error');
    }
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
      know(page);
      setMessages((m) => merge(m, page));
      setOlder(page.length < PAGE ? 'done' : 'idle');
    } catch {
      if (alive.current) setOlder('idle');
    }
  };

  // New and deleted messages, and the other person's read receipt.
  useEffect(() => {
    if (!supabase || !id || !userId) return;
    const channel = ownChannel(`hub:thread:${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${id}` }, ({ new: m }) => {
        if (isExpired(m)) return;
        setMessages((l) => merge(l, [m]));
        if (m.sender_id !== userId) {
          setTheyType(false);
          haptics.selection();
          markRead(id).catch(() => {});
        }
      })
      // A view-once photo being opened (the sender sees "Opened").
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${id}` }, ({ new: m }) => {
        if (m?.id) setMessages((l) => (l.some((x) => x.id === m.id) ? merge(l, [m]) : l));
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

  // Their typing, live; yours goes out as you type.
  useEffect(() => {
    let timer = null;
    const room = openTyping(id, userId, (on) => {
      clearTimeout(timer);
      if (!alive.current) return;
      setTheyType(on);
      if (on) timer = setTimeout(() => alive.current && setTheyType(false), TYPING_HOLD_MS);
    });
    typing.current = room;
    return () => {
      clearTimeout(timer);
      room.close();
      typing.current = null;
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
  const settle = (tempId, saved) => {
    if (!alive.current) return;
    // It made its entrance while sending; the saved copy just takes its place.
    if (saved?.id) known.current.add(saved.id);
    setMessages((l) => merge(l.filter((m) => m.id !== tempId), [saved]));
  };
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
      view_once: !!file.viewOnce,
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
    // A look at it first, with the View once switch (off each time).
    setViewOnce(false);
    setPicked({
      kind,
      uri: asset.uri,
      mimeType: asset.mimeType ?? (kind === 'video' ? 'video/mp4' : 'image/jpeg'),
      width: asset.width,
      height: asset.height,
      durationMs: kind === 'video' ? asset.duration ?? null : null,
    });
  };

  const sendPicked = () => {
    if (!picked) return;
    const file = { ...picked, viewOnce };
    setPicked(null);
    sendFile(file);
  };

  // A view-once photo or video: the database marks it opened as it hands
  // the file over, so it opens once, on one phone.
  const openOnce = async (message) => {
    if (openingId) return;
    setOpeningId(message.id);
    try {
      const url = await openViewOnce(message);
      if (!alive.current) return;
      const opened = { ...message, viewed_at: new Date().toISOString() };
      setMessages((l) => merge(l, [opened]));
      setOnce({ ...opened, url });
    } catch (err) {
      if (alive.current) {
        if (/already/i.test(err.message)) setMessages((l) => merge(l, [{ ...message, viewed_at: message.viewed_at ?? new Date().toISOString() }]));
        Alert.alert("Can't open this", err.message);
      }
    } finally {
      if (alive.current) setOpeningId(null);
    }
  };
  const closeOnce = useCallback(() => {
    setOnce((item) => {
      if (item?.media_path) {
        discarded.add(item.media_path);
        discardViewOnce(item.media_path);
      }
      return null;
    });
  }, []);

  // Opened view-once files sent to you are deleted from Storage; this
  // catches any left behind (the app closed while one was open).
  useEffect(() => {
    messages.forEach((m) => {
      if (m.view_once && m.viewed_at && m.media_path && m.sender_id !== userId && !discarded.has(m.media_path)) {
        discarded.add(m.media_path);
        discardViewOnce(m.media_path);
      }
    });
  }, [messages, userId]);

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
  const dayOne = useDayOne([conv?.otherId]).has(conv?.otherId);
  const isBlocked = conv ? blocked.has(conv.otherId) : false;
  // They've turned messages off (Hub settings > Who can message you): the
  // thread stays readable, and the composer makes way for a quiet note.
  const [closed, setClosed] = useState(false);
  const otherId = conv?.otherId;
  useEffect(() => {
    if (!otherId) return undefined;
    let alive = true;
    Promise.resolve()
      .then(() => canMessage(otherId))
      .then((yes) => alive && setClosed(!yes))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [otherId]);
  // "Seen" goes under your latest message once they've read it.
  const lastMine = messages.find((m) => m.sender_id === userId && !m.pending && !m.failed);
  const seenId = lastMine && conv?.theirReadAt && new Date(conv.theirReadAt) >= new Date(lastMine.created_at) ? lastMine.id : null;
  const bottom = keyboard ? 0 : insets.bottom;

  const header = (
    <ThreadHeader
      name={name}
      person={other}
      online={online}
      vibe={vibe}
      blurTarget={behind}
      badge={
        other?.is_boa_star || dayOne ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            {other?.is_boa_star ? <BoaStarBadge size={15} /> : null}
            {dayOne ? <DayOneBadge size={15} label={!other?.is_boa_star} /> : null}
          </View>
        ) : null
      }
      status={other ? <HeaderStatus person={other} online={online} typing={theyType} accent={vibe.accent} /> : null}
      onBack={() => navigation.goBack()}
      onProfile={conv && other ? () => navigation.navigate('HubProfile', { id: conv.otherId }) : null}
      onVibe={() => setPicking(true)}
      onLayout={(e) => setHeaderH(e.nativeEvent.layout.height)}
    />
  );

  const picker = (
    <BottomSheet open={picking} onClose={() => setPicking(false)} glass>
      <View style={styles.sheet} testID="chat-vibe-sheet">
        <Text style={styles.sheetKicker}>Chat vibe</Text>
        <Text style={[type.bodyMuted, { marginBottom: space.lg }]}>How your conversations look. Applies to every chat on this phone.</Text>
        <VibePicker value={vibe.id} onChange={setVibe} />
      </View>
    </BottomSheet>
  );

  // Layers, back to front: the backdrop and the messages (together, the
  // glass's blur target), then the glass header and composer floating over
  // them. Nothing between the backdrop and the screen draws a fill of its
  // own; the screen's fill is the vibe's middle tone, the same colour the
  // backdrop starts from, so there's no black flash before it draws.
  if (state !== 'ready') {
    return (
      <View style={[styles.screen, { backgroundColor: vibe.mesh[1] }]} testID="hub-thread">
        <BlurTargetView ref={behind} style={StyleSheet.absoluteFill} collapsable={false}>
          <AmbientGlow vibe={vibe} />
          <View style={{ paddingTop: headerH }}>
            {state === 'loading' ? (
              <ActivityIndicator color={vibe.accent} style={{ marginTop: space.xxxl }} />
            ) : (
              <View style={styles.empty}>
                <Ionicons name="cloud-offline-outline" size={30} color={vibe.accent} />
                <Text style={[type.title, { marginTop: space.md, textAlign: 'center' }]}>Couldn't open this conversation</Text>
                <Text style={[type.bodyMuted, { textAlign: 'center', marginTop: space.sm }]}>{error}</Text>
                <Button label="Try again" icon="refresh" onPress={load} style={{ marginTop: space.xl }} />
              </View>
            )}
          </View>
        </BlurTargetView>
        {header}
        {picker}
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: vibe.mesh[1] }]} testID="hub-thread">
      <KeyboardAvoidingView style={styles.fill} behavior={keyboardBehavior()} testID="hub-thread-keyboard">
        {/* The keyboard shortens this; the floating layers sit inside it. */}
        <View style={styles.fill}>
          <BlurTargetView ref={behind} style={StyleSheet.absoluteFill} collapsable={false} testID="hub-thread-behind">
            <AmbientGlow vibe={vibe} />
            <FlatList
              ref={list}
              inverted
              data={messages}
              keyExtractor={(m, i) => String(m?.id ?? i)}
              renderItem={({ item }) => (
                <Bubble
                  message={item}
                  mine={item.sender_id === userId}
                  seen={item.id === seenId}
                  fresh={!known.current.has(item.id)}
                  vibe={vibe}
                  onLongPress={() => onLongPress(item)}
                  onOpenMedia={setViewing}
                  onOpenOnce={openOnce}
                  opening={openingId === item.id}
                />
              )}
              onEndReachedThreshold={0.4}
              onEndReached={loadOlder}
              // Inverted: the top padding sits at the bottom of the screen.
              contentContainerStyle={{ paddingHorizontal: space.lg, paddingTop: composerH + space.md, paddingBottom: headerH + space.md, flexGrow: 1 }}
              scrollIndicatorInsets={{ top: composerH, bottom: headerH }}
              style={styles.list}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              ListHeaderComponent={theyType ? <TypingIndicator name={name} vibe={vibe} /> : null}
              ListFooterComponent={older === 'loading' ? <ActivityIndicator color={vibe.accent} style={{ margin: space.lg }} /> : null}
              ListEmptyComponent={
                <View style={styles.empty}>
                  <Text style={[type.bodyMuted, { textAlign: 'center' }]}>Say hello to {name}.</Text>
                </View>
              }
            />
          </BlurTargetView>
          {header}
          {isBlocked ? (
            <View style={[styles.blocked, { paddingBottom: insets.bottom + space.md, backgroundColor: vibe.bar }]} onLayout={(e) => setComposerH(e.nativeEvent.layout.height)}>
              <Text style={[type.bodyMuted, { flex: 1 }]}>You've blocked {name}. Unblock them to send messages.</Text>
              <Button label="Unblock" variant="ghost" onPress={() => unblock(conv.otherId).catch((e) => Alert.alert('Unblock failed', e.message))} />
            </View>
          ) : closed ? (
            <View style={[styles.blocked, { paddingBottom: insets.bottom + space.md, backgroundColor: vibe.bar }]} onLayout={(e) => setComposerH(e.nativeEvent.layout.height)} testID="thread-messages-off">
              <Ionicons name="lock-closed-outline" size={18} color={colors.textMuted} />
              <Text style={[type.bodyMuted, { flex: 1 }]}>{name} isn't taking messages right now.</Text>
            </View>
          ) : (
            <Composer
              onSend={(text) => send(text)}
              onAttach={attach}
              onVoice={sendVoice}
              onTyping={(on) => (on ? typing.current?.ping() : typing.current?.stop())}
              bottomInset={bottom}
              onFocus={toNewest}
              vibe={vibe}
              blurTarget={behind}
              onLayout={(e) => setComposerH(e.nativeEvent.layout.height)}
              style={styles.floating}
            />
          )}
        </View>
      </KeyboardAvoidingView>
      <MediaViewer item={viewing} onClose={() => setViewing(null)} />
      <SendMediaSheet file={picked} viewOnce={viewOnce} onViewOnce={setViewOnce} onCancel={() => setPicked(null)} onSend={sendPicked} />
      <ReportSheet target={reporting} onClose={(didBlock) => (setReporting(null), didBlock && navigation.goBack())} />
      {picker}
      <ViewOnceViewer item={once} onClose={closeOnce} />
    </View>
  );
}

/**
 * If anything in the conversation fails to draw, the thread says so, with
 * a way back and a retry, instead of taking the app down. Plain views
 * only, so the fallback can't fail the same way.
 */
function ThreadFallback({ error, retry, navigation }) {
  const insets = useSafeAreaInsets();
  const vibe = vibeById();
  return (
    <View style={[styles.screen, styles.fallback, { paddingTop: insets.top + space.md, backgroundColor: vibe.mesh[1] }]} testID="hub-thread-fallback">
      <LinearGradient colors={vibe.mesh} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <Pressable
        onPress={() => (navigation?.canGoBack?.() ? navigation.goBack() : null)}
        accessibilityRole="button"
        accessibilityLabel="Back"
        hitSlop={12}
        style={styles.fallbackBack}
      >
        <Ionicons name="chevron-back" size={26} color={colors.text} />
      </Pressable>
      <View style={styles.empty}>
        <Ionicons name="chatbubbles-outline" size={30} color={colors.gold} />
        <Text style={[type.title, { marginTop: space.md, textAlign: 'center' }]}>This conversation couldn't open</Text>
        <Text style={[type.bodyMuted, { textAlign: 'center', marginTop: space.sm }]} numberOfLines={3}>
          {String(error?.message ?? error ?? 'Something went wrong.')}
        </Text>
        <Button label="Try again" icon="refresh" onPress={retry} style={{ marginTop: space.xl }} />
      </View>
    </View>
  );
}

export default function HubThreadScreen(props) {
  return (
    <ErrorBoundary name="hub-thread" fallback={(f) => <ThreadFallback {...f} navigation={props.navigation} />}>
      <Thread {...props} />
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  // Its fill is set from the vibe where it's drawn.
  screen: { flex: 1 },
  fill: { flex: 1 },
  list: { zIndex: 1 },
  floating: { position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 2 },
  sheet: { paddingHorizontal: space.lg, paddingBottom: space.sm },
  sheetKicker: { fontFamily: fonts.stamp, fontSize: 11, letterSpacing: 2.4, textTransform: 'uppercase', color: colors.textMuted, marginBottom: space.xs },
  bubbleRow: { flexDirection: 'row', marginVertical: 3 },
  bubble: {
    maxWidth: '80%',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
  },
  mediaBubble: { padding: 4, paddingBottom: space.xs },
  // No drop shadows: the glass is lit by its edge and sheen. Neon alone
  // gives yours a glow of its own (vibe.mineGlow).
  mine: { borderBottomRightRadius: radius.sm },
  theirs: { borderBottomLeftRadius: radius.sm },
  // The glass's top edge catching the light.
  sheen: { position: 'absolute', left: 10, right: 10, top: 0, height: StyleSheet.hairlineWidth * 2, backgroundColor: 'rgba(255,255,255,0.22)' },
  body: { fontFamily: fonts.chat, fontSize: 15.5, lineHeight: 22, letterSpacing: -0.1, color: colors.text },
  status: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  statusText: { fontFamily: fonts.chat, fontSize: 12.5, color: colors.gold },
  statusFaint: { color: colors.textMuted, marginTop: 2 },
  // Times and receipts in spaced capitals.
  meta: { fontFamily: fonts.stamp, fontSize: 9.5, letterSpacing: 1.3, textTransform: 'uppercase', color: colors.textMuted, marginTop: 4, alignSelf: 'flex-end' },
  blocked: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  empty: { alignItems: 'center', padding: space.xxl },
  fallback: { paddingHorizontal: space.lg },
  fallbackBack: { width: 44, height: 44, justifyContent: 'center' },
});
