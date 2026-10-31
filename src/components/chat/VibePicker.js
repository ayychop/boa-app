import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Text from '../ScopedText';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';
import useReducedMotion from '../../hooks/useReducedMotion';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { CUSTOM_ID, customVibe, isPremiumVibe, VIBES } from '../../chat/vibes';
import { haptics } from '../../utils/haptics';
import { usePress } from '../../utils/motion';
import ColorPicker from './ColorPicker';
import VibeTexture from './VibeTexture';
import { colors, fonts, radius, space } from '../../theme';

const CARD = 132;
const GAP = space.md;
const PREVIEW_H = 108;

// A few fixed stars for a night-sky card (Midnight).
const MINI_STARS = [
  [0.12, 0.14, 2],
  [0.3, 0.32, 1.5],
  [0.48, 0.1, 2.5],
  [0.62, 0.36, 1.5],
  [0.78, 0.16, 2],
  [0.9, 0.3, 1.5],
  [0.22, 0.48, 1.5],
  [0.7, 0.05, 1.5],
];
function MiniStars() {
  return MINI_STARS.map(([x, y, s], i) => (
    <View
      key={i}
      style={{ position: 'absolute', left: `${x * 100}%`, top: `${y * 100}%`, width: s, height: s, borderRadius: s, backgroundColor: '#FFFFFF', boxShadow: '0px 0px 4px rgba(201,214,255,0.9)' }}
    />
  ));
}

/** One vibe as a small window onto its look: mesh, texture, one of their bubbles and one of yours. */
function VibeCard({ v, on, onPress, custom, locked }) {
  const press = usePress({ haptic: false });
  const still = useReducedMotion();
  return (
    <Pressable
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      accessibilityLabel={`${v.label}: ${v.detail}${locked ? '. BOA Premium' : ''}`}
      testID={`chat-vibe-${v.id}`}
    >
      <Animated.View style={[styles.card, on && { borderColor: v.accentEdge, boxShadow: `0px 0px 16px ${v.accentSoft}` }, press.style]}>
        <LinearGradient colors={v.mesh} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.preview} testID={`chat-vibe-${v.id}-preview`}>
          <View style={[styles.light, { backgroundColor: v.lights[0].color }]} />
          <View style={[styles.light2, { backgroundColor: v.lights[1].color }]} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: v.veil }]} />
          {v.stars.max >= 0.5 ? <MiniStars /> : null}
          {/* Only the record moves: twelve animating cards would cost frames. */}
          <VibeTexture vibe={v} width={CARD - 12} height={PREVIEW_H} still={still || v.texture !== 'vinyl'} mini />
          {/* Premium, and you haven't got it: a gold lock, and the card dims a little. */}
          {locked ? (
            <View style={styles.lock} testID={`chat-vibe-${v.id}-locked`}>
              <Ionicons name="diamond" size={10} color="#0B0906" />
              <Text style={styles.lockText}>Premium</Text>
            </View>
          ) : null}
          {custom ? (
            <View style={styles.customBadge}>
              <Ionicons name="color-palette" size={18} color={v.accent} />
            </View>
          ) : null}
          {/* The theme's real bubbles: fill, edge, corner, glow and text colour. */}
          <View style={[styles.theirs, { backgroundColor: v.theirsFill, borderColor: v.theirsEdge }, v.radius && { borderRadius: 3 }]}>
            <LinearGradient colors={v.theirs} start={{ x: 0, y: 0 }} end={{ x: 0.5, y: 1 }} style={StyleSheet.absoluteFill} />
            <Text style={[styles.bubbleText, { color: v.theirsText }, v.theirsGlow && styles.glowText]} numberOfLines={1}>
              You up?
            </Text>
          </View>
          <View style={[styles.mineWrap, v.mineGlow && { boxShadow: v.mineGlow }, v.radius && { borderRadius: 3 }]}>
            <LinearGradient colors={v.mine} start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 1 }} style={[styles.mine, { borderColor: v.mineEdge }, v.radius && { borderRadius: 3 }]}>
              <Text style={[styles.bubbleText, { color: v.mineText }]} numberOfLines={1}>
                Pull up
              </Text>
            </LinearGradient>
          </View>
        </LinearGradient>
        <View style={styles.labelRow}>
          <Text style={styles.label} numberOfLines={1}>
            {v.label}
          </Text>
          {on ? <Ionicons name="checkmark-circle" size={15} color={v.accent} testID={`chat-vibe-${v.id}-selected`} /> : null}
        </View>
        <Text style={styles.detail} numberOfLines={2}>
          {v.detail}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

