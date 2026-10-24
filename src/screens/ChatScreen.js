import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHub } from '../context/HubContext';
import ChatHome from './hub/ChatHome';
import DailySpark from '../components/DailySpark';
import { HubGate } from './hub/HubWelcomeScreen';
import { Slate } from '../components/ui';
import useBottomSpace from '../hooks/useBottomSpace';
import { colors, space, type } from '../theme';

/**
 * The Chat tab: the Creative Hub. Signed in with a profile, it's the Hub's
 * home (ChatHome: the Daily Spark, the Community Pulse and your
 * conversations); before that, the way in (email and password, then
 * onboarding) right here in the tab, which turns into the home once done.
 */
export default function ChatScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { stage, profile } = useHub();
  const bottom = useBottomSpace(space.xxl);

  // A suspended account: said plainly, with nothing it can no longer do.
  if (stage === 'ready' && profile?.banned_at) {
    return (
      <View style={[styles.screen, styles.banned]} testID="chat-banned">
        <Slate dot color={colors.gold}>
          Creative Hub
        </Slate>
        <Text style={[type.h1, { marginTop: space.md, textAlign: 'center' }]}>Your Hub account is suspended</Text>
        <Text style={[type.bodyMuted, { marginTop: space.sm, textAlign: 'center' }]}>
          A BOA moderator suspended it after a report. If you think that's a mistake, contact BOA from your Profile.
        </Text>
      </View>
    );
  }
  if (stage === 'ready') return <ChatHome navigation={navigation} bottomPadding={bottom} />;

  return (
    <View style={styles.screen} testID="chat-gate">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={[styles.body, { paddingTop: insets.top + space.xl, paddingBottom: bottom }]}
          keyboardShouldPersistTaps="handled"
        >
          <Slate dot color={colors.gold}>
            Creative Hub
          </Slate>
          <Text style={[type.h1, styles.title]} accessibilityRole="header">
            Messages
          </Text>
          {/* Today's line, before you've even joined. */}
          {stage === 'signedOut' && (
            <View style={{ marginBottom: space.xl, marginTop: -space.lg }}>
              <DailySpark hint="Join the Hub to choose your kind: Love, Wealth, Health or Career." />
            </View>
          )}
          <HubGate stage={stage} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { paddingHorizontal: space.xl },
  title: { marginTop: space.sm, marginBottom: space.xl },
  banned: { alignItems: 'center', justifyContent: 'center', padding: space.xl },
});
