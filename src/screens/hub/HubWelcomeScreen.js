import { useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import Animated, { FadeInDown, FadeInRight, FadeOutLeft } from 'react-native-reanimated';
import { useHub } from '../../context/HubContext';
import * as hub from '../../api/hub';
import { Avatar, Chip, Field, PageHeader } from '../../components/kit';
import { Button, Fog, Slate, Viewfinder } from '../../components/ui';
import BoaLogo from '../../components/BoaLogo';
import { haptics } from '../../utils/haptics';
import { QUOTE_CATEGORIES } from '../../data/quotes';
import { colors, fonts, radius, space, type } from '../../theme';
import { LoadingDots } from '../../components/Skeleton';
import Panel from '../../components/Panel';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// The Hub's rules, shown before you agree to them.
const TERMS = [
  'You are 18 or over, and the profile is really you.',
  'Be respectful. No harassment, hate, sexual content, scams or spam.',
  'Messages are private between the two of you. Reports go to BOA moderators with the message reported.',
  'Block anyone, any time. They can no longer see your profile or message you.',
  'Your data is yours: export it or delete your account (and everything in it) from Hub settings at any time.',
];

function Hero({ children }) {
  return (
    <Panel style={styles.hero}>
      <Fog opacity={0.3} />
      <Viewfinder inset={12} size={12} />
      <BoaLogo height={30} />
      <Slate dot color={colors.gold} style={{ marginTop: space.lg }}>
        BOA HUB · Creative network
      </Slate>
      {children}
    </Panel>
  );
}

function NotConfigured() {
  return (
    <Hero>
      <Text style={[type.h1, { marginTop: space.md }]}>The Hub is nearly here.</Text>
      <Text style={[type.bodyMuted, { marginTop: space.sm }]} testID="hub-not-configured">
        This build isn't connected to BOA HUB yet. Add the project's URL and anon key to .env.local and restart the app.
      </Text>
    </Hero>
  );
}

// The way in: email and password. Create an account (a confirmation link
// is emailed; tapping it on this phone signs you in) or sign in.
function SignIn() {
  const [mode, setMode] = useState('signIn'); // signIn | signUp
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null); // { text, code }
  const [sentTo, setSentTo] = useState(null); // the inbox a link went to
  const [resent, setResent] = useState(false);
  const emailOk = EMAIL.test(email.trim());
  const passOk = password.length >= 8;
  const matches = mode === 'signIn' || password === confirm;
  const ready = emailOk && passOk && matches;

  const switchTo = (next) => {
    setMode(next);
    setError(null);
    setConfirm('');
  };

  const submit = async () => {
    if (!ready || busy) return;
    setBusy('submit');
    setError(null);
    try {
      if (mode === 'signIn') {
        await hub.signInWithEmail(email, password);
      } else {
        const res = await hub.signUpWithEmail(email, password);
        // "Confirm email" is on: no session until the link is tapped.
        if (!res?.session) {
          setSentTo(email.trim());
          setResent(false);
        }
      }
    } catch (err) {
      setError({ text: err.message, code: err.code ?? null });
    } finally {
      setBusy(null);
    }
  };

  const resend = async (to) => {
    setBusy('resend');
    try {
      await hub.resendConfirmation(to);
      setResent(true);
      setError(null);
    } catch (err) {
      setError({ text: err.message, code: err.code ?? null });
    } finally {
      setBusy(null);
    }
  };

  if (sentTo) {
    return (
      <Hero>
        <Ionicons name="mail-open-outline" size={30} color={colors.gold} style={{ marginTop: space.lg }} />
        <Text style={[type.h1, { marginTop: space.md }]} testID="hub-check-inbox">
          Check your <Text style={type.serif}>inbox.</Text>
        </Text>
        <Text style={[type.bodyMuted, { marginTop: space.sm }]}>
          We sent a confirmation link to {sentTo}. Open it on this phone and you're straight in. It can take a minute, and sometimes lands in spam.
        </Text>
        {resent ? <Text style={[styles.message, { color: colors.live }]}>Sent again.</Text> : null}
        {error ? <Text style={styles.message}>{error.text}</Text> : null}
        <Button label={busy === 'resend' ? 'Sending' : 'Resend the email'} icon="refresh" variant="ghost" disabled={!!busy} onPress={() => resend(sentTo)} style={{ marginTop: space.xl }} />
        <Pressable
          hitSlop={10}
          onPress={() => {
            setSentTo(null);
            switchTo('signIn');
          }}
          style={styles.switch}
          accessibilityRole="button"
        >
          <Text style={styles.switchText}>Back to sign in</Text>
        </Pressable>
      </Hero>
    );
  }

  return (
    <>
      <Hero>
        <Text style={[type.h1, { marginTop: space.md }]}>
          Find your <Text style={type.serif}>people.</Text>
        </Text>
        <Text style={[type.bodyMuted, { marginTop: space.sm }]}>Actors, directors, musicians and crew. Get discovered, find collaborators, message in private.</Text>
      </Hero>

      {/* Sign in or create an account. */}
      <View style={styles.modes} accessibilityRole="tablist">
        {[
          ['signIn', 'Sign in'],
          ['signUp', 'Create account'],
        ].map(([id, label]) => {
          const on = mode === id;
          return (
            <Pressable
              hitSlop={{ top: 2, bottom: 2 }}
              key={id}
              onPress={() => switchTo(id)}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              testID={`hub-mode-${id}`}
              style={[styles.mode, on && styles.modeOn]}
            >
              <Text style={[styles.modeText, on && styles.modeTextOn]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>

      <Field
        label="Email"
        value={email}
        onChangeText={(t) => {
          setEmail(t);
          setError(null);
        }}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
        placeholder="you@example.com"
        error={email && !emailOk ? 'That doesn\u2019t look like an email address.' : null}
        testID="hub-email"
        style={{ marginTop: space.xl }}
      />
      <Field
        label="Password"
        value={password}
        onChangeText={(t) => {
          setPassword(t);
          setError(null);
        }}
        secureTextEntry={!show}
        autoCapitalize="none"
        autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'}
        textContentType={mode === 'signUp' ? 'newPassword' : 'password'}
        placeholder="At least 8 characters"
        hint={mode === 'signUp' && password && !passOk ? `${8 - password.length} more character${8 - password.length === 1 ? '' : 's'}` : null}
        testID="hub-password"
        style={{ marginTop: space.lg }}
      />
      {mode === 'signUp' ? (
        <Field
          label="Confirm password"
          value={confirm}
          onChangeText={setConfirm}
          secureTextEntry={!show}
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="newPassword"
          error={confirm && password !== confirm ? "Those passwords don't match." : null}
          testID="hub-password-confirm"
          style={{ marginTop: space.lg }}
        />
      ) : null}
      <Pressable hitSlop={10} onPress={() => setShow(!show)} accessibilityRole="button" style={styles.show} testID="hub-show-password">
        <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={16} color={colors.textMuted} />
        <Text style={styles.showText}>{show ? 'Hide password' : 'Show password'}</Text>
      </Pressable>

      {error ? (
        <Text style={styles.message} testID="hub-auth-error">
          {error.text}
        </Text>
      ) : null}
      {error?.code === 'user_already_exists' ? (
        <Pressable hitSlop={10} onPress={() => switchTo('signIn')} style={styles.inline} accessibilityRole="button">
          <Text style={styles.switchText}>Sign in with {email.trim()}</Text>
        </Pressable>
      ) : null}
      {error?.code === 'email_not_confirmed' ? (
        <Pressable hitSlop={10} onPress={() => resend(email)} style={styles.inline} accessibilityRole="button" testID="hub-resend">
          <Text style={styles.switchText}>{busy === 'resend' ? 'Sending' : 'Resend the confirmation email'}</Text>
        </Pressable>
      ) : null}
      {resent && !sentTo ? <Text style={[styles.message, { color: colors.live }]}>Sent. Check your inbox.</Text> : null}

      <Button
        label={busy === 'submit' ? 'One moment' : mode === 'signIn' ? 'Sign in' : 'Create account'}
        icon="arrow-forward"
        disabled={!ready || !!busy}
        onPress={submit}
        style={{ marginTop: space.xl }}
      />
      {mode === 'signUp' ? <Text style={styles.fine}>We'll email you a link to confirm it's you. Your email stays private.</Text> : null}
    </>
  );
}

// Four short steps, one screen each.
function Onboarding({ onDone }) {
  const { userId, finishOnboarding, session } = useHub();
  const [step, setStep] = useState(0);
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState(session?.user?.user_metadata?.full_name ?? '');
  const [avatar, setAvatar] = useState(null); // picked asset
  const [bio, setBio] = useState('');
  const [roles, setRoles] = useState([]);
  const [spark, setSpark] = useState(null); // quote category id
  const [dob, setDob] = useState({ d: '', m: '', y: '' });
  const [agreed, setAgreed] = useState(false);
  // When "I am 18 or over" was ticked: sent as adult_confirmed_at.
  const [agreedAt, setAgreedAt] = useState(null);
  const [photoError, setPhotoError] = useState(null);
  const [free, setFree] = useState(null); // null checking | true | false
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const checkId = useRef(0);

  const handle = username.toLowerCase();
  const handleOk = hub.USERNAME.test(handle);
  useEffect(() => {
    if (!handleOk) return setFree(null);
    const id = ++checkId.current;
    setFree(null);
    const t = setTimeout(() => {
      hub
        .isUsernameFree(handle, userId)
        .then((ok) => id === checkId.current && setFree(ok))
        .catch(() => id === checkId.current && setFree(true));
    }, 400);
    return () => clearTimeout(t);
  }, [handle, handleOk, userId]);

  const birth = new Date(Number(dob.y), Number(dob.m) - 1, Number(dob.d));
  const dobValid = dob.y.length === 4 && birth.getDate() === Number(dob.d) && birth.getMonth() === Number(dob.m) - 1 && birth < new Date();
  const age = dobValid ? hub.ageOn(birth) : null;

  const pick = async () => {
    setPhotoError(null);
    try {
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
      const asset = res?.canceled ? null : res?.assets?.[0];
      if (!asset) return;
      const problem = hub.avatarProblem(asset);
      if (problem) setPhotoError(problem);
      else setAvatar(asset);
    } catch {
      setPhotoError("Couldn't open your photos. You can add one later from Hub settings.");
    }
  };

  const finish = async () => {
    setBusy(true);
    setError(null);
    try {
      // The photo is optional: if it won't upload (no connection, too
      // large), the profile is still created and you can add it later.
      let avatar_url = null;
      let photoFailed = null;
      if (avatar) {
        try {
          avatar_url = await hub.uploadAvatar(userId, avatar);
        } catch (err) {
          photoFailed = err?.message || "Couldn't upload the photo.";
        }
      }
      await finishOnboarding({ username: handle, display_name: displayName.trim() || null, avatar_url, bio: bio.trim() || null, roles, quote_category: spark }, { adultConfirmedAt: agreedAt });
      haptics.success();
      if (photoFailed) Alert.alert('Your photo wasn’t added', `${photoFailed} You can add one any time from Hub settings.`);
      onDone();
    } catch (err) {
      console.warn('[hub] Join the Hub failed', JSON.stringify({ code: err?.code ?? null, message: err?.message, details: err?.details ?? null }));
      setError(/duplicate|unique/i.test(err.message) ? 'That username was just taken. Go back and pick another.' : err.message);
    } finally {
      setBusy(false);
    }
  };

  const steps = [
    {
      title: 'Choose your name',
      ok: handleOk && free === true,
      body: (
        <>
          <Field
            label="Username"
            value={username}
            onChangeText={(t) => setUsername(t.replace(/\s/g, '').slice(0, 24))}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="e.g. ama.directs"
            testID="hub-username"
            error={username && !handleOk ? '3 to 24 letters, numbers, dots or underscores.' : free === false ? 'That one is taken.' : null}
            hint={handleOk && free ? `@${handle} is yours.` : 'How people find and mention you.'}
          />
          <Field label="Display name" value={displayName} onChangeText={(t) => setDisplayName(t.slice(0, 50))} placeholder="Your name" style={{ marginTop: space.lg }} />
        </>
      ),
    },
    {
      title: 'Add a photo',
      ok: true,
      body: (
        <View style={{ alignItems: 'center', gap: space.lg }}>
          <Pressable onPress={pick} accessibilityRole="button" accessibilityLabel="Choose a profile photo">
            <Avatar uri={avatar?.uri} name={displayName || handle} size={128} ring />
            <View style={styles.camera}>
              <Ionicons name="camera" size={16} color={colors.bg} />
            </View>
          </Pressable>
          <Text style={[type.bodyMuted, { textAlign: 'center' }]}>A clear headshot gets you found. You can skip this and add one later.</Text>
          {photoError ? <Text style={[styles.message, { textAlign: 'center' }]}>{photoError}</Text> : null}
        </View>
      ),
    },
    {
      title: 'What do you do?',
      ok: roles.length > 0,
      body: (
        <>
          <Text style={styles.label}>Roles (up to 6)</Text>
          <View style={styles.chips}>
            {hub.ROLES.map((r) => (
              <Chip key={r.id} label={r.label} selected={roles.includes(r.id)} onPress={() => setRoles((x) => (x.includes(r.id) ? x.filter((i) => i !== r.id) : x.length < 6 ? [...x, r.id] : x))} />
            ))}
          </View>
          <Field
            label="Bio"
            value={bio}
            onChangeText={(t) => setBio(t.slice(0, 280))}
            multiline
            placeholder="Your work, your credits, what you're looking for."
            hint={`${bio.length}/280`}
            style={{ marginTop: space.xl }}
          />
        </>
      ),
    },
    {
      title: 'Your Daily Spark',
      ok: !!spark,
      body: (
        <>
          <Text style={[type.bodyMuted, { marginBottom: space.lg }]}>One line a day on your Profile, in the kind you choose. You can see a new one every morning.</Text>
          <View style={styles.sparks}>
            {QUOTE_CATEGORIES.map((c) => {
              const on = spark === c.id;
              return (
                <Pressable
                  hitSlop={6}
                  key={c.id}
                  onPress={() => {
                    haptics.selection();
                    setSpark(c.id);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${c.label}, ${c.theme}`}
                  testID={`hub-spark-${c.id}`}
                  style={({ pressed }) => [styles.spark, on && styles.sparkOn, pressed && { opacity: 0.85 }]}
                >
                  <Ionicons name={c.icon} size={20} color={on ? colors.bg : colors.gold} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.sparkLabel, on && { color: colors.bg }]}>{c.label}</Text>
                    <Text style={[styles.sparkTheme, on && { color: 'rgba(5,5,6,0.7)' }]}>{c.theme}</Text>
                  </View>
                  {on && <Ionicons name="checkmark-circle" size={20} color={colors.bg} />}
                </Pressable>
              );
            })}
          </View>
        </>
      ),
    },
    {
      title: 'Last thing',
      ok: age != null && age >= hub.MIN_AGE && agreed && !!agreedAt,
      body: (
        <>
          <Text style={styles.label}>Date of birth</Text>
          <View style={styles.dob}>
            {[
              ['d', 'DD', 2],
              ['m', 'MM', 2],
              ['y', 'YYYY', 4],
            ].map(([k, ph, len]) => (
              <Field
                key={k}
                value={dob[k]}
                onChangeText={(t) => setDob((x) => ({ ...x, [k]: t.replace(/\D/g, '').slice(0, len) }))}
                keyboardType="number-pad"
                placeholder={ph}
                maxLength={len}
                testID={`hub-dob-${k}`}
                style={{ flex: k === 'y' ? 1.6 : 1 }}
                inputStyle={{ textAlign: 'center' }}
              />
            ))}
          </View>
          <Text style={[styles.dobNote, age != null && age < hub.MIN_AGE && { color: '#FF8A8A' }]}>
            {age != null && age < hub.MIN_AGE
              ? 'The Hub is for adults (18 and over), so it isn’t open to you yet. The rest of BOA is.'
              : 'Only used to confirm you are 18 or over. It is checked on your phone and never stored.'}
          </Text>
          <View style={styles.terms}>
            {TERMS.map((t) => (
              <View key={t} style={styles.term}>
                <Ionicons name="checkmark" size={14} color={colors.gold} />
                <Text style={styles.termText}>{t}</Text>
              </View>
            ))}
          </View>
          <Pressable
            hitSlop={8}
            onPress={() => {
              haptics.selection();
              setAgreedAt(agreed ? null : new Date().toISOString());
              setAgreed(!agreed);
            }}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: agreed }}
            testID="hub-terms"
            style={styles.agree}
          >
            <View style={[styles.box, agreed && styles.boxOn]}>{agreed && <Ionicons name="checkmark" size={16} color={colors.bg} />}</View>
            <Text style={styles.agreeText}>I am 18 or over and I agree to the BOA HUB Terms of Service and community rules.</Text>
          </Pressable>
          {error ? <Text style={styles.message}>{error}</Text> : null}
        </>
      ),
    },
  ];
  const current = steps[step];
  const last = step === steps.length - 1;

  return (
    <>
      <View style={styles.progress}>
        {steps.map((_, i) => (
          <View key={i} style={[styles.bar, i <= step && styles.barOn]} />
        ))}
      </View>
      <Animated.View key={step} entering={FadeInRight.springify().damping(20)} exiting={FadeOutLeft.duration(150)}>
        <Slate>
          Step {step + 1} of {steps.length}
        </Slate>
        <Text style={[type.h1, { marginTop: space.sm, marginBottom: space.xl }]}>{current.title}</Text>
        {current.body}
      </Animated.View>
      <View style={styles.nav}>
        {step > 0 && <Button label="Back" variant="ghost" onPress={() => setStep(step - 1)} />}
        <Button
          label={last ? (busy ? 'Creating' : 'Join the Hub') : step === 1 && !avatar ? 'Skip' : 'Next'}
          icon={last ? 'sparkles' : 'arrow-forward'}
          disabled={!current.ok || busy}
          onPress={() => (last ? finish() : setStep(step + 1))}
        />
      </View>
    </>
  );
}

/**
 * What the way into the Hub shows at each stage: a notice if the app isn't
 * connected to BOA HUB, sign-in (email and password), then onboarding. Shared
 * by the welcome page and the Chat tab.
 */
export function HubGate({ stage }) {
  return (
    <Animated.View entering={FadeInDown.springify().damping(18)}>
      {stage === 'off' ? (
        <NotConfigured />
      ) : stage === 'loading' || stage === 'ready' ? (
        <LoadingDots style={{ marginTop: space.xxxl }} />
      ) : stage === 'signedOut' ? (
        <SignIn />
      ) : (
        <Onboarding onDone={() => {}} />
      )}
    </Animated.View>
  );
}

/**
 * The way into the Creative Hub. Once the profile exists it carries on to
 * the page that was asked for, or (next: 'back') returns to where it was
 * opened from, such as the Profile tab.
 */
export default function HubWelcomeScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { stage } = useHub();
  const next = route.params?.next ?? 'HubDirectory';
  const nextParams = route.params?.nextParams;
  useEffect(() => {
    if (stage !== 'ready') return;
    if (next === 'back') navigation.goBack();
    else navigation.replace(next, nextParams);
  }, [stage, navigation, next, nextParams]);

  return (
    <View style={styles.screen} testID="hub-welcome">
      <PageHeader kicker="Creative Hub" title={stage === 'needsProfile' ? 'Your profile' : 'BOA HUB'} backIcon="close" onBack={() => navigation.goBack()} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={[styles.body, styles.form, { paddingBottom: insets.bottom + space.xxl }]} keyboardShouldPersistTaps="handled">
          <HubGate stage={stage} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { padding: space.xl, paddingTop: space.sm },
  // Sign-in and sign-up fields at a form's width, centred, on an unfolded screen.
  form: { width: '100%', maxWidth: 560, alignSelf: 'center' },
  hero: {
    padding: space.xl,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    marginBottom: space.xl,
  },
  modes: { flexDirection: 'row', padding: 4, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  mode: { flex: 1, height: 42, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  modeOn: { backgroundColor: colors.gold },
  modeText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.textMuted },
  modeTextOn: { color: colors.bg },
  show: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: space.sm, marginTop: space.sm },
  showText: { fontFamily: fonts.medium, fontSize: 13, color: colors.textMuted },
  inline: { alignSelf: 'flex-start', paddingVertical: space.sm },
  fine: { fontFamily: fonts.medium, fontSize: 12, color: colors.textFaint, textAlign: 'center', marginTop: space.md },
  message: { fontFamily: fonts.medium, fontSize: 13, color: '#FF8A8A', marginTop: space.md },
  switch: { alignSelf: 'center', padding: space.md, marginTop: space.sm },
  switchText: { fontFamily: fonts.semibold, fontSize: 13.5, color: colors.gold },
  progress: { flexDirection: 'row', gap: 6, marginBottom: space.xl },
  bar: { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(243,239,232,0.12)' },
  barOn: { backgroundColor: colors.gold },
  label: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1.8, textTransform: 'uppercase', color: colors.textMuted, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  camera: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.gold,
    borderWidth: 3,
    borderColor: colors.bg,
  },
  dob: { flexDirection: 'row', gap: space.sm },
  dobNote: { fontFamily: fonts.medium, fontSize: 12, color: colors.textFaint, marginTop: space.sm },
  terms: { gap: space.sm, marginTop: space.xl, padding: space.lg, borderRadius: radius.lg, backgroundColor: colors.surface },
  term: { flexDirection: 'row', gap: space.sm },
  termText: { flex: 1, fontFamily: fonts.medium, fontSize: 13, lineHeight: 19, color: colors.textMuted },
  agree: { flexDirection: 'row', gap: space.md, alignItems: 'center', marginTop: space.lg },
  box: { width: 26, height: 26, borderRadius: 7, borderWidth: 1.5, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  agreeText: { flex: 1, fontFamily: fonts.medium, fontSize: 13.5, color: colors.text },
  nav: { flexDirection: 'row', justifyContent: 'flex-end', gap: space.md, marginTop: space.xxl },
  sparks: { gap: space.sm },
  spark: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  sparkOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  sparkLabel: { fontFamily: fonts.semibold, fontSize: 16, color: colors.text },
  sparkTheme: { fontFamily: fonts.medium, fontSize: 12, color: colors.textMuted, marginTop: 2 },
});
