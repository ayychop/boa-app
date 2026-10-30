import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Keyboard, KeyboardAvoidingView, Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Text, { FontScope } from '../../components/ScopedText';
import { READING } from '../../hooks/useLayout';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { setStatusBarStyle } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import * as ImagePicker from 'expo-image-picker';
import Animated, { FadeOut, withSpring, withTiming, ZoomIn } from 'react-native-reanimated';
import { useHub } from '../../context/HubContext';
import { useCallMaybe } from '../../context/CallContext';
import { supabase } from '../../lib/supabase';
import { ownChannel } from '../../lib/realtime';
import {
  canMessage,
  deleteMessage,
  discardViewOnce,
  getConversation,
  isExpired,
  listMessages,
  listReactions,
  markRead,
  acceptConversation,
  MEDIA_QUALITY,
  mediaKind,
  mediaProblem,
  openViewOnce,
  react,
  sendMedia,
  sendMessage,
  sendSticker,
  sendGif,
  unreact,
  uploadChatMedia,
} from '../../api/hub';
import MessageActions, { describeMessage } from '../../components/chat/MessageActions';
import { ReactionChips, ReplyQuote } from '../../components/chat/MessageExtras';
import StickerPicker from '../../components/chat/StickerPicker';
import Sticker from '../../components/chat/Sticker';
import GifPicker from '../../components/chat/GifPicker';
import GifTile from '../../components/chat/GifTile';
import { isGifUrl } from '../../chat/gifs';
import { nameFor, useAlias } from '../../chat/contacts';
import ContactSheet from '../../components/hub/ContactSheet';
import { setOpenThread } from '../../chat/notifications';
import { openTyping, TYPING_HOLD_MS } from '../../chat/typing';
import { Avatar, BoaStarBadge, DayOneBadge } from '../../components/kit';
import useDayOne from '../../hooks/useDayOne';
import { lastSeen, statusLine } from '../../components/hub/hubNav';
import ReportSheet from '../../components/hub/ReportSheet';
import NowPlaying from '../../components/hub/NowPlaying';
import useProfileUpdates from '../../hooks/useProfileUpdates';
import ChatBackdrop from '../../components/chat/ChatBackdrop';
import Composer from '../../components/chat/Composer';
import TypingIndicator, { TypingDots } from '../../components/chat/TypingIndicator';
import ChatVibeSheet from '../../components/chat/ChatVibeSheet';
import useChatVibe, { allowedVibe, MOTION, vibeById } from '../../chat/vibes';
import { usePremiumUnlocked } from '../../context/PremiumContext';
import { useHeadlineFont } from '../../context/FontContext';
import { withChatTheme } from '../../chat/bubbleTheme';
import { MediaTile, MediaViewer, VoiceNote } from '../../components/chat/media';
import { SendMediaSheet, ViewOnceTile, ViewOnceViewer } from '../../components/chat/ViewOnce';
import { Button, PulseDot } from '../../components/ui';
import { LoadingDots, MessagesSkeleton } from '../../components/Skeleton';
import ErrorBoundary from '../../components/ErrorBoundary';
import { chatTime } from './HubChatsScreen';
import { haptics } from '../../utils/haptics';
import { colors, fonts, radius, space, type } from '../../theme';

/*
 * One conversation, built in three layers, back to front:
 *
 *   1. ChatBackdrop   full screen, zIndex 0, outside the keyboard's reach:
 *                     the vibe's animated (or static) scene.
 *   2. Message list   a transparent FlatList of translucent bubbles that
 *                     float over the backdrop.
 *   3. Header, composer  smoked glass bars floating over both.
 *
 * Nothing between layer 1 and the glass paints a fill of its own, and there
 * is no blur-target view anywhere (on Android that view drew opaque over the
 * backdrop, which is why vibes never showed). The screen's own fill is the
 * vibe's middle tone, so there's no black flash before the backdrop draws.
 */

const PAGE = 40;
const BUBBLE_MAX = 540;
// Disappearing messages are swept from the screen this often.
const EXPIRY_SWEEP_MS = 30000;
const AVATAR = 40;

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

/**
 * Bubbles let the backdrop through: no colour in them is more opaque than
 * `max`. Light vibes pass 1 and stay solid, since a pale backdrop showing
 * through dark-on-light text would cost more than it adds.
 */
export const seeThrough = (color, max) =>
  max >= 1 ? color : String(color).replace(/rgba\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/, (_, r, g, b, a) => `rgba(${r},${g},${b},${Math.min(Number(a), max)})`);
const MINE_MAX = 0.9;
const THEIRS_MAX = 0.74;

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
const riseMine = slideIn(28);
const riseTheirs = slideIn(-28);

// View-once files this phone has already cleared from Storage.
const discarded = new Set();

// ------------------------------------------------------------ layer 2

// How long the page takes to slide away; the backdrop pauses after it.
const LEAVE_SETTLE_MS = 600;

// Two taps this close together are a double tap (a ❤️).
const DOUBLE_TAP_MS = 280;

/** A ❤️ that swells up out of a double-tapped bubble and fades. */
function HeartPop() {
  return (
    <Animated.View pointerEvents="none" entering={ZoomIn.springify().damping(9).stiffness(200)} exiting={FadeOut.duration(220)} style={styles.heartPop}>
      <Sticker emoji="❤️" size={64} />
    </Animated.View>
  );
}

