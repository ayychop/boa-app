import { useEffect } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { FadeIn, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { usePlaybackProgress, usePlayer } from '../../context/PlayerContext';
import { episodeItem } from '../../data/podcasts';
import PodcastCover from '../PodcastCover';
import Scrubber from '../Scrubber';
import { Slate, Tappable } from '../ui';
import { colors, fonts, radius, space, type } from '../../theme';

const RATES = [1, 1.25, 1.5, 2, 0.75];

const minutes = (sec) => (sec ? `${Math.round(sec / 60)} min` : null);

function CircleButton({ icon, label, onPress, size = 52, primary, children }) {
  return (
    <Tappable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      scaleTo={0.9}
      style={[
        styles.circle,
        { width: size, height: size, borderRadius: size / 2 },
        primary && { backgroundColor: colors.text },
      ]}
    >
      {children ?? <Ionicons name={icon} size={size * 0.46} color={primary ? colors.bg : colors.text} />}
    </Tappable>
  );
}

/** Full-screen player for on-demand podcast episodes. */
export default function PodcastPlayer({ podcast, onClose }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const player = usePlayer();
  const { position, duration } = usePlaybackProgress();
  const reduceMotion = useReducedMotion();
  const coverScale = useSharedValue(1);

  const mine = player.current?.kind === 'podcast' && player.current.podcastId === podcast?.id;
  const playing = mine && player.isPlaying;

  // Cover breathes with playback, like Apple Music: full size while playing,
  // settled back when paused.
  useEffect(() => {
    const target = playing || !mine ? 1 : 0.86;
    coverScale.value = reduceMotion ? target : withSpring(target, { stiffness: 180, damping: 18 });
  }, [playing, mine, reduceMotion, coverScale]);
  const coverStyle = useAnimatedStyle(() => ({ transform: [{ scale: coverScale.value }] }));

  if (!podcast) return null;

  const episode = (mine && podcast.episodes.find((e) => e.id === player.current.id)) || podcast.episodes[0];
  const item = episodeItem(podcast, episode);
  const coverSize = Math.round(Math.min(width * 0.78, height * 0.4, 420));
  const contentWidth = Math.min(width - space.xl * 2, 520);
  const rate = player.rate ?? 1;
  const nextRate = RATES[(RATES.indexOf(rate) + 1) % RATES.length];

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={styles.backdrop}>
          <LinearGradient
            colors={[`${podcast.palette[0]}55`, `${podcast.palette[1]}88`, colors.bg]}
            locations={[0, 0.45, 0.9]}
            style={StyleSheet.absoluteFill}
          />
          <ScrollView
            contentContainerStyle={{ alignItems: 'center', paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.xxl }}
            showsVerticalScrollIndicator={false}
          >
            <View style={[styles.topBar, { width: contentWidth }]}>
              <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close player" style={styles.close}>
                <Ionicons name="chevron-down" size={24} color={colors.text} />
              </Pressable>
              <View style={{ alignItems: 'center' }}>
                <Slate>BOA Podcasts · {podcast.category}</Slate>
                <Text style={styles.topTitle} numberOfLines={1}>
                  {podcast.title}
                </Text>
              </View>
              <View style={{ width: 40 }} />
            </View>

            <Animated.View style={[styles.cover, coverStyle]}>
              <PodcastCover podcast={podcast} size={coverSize} rounded={radius.lg} />
            </Animated.View>

            <View style={{ width: contentWidth }}>
              <View style={styles.epMeta}>
                <Slate color={podcast.palette[0]}>
                  {[podcast.category, minutes(episode.duration)].filter(Boolean).join(' · ')}
                </Slate>
                {episode.sample && (
                  <View style={styles.sampleBadge}>
                    <Text style={styles.sampleText}>Sample Episode</Text>
                  </View>
                )}
              </View>
              <Text style={styles.episodeTitle} numberOfLines={2}>
                {episode.title}
              </Text>
              <Text style={[type.bodyMuted, { marginTop: 2 }]} numberOfLines={1}>
                {podcast.title} · {podcast.author}
              </Text>

              <View style={{ marginTop: space.xl }}>
                <Scrubber
                  position={mine ? position : 0}
                  duration={mine ? duration : 0}
                  onSeek={player.seek}
                  tint={podcast.palette[0]}
                />
              </View>

              <View style={styles.controls}>
                <Tappable
                  onPress={() => player.setRate(nextRate)}
                  accessibilityRole="button"
                  accessibilityLabel={`Playback speed ${rate}x`}
                  style={styles.rate}
                >
                  <Text style={styles.rateText}>{rate}×</Text>
                </Tappable>
                <CircleButton icon="play-back" label="Back 15 seconds" onPress={() => player.skip(-15)} />
                <CircleButton
                  primary
                  size={76}
                  label={playing ? 'Pause' : 'Play'}
                  onPress={() => (mine ? player.toggle() : player.play(item))}
                >
                  {mine && player.status === 'loading' ? (
                    <ActivityIndicator color={colors.bg} />
                  ) : (
                    <Ionicons name={playing ? 'pause' : 'play'} size={32} color={colors.bg} style={playing ? null : { marginLeft: 4 }} />
                  )}
                </CircleButton>
                <CircleButton icon="play-forward" label="Forward 30 seconds" onPress={() => player.skip(30)} />
                {/* Balances the speed pill so play stays centred. */}
                <View style={styles.rate} />
              </View>
              {mine && player.status === 'error' && (
                <Text style={[type.caption, { textAlign: 'center', marginTop: space.md }]}>
                  This episode couldn't load. Tap play to retry.
                </Text>
              )}

              <Text style={[type.bodyMuted, { marginTop: space.xl }]}>{podcast.tagline}</Text>


              <Slate style={{ marginTop: space.xxl, marginBottom: space.md }}>Episodes</Slate>
              {podcast.episodes.map((ep, i) => {
                const isCurrent = ep.id === episode.id;
                return (
                  <Animated.View key={ep.id} entering={FadeIn}>
                    <Pressable
                      onPress={() => player.play(episodeItem(podcast, ep))}
                      accessibilityRole="button"
                      accessibilityLabel={`Play ${ep.title}${ep.sample ? ' (sample episode)' : ''}`}
                      style={({ pressed }) => [styles.epRow, isCurrent && styles.epRowActive, pressed && { opacity: 0.7 }]}
                    >
                      <Text style={[styles.epNum, isCurrent && { color: podcast.palette[0] }]}>
                        {String(i + 1).padStart(2, '0')}
                      </Text>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.epTitle} numberOfLines={1}>
                          {ep.title}
                        </Text>
                        <Text style={styles.epSub} numberOfLines={1}>
                          {[i === 0 ? 'Latest' : null, minutes(ep.duration), ep.sample ? 'Sample Episode' : null].filter(Boolean).join(' · ')}
                        </Text>
                      </View>
                      <Ionicons
                        name={isCurrent && playing ? 'pulse' : 'play-circle-outline'}
                        size={22}
                        color={isCurrent ? podcast.palette[0] : colors.textMuted}
                      />
                    </Pressable>
                  </Animated.View>
                );
              })}
            </View>
          </ScrollView>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.bg },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.xl },
  close: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(243,239,232,0.1)' },
  topTitle: { fontFamily: fonts.semibold, fontSize: 13, color: colors.text, marginTop: 4, maxWidth: 220 },
  cover: { boxShadow: '0px 30px 60px rgba(0,0,0,0.55)', borderRadius: radius.lg },
  episodeTitle: { fontFamily: fonts.bold, fontSize: 28, lineHeight: 32, letterSpacing: -0.9, color: colors.text, marginTop: space.sm },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.lg },
  circle: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(243,239,232,0.08)' },
  rate: { width: 44, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 16 },
  rateText: { fontFamily: fonts.monoMedium, fontSize: 13, color: colors.text },
  epRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: 14,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  epRowActive: { backgroundColor: 'rgba(243,239,232,0.06)' },
  epNum: { fontFamily: fonts.mono, fontSize: 12, color: colors.textFaint, width: 22 },
  epTitle: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
  epSub: { fontFamily: fonts.medium, fontSize: 12, color: colors.textFaint, marginTop: 2 },
  epMeta: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.xl, flexWrap: 'wrap' },
  sampleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  sampleText: { fontFamily: fonts.mono, fontSize: 9.5, letterSpacing: 1.4, textTransform: 'uppercase', color: colors.textMuted },
});
