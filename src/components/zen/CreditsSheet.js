import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import BottomSheet from '../BottomSheet';
import { Slate } from '../ui';
import { SCENES, SOUNDSCAPES } from '../../data/sleep';
import { colors, fonts, space, type } from '../../theme';

// Who made Zen's sounds, videos and pictures, and under which licence (CC BY
// needs the attribution; the rest get it anyway). Each opens its source page.
export default function CreditsSheet({ open, onClose }) {
  const items = [
    ...SOUNDSCAPES.map((s) => ({ key: s.id, kind: 'Sound', ...s })),
    ...Object.values(SCENES).flatMap((s) => [
      { key: `video-${s.id}`, kind: 'Video', ...s.video },
      { key: `photo-${s.id}`, kind: 'Photo', ...s },
    ]),
  ];
  return (
    <BottomSheet open={open} onClose={onClose} dragAnywhere={false}>
      <View style={styles.body}>
        <Slate dot>Credits</Slate>
        <Text style={[type.h1, { marginTop: space.sm }]}>
          Zen's sounds, <Text style={type.serif}>and who made them.</Text>
        </Text>
        <ScrollView style={{ maxHeight: 380 }} contentContainerStyle={{ gap: space.md, paddingTop: space.lg }}>
          {items.map((c) => (
            <Pressable key={c.key} onPress={() => Linking.openURL(c.source)} accessibilityRole="link">
              <Text style={styles.title}>
                {c.kind} · {c.title}
              </Text>
              <Text style={styles.detail}>
                {c.author} · {c.license}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: space.xl, paddingBottom: space.xl },
  title: { fontFamily: fonts.semibold, fontSize: 14, color: colors.text },
  detail: { fontFamily: fonts.medium, fontSize: 12, color: colors.textMuted, marginTop: 2 },
});
