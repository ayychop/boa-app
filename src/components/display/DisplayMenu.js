import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BottomSheet from '../BottomSheet';
import SheetOption from '../SheetOption';
import { ExpandIcon, SplitIcon, ZenIcon } from '../icons';
import { Slate } from '../ui';
import { useDisplay } from '../../context/DisplayContext';
import useLayout from '../../hooks/useLayout';
import { colors, space, type } from '../../theme';

// Room the header button takes in the top-right corner; headers keep their
// right-hand content clear of it on unfolded screens.
export const DISPLAY_BUTTON_SPACE = 56;

/** Top-right glass button on unfolded screens; opens the display menu. */
export function DisplayButton() {
  const { unfolded, split, zen, openMenu } = useDisplay();
  const insets = useSafeAreaInsets();
  const { side } = useLayout();
  if (!unfolded || zen) return null;
  const Icon = split ? SplitIcon : ExpandIcon;
  return (
    <Pressable
      onPress={openMenu}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={`Display mode: ${split ? 'Split View' : 'Full Screen'}. Change`}
      style={({ pressed }) => [
        styles.button,
        { top: insets.top + space.md, right: side + space.lg },
        pressed && { transform: [{ scale: 0.92 }] },
      ]}
    >
      <BlurView intensity={80} tint="dark" experimentalBlurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} />
      <View style={styles.tint} />
      <Icon size={19} color={colors.text} />
    </Pressable>
  );
}

const ZEN_AFTER_CLOSE = 360;

export default function DisplayMenu({ open, onClose }) {
  const { layout, setLayout, enterZen } = useDisplay();
  const choose = (next) => {
    setLayout(next);
    onClose();
  };
  return (
    <BottomSheet open={open} onClose={onClose} glass>
      <View style={styles.body}>
        <Slate dot>Display</Slate>
        <Text style={[type.h1, styles.title]}>
          Make the most of <Text style={type.serif}>the big screen.</Text>
        </Text>
        <View style={styles.options}>
          <SheetOption
            icon={<ExpandIcon size={20} color={layout === 'full' ? colors.gold : colors.text} />}
            label="Full Screen"
            detail="One column, edge to edge. The default."
            selected={layout === 'full'}
            onPress={() => choose('full')}
          />
          <SheetOption
            icon={<SplitIcon size={20} color={layout === 'split' ? colors.gold : colors.text} />}
            label="Split View"
            detail="Two panes side by side, split at the fold."
            selected={layout === 'split'}
            onPress={() => choose('split')}
          />
          <SheetOption
            icon={<ZenIcon size={20} color={colors.text} />}
            label="Zen Mode"
            detail="A screensaver: the time and what's playing. Tap to wake."
            onPress={() => {
              onClose();
              // Zen Mode starts once this sheet's window has fully closed
              // (its slide-out takes 240ms), never while both are on screen.
              setTimeout(enterZen, ZEN_AFTER_CLOSE);
            }}
          />
        </View>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    zIndex: 10,
  },
  tint: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(18,18,22,0.35)' },
  body: { paddingHorizontal: space.xl },
  title: { marginTop: space.sm },
  options: { marginTop: space.lg, gap: space.xs },
});
