import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { brand, founders, SITE_URL } from '../data/boaContent';
import BoaLogo from '../components/BoaLogo';
import { Button, Fog, Slate, Viewfinder } from '../components/ui';
import useBottomSpace from '../hooks/useBottomSpace';
import { colors, fonts, radius, space, type } from '../theme';

const LINKS = [
  { icon: 'person-add-outline', label: 'Submit as talent', url: brand.submitUrl },
  { icon: 'key-outline', label: 'How access works', url: `${SITE_URL}/access` },
  { icon: 'mail-outline', label: brand.email, url: `mailto:${brand.email}` },
  { icon: 'globe-outline', label: 'boanetworks.com', url: SITE_URL },
];

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const bottom = useBottomSpace(space.xxl);

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + space.xxl, paddingBottom: bottom }]}>
        <View style={styles.card}>
          <Fog opacity={0.28} />
          <Viewfinder inset={12} size={12} />
          <BoaLogo height={40} />
          <Slate style={{ marginTop: space.lg }} dot>
            Your account
          </Slate>
          <Text style={[type.h1, { marginTop: space.sm }]}>
            Sign-in is <Text style={type.serif}>on its way.</Text>
          </Text>
          <Text style={[type.bodyMuted, { marginTop: space.sm }]}>
            Saved stations, watch history and your talent submissions will live here.
          </Text>
        </View>

        <View style={styles.list}>
          {LINKS.map((l) => (
            <Pressable
              key={l.label}
              onPress={() => Linking.openURL(l.url)}
              accessibilityRole="link"
              style={({ pressed }) => [styles.link, pressed && { backgroundColor: colors.surfaceRaised }]}
            >
              <Ionicons name={l.icon} size={19} color={colors.gold} />
              <Text style={styles.linkText}>{l.label}</Text>
              <Ionicons name="arrow-forward" size={16} color={colors.textFaint} />
            </Pressable>
          ))}
        </View>

        <Slate style={{ marginTop: space.xxl }}>The founders</Slate>
        {founders.map((f) => (
          <View key={f.name} style={styles.quote}>
            <Text style={styles.quoteText}>“{f.quote}”</Text>
            <Slate style={{ marginTop: space.md }}>
              {f.name} · {f.role}
            </Slate>
          </View>
        ))}

        <Button label="Get seen" icon="arrow-forward" onPress={() => Linking.openURL(brand.submitUrl)} style={{ marginTop: space.xl, alignSelf: 'flex-start' }} />
        <Slate style={{ marginTop: space.xxl, opacity: 0.6 }}>© 2026 BOA Network · Made in the United Kingdom</Slate>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: space.xl, maxWidth: 720, width: '100%', alignSelf: 'center' },
  card: {
    padding: space.xl,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  list: {
    marginTop: space.xl,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    height: 56,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  linkText: { flex: 1, fontFamily: fonts.medium, fontSize: 15, color: colors.text },
  quote: { marginTop: space.lg, paddingLeft: space.lg, borderLeftWidth: 2, borderLeftColor: colors.gold },
  quoteText: { fontFamily: fonts.serif, fontSize: 24, lineHeight: 30, color: colors.text },
});