/**
 * One message: tinted glass over the backdrop, yours in the vibe's
 * gradient, theirs in smoke. A reply carries a quote of what it answers;
 * reactions hang off its lower edge. Hold it for reactions and Reply;
 * double tap it for a ❤️. An animated emoji sticker has no bubble at all.
 */
function Bubble({ message, mine, seen, fresh, vibe, reactions, myId, quoted, quotedWho, flash, maxWidth, onLongPress, onReact, onQuote, onOpenMedia, onOpenOnce, opening }) {
  const once = !!message.view_once && (message.kind === 'image' || message.kind === 'video');
  const media = !once && (message.kind === 'image' || message.kind === 'video');
  const voice = message.kind === 'voice';
  const gif = message.kind === 'gif' && isGifUrl(message.body);
  // Animated emoji and GIFs have no bubble around them.
  const sticker = message.kind === 'sticker' || gif;
  const caption = message.body?.trim();
  const status = message.failed ? 'Not sent · hold to retry' : message.pending ? 'Sending…' : chatTime(message.created_at);
  const left = message.expires_at ? timeLeft(message.expires_at) : null;
  const max = vibe.light ? 1 : mine ? MINE_MAX : THEIRS_MAX;
  const fill = mine ? vibe.mine.map((c) => seeThrough(c, max)) : vibe.theirs.map((c) => seeThrough(c, max));
  const lastTap = useRef(0);
  const [hearted, setHearted] = useState(0);
  useEffect(() => {
    if (!hearted) return undefined;
    const t = setTimeout(() => setHearted(0), 750);
    return () => clearTimeout(t);
  }, [hearted]);
  const tap = () => {
    if (message.pending || message.failed) return;
    const now = Date.now();
    if (now - lastTap.current < DOUBLE_TAP_MS) {
      lastTap.current = 0;
      haptics.tap();
      setHearted(now);
      onReact?.('❤️', true);
    } else lastTap.current = now;
  };
  const meta = (
    <Text style={[styles.meta, mine ? { color: vibe.mineMeta } : vibe.light && { color: vibe.inkMuted }, (media || sticker) && { paddingHorizontal: space.xs }, sticker && !vibe.light && { color: colors.textMuted }]}>
      {left ? (
        <>
          <Ionicons name="timer-outline" size={9} /> {left} ·{' '}
        </>
      ) : null}
      {status}
      {seen ? ' · Seen' : ''}
    </Text>
  );
  const quote = message.reply_to ? <ReplyQuote quoted={quoted} who={quotedWho} mine={mine && !sticker} vibe={vibe} onPress={onQuote} /> : null;
  return (
    <Animated.View
      entering={fresh ? (mine ? riseMine : riseTheirs) : undefined}
      style={[styles.bubbleRow, mine && { justifyContent: 'flex-end' }]}
      testID={fresh ? `hub-message-fresh-${message.id}` : undefined}
    >
      <View style={[styles.bubbleCol, maxWidth ? { maxWidth } : null, { alignItems: mine ? 'flex-end' : 'flex-start' }]}>
      {sticker ? (
        <Pressable
          onPress={tap}
          onLongPress={onLongPress}
          delayLongPress={350}
          accessibilityHint="Hold for reactions and reply"
          style={[styles.stickerMsg, message.pending && { opacity: 0.6 }, flash && { backgroundColor: vibe.accentSoft }]}
          testID={`hub-message-${message.id}`}
        >
          {quote}
          {gif ? <GifTile message={message} maxWidth={maxWidth} /> : <Sticker emoji={message.body} size={128} />}
          {meta}
          {hearted ? <HeartPop key={hearted} /> : null}
        </Pressable>
      ) : (
      <Pressable
        onPress={tap}
        onLongPress={onLongPress}
        delayLongPress={350}
        accessibilityHint="Hold for reactions and reply. Double tap to love it."
        style={[
          styles.bubble,
          mine
            ? [styles.mine, { borderColor: vibe.mineEdge }, vibe.mineGlow && { boxShadow: vibe.mineGlow }]
            : [styles.theirs, { backgroundColor: seeThrough(vibe.theirsFill, max), borderColor: vibe.theirsEdge }],
          vibe.radius && { borderRadius: vibe.radius },
          media && styles.mediaBubble,
          message.pending && !media && { opacity: 0.6 },
          flash && { borderColor: vibe.accent, borderWidth: 1.5 },
        ]}
        testID={`hub-message-${message.id}`}
      >
        <LinearGradient colors={fill} start={{ x: 0, y: 0 }} end={{ x: 0.5, y: 1 }} style={StyleSheet.absoluteFill} />
        {/* The glass's top edge catching the light. */}
        <View pointerEvents="none" style={[styles.sheen, mine && { backgroundColor: 'rgba(255,255,255,0.28)' }]} />
        {quote}
        {media ? <MediaTile message={message} onOpen={onOpenMedia} /> : null}
        {once ? (
          <ViewOnceTile message={message} mine={mine} onOpen={onOpenOnce} opening={opening} accent={mine ? vibe.mineText : vibe.accent} textColor={mine ? vibe.mineText : vibe.theirsText} />
        ) : null}
        {voice ? <VoiceNote message={message} mine={mine} /> : null}
        {(!media && !voice && !once) || (caption && !once) ? (
          <Text
            style={[
              styles.body,
              { color: mine ? vibe.mineText : vibe.theirsText },
              !mine && vibe.theirsGlow && { textShadowColor: 'rgba(201,214,255,0.7)', textShadowRadius: 8 },
              media && { marginTop: space.sm, paddingHorizontal: space.xs },
            ]}
          >
            {message.body}
          </Text>
        ) : null}
        {meta}
        {hearted ? <HeartPop key={hearted} /> : null}
      </Pressable>
      )}
      <ReactionChips reactions={reactions} myId={myId} mine={mine} vibe={vibe} onToggle={(emoji) => onReact?.(emoji)} />
      </View>
    </Animated.View>
  );
}

