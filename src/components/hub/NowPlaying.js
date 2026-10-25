import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming, cancelAnimation } from 'react-native-reanimated';
import { PulseDot } from '../ui';
import { statusLine } from './hubNav';
import { colors, fonts } from '../../theme';

/** A record turning: one slow revolution every 2.4 seconds. */
function SpinningRecord({ size }) {
  const still = useReducedMotion();
  const turn = useSharedValue(0);
  useEffect(() => {
    if (still) return undefined;
    turn.value = withRepeat(withTiming(1, { duration: 2400, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(turn);
  }, [still, turn]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value * 360}deg` }] }));
  return (
    <Animated.View style={style}>
      <Ionicons name="disc" size={size} color={colors.gold} />
    </Animated.View>
  );
}

/**
 * Someone's now-playing status, with a live icon: a spinning record for
 * the radio, a breathing dot for the Zen Zone, a film for the screening
 * room. Renders nothing when they aren't playing anything.
 */
export default function NowPlaying({ person, size = 'sm', style, lines = 1 }) {
  const line = statusLine(person);
  if (!line) return null;
  const big = size === 'lg';
  const icon = big ? 15 : 12;
  return (
    <View style={[styles.row, style]} testID="now-playing" accessibilityLabel={line}>
      {person.status_kind === 'zen' ? (
        <View style={{ width: icon, alignItems: 'center' }}>
          <PulseDot color="#8FB8FF" size={big ? 8 : 6} />
        </View>
      ) : person.status_kind === 'watching' ? (
        <Ionicons name="film" size={icon} color={colors.gold} />
      ) : (
        <SpinningRecord size={icon} />
      )}
      <Text style={[styles.text, big && styles.big, person.status_kind === 'zen' && { color: '#B8D0FF' }]} numberOfLines={lines}>
        {line}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
  text: { flexShrink: 1, fontFamily: fonts.medium, fontSize: 12, color: colors.gold },
  big: { fontSize: 14 },
});
