import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { founders, SITE_URL } from '../data/boaContent';
import { useForms } from '../context/FormsContext';
import BoaLogo from '../components/BoaLogo';
import { Button, Fog, Slate, Viewfinder } from '../components/ui';
import useBottomSpace from '../hooks/useBottomSpace';
import { colors, fonts, radius, space, type } from '../theme';

const KIND_LABEL = { getSeen: 'Talent application', contact: 'Message to BOA' };

function when(iso) {
  return new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const bottom = useBottomSpace(space.xxl);
  const forms = useForms();

  const actions = [
    { icon: 'person-add-outline', label: 'Get seen', detail: 'Submit as talent', onPress: forms.openGetSeen },
    { icon: 'chatbubble-ellipses-outline', label: 'Contact BOA', detail: 'Bookings, press, hello', onPress: () => forms.openContact() },
    // Still on the website until the access page has in-app content.
    { icon: 'key-outline', label: 'How access works', detail: 'boanetworks.com', onPress: () => Linking.openURL(`${SITE_URL}/access`), external: true },
  ];

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
          {actions.map((a) => (
            <Pressable
              key={a.label}
              onPress={a.onPress}
              accessibilityRole={a.external ? 'link' : 'button'}
              style={({ pressed }) => [styles.link, pressed && { backgroundColor: colors.surfaceRaised }]}
            >
              <Ionicons name={a.icon} size={19} color={colors.gold} />
              <View style={{ flex: 1 }}>
                <Text style={styles.linkText}>{a.label}</Text>
                <Text style={styles.linkDetail}>{a.detail}</Text>
              </View>
              <Ionicons name={a.external ? 'open-outline' : 'chevron-forward'} size={16} color={colors.textFaint} />
            </Pressable>
          ))}
        </View>

        {forms.submissions.length > 0 && (
          <>
            <Slate style={{ marginTop: space.xxl, marginBottom: space.md }}>Your submissions</Slate>
            <View style={styles.list}>
              {forms.submissions.map((sub) => (
                <View key={sub.id} style={styles.link}>
                  <Ionicons name="checkmark-circle" size={19} color={colors.live} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.linkText}>{KIND_LABEL[sub.kind]}</Text>
                    <Text style={styles.linkDetail} numberOfLines={1}>
                      {[sub.values.subject, sub.values.email].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <Text style={styles.linkDetail}>{when(sub.at)}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        <Slate style={{ marginTop: space.xxl }}>The founders</Slate>
        {founders.map((f) => (
          <View key={f.name} style={styles.quote}>
            <Text style={styles.quoteText}>“{f.quote}”</Text>
            <Slate style={{ marginTop: space.md }}>
              {f.name} · {f.role}
            </Slate>
          </View>
        ))}

        <Button label="Get seen" icon="arrow-forward" onPress={forms.openGetSeen} style={{ marginTop: space.xl, alignSelf: 'flex-start' }} />
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
    minHeight: 62,
    paddingVertical: 10,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  linkText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
  linkDetail: { fontFamily: fonts.medium, fontSize: 12, color: colors.textFaint, marginTop: 2 },
  quote: { marginTop: space.lg, paddingLeft: space.lg, borderLeftWidth: 2, borderLeftColor: colors.gold },
  quoteText: { fontFamily: fonts.serif, fontSize: 24, lineHeight: 30, color: colors.text },
});
