import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Headshot from './Headshot';
import { Slate } from './ui';
import { colors, fonts, space } from '../theme';

/**
 * A founder: their quote, their photo and, opened with Read more, their own
 * words about themselves. Used in Profile (a small round photo beside the
 * name) and on the Talent page (`photoWidth`: the photo in full, cover-filled
 * under the dark gradient, with the name set on it).
 */
export default function FounderCard({ founder: f, style, textStyle, photoWidth }) {
  const [open, setOpen] = useState(false);
  const slug = f.name.replace(/\s+/g, '-').toLowerCase();
  return (
    <View style={style} testID={`founder-${slug}`}>
      {photoWidth ? (
        <View style={styles.photo}>
          <Headshot person={f} width={photoWidth} ratio={4 / 5} label={false} caption={{ kicker: f.role, title: f.name, highlight: true }} />
        </View>
      ) : null}
      <Text style={textStyle}>“{f.quote}”</Text>
      {photoWidth ? null : (
        <View style={styles.row}>
          <Headshot person={f} width={44} round />
          <Slate style={{ flex: 1 }} lines={2}>
            {f.name} · {f.role}
          </Slate>
        </View>
      )}
      {f.bio ? (
        <>
          <Text style={styles.bio} numberOfLines={open ? undefined : 3} testID="founder-bio">
            {f.bio}
          </Text>
          <Pressable
            onPress={() => setOpen((v) => !v)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityState={{ expanded: open }}
            accessibilityLabel={open ? `Show less about ${f.name}` : `Read more about ${f.name}`}
            testID="founder-bio-toggle"
          >
            <Text style={styles.more}>{open ? 'Show less' : 'Read more'}</Text>
          </Pressable>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  photo: { marginBottom: space.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.md },
  bio: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 21, color: colors.textMuted, marginTop: space.md },
  more: { fontFamily: fonts.semibold, fontSize: 12.5, color: colors.gold, marginTop: space.sm },
});
