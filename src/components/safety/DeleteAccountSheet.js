import { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import Text from '../ScopedText';
import { Ionicons } from '@expo/vector-icons';
import BottomSheet from '../BottomSheet';
import { Field } from '../kit';
import { Button, Slate } from '../ui';
import { DELETE_ACCOUNT_URL } from '../../safety/terms';
import { haptics } from '../../utils/haptics';
import { colors, fonts, space, type } from '../../theme';

/** The word they type to delete the account. */
export const DELETE_WORD = 'DELETE';

/** Whether what they typed confirms the deletion (any case, spaces around ignored). */
export const confirmsDeletion = (text) => String(text ?? '').trim().toUpperCase() === DELETE_WORD;

/**
 * "Delete account": what goes, the word to type, and the delete itself.
 * `onDelete` should call the delete-account Edge Function (through the Hub
 * context) and throw a readable Error if it fails.
 */
export default function DeleteAccountSheet({ open, onClose, onDelete }) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (open) {
      setTyped('');
      setBusy(false);
      setError(null);
    }
  }, [open]);

  const go = async () => {
    if (!confirmsDeletion(typed) || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onDelete();
      haptics.success();
    } catch (err) {
      setError(err.message || "Couldn't delete your account. Try again.");
      setBusy(false);
    }
  };

  return (
    <BottomSheet open={open} onClose={busy ? undefined : onClose} dragAnywhere={false}>
      <View style={styles.body} testID="delete-account-sheet">
        <Ionicons name="trash-outline" size={28} color="#FF6B6B" />
        <Slate dot color="#FF6B6B" style={{ marginTop: space.md }}>
          Delete account
        </Slate>
        <Text style={[type.title, { marginTop: space.sm }]}>This can't be undone.</Text>
        <Text style={[type.bodyMuted, { marginTop: space.sm }]}>
          Your sign in, profile, photo, posts and every conversation (for both people) are erased from BOA HUB for good, along with the files in them.
        </Text>
        <Field
          label={`Type ${DELETE_WORD} to confirm`}
          value={typed}
          onChangeText={setTyped}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder={DELETE_WORD}
          style={{ marginTop: space.lg }}
          testID="delete-account-input"
        />
        {error ? (
          <Text style={styles.error} testID="delete-account-error">
            {error}
          </Text>
        ) : null}
        <Button label={busy ? 'Deleting' : 'Delete account permanently'} icon="trash" disabled={!confirmsDeletion(typed) || busy} onPress={go} style={{ marginTop: space.lg }} testID="delete-account-confirm" />
        <Pressable onPress={onClose} disabled={busy} accessibilityRole="button" style={styles.cancel} testID="delete-account-cancel">
          <Text style={styles.cancelText}>Keep my account</Text>
        </Pressable>
        <Pressable onPress={() => Linking.openURL(DELETE_ACCOUNT_URL).catch(() => {})} accessibilityRole="link" style={styles.cancel}>
          <Text style={styles.link}>Prefer the web? Delete at {DELETE_ACCOUNT_URL.replace('https://', '')}</Text>
        </Pressable>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.xl },
  error: { fontFamily: fonts.medium, fontSize: 13, color: '#FF8A8A', marginTop: space.md },
  cancel: { alignItems: 'center', paddingTop: space.lg },
  cancelText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.textMuted },
  link: { fontFamily: fonts.medium, fontSize: 12.5, color: colors.gold, textDecorationLine: 'underline' },
});
