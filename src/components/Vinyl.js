import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import useReducedMotion from '../hooks/useReducedMotion';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import StationLogo from './StationLogo';
import BoaLogo from './BoaLogo';
import { useStationLogo } from '../api/stationArt';
import { colors } from '../theme';
import { LoadingDots } from './Skeleton';

const REVOLUTION_MS = 9000;
// Brushed-steel ring: alternating light/dark stops read as metal once the
// gradient is clipped to a circle.
const METAL = ['#F2F2F4', '#8A8A90', '#FAFAFB', '#5E5E64', '#D9D9DD', '#77777D'];
const GROOVES = [0.94, 0.86, 0.79, 0.72, 0.65, 0.58, 0.52];

// The centre label: the station's logo (a working one found by
// api/stationArt.js if the listed one is dead), else the BOA Network logo on
// gold. While it's still looking, the listed logo or the station's initials.
function RecordLabel({ station, size }) {
  const logo = useStationLogo(station);
  if (logo === null) {
    return (
      <View style={[StyleSheet.absoluteFill, styles.boaLabel]} testID="vinyl-boa-label">
        <BoaLogo height={size * 0.26} color="#050506" />
      </View>
    );
  }
  return <StationLogo station={logo ? { ...station, logo } : station} size={size} rounded={size / 2} fit="cover" />;
}

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
        withRepeat(withTiming(from + 25 + 360, { duration: REVOLUTION_MS, easing: Easing.linear }), -1, false),
      );
    } else {
      cancelAnimation(angle);
      // Coast to a stop instead of freezing mid-frame.
      angle.value = withTiming(angle.value + 18, { duration: 900, easing: Easing.out(Easing.cubic) });
    }
  }, [spinning, reduceMotion, angle]);

  const spinStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${angle.value}deg` }] }));

  // Dynamic Island-style "pop" when a tap starts or stops this record: a quick
  // dip, then an under-damped spring back. Transform only, on the UI thread.
  const pop = useSharedValue(1);
  const lastStatus = useRef(status);
  useEffect(() => {
    const prev = lastStatus.current;
    lastStatus.current = status;
    const tapped = (status === 'loading' && prev !== 'loading') || (status === 'paused' && prev !== 'paused');
    if (!tapped || reduceMotion) return;
    pop.value = withSequence(withTiming(0.955, { duration: 90, easing: Easing.bezier(0.23, 1, 0.32, 1) }), withSpring(1, { duration: 520, dampingRatio: 0.45 }));
  }, [status, reduceMotion, pop]);
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));

  const ring = Math.max(5, Math.round(size * 0.022));
  const disc = size - ring * 2;
  const label = Math.round(size * 0.4);
  const showPlay = station && focused && status !== 'playing' && status !== 'loading';

  return (
    <Animated.View style={[styles.shadow, { width: size, height: size, borderRadius: size / 2 }, popStyle]}>
      <LinearGradient colors={METAL} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: size / 2 }]} />

      <Animated.View style={[styles.disc, { top: ring, left: ring, width: disc, height: disc, borderRadius: disc / 2 }, spinStyle]}>
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
          {station ? <RecordLabel station={station} size={label} /> : <View style={[StyleSheet.absoluteFill, styles.blankLabel]} />}
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
              <LoadingDots color="#FFFFFF" />
            ) : (
              <Ionicons name={status === 'error' ? 'refresh' : 'play'} size={26} color="#fff" style={status === 'error' ? null : { marginLeft: 3 }} />
            )}
          </View>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  boaLabel: { backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'flex-start', paddingTop: '16%' },
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
