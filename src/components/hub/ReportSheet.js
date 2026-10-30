import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Text from '../ScopedText';
import { Ionicons } from '@expo/vector-icons';
import BottomSheet from '../BottomSheet';
import { Field } from '../kit';
import { Button, Slate } from '../ui';
import { REPORT_REASONS, report } from '../../api/hub';
import { useHub } from '../../context/HubContext';
import { haptics } from '../../utils/haptics';
import { colors, fonts, radius, space, type } from '../../theme';

/**
 * Report a person or one message to BOA's moderators, with a reason and
 * an optional note. Offers to block them too.
 * target: { user: profile } or { message, user }.
 */
export default function ReportSheet({ target, onClose }) {
  const { block, blocked } = useHub();
  const [reason, setReason] = useState(null);
  const [details, setDetails] = useState('');
  const [state, setState] = useState('form'); // form | sending | sent | error
  const [error, setError] = useState(null);
  useEffect(() => {
    if (!target) return;
    setReason(null);
    setDetails('');
    setState('form');
  }, [target]);

  const who = target?.user?.display_name || (target?.user?.username ? `@${target.user.username}` : 'this person');
  const send = async () => {
    setState('sending');
    try {
      await report({ userId: target.user?.id, message: target.message, reason, details });
      haptics.success();
      setState('sent');
    } catch (err) {
      setError(err.message);
      setState('error');
    }
  };

  return (
    <BottomSheet open={!!target} onClose={onClose}>
      <View style={styles.body} testID="report-sheet">
        {state === 'sent' ? (
          <>
            <Ionicons name="shield-checkmark" size={30} color={colors.gold} />
            <Text style={[type.title, { marginTop: space.md }]}>Thanks. We'll take a look.</Text>
            <Text style={[type.bodyMuted, { marginTop: space.sm }]}>BOA moderators review every report. {who} isn't told who reported them.</Text>
            <View style={styles.row}>
              {target?.user && !blocked.has(target.user.id) && (
                <Button
                  label={`Block ${who}`}
                  icon="ban-outline"
                  variant="ghost"
                  onPress={async () => {
                    await block(target.user.id, {
                      reason: `Reported: ${REPORT_REASONS.find((r) => r.id === reason)?.label ?? reason}${details.trim() ? `: ${details.trim().slice(0, 400)}` : ''}`,
                    }).catch(() => {});
                    onClose(true);
                  }}
                />
              )}
              <Button label="Done" onPress={() => onClose(false)} />
            </View>
          </>
        ) : (
          <>
            <Slate dot>{target?.message ? 'Report message' : 'Report user'}</Slate>
            <Text style={[type.title, { marginTop: space.sm }]}>What's wrong?</Text>
            {target?.message ? (
              <Text style={styles.quote} numberOfLines={3}>
                "{target.message.body}"
              </Text>
            ) : null}
            <View style={styles.reasons}>
              {REPORT_REASONS.map((r) => {
                const on = reason === r.id;
                return (
                  <Pressable
                    key={r.id}
                    onPress={() => {
                      haptics.selection();
                      setReason(r.id);
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    testID={`report-reason-${r.id}`}
                    style={[styles.reason, on && styles.reasonOn]}
                  >
                    <Text style={[styles.reasonText, on && { color: colors.bg }]}>{r.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Field value={details} onChangeText={(t) => setDetails(t.slice(0, 1000))} placeholder="Anything else we should know? (optional)" multiline style={{ marginTop: space.lg }} />
            {state === 'error' ? <Text style={styles.error}>{error}</Text> : null}
            <Button label={state === 'sending' ? 'Sending' : 'Send report'} icon="flag" disabled={!reason || state === 'sending'} onPress={send} style={{ marginTop: space.lg }} />
          </>
        )}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.xl },
  quote: { fontFamily: fonts.serif, fontSize: 18, color: colors.textMuted, marginTop: space.md },
  reasons: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.lg },
  reason: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.pill, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  reasonOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  reasonText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.text },
  error: { fontFamily: fonts.medium, fontSize: 13, color: '#FF8A8A', marginTop: space.md },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, marginTop: space.xl },
});
