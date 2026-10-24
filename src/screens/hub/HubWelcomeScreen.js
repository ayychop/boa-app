import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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
import { colors, fonts, radius, space, type } from '../../theme';

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
    <View style={styles.hero}>
      <Fog opacity={0.3} />
      <Viewfinder inset={12} size={12} />
      <BoaLogo height={30} />
      <Slate dot color={colors.gold} style={{ marginTop: space.lg }}>
        BOA HUB · Creative network
      </Slate>
      {children}
    </View>
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

function SignIn() {
  const [mode, setMode] = useState('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(null);
  const [message, setMessage] = useState(null);
  const emailOk = EMAIL.test(email.trim());
  const passOk = password.length >= 8;

  const run = async (which, fn) => {
    setBusy(which);
    setMessage(null);
    try {
      const res = await fn();
      if (which === 'signUp' && !res?.session) setMessage({ ok: true, text: 'Check your email to confirm your address, then sign in.' });
    } catch (err) {
      setMessage({ ok: false, text: err.message });
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Hero>
        <Text style={[type.h1, { marginTop: space.md }]}>
          Find your <Text style={type.serif}>people.</Text>
        </Text>
        <Text style={[type.bodyMuted, { marginTop: space.sm }]}>
          Actors, directors, musicians and crew. Get discovered, find collaborators, message in private.
        </Text>
      </Hero>
      <Pressable
        onPress={() => run('google', hub.signInWithGoogle)}
        accessibilityRole="button"
        testID="hub-google"
        style={({ pressed }) => [styles.google, pressed && { opacity: 0.85 }]}
      >
        {busy === 'google' ? <ActivityIndicator color={colors.bg} /> : <Ionicons name="logo-google" size={18} color={colors.bg} />}
        <Text style={styles.googleText}>Continue with Google</Text>
      </Pressable>
      <View style={styles.or}>
        <View style={styles.rule} />
        <Text style={styles.orText}>or with email</Text>
        <View style={styles.rule} />
      </View>
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
        placeholder="you@example.com"
        testID="hub-email"
      />
      <Field
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'}
        textContentType={mode === 'signUp' ? 'newPassword' : 'password'}
        placeholder="At least 8 characters"
        testID="hub-password"
        style={{ marginTop: space.md }}
      />
      {message ? <Text style={[styles.message, message.ok && { color: colors.live }]}>{message.text}</Text> : null}
      <Button
        label={busy === mode ? 'One moment' : mode === 'signIn' ? 'Sign in' : 'Create account'}
        icon="arrow-forward"
        disabled={!emailOk || !passOk || !!busy}
        onPress={() => run(mode, () => (mode === 'signIn' ? hub.signInWithEmail(email, password) : hub.signUpWithEmail(email, password)))}
        style={{ marginTop: space.lg }}
      />
      <Pressable onPress={() => setMode(mode === 'signIn' ? 'signUp' : 'signIn')} style={styles.switch} accessibilityRole="button">
        <Text style={styles.switchText}>{mode === 'signIn' ? 'New to the Hub? Create an account' : 'Already on the Hub? Sign in'}</Text>
      </Pressable>
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
      await finishOnboarding(
        { username: handle, display_name: displayName.trim() || null, avatar_url, bio: bio.trim() || null, roles },
        { adultConfirmedAt: agreedAt },
      );
      haptics.success();
      if (photoFailed) Alert.alert('Your photo wasn’t added', `${photoFailed} You can add one any time from Hub settings.`);
      onDone();
    } catch (err) {
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
              <Chip
                key={r.id}
                label={r.label}
                selected={roles.includes(r.id)}
                onPress={() =>
                  setRoles((x) => (x.includes(r.id) ? x.filter((i) => i !== r.id) : x.length < 6 ? [...x, r.id] : x))
                }
              />
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
        <Slate>Step {step + 1} of {steps.length}</Slate>
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
 * connected to BOA HUB, sign-in (Google or email), then onboarding. Shared
 * by the welcome page and the Chat tab.
 */
export function HubGate({ stage }) {
  return (
    <Animated.View entering={FadeInDown.springify().damping(18)}>
      {stage === 'off' ? (
        <NotConfigured />
      ) : stage === 'loading' || stage === 'ready' ? (
        <ActivityIndicator color={colors.gold} style={{ marginTop: space.xxxl }} />
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
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.xxl }]} keyboardShouldPersistTaps="handled">
          <HubGate stage={stage} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { padding: space.xl, paddingTop: space.sm },
  hero: {
    padding: space.xl,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    marginBottom: space.xl,
  },
  google: {
    flexDirection: 'row',
    gap: space.sm,
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.text,
  },
  googleText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.bg },
  or: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginVertical: space.xl },
  rule: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.borderStrong },
  orText: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1.6, color: colors.textFaint, textTransform: 'uppercase' },
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
});
