import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import BoaSlider from '../BoaSlider';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import BottomSheet from '../BottomSheet';
import { Toggle } from '../kit';
import { Button, Slate } from '../ui';
import * as eq from '../../audio/eq';
import { usePremium } from '../../context/PremiumContext';
import { haptics } from '../../utils/haptics';
import { colors, fonts, radius, space, type } from '../../theme';

// Slider position (-1..1) as what it means: -1 is flat, 0 the BOA
// Signature sound (the phone's own Equalizer at its ceiling, on most phones
// +15 dB), and above it the extra that modules/boa-eq adds past that
// ceiling: up to 12 dB more bass and 6 dB more treble.
const PAST = { bass: 12, treble: 6 };
const BELOW = 15;
const STEPS = 30;
const snap = (v) => Math.round(v * STEPS) / STEPS;
// The slider reaches the hardware at most this often while it moves (about
// 30 a second): instant to the ear, without a native call on every pixel.
const APPLY_EVERY_MS = 33;
export const readout = (v, kind) => {
  if (v <= -1) return 'Flat';
  const n = Math.round(v * (v > 0 ? PAST[kind] : BELOW));
  return n === 0 ? 'Signature' : `${n > 0 ? '+' : ''}${n} dB`;
};

function useEq() {
  const [s, setS] = useState(() => ({ settings: eq.getSettings(), active: false, supported: eq.isSupported }));
  useEffect(() => eq.subscribe(setS), []);
  return s;
}

/**
 * One slider (Bass or Treble). It runs on its own while your finger is on it
 * (the thumb never waits on the store), sends each move straight to the
 * hardware about 30 times a second through onPreview, and saves where you
 * let go through onCommit. A change from elsewhere (a preset, a saved value)
 * moves it too, unless you're holding it.
 */
