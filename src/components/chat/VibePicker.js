import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { CUSTOM_ID, customVibe, VIBES } from '../../chat/vibes';
import { haptics } from '../../utils/haptics';
import { usePress } from '../../utils/motion';
import ColorPicker from './ColorPicker';
import VibeTexture from './VibeTexture';
import { colors, fonts, radius, space } from '../../theme';

const CARD = 132;
const GAP = space.md;
const PREVIEW_H = 108;

/** One vibe as a small window onto its look: mesh, texture, one of their bubbles and one of yours. */
function VibeCard({ v, on, onPress, custom }) {
  const press = usePress({ haptic: false });
  return (
    <Pressable
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      accessibilityLabel={`${v.label}: ${v.detail}`}
      testID={`chat-vibe-${v.id}`}
    >
      <Animated.View style={[styles.card, on && { borderColor: v.accentEdge, boxShadow: `0px 0px 16px ${v.accentSoft}` }, press.style]}>
        <LinearGradient colors={v.mesh} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.preview}>
          <View style={[styles.light, { backgroundColor: v.lights[0].color }]} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: v.veil }]} />
          <VibeTexture vibe={v} width={CARD - 12} height={PREVIEW_H} still mini />
          {custom ? (
            <View style={styles.customBadge}>
              <Ionicons name="color-palette" size={18} color={v.accent} />
            </View>
          ) : null}
          <View style={[styles.theirs, { backgroundColor: v.theirsFill, borderColor: v.theirsEdge }, v.radius && { borderRadius: 3 }]} />
          <LinearGradient colors={v.mine} start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 1 }} style={[styles.mine, { borderColor: v.mineEdge }, v.radius && { borderRadius: 3 }]} />
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
export default function VibePicker({ value, onChange, customColor, onCustomColor }) {
  const [picking, setPicking] = useState(false);
  const custom = customVibe(customColor);
  const choose = (id) => {
    haptics.selection();
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
          <VibeCard key={v.id} v={v} on={v.id === value} onPress={() => choose(v.id)} />
        ))}
        <VibeCard v={custom} on={value === CUSTOM_ID} onPress={() => choose(CUSTOM_ID)} custom />
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
  row: { gap: GAP, paddingRight: space.lg },
  card: {
    width: CARD,
    padding: 6,
    paddingBottom: space.sm,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  preview: { height: PREVIEW_H, borderRadius: radius.md, overflow: 'hidden', padding: 8, justifyContent: 'flex-end', gap: 5 },
  light: { position: 'absolute', width: 80, height: 80, borderRadius: 40, top: -26, left: -20, opacity: 0.5 },
  customBadge: { position: 'absolute', top: 8, right: 8 },
  theirs: { width: '62%', height: 16, borderRadius: 8, borderBottomLeftRadius: 3, borderWidth: 1 },
  mine: { alignSelf: 'flex-end', width: '55%', height: 16, borderRadius: 8, borderBottomRightRadius: 3, borderWidth: 1 },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4, marginTop: space.sm, paddingHorizontal: 4 },
  label: { flexShrink: 1, fontFamily: fonts.chatBold, fontSize: 13.5, color: colors.text },
  detail: { fontFamily: fonts.chat, fontSize: 11, lineHeight: 15, color: colors.textFaint, marginTop: 2, paddingHorizontal: 4 },
  pickerWrap: { marginTop: space.lg },
});