// ------------------------------------------------------------ layer 3

/**
 * The live line under their name, most telling first: typing, then what
 * they're playing, then "Online in the Hub", then when they were last about.
 */
function HeaderStatus({ person, online, typing, vibe }) {
  if (typing) {
    return (
      <View style={styles.status} testID="thread-status-typing">
        <TypingDots size={4} color={vibe.accent} />
        <Text style={[styles.statusText, { color: vibe.accent }]}>typing</Text>
      </View>
    );
  }
  if (statusLine(person)) return <NowPlaying person={person} style={{ marginTop: 2 }} />;
  if (online) {
    return (
      <View style={styles.status} testID="thread-status-online">
        <PulseDot color={colors.live} size={6} />
        <Text style={[styles.statusText, { color: vibe.ink }]}>Online in the Hub</Text>
      </View>
    );
  }
  const seen = lastSeen(person?.last_seen_at, false);
  return seen ? (
    <Text style={[styles.statusText, { color: vibe.inkMuted }]} testID="thread-status-seen">
      {seen}
    </Text>
  ) : null;
}

/** Smoked glass for the header and blocked bars: blurred on iOS, tint alone on Android. */
function Smoke({ vibe }) {
  return (
    <>
      {Platform.OS === 'ios' ? <BlurView intensity={50} tint={vibe.light ? 'light' : 'dark'} style={StyleSheet.absoluteFill} /> : null}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: vibe.bar }]} />
    </>
  );
}

/**
 * The header on smoked glass: back, their avatar, their name (with badges)
 * over the live status, the video call button, and the Vibe button: a
 * pill in the vibe's own gradient, the one bright thing up here.
 * callState: 'preparing' while the next call gets ready in the background
 * (a small spinner, the button still works), 'starting' once you've tapped
 * and it's waiting on that ("Preparing call...").
 */
function Header({ name, person, online, badge, status, vibe, motion, onBack, onProfile, onContact, onVibe, onCall, callState, onLayout }) {
  const insets = useSafeAreaInsets();
  const starting = callState === 'starting';
  // The chat header name wears the member's chosen headline typeface, so the
  // font picker shows in the chat too, not only on the profile.
  const headlineFont = useHeadlineFont();
  return (
    <View style={[styles.header, { paddingTop: insets.top + space.sm }]} onLayout={onLayout} testID="thread-header">
      <Smoke vibe={vibe} />
      <View style={styles.headerRow}>
        <Pressable onPress={onBack} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back" style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
          <Ionicons name="chevron-back" size={24} color={vibe.ink} />
        </Pressable>
        <Pressable
          onPress={onProfile}
          onLongPress={onContact}
          delayLongPress={350}
          disabled={!onProfile}
          accessibilityRole="button"
          accessibilityLabel={`View ${name}'s profile`}
          accessibilityHint={onContact ? 'Hold to save or rename this contact' : undefined}
          style={({ pressed }) => [styles.who, pressed && { opacity: 0.75 }]}
        >
          {person ? <Avatar uri={person.avatar_url} name={name} size={AVATAR} online={online} /> : <View style={{ width: AVATAR, height: AVATAR }} />}
          <View style={styles.whoText}>
            <View style={styles.nameRow}>
              <Text style={[styles.name, { color: vibe.ink, fontFamily: headlineFont }]} numberOfLines={1} accessibilityRole="header">
                {name}
              </Text>
              {badge}
            </View>
            {starting ? (
              <Text style={[styles.statusText, { color: vibe.accent, marginTop: 3 }]} testID="thread-call-preparing">
                Preparing call...
              </Text>
            ) : (
              status
            )}
          </View>
        </Pressable>
        {onCall ? (
          <Pressable
            onPress={onCall}
            disabled={starting}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={starting ? 'Preparing call' : `Video call ${name}`}
            accessibilityState={{ busy: starting || callState === 'preparing' }}
            style={({ pressed }) => [styles.round, { borderColor: vibe.accentEdge, backgroundColor: vibe.accentSoft }, pressed && styles.pressed]}
            testID="thread-call"
          >
            {starting || callState === 'preparing' ? <LoadingDots color={vibe.accent} size={5} testID="thread-call-spinner" /> : <Ionicons name="videocam-outline" size={19} color={vibe.accent} />}
          </Pressable>
        ) : null}
        <Pressable
          onPress={onVibe}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Chat vibe"
          style={({ pressed }) => [styles.vibe, { borderColor: vibe.accentEdge }, pressed && styles.pressed]}
          testID="thread-vibe"
        >
          <LinearGradient colors={vibe.send} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          <Ionicons name={motion ? 'sparkles' : 'color-palette'} size={14} color={vibe.sendIcon} />
          <Text style={[styles.vibeLabel, { color: vibe.sendIcon }]}>Vibe</Text>
        </Pressable>
      </View>
      {/* A fine line of the vibe's light along the glass's lower edge. */}
      <View style={[styles.edge, { backgroundColor: vibe.accentEdge }]} />
    </View>
  );
}

