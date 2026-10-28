import { useEffect, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import BottomSheet from '../BottomSheet';
import { Button, Fog, Slate } from '../ui';
import { colors, fonts, radius, space, type } from '../../theme';
import { LoadingDots } from '../Skeleton';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const HANDLE_OR_URL = /^(@[\w.]{2,30}|(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/\S*)?)$/i;

// The two in-app forms. Fields render in order; `required` and `test` drive
// validation.
export const FORMS = {
  getSeen: {
    kicker: 'Open call',
    title: ['Get', 'seen.'],
    lede: 'No agent. No followers. No fee. Send us what you have and a real person will watch it.',
    submitLabel: 'Submit application',
    success: ['Application received.', 'We’ll be in touch.'],
    fields: [
      { key: 'name', label: 'Name', placeholder: 'Your full name', required: true, autoComplete: 'name', textContentType: 'name' },
      {
        key: 'email',
        label: 'Email',
        placeholder: 'you@example.com',
        required: true,
        keyboardType: 'email-address',
        autoComplete: 'email',
        textContentType: 'emailAddress',
        test: (v) => EMAIL.test(v) || 'Enter a valid email address.',
      },
      {
        key: 'link',
        label: 'Instagram / Portfolio',
        placeholder: '@yourhandle or https://…',
        required: true,
        keyboardType: 'url',
        test: (v) => HANDLE_OR_URL.test(v) || 'Add an @handle or a link to your work.',
      },
      {
        key: 'message',
        label: 'Short message',
        placeholder: 'Tell us about you: experience, what you want to do, anything we should see.',
        multiline: true,
        maxLength: 500,
      },
    ],
  },
  contact: {
    kicker: 'Get in touch',
    title: ['Contact', 'BOA.'],
    lede: 'Bookings, press, partnerships or just hello. It goes straight to the team.',
    submitLabel: 'Send message',
    success: ['Message sent.', 'We’ll be in touch.'],
    fields: [
      { key: 'name', label: 'Name', placeholder: 'Your full name', required: true, autoComplete: 'name', textContentType: 'name' },
      {
        key: 'email',
        label: 'Email',
        placeholder: 'you@example.com',
        required: true,
        keyboardType: 'email-address',
        autoComplete: 'email',
        textContentType: 'emailAddress',
        test: (v) => EMAIL.test(v) || 'Enter a valid email address.',
      },
      { key: 'subject', label: 'Subject', placeholder: 'What’s it about?' },
      {
        key: 'message',
        label: 'Message',
        placeholder: 'Write your message…',
        required: true,
        multiline: true,
        maxLength: 1000,
      },
    ],
  },
};

function validate(form, values) {
  const errors = {};
  for (const f of form.fields) {
    const v = (values[f.key] || '').trim();
    if (!v) {
      if (f.required) errors[f.key] = `${f.label} is required.`;
      continue;
    }
    const result = f.test?.(v);
    if (typeof result === 'string') errors[f.key] = result;
  }
  return errors;
}

function Field({ field, value, error, onChange, inputRef, onSubmitEditing, last }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <Slate color={error ? '#E5735F' : focused ? colors.gold : undefined}>
        {field.label}
        {field.required ? '' : ' · Optional'}
      </Slate>
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={onChange}
        placeholder={field.placeholder}
        placeholderTextColor={colors.textFaint}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        multiline={field.multiline}
        maxLength={field.maxLength}
        keyboardType={field.keyboardType}
        autoComplete={field.autoComplete}
        textContentType={field.textContentType}
        autoCapitalize={field.keyboardType ? 'none' : 'sentences'}
        autoCorrect={!field.keyboardType}
        returnKeyType={field.multiline ? 'default' : last ? 'done' : 'next'}
        onSubmitEditing={field.multiline ? undefined : onSubmitEditing}
        blurOnSubmit={!field.multiline}
        accessibilityLabel={field.label}
        aria-invalid={!!error}
        style={[styles.input, field.multiline && styles.multiline, focused && styles.inputFocused, error && styles.inputError]}
      />
      {error ? (
        <Animated.Text entering={FadeIn.duration(150)} style={styles.error}>
          {error}
        </Animated.Text>
      ) : field.maxLength && field.multiline ? (
        <Text style={styles.count}>
          {(value || '').length}/{field.maxLength}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * In-app form in a bottom sheet: validates, shows a sending state, then a
 * success screen. `onSubmit(values)` returns a promise.
 */
export default function FormSheet({ kind, open, initialValues, onSubmit, onClose }) {
  const form = FORMS[kind] ?? FORMS.getSeen;
  const [values, setValues] = useState({});
  const [errors, setErrors] = useState({});
  const [phase, setPhase] = useState('editing'); // editing | sending | done
  const refs = useRef({});

  // Fresh form each time it opens (prefilled for e.g. booking enquiries).
  useEffect(() => {
    if (!open) return;
    setValues(initialValues || {});
    setErrors({});
    setPhase('editing');
  }, [open, initialValues]);

  const set = (key) => (text) => {
    setValues((v) => ({ ...v, [key]: text }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const submit = async () => {
    const found = validate(form, values);
    setErrors(found);
    const firstBad = form.fields.find((f) => found[f.key]);
    if (firstBad) {
      refs.current[firstBad.key]?.focus();
      return;
    }
    setPhase('sending');
    const clean = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, (v || '').trim()]));
    await onSubmit(clean);
    setPhase('done');
  };

  return (
    <BottomSheet open={open} onClose={onClose} dragAnywhere={false}>
      {phase === 'done' ? (
        <Animated.View entering={FadeInDown.springify().damping(18)} style={styles.done}>
          <Fog opacity={0.25} />
          <Animated.View entering={ZoomIn.springify().damping(12).delay(80)} style={styles.check}>
            <Ionicons name="checkmark" size={34} color={colors.bg} />
          </Animated.View>
          <Text style={[type.h1, { textAlign: 'center', marginTop: space.xl }]}>{form.success[0]}</Text>
          <Text style={[type.serif, styles.doneSerif]}>{form.success[1]}</Text>
          <Text style={[type.bodyMuted, { textAlign: 'center', marginTop: space.md }]}>{values.email ? `We’ll reply to ${values.email.trim()}.` : ''}</Text>
          <Button label="Done" onPress={onClose} style={{ marginTop: space.xl, alignSelf: 'stretch' }} />
        </Animated.View>
      ) : (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <Slate dot>{form.kicker}</Slate>
          <Text style={[type.h1, { marginTop: space.sm }]}>
            {form.title[0]} <Text style={type.serif}>{form.title[1]}</Text>
          </Text>
          <Text style={[type.bodyMuted, { marginTop: space.sm, marginBottom: space.lg }]}>{form.lede}</Text>
          {form.fields.map((f, i) => (
            <Field
              key={f.key}
              field={f}
              value={values[f.key] || ''}
              error={errors[f.key]}
              onChange={set(f.key)}
              inputRef={(r) => (refs.current[f.key] = r)}
              last={i === form.fields.length - 1}
              onSubmitEditing={() => {
                const next = form.fields[i + 1];
                if (next) refs.current[next.key]?.focus();
                else submit();
              }}
            />
          ))}
          {phase === 'sending' ? (
            <View style={[styles.sending]}>
              <LoadingDots color={colors.bg} />
            </View>
          ) : (
            <Button label={form.submitLabel} icon="arrow-forward" onPress={submit} style={{ marginTop: space.sm }} />
          )}
          <Text style={styles.fineprint}>Sent inside the BOA app. We never share your details.</Text>
        </ScrollView>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: space.xl, paddingBottom: space.md },
  field: { marginBottom: space.lg, gap: 8 },
  input: {
    fontFamily: fonts.medium,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    paddingVertical: 13,
    ...(Platform.OS === 'web' && { outlineStyle: 'none' }),
  },
  multiline: { minHeight: 110, textAlignVertical: 'top', paddingTop: 13 },
  inputFocused: { borderColor: colors.gold, backgroundColor: colors.surfaceRaised, boxShadow: '0px 0px 0px 3px rgba(226,168,75,0.15)' },
  inputError: { borderColor: '#E5735F' },
  error: { fontFamily: fonts.medium, fontSize: 12.5, color: '#E5735F' },
  count: { fontFamily: fonts.mono, fontSize: 10.5, color: colors.textFaint, alignSelf: 'flex-end' },
  sending: {
    height: 46,
    marginTop: space.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fineprint: { fontFamily: fonts.medium, fontSize: 11.5, color: colors.textFaint, textAlign: 'center', marginTop: space.md },
  done: { alignItems: 'center', paddingHorizontal: space.xl, paddingTop: space.xl, paddingBottom: space.md, overflow: 'hidden' },
  check: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0px 10px 34px rgba(226,168,75,0.45)',
  },
  doneSerif: { fontSize: 30, marginTop: 4, textAlign: 'center' },
});
