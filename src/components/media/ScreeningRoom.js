import { useEffect, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import YouTubePlayer from './YouTubePlayer';
import VideoPlayer from './VideoPlayer';
import Poster, { metaLine } from '../Poster';
import { Button, Slate, Viewfinder } from '../ui';
import { fillFrame, toSource } from '../HeroArt';
import OriginalHeart from '../hub/OriginalHeart';
import { colors, fonts, space, type } from '../../theme';
import { PARKED_ONLY } from '../../car/parked';

// Default room art when a production has none of its own.
const ROOM_ART = require('../../../assets/images/mind-states-backdrop.jpg');

/**
 * Full-screen player. Episodes play from a direct file through <video> when
 * one exists, otherwise from YouTube (where BOA publishes today).
 *
 * In a car (car.car, src/car/parked.js) the picture is parked only: the
 * moment the car moves, the player is taken away (unmounted, so it stops
 * dead) and a still card takes its place. Once parked again the card
 * offers Resume; nothing starts by itself.
 */
export default function ScreeningRoom({ screening, onClose, onSwitch, car }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const inCar = !!car?.car;
  const parked = !inCar || !!car.parked;
  // Held: stopped because the car moved, until Resume.
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (!parked) setHeld(true);
  }, [parked]);
  // A new screening starts held unless the car is parked.
  useEffect(() => {
    setHeld(!parked);
  }, [screening]);
  if (!screening) return null;
  const blocked = inCar && (held || !parked);

  const { production, kind, episode } = screening;
  const videoWidth = Math.max(Math.min(width, ((height - 260) * 16) / 9, 1200), Math.min(width, 300));
  const videoHeight = Math.round((videoWidth * 9) / 16);

  let source = null;
  if (kind === 'trailer' && production.trailerYouTubeId) source = { youTubeId: production.trailerYouTubeId };
  if (kind === 'episode' && episode) source = episode.videoUrl ? { videoUrl: episode.videoUrl } : { youTubeId: episode.youTubeId };

  const label = kind === 'trailer' ? 'Official trailer' : episode?.title ?? 'Episode';
  const firstEpisode = production.episodes[0];

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View entering={FadeIn.duration(220)} style={styles.backdrop}>
        {/* The room: key art blurred to pure atmosphere and pulled down to
            near-black, so the picture stays the brightest thing on screen. */}
        <Image
          source={toSource(production.backdrop) ?? ROOM_ART}
          blurRadius={40}
          resizeMode="cover"
          style={[fillFrame, styles.roomArt]}
          accessibilityIgnoresInvertColors
        />
        <LinearGradient
          colors={['rgba(5,5,6,0.55)', 'rgba(5,5,6,0.42)', 'rgba(5,5,6,0.82)', colors.bg]}
          locations={[0, 0.35, 0.75, 1]}
          style={StyleSheet.absoluteFill}
        />
        <ScrollView contentContainerStyle={{ paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.xxl }}>
          <View style={styles.topBar}>
            <Slate dot>Now screening · {label}</Slate>
            <Pressable
              onPress={onClose}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Close player"
              style={({ pressed }) => [styles.close, pressed && { opacity: 0.6 }]}
            >
              <Ionicons name="close" size={22} color={colors.text} />
            </Pressable>
          </View>

          <Animated.View
            entering={FadeInDown.springify().damping(20).stiffness(140)}
            style={[styles.stage, { width: videoWidth, height: videoHeight }]}
          >
            {/* YouTube shows each video's own thumbnail; never overlay the
                production art on it. That art is only the room behind. */}
            {blocked ? (
              <View style={[styles.parkedHold, { width: videoWidth, height: videoHeight }]} testID="screening-parked-only">
                <Ionicons name="car-outline" size={40} color={colors.gold} />
                <Text style={styles.parkedTitle}>{parked ? 'Parked. Pick up where you left off.' : 'Paused while you drive'}</Text>
                <Text style={styles.parkedBody}>{PARKED_ONLY}</Text>
                {parked ? <Button label="Resume" onPress={() => setHeld(false)} style={{ marginTop: space.lg }} testID="screening-resume" /> : null}
              </View>
            ) : source?.youTubeId ? (
              <YouTubePlayer key={source.youTubeId} videoId={source.youTubeId} width={videoWidth} height={videoHeight} />
            ) : source?.videoUrl ? (
              <VideoPlayer uri={source.videoUrl} poster={production.image} width={videoWidth} height={videoHeight} />
            ) : (
              <View>
                <Poster production={production} width={videoWidth} showTitle={false} rounded={0} />
                <View style={styles.soonOverlay}>
                  <Viewfinder />
                  <Text style={styles.soonTitle}>
                    {kind === 'trailer' ? 'Trailer' : 'Episode'} <Text style={type.serif}>coming soon</Text>
                  </Text>
                </View>
              </View>
            )}
          </Animated.View>

          <View style={[styles.info, { width: Math.min(width, 760) }]}>
            <View style={styles.titleRow}>
              <Text style={[type.h1, { flex: 1 }]}>{production.title}</Text>
              <OriginalHeart production={production} />
            </View>
            {!!metaLine(production) && <Slate style={{ marginTop: 10 }}>{metaLine(production)}</Slate>}
            {production.logline && <Text style={[type.bodyMuted, { marginTop: space.lg }]}>{production.logline}</Text>}
            <View style={styles.actions}>
              {kind === 'episode' && production.trailerYouTubeId && (
                <Button
                  label="Watch Trailer"
                  icon="film-outline"
                  variant="ghost"
                  onPress={() => onSwitch({ production, kind: 'trailer' })}
                />
              )}
              {kind === 'trailer' && firstEpisode && (
                <Button
                  label={`Play ${firstEpisode.title}`}
                  icon="play"
                  onPress={() => onSwitch({ production, kind: 'episode', episode: firstEpisode })}
                />
              )}
            </View>
          </View>
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  parkedHold: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xl,
    backgroundColor: '#050506',
  },
  parkedTitle: { fontFamily: fonts.semibold, fontSize: 24, color: colors.text, marginTop: space.md, textAlign: 'center' },
  parkedBody: { fontFamily: fonts.medium, fontSize: 18, color: colors.textMuted, marginTop: space.sm, textAlign: 'center' },
  backdrop: { flex: 1, backgroundColor: '#000', overflow: 'hidden' },
  // Oversized so the blur's soft edges stay off-screen.
  roomArt: { transform: [{ scale: 1.2 }] },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.xl,
    paddingBottom: space.md,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  close: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(243,239,232,0.1)',
  },
  stage: {
    alignSelf: 'center',
    backgroundColor: '#000',
    overflow: 'hidden',
    boxShadow: '0px 30px 80px rgba(0,0,0,0.75), 0px 0px 0px 1px rgba(243,239,232,0.08)',
  },
  soonOverlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  soonTitle: { fontFamily: fonts.semibold, fontSize: 26, color: colors.text, letterSpacing: -0.8 },
  info: { alignSelf: 'center', paddingHorizontal: space.xl, paddingTop: space.xl },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, marginTop: space.xl },
});
