// The call screen's extras for calls that involve more than two phones:
//
//   CallWaitingBanner  over the call you're on, when someone else rings
//   TransferPrompt     on your other phone, when a call is live on this one
//   ConferenceTiles    the extra faces when a call has been merged
//
// The logic is in CallContext; these only show it and report the tap.
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useCall } from '../../context/CallContext';
import { RemoteVideo } from '../../calls/media';
import { haptics } from '../../utils/haptics';
import { Avatar } from '../kit';
import { colors, fonts, radius, space } from '../../theme';

const RED = '#FF3B4E';
const GREEN = '#1ED760';

function Glass() {
  return (
    <>
      {Platform.OS === 'ios' ? <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} /> : null}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(14,14,17,0.88)' }]} />
    </>
  );
}

function Choice({ label, icon, color, onPress, testID, dark }) {
  return (
    <Pressable
      onPress={() => {
        haptics.tap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.choice, { backgroundColor: color }, pressed && { opacity: 0.8, transform: [{ scale: 0.97 }] }]}
      testID={testID}
    >
      <Ionicons name={icon} size={18} color={dark ? colors.bg : '#fff'} />
      <Text style={[styles.choiceText, { color: dark ? colors.bg : '#fff' }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * "Call Waiting": someone is ringing while you're on a call. Your call carries
 * on underneath. End and accept hangs up on it and answers; Merge makes it one
 * conference (only once your call is live); Decline sends them away busy.
 */
export function CallWaitingBanner() {
  const { waiting, call, endAndAccept, mergeWaiting, declineWaiting } = useCall();
  const insets = useSafeAreaInsets();
  if (!waiting) return null;
  const canMerge = call?.phase === 'active';
  return (
    <Animated.View
      entering={FadeInDown.duration(220)}
      exiting={FadeOut.duration(150)}
      style={[styles.banner, { top: insets.top + space.sm }]}
      testID="call-waiting-banner"
    >
      <Glass />
      <View style={styles.bannerHead}>
        <Avatar uri={waiting.peer.avatar_url} name={waiting.peer.name} size={44} ring />
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>CALL WAITING</Text>
          <Text style={styles.waiterName} numberOfLines={1} testID="call-waiting-name">
            {waiting.peer.name}
          </Text>
          <Text style={styles.waiterSub}>{waiting.voice ? 'Voice call' : 'Video call'}</Text>
        </View>
      </View>
      <View style={styles.choices}>
        <Choice label="End & Accept" icon="call" color={GREEN} dark onPress={endAndAccept} testID="call-waiting-end-accept" />
        {canMerge ? <Choice label="Merge" icon="git-merge" color={colors.gold} dark onPress={mergeWaiting} testID="call-waiting-merge" /> : null}
        <Choice label="Decline" icon="close" color={RED} onPress={declineWaiting} testID="call-waiting-decline" />
      </View>
    </Animated.View>
  );
}

/**
 * Shown on a phone with no call of its own when your other phone has one live:
 * a yes moves the call here, a no leaves it where it is.
 */
export function TransferPrompt() {
  const { transferOffer, transferring, transferHere, keepOnOtherPhone } = useCall();
  if (!transferOffer) return null;
  const { peer } = transferOffer;
  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={keepOnOtherPhone}>
      <View style={styles.scrim} testID="transfer-prompt">
        <Animated.View entering={FadeIn.duration(200)} style={styles.card}>
          <Glass />
          <Avatar uri={peer.avatar_url} name={peer.name} size={64} ring />
          <Text style={styles.cardTitle}>Call is active on another device</Text>
          <Text style={styles.cardBody} testID="transfer-text">
            Call is active on another device. Transfer call to this device?
          </Text>
          <Text style={styles.cardWho}>{peer.name}</Text>
          <View style={styles.cardChoices}>
            <Choice label="No" icon="close" color="rgba(243,239,232,0.14)" onPress={keepOnOtherPhone} testID="transfer-no" />
            <Choice label={transferring ? 'Moving…' : 'Yes, transfer'} icon="swap-horizontal" color={colors.gold} dark onPress={transferring ? () => {} : transferHere} testID="transfer-yes" />
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

/** The other faces of a merged call: small tiles under the main picture. */
export function ConferenceTiles({ uids, main, top }) {
  const others = (uids ?? []).filter((u) => u !== main);
  if (!others.length) return null;
  return (
    <View style={[styles.tiles, { top }]} pointerEvents="none" testID="conference-tiles">
      {others.slice(0, 3).map((uid) => (
        <View key={uid} style={styles.tile}>
          <RemoteVideo uid={uid} style={StyleSheet.absoluteFill} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    left: space.md,
    right: space.md,
    borderRadius: radius.xl,
    overflow: 'hidden',
    padding: space.md,
    gap: space.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(246,211,138,0.45)',
    zIndex: 20,
    elevation: 20,
  },
  bannerHead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  kicker: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 1.6, color: colors.gold },
  waiterName: { fontFamily: fonts.bold, fontSize: 18, color: colors.text },
  waiterSub: { fontFamily: fonts.regular, fontSize: 13, color: colors.textMuted },
  choices: { flexDirection: 'row', gap: space.sm },
  choice: {
    flex: 1,
    minHeight: 46,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: space.sm,
  },
  choiceText: { fontFamily: fonts.bold, fontSize: 14 },
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: space.xl },
  card: {
    width: '100%',
    maxWidth: 380,
    borderRadius: radius.xl,
    overflow: 'hidden',
    padding: space.xl,
    alignItems: 'center',
    gap: space.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(246,211,138,0.4)',
  },
  cardTitle: { fontFamily: fonts.bold, fontSize: 18, color: colors.text, textAlign: 'center', marginTop: space.sm },
  cardBody: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, color: colors.textMuted, textAlign: 'center' },
  cardWho: { fontFamily: fonts.semibold, fontSize: 14, color: colors.gold },
  cardChoices: { flexDirection: 'row', gap: space.sm, alignSelf: 'stretch', marginTop: space.md },
  tiles: { position: 'absolute', right: space.lg, flexDirection: 'column', gap: space.sm },
  tile: { width: 84, height: 112, borderRadius: radius.md, overflow: 'hidden', backgroundColor: '#111113', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(243,239,232,0.3)' },
});