function Band({ label, kind, value, onPreview, onCommit, locked, testID }) {
  const [shown, setShown] = useState(value);
  const dragging = useRef(false);
  const last = useRef(0);
  useEffect(() => {
    if (!dragging.current) setShown(value);
  }, [value]);
  const move = (v) => {
    const s = snap(v);
    dragging.current = true;
    setShown(s);
    const now = Date.now();
    if (now - last.current >= APPLY_EVERY_MS) {
      last.current = now;
      onPreview(s);
    }
  };
  const done = (v) => {
    const s = snap(v);
    dragging.current = false;
    last.current = 0;
    setShown(s);
    onCommit(s);
    haptics.selection();
  };
  // Past Signature, past what the phone's own Equalizer can do: the card lights gold.
  const past = shown > 0;
  const text = readout(shown, kind);
  return (
    <View style={[styles.band, past && styles.bandPast]} testID={`${testID}-card`}>
      {past ? <LinearGradient colors={['rgba(226,168,75,0.16)', 'rgba(226,168,75,0)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} /> : null}
      <View style={styles.bandHead}>
        <Text style={styles.bandLabel}>{label}</Text>
        {past ? (
          <View style={styles.pastTag} testID={`${testID}-past`}>
            <Text style={styles.pastText}>PAST STOCK</Text>
          </View>
        ) : null}
        <Text style={[styles.bandValue, shown <= -1 && { color: colors.textMuted }]} testID={`${testID}-value`}>
          {text}
        </Text>
      </View>
      <BoaSlider
        style={styles.slider}
        minimumValue={-1}
        maximumValue={1}
        step={1 / STEPS}
        value={shown}
        disabled={locked}
        onValueChange={move}
        onSlidingComplete={done}
        minimumTrackTintColor={colors.gold}
        maximumTrackTintColor="rgba(243,239,232,0.18)"
        accessibilityLabel={`${label}, ${text}`}
        testID={testID}
      />
      <View style={styles.scale}>
        <Text style={styles.scaleText}>FLAT</Text>
        <Text style={[styles.scaleText, { color: colors.gold }]}>BOA SIGNATURE</Text>
        <Text style={styles.scaleText}>MAX</Text>
      </View>
    </View>
  );
}

/**
 * BOA Hi-Fi: bass, treble and spatial sound for the radio, with one-tap
 * presets. BOA Premium (or the trial); everyone else sees it locked behind
 * "Unlock with BOA Premium".
 */
export default function EqualizerSheet({ open, onClose }) {
  const { hasPremium, checked, requirePremium } = usePremium();
  const { settings, active, supported } = useEq();
  // Never shown locked while the answer is still coming (an admin opening
  // the app straight onto Radio would otherwise see it flash).
  const locked = checked && !hasPremium;
  const preset = eq.presetOf(settings);

  return (
    <BottomSheet open={open} onClose={onClose}>
      <View style={styles.body} testID="eq-sheet">
        <LinearGradient colors={['rgba(226,168,75,0.18)', 'rgba(5,5,6,0)']} locations={[0, 0.6]} style={StyleSheet.absoluteFill} />
        <View style={styles.head}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Slate dot>BOA Hi-Fi</Slate>
            <Text style={[type.title, { marginTop: space.xs }]}>Sound</Text>
          </View>
          {hasPremium && supported ? (
            <View style={[styles.live, !active && { opacity: 0.5 }]} testID="eq-live">
              <View style={[styles.liveDot, { backgroundColor: active ? colors.live : colors.textFaint }]} />
              <Text style={styles.liveText}>{active ? 'SHAPING' : 'FLAT'}</Text>
            </View>
          ) : null}
        </View>

        <View>
          <View style={styles.presets}>
            {eq.PRESETS.map((p) => {
              const on = preset === p.id;
              return (
                <Pressable
                  hitSlop={6}
                  key={p.id}
                  disabled={locked}
                  onPress={() => {
                    haptics.selection();
                    eq.setSettings(p.settings);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on, disabled: locked }}
                  testID={`eq-preset-${p.id}`}
                  style={[styles.preset, on && styles.presetOn]}
                >
                  <Text style={[styles.presetText, on && { color: colors.bg }]}>{p.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <Band label="Bass" kind="bass" value={settings.bass} onPreview={(v) => eq.preview({ bass: v })} onCommit={(v) => eq.setSettings({ bass: v })} locked={locked} testID="eq-bass" />
          <Band label="Treble" kind="treble" value={settings.treble} onPreview={(v) => eq.preview({ treble: v })} onCommit={(v) => eq.setSettings({ treble: v })} locked={locked} testID="eq-treble" />

          <View style={styles.spatial}>
            <View style={styles.spatialIcon}>
              <Ionicons name="planet-outline" size={18} color={colors.gold} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.bandLabel}>Spatial Audio</Text>
              <Text style={styles.note}>Wider stereo, best on headphones</Text>
            </View>
            <Toggle value={settings.spatial} onChange={(v) => !locked && eq.setSettings({ spatial: v })} label="Spatial Audio" testID="eq-spatial" />
          </View>

          <View style={styles.spatial}>
            <View style={styles.spatialIcon}>
              <Ionicons name="volume-high-outline" size={18} color={colors.gold} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.bandLabel}>Bass Boost</Text>
              <Text style={styles.note}>The lows pushed past stock and an 18 dB louder ceiling. Mind your ears.</Text>
            </View>
            <Toggle value={!!settings.boost} onChange={(v) => !locked && eq.setSettings({ boost: v })} label="Bass Boost" testID="eq-boost" />
          </View>

          {locked ? (
            <View style={StyleSheet.absoluteFill} testID="eq-locked">
              <BlurView intensity={18} tint="dark" blurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} />
              <View style={styles.lockVeil}>
                <View style={styles.lockIcon}>
                  <Ionicons name="lock-closed" size={20} color={colors.bg} />
                </View>
                <Button
                  label="Unlock with BOA Premium"
                  icon="diamond"
                  onPress={() => {
                    onClose();
                    requirePremium(() => {}, 'Hi-Fi sound is part of BOA Premium.');
                  }}
                  style={{ marginTop: space.md }}
                  testID="eq-unlock"
                />
              </View>
            </View>
          ) : null}
        </View>

        {!supported ? <Text style={[styles.note, { marginTop: space.lg, textAlign: 'center' }]}>Your settings are saved; they shape the sound in the BOA app on Android.</Text> : null}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.xl, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: space.lg },
  live: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    height: 26,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(18,18,22,0.7)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  liveText: { fontFamily: fonts.mono, fontSize: 9.5, letterSpacing: 1.4, color: colors.textMuted },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.md },
  preset: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: 'rgba(18,18,22,0.7)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(226,168,75,0.4)' },
  presetOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  presetText: { fontFamily: fonts.semibold, fontSize: 12.5, color: colors.text },
  band: {
    marginTop: space.md,
    paddingHorizontal: space.md,
    paddingTop: space.md,
    paddingBottom: space.sm,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(18,18,22,0.6)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  bandPast: { borderColor: 'rgba(226,168,75,0.55)', boxShadow: '0px 0px 18px rgba(226,168,75,0.22)' },
  bandHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  pastTag: { paddingHorizontal: 7, height: 18, borderRadius: radius.pill, justifyContent: 'center', backgroundColor: colors.gold },
  pastText: { fontFamily: fonts.mono, fontSize: 8.5, letterSpacing: 1.2, color: colors.bg },
  bandLabel: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
  bandValue: { marginLeft: 'auto', fontFamily: fonts.mono, fontSize: 12, color: colors.gold, fontVariant: ['tabular-nums'] },
  slider: { height: 48, marginHorizontal: -4 },
  scale: { flexDirection: 'row', justifyContent: 'space-between' },
  scaleText: { fontFamily: fonts.mono, fontSize: 8.5, letterSpacing: 1.4, color: colors.textFaint },
  spatial: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginTop: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(18,18,22,0.6)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  spatialIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.goldSoft },
  note: { fontFamily: fonts.medium, fontSize: 12, color: colors.textMuted, marginTop: 2 },
  lockVeil: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(5,5,6,0.45)', borderRadius: radius.lg },
  lockIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.gold, boxShadow: '0px 8px 24px rgba(226,168,75,0.45)' },
});