// ---------------------------------------------------------------- screen

function Thread({ navigation, route }) {
  const insets = useSafeAreaInsets();
  // Unfolded, the conversation is a centred column and a bubble stops at a
  // comfortable line length instead of 80% of the whole screen.
  const { width: windowWidth } = useWindowDimensions();
  const gutter = Math.max(space.lg, (windowWidth - READING) / 2);
  const bubbleMax = Math.min((windowWidth - gutter * 2) * 0.8, BUBBLE_MAX);
  const id = route.params?.id;
  const { userId, isOnline, blocked, block, unblock, chatTheme } = useHub();
  // A message request (they wrote, you've never answered): no "Seen" goes
  // back until you accept, by replying or with Accept.
  const requestRef = useRef(false);
  const calls = useCallMaybe();
  const [conv, setConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [state, setState] = useState('loading'); // loading | ready | error
  const [error, setError] = useState(null);
  const [older, setOlder] = useState('idle'); // idle | loading | done
  const [reporting, setReporting] = useState(null);
  const [viewing, setViewing] = useState(null);
  // Reactions by message id: [{ user_id, emoji }].
  const [reactions, setReactions] = useState({});
  // The held message (its reactions and actions), the one being replied
  // to, the sticker picker ({ purpose, message }), and a quoted message
  // lit up after jumping to it.
  const [holding, setHolding] = useState(null);
  const [replyTo, setReplyTo] = useState(null);
  const [stickers, setStickers] = useState(null);
  const [gifs, setGifs] = useState(false);
  const [flashId, setFlashId] = useState(null);
  // A picked photo or video waiting on the send sheet, and its View once switch.
  const [picked, setPicked] = useState(null);
  const [viewOnce, setViewOnce] = useState(false);
  // The view-once message being opened, and the one open full screen.
  const [openingId, setOpeningId] = useState(null);
  const [once, setOnce] = useState(null);
  const [keyboard, setKeyboard] = useState(false);
  const [theyType, setTheyType] = useState(false);
  const [picking, setPicking] = useState(false);
  // The header and composer float over the list, so it keeps their heights clear at its ends.
  const [headerH, setHeaderH] = useState(insets.top + 60);
  const [composerH, setComposerH] = useState(64);
  const { vibe: savedVibe, motion } = useChatVibe();
  // A Premium vibe shows only while Premium is on; otherwise Noir, with your choice kept for when it's back.
  const chatVibe = allowedVibe(savedVibe, usePremiumUnlocked());
  // Your own bubbles in your Chat Appearance colour, if you've chosen one.
  // The first vibes predate ink; they're dark, so they take the app's.
  const vibe = useMemo(() => ({ ink: colors.text, inkMuted: colors.textMuted, ...withChatTheme(chatVibe, chatTheme) }), [chatVibe, chatTheme]);
  // The backdrop only moves while the thread is on screen.
  const [focused, setFocused] = useState(true);
  // A light vibe gets dark status bar icons; the app's light ones come back on leaving.
  const lightVibe = !!vibe.light;
  // Leaving: the page slides away on the native thread, and nothing here
  // should re-render under it. So the backdrop is paused only once the slide
  // has finished (a re-render mid-slide is what made it stutter), and the
  // keyboard going down doesn't re-lay-out the thread while it goes.
  const leaving = useRef(false);
  useFocusEffect(
    useCallback(() => {
      leaving.current = false;
      setFocused(true);
      setStatusBarStyle(lightVibe ? 'dark' : 'light');
      const pause = { timer: null };
      return () => {
        setStatusBarStyle('light');
        pause.timer = setTimeout(() => setFocused(false), LEAVE_SETTLE_MS);
        // Coming straight back (a swipe let go of) cancels it.
        cancelPause.current = () => clearTimeout(pause.timer);
      };
    }, [lightVibe]),
  );
  const cancelPause = useRef(() => {});
  useEffect(() => {
    if (!navigation?.addListener) return undefined;
    const start = () => {
      leaving.current = true;
    };
    const stop = () => {
      leaving.current = false;
    };
    const subs = [navigation.addListener('beforeRemove', start), navigation.addListener('gestureCancel', stop), navigation.addListener('focus', () => (stop(), cancelPause.current()))];
    return () => subs.forEach((unsub) => unsub?.());
  }, [navigation]);
  const alive = useRef(true);
  const list = useRef(null);
  const typing = useRef(null);
  // Messages already on screen; anything new gets the entrance.
  const known = useRef(new Set());
  const know = (rows) => rows.forEach((m) => m?.id && known.current.add(m.id));
  // Reactions for a page of messages, fetched beside it.
  const loadReactions = useCallback((rows) => {
    listReactions(rows.map((m) => m.id))
      .then((list) => {
        if (!alive.current || !list.length) return;
        setReactions((all) => {
          const next = { ...all };
          for (const r of list) next[r.message_id] = [...(next[r.message_id] ?? []).filter((x) => x.user_id !== r.user_id), { user_id: r.user_id, emoji: r.emoji }];
          return next;
        });
      })
      .catch(() => {});
  }, []);
  const putReaction = (messageId, who, emoji) =>
    setReactions((all) => {
      const rest = (all[messageId] ?? []).filter((r) => r.user_id !== who);
      return { ...all, [messageId]: emoji ? [...rest, { user_id: who, emoji }] : rest };
    });

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // The call button's call is got ready while you read (its token only:
  // the camera and the video engine wait for the tap), and again once a
  // call is over, so tapping it connects first time.
  const callOpen = !!calls?.call;
  const primeCall = calls?.primeCall;
  useEffect(() => {
    if (!callOpen) primeCall?.();
  }, [callOpen, primeCall]);

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
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => {
      if (!leaving.current) setKeyboard(false);
    });
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
      requestRef.current = !!c?.request;
      know(page);
      setMessages(page);
      loadReactions(page);
      setOlder(page.length < PAGE ? 'done' : 'idle');
      setState('ready');
      if (!c?.request) markRead(id).catch(() => {});
    } catch (err) {
      if (!alive.current) return;
      setError(err.message);
      setState('error');
    }
  }, [id, userId, loadReactions]);

  useEffect(() => {
    if (id && userId) load();
    else if (!id) {
      setError("This conversation wasn't found.");
      setState('error');
    }
  }, [id, userId, load]);

  // What they're playing, live in the header.
  useProfileUpdates(conv?.otherId ? [conv.otherId] : [], (p) => setConv((prev) => (prev ? { ...prev, other: { ...prev.other, ...p } } : prev)));

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
      loadReactions(page);
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
          if (!requestRef.current) markRead(id).catch(() => {});
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
      // Reactions, theirs and yours from another phone.
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'message_reactions', filter: `conversation_id=eq.${id}` }, ({ new: r }) => {
        if (r?.message_id) putReaction(r.message_id, r.user_id, r.emoji);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'message_reactions', filter: `conversation_id=eq.${id}` }, ({ new: r }) => {
        if (r?.message_id) putReaction(r.message_id, r.user_id, r.emoji);
      })
      // Deletes can't be filtered; the whole old row comes through (replica identity full).
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'message_reactions' }, ({ old: r }) => {
        if (r?.message_id && r.conversation_id === id) putReaction(r.message_id, r.user_id, null);
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
    setMessages((l) =>
      merge(
        l.filter((m) => m.id !== tempId),
        [saved],
      ),
    );
  };
  const fail = (tempId, title, err) => {
    if (!alive.current) return;
    setMessages((l) => l.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true } : m)));
    Alert.alert(title, err.message);
  };

  // The message being answered goes with the next send, then the reply bar closes.
  const takeReply = (given) => {
    if (given !== undefined) return given;
    const r = replyTo?.id ?? null;
    setReplyTo(null);
    return r;
  };

  const send = async (text, retryId = null, retryReply) => {
    const body = (text ?? '').trim();
    if (!body) return;
    const reply = takeReply(retryReply);
    const tempId = retryId ?? `pending-${Date.now()}`;
    optimistic(tempId, { body, reply_to: reply });
    haptics.tap();
    toNewest();
    try {
      settle(tempId, await (reply ? sendMessage(id, body, { replyTo: reply }) : sendMessage(id, body)));
    } catch (err) {
      fail(tempId, 'Message not sent', err);
    }
  };

  // A GIF from the picker, sent on its own.
  const sendGifMessage = async (gif, retryId = null, retryReply) => {
    const reply = takeReply(retryReply);
    const tempId = retryId ?? `pending-${Date.now()}`;
    optimistic(tempId, { kind: 'gif', body: gif.url, media_width: gif.width ?? null, media_height: gif.height ?? null, reply_to: reply });
    toNewest();
    try {
      settle(tempId, await sendGif(id, gif, { replyTo: reply }));
    } catch (err) {
      fail(tempId, 'GIF not sent', err);
    }
  };

  // An animated emoji, sent on its own.
  const sendStickerMessage = async (emoji, retryId = null, retryReply) => {
    const reply = takeReply(retryReply);
    const tempId = retryId ?? `pending-${Date.now()}`;
    optimistic(tempId, { kind: 'sticker', body: emoji, reply_to: reply });
    toNewest();
    try {
      settle(tempId, await sendSticker(id, emoji, { replyTo: reply }));
    } catch (err) {
      fail(tempId, 'Sticker not sent', err);
    }
  };

  // Your reaction on a message: set, swapped or (null) taken back. It shows
  // at once and goes back if the database refuses it.
  const setMyReaction = async (message, emoji) => {
    if (!message?.id || message.pending || message.failed) return;
    const before = (reactions[message.id] ?? []).find((r) => r.user_id === userId)?.emoji ?? null;
    if (before === emoji) return;
    if (emoji) haptics.tap();
    putReaction(message.id, userId, emoji);
    try {
      if (emoji) await react(message.id, emoji);
      else await unreact(message.id, userId);
    } catch (err) {
      if (!alive.current) return;
      putReaction(message.id, userId, before);
      Alert.alert("Couldn't react", err.message);
    }
  };
  // A double tap loves it (and leaves an existing ❤️ alone); a chip tap toggles.
  const reactFromBubble = (message) => (emoji, doubleTap) => {
    const mineNow = (reactions[message.id] ?? []).find((r) => r.user_id === userId)?.emoji;
    if (doubleTap && mineNow === emoji) return;
    setMyReaction(message, emoji);
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
      durationMs: kind === 'video' ? (asset.duration ?? null) : null,
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

  const retry = (message) =>
    message.upload
      ? sendFile(message.upload, message.id)
      : message.kind === 'gif'
        ? sendGifMessage({ url: message.body, width: message.media_width, height: message.media_height }, message.id, message.reply_to ?? null)
        : message.kind === 'sticker'
          ? sendStickerMessage(message.body, message.id, message.reply_to ?? null)
          : send(message.body, message.id, message.reply_to ?? null);

  // Holding a message lifts it out with its reactions and actions.
  const onLongPress = (message) => {
    if (message.pending) return;
    haptics.selection();
    Keyboard.dismiss();
    setHolding(message);
  };

  const byId = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);
  // Tapping a quote scrolls to the message it quotes and lights it up.
  const jumpTo = (messageId) => {
    const index = messages.findIndex((m) => m.id === messageId);
    if (index < 0) return;
    list.current?.scrollToIndex?.({ index, viewPosition: 0.5, animated: true });
    setFlashId(messageId);
    setTimeout(() => alive.current && setFlashId((f) => (f === messageId ? null : f)), 1400);
  };

  const other = conv?.other;
  // Your Contact Book name for them, if you've saved one, beats their own.
  const alias = useAlias(conv?.otherId);
  const name = nameFor(other, alias, 'Conversation');
  const [contactOpen, setContactOpen] = useState(false);
  const online = conv ? isOnline(conv.otherId) : false;
  const dayOne = useDayOne([conv?.otherId]).has(conv?.otherId);
  const isBlocked = conv ? blocked.has(conv.otherId) : false;
  // They've turned messages off (Hub settings > Who can message you): the
  // thread stays readable, and the composer makes way for a quiet note.
  const [closed, setClosed] = useState(false);
  const otherId = conv?.otherId;
  useEffect(() => {
    if (!otherId) return undefined;
    let live = true;
    Promise.resolve()
      .then(() => canMessage(otherId))
      .then((yes) => live && setClosed(!yes))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [otherId]);
  // "Seen" goes under your latest message once they've read it.
  const lastMine = messages.find((m) => m.sender_id === userId && !m.pending && !m.failed);
  const seenId = lastMine && conv?.theirReadAt && new Date(conv.theirReadAt) >= new Date(lastMine.created_at) ? lastMine.id : null;
  const bottom = keyboard ? 0 : insets.bottom;
  const isRequest = !!conv?.request;
  // Reply needs the composer: not on a request, a block or closed messages.
  const canReply = !isRequest && !isBlocked && !closed;
  const accept = async () => {
    try {
      await acceptConversation(id);
      haptics.success();
      requestRef.current = false;
      setConv((c) => (c ? { ...c, request: false } : c));
      markRead(id).catch(() => {});
    } catch (err) {
      Alert.alert("Couldn't accept", err.message);
    }
  };
  const blockRequest = () =>
    Alert.alert(`Block ${name}?`, "They won't be able to message or call you, and won't be told.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Block',
        style: 'destructive',
        onPress: () =>
          block(conv.otherId)
            .then(() => navigation.goBack())
            .catch((err) => Alert.alert("Couldn't block", err.message)),
      },
    ]);
  const measureComposer = (e) => setComposerH(e.nativeEvent.layout.height);

  // If the animated backdrop ever fails to draw, the vibe's own base tone stands in: the conversation stays.
  const backdrop = (
    <ErrorBoundary
      name="chat-backdrop"
      fallback={() => <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: vibe.mesh?.[0] ?? colors.bg }]} testID="chat-backdrop-fallback" />}
    >
      <ChatBackdrop vibe={vibe} motion={motion === MOTION} paused={!focused || !!(calls?.call && calls.call.phase !== 'ended')} />
    </ErrorBoundary>
  );
  const header = (
    <Header
      name={name}
      onContact={other ? () => { haptics.selection(); setContactOpen(true); } : undefined}
      person={other}
      online={online}
      vibe={vibe}
      motion={motion === MOTION}
      badge={
        other?.is_boa_star || dayOne ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            {other?.is_boa_star ? <BoaStarBadge size={15} /> : null}
            {dayOne ? <DayOneBadge size={15} label={!other?.is_boa_star} /> : null}
          </View>
        ) : null
      }
      status={other ? <HeaderStatus person={other} online={online} typing={theyType} vibe={vibe} /> : null}
      onBack={() => navigation.goBack()}
      onProfile={conv && other ? () => navigation.navigate('HubProfile', { id: conv.otherId }) : null}
      onVibe={() => setPicking(true)}
      onCall={calls && other && !isBlocked ? () => calls.startCall({ ...other, id: conv.otherId }) : null}
      callState={calls?.callPrep}
      onLayout={(e) => setHeaderH(e.nativeEvent.layout.height)}
    />
  );
  const sheet = <ChatVibeSheet open={picking} onClose={() => setPicking(false)} />;

  if (state !== 'ready') {
    return (
      <View style={[styles.screen, { backgroundColor: vibe.mesh[1] }]} testID="hub-thread">
        {backdrop}
        <View style={[styles.layer, { paddingTop: headerH }]}>
          {state === 'loading' ? (
            <MessagesSkeleton />
          ) : (
            <View style={styles.empty}>
              <Ionicons name="cloud-offline-outline" size={30} color={vibe.accent} />
              <Text style={[type.title, { marginTop: space.md, textAlign: 'center', color: vibe.ink }]}>Couldn't open this conversation</Text>
              <Text style={[type.bodyMuted, { textAlign: 'center', marginTop: space.sm, color: vibe.inkMuted }]}>{error}</Text>
              <Button label="Try again" icon="refresh" onPress={load} style={{ marginTop: space.xl }} />
            </View>
          )}
        </View>
        {header}
        {sheet}
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: vibe.mesh[1] }]} testID="hub-thread">
      {/* Layer 1: full screen, behind everything, outside the keyboard's reach. */}
      {backdrop}
      <KeyboardAvoidingView style={styles.fill} behavior={keyboardBehavior()} testID="hub-thread-keyboard">
        <View style={styles.fill}>
          {/* Layer 2: the messages, on nothing but the backdrop. */}
          <FlatList
            ref={list}
            inverted
            data={messages}
            keyExtractor={(m, i) => String(m?.id ?? i)}
            extraData={[reactions, flashId, seenId, openingId]}
            renderItem={({ item }) => {
              const quoted = item.reply_to ? byId.get(item.reply_to) : undefined;
              return (
                <Bubble
                  message={item}
                  mine={item.sender_id === userId}
                  seen={item.id === seenId}
                  fresh={!known.current.has(item.id)}
                  vibe={vibe}
                  reactions={reactions[item.id]}
                  myId={userId}
                  quoted={quoted}
                  quotedWho={quoted ? (quoted.sender_id === userId ? 'You' : name) : 'Reply'}
                  flash={flashId === item.id}
                  maxWidth={bubbleMax}
                  onLongPress={() => onLongPress(item)}
                  onReact={reactFromBubble(item)}
                  onQuote={() => jumpTo(item.reply_to)}
                  onOpenMedia={setViewing}
                  onOpenOnce={openOnce}
                  opening={openingId === item.id}
                />
              );
            }}
            onScrollToIndexFailed={({ index }) => list.current?.scrollToOffset?.({ offset: index * 80, animated: true })}
            onEndReachedThreshold={0.4}
            onEndReached={loadOlder}
            // Inverted: the top padding sits at the bottom of the screen.
            contentContainerStyle={{ paddingHorizontal: gutter, paddingTop: composerH + space.md, paddingBottom: headerH + space.md, flexGrow: 1 }}
            scrollIndicatorInsets={{ top: composerH, bottom: headerH }}
            style={styles.layer}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            ListHeaderComponent={theyType ? <TypingIndicator name={name} vibe={vibe} /> : null}
            ListFooterComponent={older === 'loading' ? <LoadingDots color={vibe.accent} style={{ margin: space.lg }} /> : null}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={[type.bodyMuted, { textAlign: 'center', color: vibe.inkMuted }]}>Say hello to {name}.</Text>
              </View>
            }
            testID="chat-layer-messages"
          />
          {/* Layer 3: the header and composer, floating over both. */}
          {header}
          {isRequest && !isBlocked ? (
            <View style={[styles.bar, styles.requestBar, { paddingBottom: insets.bottom + space.md }]} onLayout={measureComposer} testID="thread-request">
              <Smoke vibe={vibe} />
              <Text style={[styles.requestTitle, { color: vibe.ink }]}>{name} wants to message you</Text>
              <Text style={[type.bodyMuted, styles.requestBody, { color: vibe.inkMuted }]}>They won't know you've seen this until you accept. Accept to reply; block if it's not for you.</Text>
              <View style={styles.requestActions}>
                <Button label="Block" variant="ghost" onPress={blockRequest} style={{ flex: 1 }} testID="thread-request-block" />
                <Button label="Accept" icon="checkmark" onPress={accept} style={{ flex: 1 }} testID="thread-request-accept" />
              </View>
            </View>
          ) : isBlocked ? (
            <View style={[styles.bar, { paddingBottom: insets.bottom + space.md }]} onLayout={measureComposer}>
              <Smoke vibe={vibe} />
              <Text style={[type.bodyMuted, { flex: 1, color: vibe.inkMuted }]}>You've blocked {name}. Unblock them to send messages.</Text>
              <Button label="Unblock" variant="ghost" onPress={() => unblock(conv.otherId).catch((e) => Alert.alert('Unblock failed', e.message))} />
            </View>
          ) : closed ? (
            <View style={[styles.bar, { paddingBottom: insets.bottom + space.md }]} onLayout={measureComposer} testID="thread-messages-off">
              <Smoke vibe={vibe} />
              <Ionicons name="lock-closed-outline" size={18} color={vibe.inkMuted} />
              <Text style={[type.bodyMuted, { flex: 1, color: vibe.inkMuted }]}>{name} isn't taking messages right now.</Text>
            </View>
          ) : (
            <Composer
              onSend={(text) => send(text)}
              onAttach={attach}
              onVoice={sendVoice}
              onStickers={() => setStickers({ purpose: 'send' })}
              onGifs={() => setGifs(true)}
              replyTo={replyTo ? { message: replyTo, who: replyTo.sender_id === userId ? 'yourself' : name, text: describeMessage(replyTo) } : null}
              onCancelReply={() => setReplyTo(null)}
              onTyping={(on) => (on ? typing.current?.ping() : typing.current?.stop())}
              bottomInset={bottom}
              onFocus={toNewest}
              vibe={vibe}
              onLayout={measureComposer}
              style={styles.floating}
            />
          )}
        </View>
      </KeyboardAvoidingView>
      <MediaViewer item={viewing} onClose={() => setViewing(null)} />
      <SendMediaSheet file={picked} viewOnce={viewOnce} onViewOnce={setViewOnce} onCancel={() => setPicked(null)} onSend={sendPicked} />
      <ReportSheet target={reporting} onClose={(didBlock) => (setReporting(null), didBlock && navigation.goBack())} />
      {sheet}
      <ViewOnceViewer item={once} onClose={closeOnce} />
      <MessageActions
        message={holding}
        mine={holding?.sender_id === userId}
        current={holding ? ((reactions[holding.id] ?? []).find((r) => r.user_id === userId)?.emoji ?? null) : null}
        vibe={vibe}
        onReact={(emoji) => setMyReaction(holding, emoji)}
        onMore={() => setStickers({ purpose: 'react', message: holding })}
        onReply={canReply ? () => setReplyTo(holding) : null}
        onRetry={() => retry(holding)}
        onDelete={() => remove(holding)}
        onReport={() => setReporting({ message: holding, user: conv?.other ?? { id: holding.sender_id } })}
        onClose={() => setHolding(null)}
      />
      <ContactSheet person={contactOpen ? other : null} onClose={() => setContactOpen(false)} />
      <GifPicker open={gifs} onPick={(gif) => sendGifMessage(gif)} onClose={() => setGifs(false)} />
      <StickerPicker
        open={!!stickers}
        purpose={stickers?.purpose}
        onPick={(emoji) => (stickers?.purpose === 'react' ? setMyReaction(stickers.message, emoji) : sendStickerMessage(emoji))}
        onClose={() => setStickers(null)}
      />
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
      <Pressable onPress={() => (navigation?.canGoBack?.() ? navigation.goBack() : null)} accessibilityRole="button" accessibilityLabel="Back" hitSlop={12} style={styles.fallbackBack}>
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

