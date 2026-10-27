import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Slider from '@react-native-community/slider';
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

// Slider position (-1..1) as the gain it means on a phone: +/-12 dB.
const db = (v) => {
  const n = Math.round(v * 12);
  return n === 0 ? '0 dB' : `${n > 0 ? '+' : ''}${n} dB`;
};

function useEq() {
  const [s, setS] = useState(() => ({ settings: eq.getSettings(), active: false, supported: eq.isSupported }));
  useEffect(() => eq.subscribe(setS), []);
  return s;
}

function Band({ label, hint, value, onChange, locked, testID }) {
  return (
    <View style={styles.band}>
      <View style={styles.bandHead}>
        <Text style={styles.bandLabel}>{label}</Text>
        <Text style={styles.bandValue}>{db(value)}</Text>
      </View>
      <Slider
        style={styles.slider}
        minimumValue={-1}
        maximumValue={1}
        step={1 / 12}
        value={value}
        disabled={locked}
        onValueChange={onChange}
        onSlidingComplete={() => haptics.selection()}
        minimumTrackTintColor={colors.gold}
        maximumTrackTintColor="rgba(243,239,232,0.18)"
        thumbTintColor={locked ? colors.textFaint : colors.gold}
        accessibilityLabel={`${label}, ${db(value)}`}
        testID={testID}
      />
      <View style={styles.scale}>
        <Text style={styles.scaleText}>CUT</Text>
        <Text style={styles.scaleText}>{hint}</Text>
        <Text style={styles.scaleText}>BOOST</Text>
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

          <Band label="Bass" hint="LOWS" value={settings.bass} onChange={(v) => eq.setSettings({ bass: v })} locked={locked} testID="eq-bass" />
          <Band label="Treble" hint="HIGHS" value={settings.treble} onChange={(v) => eq.setSettings({ treble: v })} locked={locked} testID="eq-treble" />

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
              <Text style={styles.note}>Deeper lows and a louder ceiling. Mind your ears.</Text>
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
  live: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, height: 26, borderRadius: radius.pill, backgroundColor: 'rgba(18,18,22,0.7)', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
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
  },
  bandHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  bandLabel: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
  bandValue: { fontFamily: fonts.mono, fontSize: 12, color: colors.gold, fontVariant: ['tabular-nums'] },
  slider: { height: 40, marginHorizontal: -4 },
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
