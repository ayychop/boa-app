import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors, space, type } from '../theme';

// Shared shell for tabs that land in later phases.
export default function ComingSoon({ overline, title, body, icon, tint = colors.accent }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.screen}>
      <LinearGradient
        colors={[`${tint}55`, `${tint}11`, colors.bg]}
        locations={[0, 0.5, 1]}
        style={[styles.hero, { paddingTop: insets.top + space.xl }]}
      >
        <Text style={type.overline}>{overline}</Text>
        <Text style={type.display}>{title}</Text>
      </LinearGradient>
      <View style={styles.center}>
        <Ionicons name={icon} size={40} color={colors.textFaint} />
        <Text style={[type.caption, styles.body]}>{body}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  hero: { paddingHorizontal: space.lg, paddingBottom: space.xxl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, paddingHorizontal: space.xxl },
  body: { textAlign: 'center', maxWidth: 300 },
});