/** One conversation: messages, photos, videos and voice notes, live in both directions, with read receipts. */
export default function NewChatScreen(props) {
  return (
    <ErrorBoundary name="hub-thread" fallback={(f) => <ThreadFallback {...f} navigation={props.navigation} />}>
      {/* The member's chosen typeface dresses the thread (and only the thread). */}
      <FontScope>
        <Thread {...props} />
      </FontScope>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  // Its fill is set from the vibe where it's drawn.
  screen: { flex: 1 },
  fill: { flex: 1 },
  // Layer 2: transparent, over the backdrop.
  layer: { ...StyleSheet.absoluteFill, zIndex: 1, backgroundColor: 'transparent' },
  floating: { position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 2 },
  bubbleRow: { flexDirection: 'row', marginVertical: 3 },
  bubbleCol: { maxWidth: '80%' },
  bubble: { maxWidth: '100%', paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1 },
  stickerMsg: { alignItems: 'flex-end', padding: space.xs, borderRadius: radius.lg },
  heartPop: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  mediaBubble: { padding: 4, paddingBottom: space.xs },
  // No drop shadows: the glass is lit by its edge and sheen. A few vibes give yours a glow of its own (vibe.mineGlow).
  mine: { borderBottomRightRadius: radius.sm },
  theirs: { borderBottomLeftRadius: radius.sm },
  sheen: { position: 'absolute', left: 10, right: 10, top: 0, height: StyleSheet.hairlineWidth * 2, backgroundColor: 'rgba(255,255,255,0.22)' },
  body: { fontFamily: fonts.chat, fontSize: 15.5, lineHeight: 22, letterSpacing: -0.1, color: colors.text },
  // Times and receipts in spaced capitals.
  meta: { fontFamily: fonts.stamp, fontSize: 9.5, letterSpacing: 1.3, textTransform: 'uppercase', color: colors.textMuted, marginTop: 4, alignSelf: 'flex-end' },
  header: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 2, overflow: 'hidden', paddingBottom: space.sm + 2 },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingLeft: space.xs, paddingRight: space.md, gap: space.sm, width: '100%', maxWidth: READING, alignSelf: 'center' },
  back: { width: 36, height: 44, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.6, transform: [{ scale: 0.94 }] },
  who: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: space.md },
  // A fixed height keeps the name block centred on the avatar, status line or not.
  whoText: { flex: 1, minWidth: 0, minHeight: AVATAR, justifyContent: 'center' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
  name: { flexShrink: 1, fontFamily: fonts.chatBold, fontSize: 17, lineHeight: 22, letterSpacing: -0.3 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  statusText: { fontFamily: fonts.chat, fontSize: 12.5, marginTop: 2 },
  round: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  vibe: { height: 34, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: space.md, borderRadius: radius.pill, borderWidth: 1, overflow: 'hidden' },
  vibeLabel: { fontFamily: fonts.stamp, fontSize: 11, letterSpacing: 1.8, textTransform: 'uppercase' },
  edge: { position: 'absolute', left: 0, right: 0, bottom: 0, height: StyleSheet.hairlineWidth, opacity: 0.45 },
  requestBar: { flexDirection: 'column', alignItems: 'stretch', gap: space.xs },
  requestTitle: { fontFamily: fonts.chatBold, fontSize: 15.5 },
  requestBody: { fontSize: 13, lineHeight: 18 },
  requestActions: { flexDirection: 'row', gap: space.md, marginTop: space.sm },
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 2,
    overflow: 'hidden',
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
