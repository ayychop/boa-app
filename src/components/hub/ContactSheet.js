import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Text from '../ScopedText';
import BottomSheet from '../BottomSheet';
import { Field } from '../kit';
import { Button, Slate } from '../ui';
import { cleanAlias, NAME_MAX, removeContact, saveContact, useAlias } from '../../chat/contacts';
import { haptics } from '../../utils/haptics';
import { colors, fonts, space } from '../../theme';

/**
 * Save someone to your Contact Book under a name of your own. Kept on this
 * phone only; they're never told. `person` is a profile ({ id, username,
 * display_name }); null keeps the sheet closed.
 */
export default function ContactSheet({ person, onClose }) {
  const saved = useAlias(person?.id);
  const [name, setName] = useState('');
  useEffect(() => {
    if (person) setName(saved ?? '');
    // Reset only when the sheet opens for someone, not as the book changes under it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [person?.id]);

  const handle = person?.username ? `@${person.username}` : '';
  const real = person?.display_name || handle || 'this person';
  const clean = cleanAlias(name);

  const save = async () => {
    if (!person || !clean) return;
    haptics.success();
    await saveContact(person.id, clean, person.username);
    onClose();
  };
  const remove = async () => {
    if (!person) return;
    haptics.selection();
    await removeContact(person.id);
    onClose();
  };

  return (
    <BottomSheet open={!!person} onClose={onClose} dragAnywhere={false}>
      <View style={styles.body} testID="contact-sheet">
        <Slate>Contact book</Slate>
        <Text style={styles.title}>{saved ? 'Edit contact name' : 'Save to contacts'}</Text>
        <Text style={styles.hint}>
          Pick the name you want to see for {real}
          {handle && real !== handle ? ` (${handle})` : ''}. Only you see it, and it stays on this phone.
        </Text>
        <Field
          value={name}
          onChangeText={setName}
          placeholder={person?.display_name || handle || 'Name'}
          maxLength={NAME_MAX}
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={save}
          accessibilityLabel="Contact name"
          testID="contact-name"
          style={{ marginTop: space.lg }}
        />
        <Button label={saved ? 'Save name' : 'Save contact'} icon="person-add-outline" onPress={save} disabled={!clean} style={{ marginTop: space.lg }} testID="contact-save" />
        {saved ? <Button label="Remove from contacts" icon="trash-outline" variant="ghost" onPress={remove} style={{ marginTop: space.sm }} testID="contact-remove" /> : null}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: space.lg },
  title: { fontFamily: fonts.semibold, fontSize: 22, lineHeight: 28, color: colors.text, marginTop: space.sm },
  hint: { fontFamily: fonts.regular, fontSize: 13.5, lineHeight: 20, color: colors.textMuted, marginTop: space.xs },
});
