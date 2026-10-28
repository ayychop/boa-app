import { useRef } from 'react';
import { StyleSheet } from 'react-native';
import Slider from '@react-native-community/slider';
import { haptics } from '../utils/haptics';
import { colors } from '../theme';

// Every slider in BOA: a 28 pt thumb you can catch at arm's length (the
// platform's own is about 20), a track 48 pt tall to land a thumb anywhere
// on, and a tick through the phone as the value crosses each tenth of the
// way, so you feel it move. Drop-in for @react-native-community/slider.

const THUMBS = {
  gold: require('../../assets/ui/slider-thumb.png'),
  light: require('../../assets/ui/slider-thumb-light.png'),
};
/** How tall the touch area is: comfortably over the 44 pt minimum. */
export const SLIDER_HEIGHT = 48;
const TICKS = 10;

/**
 * thumb: 'gold' (default) or 'light' (over a coloured track). ticks: how
 * many haptic steps across the range (0 for none). Every other prop goes to
 * the slider, as before.
 */
export default function BoaSlider({ thumb = 'gold', ticks = TICKS, style, minimumValue = 0, maximumValue = 1, disabled, onValueChange, onSlidingStart, onSlidingComplete, ...rest }) {
  const last = useRef(null);
  const span = maximumValue - minimumValue || 1;
  const stepOf = (v) => Math.round(((v - minimumValue) / span) * ticks);
  return (
    <Slider
      {...rest}
      style={[styles.slider, style]}
      minimumValue={minimumValue}
      maximumValue={maximumValue}
      disabled={disabled}
      // A disabled slider keeps the platform's thumb, so it looks switched off.
      thumbImage={disabled ? undefined : THUMBS[thumb]}
      // No tint over the image: iOS would paint the whole thumb in it.
      thumbTintColor={disabled ? colors.textFaint : undefined}
      onSlidingStart={(v) => {
        last.current = stepOf(v);
        haptics.tap();
        onSlidingStart?.(v);
      }}
      onValueChange={(v) => {
        if (ticks > 0) {
          const step = stepOf(v);
          if (last.current != null && step !== last.current) haptics.selection();
          last.current = step;
        }
        onValueChange?.(v);
      }}
      onSlidingComplete={(v) => {
        last.current = null;
        onSlidingComplete?.(v);
      }}
    />
  );
}

const styles = StyleSheet.create({
  slider: { height: SLIDER_HEIGHT },
});
