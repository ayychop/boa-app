import { useEffect, useRef } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import StationLogo from './StationLogo';

const REVOLUTION_MS = 9000;
// Brushed-steel ring: alternating light/dark stops read as metal once the
// gradient is clipped to a circle.
const METAL = ['#F2F2F4', '#8A8A90', '#FAFAFB', '#5E5E64', '#D9D9DD', '#77777D'];
const GROOVES = [0.94, 0.86, 0.79, 0.72, 0.65, 0.58, 0.52];

/**
 * A vinyl record with the station logo as its centre label.
 *
 * @param {object} props
 * @param {object | null} props.station  null renders a blank record (loading state)
 * @param {number} props.size
 * @param {boolean} props.spinning  turntable rotation on/off
 * @param {'idle'|'loading'|'playing'|'paused'|'error'|null} props.status
 *   playback status if this is the current station, else null
 * @param {boolean} [props.focused]  centred in the carousel; only it shows the play badge
 */
export default function Vinyl({ station, size, spinning, status = null, focused = true }) {
  const reduceMotion = useReducedMotion();
  const angle = useSharedValue(0);
  const wasSpinning = useRef(false);

  useEffect(() => {
    const spin = spinning && !reduceMotion;
    if (spin === wasSpinning.current) return;
    wasSpinning.current = spin;
    if (spin) {
      const from = angle.value % 360;
      angle.value = from;
      // Ease up to speed like a platter, then hold a steady linear spin.
      angle.value = withSequence(
        withTiming(from + 25, { duration: 700, easing: Easing.in(Easing.quad) }),
        withRepeat(
          withTiming(from + 25 + 360, { duration: REVOLUTION_MS, easing: Easing.linear }),
          -1,
          false,
        ),
      );
    } else {
      cancelAnimation(angle);
      // Coast to a stop instead of freezing mid-frame.
      angle.value = withTiming(angle.value + 18, { duration: 900, easing: Easing.out(Easing.cubic) });
    }
  }, [spinning, reduceMotion, angle]);

  const spinStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${angle.value}deg` }] }));

  const ring = Math.max(5, Math.round(size * 0.022));
  const disc = size - ring * 2;
  const label = Math.round(size * 0.4);
  const showPlay = station && focused && status !== 'playing' && status !== 'loading';

  return (
    <View style={[styles.shadow, { width: size, height: size, borderRadius: size / 2 }]}>
      <LinearGradient
        colors={METAL}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[StyleSheet.absoluteFill, { borderRadius: size / 2 }]}
      />

      <Animated.View
        style={[
          styles.disc,
          { top: ring, left: ring, width: disc, height: disc, borderRadius: disc / 2 },
          spinStyle,
        ]}
      >
        {GROOVES.map((r, i) => (
          <View
            key={r}
            style={[
              styles.groove,
              {
                width: disc * r,
                height: disc * r,
                borderRadius: (disc * r) / 2,
                borderColor: i % 2 ? 'rgba(255,255,255,0.045)' : 'rgba(255,255,255,0.08)',
              },
            ]}
          />
        ))}
        <View style={[styles.label, { width: label, height: label, borderRadius: label / 2 }]}>
          {station ? (
            <StationLogo station={station} size={label} rounded={label / 2} fit="cover" />
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.blankLabel]} />
          )}
        </View>
        <View style={styles.spindle} />
      </Animated.View>

      {/* Fixed light reflection: it stays put while the record turns under it. */}
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(255,255,255,0.14)', 'rgba(255,255,255,0)', 'rgba(255,255,255,0)', 'rgba(255,255,255,0.07)']}
        locations={[0, 0.35, 0.65, 1]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={{ position: 'absolute', top: ring, left: ring, width: disc, height: disc, borderRadius: disc / 2 }}
      />

      {(showPlay || (focused && status === 'loading')) && (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.center]}>
          <View style={styles.playBadge}>
            {status === 'loading' ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Ionicons
                name={status === 'error' ? 'refresh' : 'play'}
                size={26}
                color="#fff"
                style={status === 'error' ? null : { marginLeft: 3 }}
              />
            )}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  shadow: {
    boxShadow: '0px 30px 60px rgba(0,0,0,0.65), 0px 8px 18px rgba(0,0,0,0.5)',
  },
  disc: {
    position: 'absolute',
    backgroundColor: '#0D0D0F',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  groove: { position: 'absolute', borderWidth: 1 },
  label: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1A1A1E',
    borderWidth: 2,
    borderColor: 'rgba(0,0,0,0.6)',
  },
  blankLabel: { backgroundColor: '#1C1C21' },
  spindle: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#0B0B0D',
    borderWidth: 2,
    borderColor: '#B8B8BE',
  },
  center: { alignItems: 'center', justifyContent: 'center' },
  playBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(10,10,12,0.62)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
});
