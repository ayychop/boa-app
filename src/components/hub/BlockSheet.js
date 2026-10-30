import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import Text from '../ScopedText';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import BottomSheet from '../BottomSheet';
import { Field } from '../kit';
import { Button, Slate } from '../ui';
import { BLOCK_REASONS, uploadBlockEvidence } from '../../api/hub';
import { useHub } from '../../context/HubContext';
import { haptics } from '../../utils/haptics';
import { colors, fonts, radius, space, type } from '../../theme';
import { LoadingDots } from '../Skeleton';

/**
 * Blocking someone: why, and (optionally) a screenshot of what happened.
 * Both go to BOA's moderators with the block; the person isn't told.
 * person: the profile being blocked. onClose(didBlock).
 */
export default function BlockSheet({ person, onClose }) {
  const { block, userId } = useHub();
  const [reason, setReason] = useState(null);
  const [details, setDetails] = useState('');
  const [shot, setShot] = useState(null); // the picked image asset
  const [state, setState] = useState('form'); // form | sending | error
  const [error, setError] = useState(null);
  useEffect(() => {
    if (!person) return;
    setReason(null);
    setDetails('');
    setShot(null);
    setState('form');
    setError(null);
  }, [person]);

  const who = person?.display_name || (person?.username ? `@${person.username}` : 'this person');

  const pick = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
      if (!res?.canceled && res?.assets?.[0]) setShot(res.assets[0]);
    } catch {
      setError("Couldn't open your photos. Check that BOA can access them.");
    }
  };

  const confirm = async () => {
    setState('sending');
    setError(null);
    try {
      const evidenceUrl = shot ? await uploadBlockEvidence(userId, shot) : null;
      const label = BLOCK_REASONS.find((r) => r.id === reason)?.label ?? '';
      const text = [label, details.trim()].filter(Boolean).join(': ');
      await block(person.id, { reason: text || null, evidenceUrl });
      haptics.success();
      onClose(true);
    } catch (err) {
      setError(err.message);
      setState('error');
    }
  };

  const sending = state === 'sending';
  return (
    <BottomSheet open={!!person} onClose={() => !sending && onClose(false)}>
      <View style={styles.body} testID="block-sheet">
        <Slate dot>Block</Slate>
        <Text style={[type.title, { marginTop: space.sm }]}>Block {who}?</Text>
        <Text style={[type.bodyMuted, { marginTop: space.xs }]}>They won't be able to see your profile or message you, and they won't be told. Tell us why and BOA's moderators will take a look.</Text>

        <View style={styles.reasons}>
          {BLOCK_REASONS.map((r) => {
            const on = reason === r.id;
            return (
              <Pressable
                key={r.id}
                onPress={() => {
                  haptics.selection();
                  setReason(on ? null : r.id);
                }}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                testID={`block-reason-${r.id}`}
                style={[styles.reason, on && styles.reasonOn]}
              >
                <Text style={[styles.reasonText, on && { color: colors.bg }]}>{r.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <Field value={details} onChangeText={(t) => setDetails(t.slice(0, 400))} placeholder="What happened? (optional)" multiline style={{ marginTop: space.lg }} testID="block-details" />

        <Pressable
          onPress={pick}
          disabled={sending}
          accessibilityRole="button"
          accessibilityLabel={shot ? 'Change screenshot' : 'Add a screenshot'}
          style={styles.evidence}
          testID="block-add-screenshot"
        >
          <LinearGradient colors={['rgba(226,168,75,0.14)', 'rgba(255,255,255,0.02)']} style={StyleSheet.absoluteFill} />
          {shot ? (
            <Image source={{ uri: shot.uri }} style={styles.thumb} />
          ) : (
            <View style={styles.thumbEmpty}>
              <Ionicons name="image-outline" size={20} color={colors.gold} />
            </View>
          )}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.evidenceTitle}>{shot ? 'Screenshot attached' : 'Add a screenshot'}</Text>
            <Text style={styles.evidenceBody}>{shot ? 'Tap to change it' : 'Optional. Only BOA moderators see it.'}</Text>
          </View>
          {shot ? (
            <Pressable onPress={() => setShot(null)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Remove screenshot">
              <Ionicons name="close-circle" size={22} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </Pressable>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={styles.row}>
          <Button label="Cancel" variant="ghost" onPress={() => onClose(false)} disabled={sending} style={{ flex: 1 }} />
          <Button label={sending ? 'Blocking' : 'Block'} icon={sending ? undefined : 'ban'} onPress={confirm} disabled={sending} style={{ flex: 1 }} testID="block-confirm" />
        </View>
        {sending && shot ? <LoadingDots style={{ marginTop: space.md }} /> : null}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.xl },
  reasons: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.lg },
  reason: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.pill, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  reasonOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  reasonText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.text },
  evidence: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginTop: space.lg,
    padding: space.md,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(226,168,75,0.45)',
    backgroundColor: 'rgba(18,18,22,0.7)',
  },
  thumb: { width: 44, height: 44, borderRadius: radius.sm },
  thumbEmpty: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.goldSoft },
  evidenceTitle: { fontFamily: fonts.semibold, fontSize: 14, color: colors.text },
  evidenceBody: { fontFamily: fonts.medium, fontSize: 12, color: colors.textMuted, marginTop: 2 },
  error: { fontFamily: fonts.medium, fontSize: 13, color: '#FF8A8A', marginTop: space.md },
  row: { flexDirection: 'row', gap: space.md, marginTop: space.xl },
});