/**
 * Every chat vibe in a row that snaps card by card, with Custom last:
 * picking one applies it at once (the thread crossfades to it). Custom
 * opens a colour picker below the row.
 */
export default function VibePicker({ value, onChange, customColor, onCustomColor, locked = false }) {
  const [picking, setPicking] = useState(false);
  const custom = customVibe(customColor);
  const choose = (id) => {
    haptics.selection();
    // Locked: the parent shows what Premium unlocks instead.
    if (locked && isPremiumVibe(id)) return onChange(id);
    if (id === CUSTOM_ID) {
      setPicking((p) => !p || value !== CUSTOM_ID);
      if (value !== CUSTOM_ID) onChange(CUSTOM_ID);
      return;
    }
    setPicking(false);
    onChange(id);
  };
  return (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={CARD + GAP}
        decelerationRate="fast"
        contentContainerStyle={styles.row}
        accessibilityRole="radiogroup"
        testID="chat-vibe-list"
      >
        {VIBES.map((v) => (
          <VibeCard key={v.id} v={v} on={v.id === value} onPress={() => choose(v.id)} locked={locked && isPremiumVibe(v.id)} />
        ))}
        <VibeCard v={custom} on={value === CUSTOM_ID} onPress={() => choose(CUSTOM_ID)} custom locked={locked} />
      </ScrollView>
      {picking && onCustomColor ? (
        <Animated.View entering={FadeInDown.springify().damping(15).stiffness(150)} exiting={FadeOutUp.duration(160)} style={styles.pickerWrap}>
          <ColorPicker
            value={custom.customColor}
            onDone={(hex) => {
              onCustomColor(hex);
              setPicking(false);
            }}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  lock: {
    position: 'absolute',
    top: 6,
    left: 6,
    zIndex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: '#F6D38A',
    boxShadow: '0px 0px 10px rgba(226,168,75,0.6)',
  },
  lockText: { fontFamily: fonts.semibold, fontSize: 9, letterSpacing: 0.4, color: '#0B0906' },
  row: { gap: GAP, paddingRight: space.lg },
  card: {
    width: CARD,
    padding: 6,
    paddingBottom: space.sm,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: colors.bgElevated,
  },
  preview: { height: PREVIEW_H, borderRadius: radius.md, overflow: 'hidden', padding: 8, justifyContent: 'flex-end', gap: 5 },
  light: { position: 'absolute', width: 80, height: 80, borderRadius: 40, top: -26, left: -20, opacity: 0.5 },
  light2: { position: 'absolute', width: 70, height: 70, borderRadius: 35, bottom: -30, right: -18, opacity: 0.4 },
  customBadge: { position: 'absolute', top: 8, right: 8 },
  theirs: { alignSelf: 'flex-start', maxWidth: '78%', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 9, borderBottomLeftRadius: 3, borderWidth: 1, overflow: 'hidden' },
  mineWrap: { alignSelf: 'flex-end', maxWidth: '78%', borderRadius: 9, borderBottomRightRadius: 3 },
  mine: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 9, borderBottomRightRadius: 3, borderWidth: 1, overflow: 'hidden' },
  bubbleText: { fontFamily: fonts.chatBold, fontSize: 10, lineHeight: 13 },
  glowText: { textShadowColor: 'rgba(201,214,255,0.9)', textShadowRadius: 6 },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4, marginTop: space.sm, paddingHorizontal: 4 },
  label: { flexShrink: 1, fontFamily: fonts.chatBold, fontSize: 13.5, color: colors.text },
  detail: { fontFamily: fonts.chat, fontSize: 11, lineHeight: 15, color: colors.textFaint, marginTop: 2, paddingHorizontal: 4 },
  pickerWrap: { marginTop: space.lg },
});
