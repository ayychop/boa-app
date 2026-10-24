import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useHub } from '../../context/HubContext';
import * as casting from '../../api/casting';
import { ROLES } from '../../api/hub';
import BottomSheet from '../BottomSheet';
import { Chip, Field } from '../kit';
import { Button, Slate } from '../ui';
import { haptics } from '../../utils/haptics';
import { colors, fonts, radius, space, type } from '../../theme';

// BOA's casting calls have their own image, not the show's poster (that's
// on the Originals): a film set, a light held over the performers.
// "On Set II" by Wesley Tingey (Unsplash, via Wikimedia Commons), CC0.
const CASTING_ART = require('../../../assets/images/casting-on-set.jpg');

const STATUS_LABEL = { submitted: 'Applied', shortlisted: 'Shortlisted', declined: 'Not this time', hired: 'Hired' };

function AppliedPill({ status }) {
  return (
    <View style={styles.applied} testID="casting-applied">
      <Ionicons name={status === 'hired' ? 'trophy' : 'checkmark-circle'} size={14} color={colors.gold} />
      <Text style={styles.appliedText}>{STATUS_LABEL[status] ?? 'Applied'}</Text>
    </View>
  );
}

/** The massive gold band on BOA's own productions. */
function OriginalBadge() {
  return (
    <LinearGradient
      colors={['#FFE6A8', colors.gold, colors.goldDeep]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.originalBadge}
      testID="badge-boa-original"
    >
      <Ionicons name="film" size={16} color={colors.bg} />
      <Text style={styles.originalBadgeText}>BOA ORIGINAL PRODUCTION</Text>
    </LinearGradient>
  );
}

/** Gold, for external gigs that meet BOA's minimum. */
function VerifiedGigBadge() {
  return (
    <View style={styles.gigBadge} testID="badge-boa-verified">
      <Ionicons name="shield-checkmark" size={13} color={colors.gold} />
      <Text style={styles.gigBadgeText}>£1,000+ BOA VERIFIED</Text>
    </View>
  );
}

/** A BOA Original: cinematic, the key art behind it, no budget. */
function OriginalCard({ call, applied, onApply, index }) {
  return (
    <Animated.View entering={FadeInDown.delay(index * 70).springify().damping(18)} style={styles.originalCard} testID={`casting-${call.id}`}>
      <Image source={CASTING_ART} style={StyleSheet.absoluteFill} resizeMode="cover" testID="casting-art" />
      {/* BOA's gold light over the black-and-white set, then night below. */}
      <LinearGradient
        colors={['rgba(226,168,75,0.38)', 'rgba(226,168,75,0.06)', 'rgba(5,5,6,0)']}
        locations={[0, 0.45, 0.7]}
        start={{ x: 0.85, y: 0 }}
        end={{ x: 0.2, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={['rgba(5,5,6,0.2)', 'rgba(5,5,6,0.5)', 'rgba(5,5,6,0.97)']}
        locations={[0, 0.42, 1]}
        style={StyleSheet.absoluteFill}
      />
      <OriginalBadge />
      <View style={{ flex: 1 }} />
      <Text style={styles.originalTitle}>{call.title}</Text>
      <View style={styles.metaRow}>
        <Meta icon="person-outline" text={call.role_needed} />
        <Meta icon="location-outline" text={call.location} />
      </View>
      <Text style={styles.originalBody} numberOfLines={4}>
        {call.description}
      </Text>
      <View style={styles.cardFoot}>
        {applied ? <AppliedPill status={applied} /> : <Button label="Apply" icon="videocam-outline" onPress={() => onApply(call)} />}
      </View>
    </Animated.View>
  );
}

function Meta({ icon, text }) {
  return (
    <View style={styles.meta}>
      <Ionicons name={icon} size={13} color={colors.textMuted} />
      <Text style={styles.metaText} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

/** An external gig, on frosted glass, with its budget. */
function GigCard({ call, applied, mine, onApply, index }) {
  return (
    <Animated.View entering={FadeInDown.delay(index * 70).springify().damping(18)} style={styles.gigCard} testID={`casting-${call.id}`}>
      <LinearGradient colors={['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.02)']} style={StyleSheet.absoluteFill} />
      <View style={styles.gigHead}>
        <VerifiedGigBadge />
        <Text style={styles.budget}>{casting.formatBudget(call.budget_amount)}</Text>
      </View>
      <Text style={styles.gigTitle}>{call.title}</Text>
      <View style={styles.metaRow}>
        <Meta icon="person-outline" text={call.role_needed} />
        <Meta icon="location-outline" text={call.location} />
      </View>
      <Text style={styles.gigBody} numberOfLines={3}>
        {call.description}
      </Text>
      <View style={styles.cardFoot}>
        {mine ? (
          <Text style={styles.mine}>{call.approved ? 'Your gig · live' : 'Your gig · awaiting BOA review'}</Text>
        ) : applied ? (
          <AppliedPill status={applied} />
        ) : (
          <Button label="Apply" icon="videocam-outline" variant="ghost" onPress={() => onApply(call)} />
        )}
      </View>
    </Animated.View>
  );
}

/** Apply: a self-tape link and/or a cover note. */
function ApplySheet({ call, onClose, onSent, onSignIn }) {
  const { stage, userId } = useHub();
  const [tape, setTape] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => {
    setTape('');
    setNote('');
    setError(null);
  }, [call?.id]);

  const send = async () => {
    const problem = casting.applicationProblem({ selfTapeUrl: tape, coverNote: note });
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      await casting.apply({ castingCallId: call.id, userId, selfTapeUrl: tape, coverNote: note });
      haptics.success();
      onSent(call.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet open={!!call} onClose={onClose} dragAnywhere={false}>
      {call ? (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView contentContainerStyle={styles.sheet} keyboardShouldPersistTaps="handled">
            <Slate dot color={colors.gold}>
              {call.is_boa_original ? 'BOA Original Production' : 'Apply'}
            </Slate>
            <Text style={[type.h1, { marginTop: space.sm }]}>{call.title}</Text>
            {stage !== 'ready' ? (
              <>
                <Text style={[type.bodyMuted, { marginTop: space.md }]}>
                  Applications come from your Creative Hub profile, so casting can see who you are. Join the Hub (it takes a minute), then apply.
                </Text>
                <Button label="Join the Hub to apply" icon="arrow-forward" onPress={onSignIn} style={{ marginTop: space.xl }} />
              </>
            ) : (
              <>
                <Field
                  label="Self-tape link"
                  value={tape}
                  onChangeText={setTape}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  placeholder="https://youtu.be/..."
                  hint="YouTube, Vimeo, Google Drive or Dropbox. Make sure it can be viewed."
                  testID="apply-tape"
                  style={{ marginTop: space.xl }}
                />
                <Field
                  label="Cover note"
                  value={note}
                  onChangeText={(t) => setNote(t.slice(0, 1500))}
                  multiline
                  placeholder="Who you are, what you've done, why this role."
                  hint={`${note.length}/1500`}
                  testID="apply-note"
                  style={{ marginTop: space.lg }}
                />
                {error ? <Text style={styles.error}>{error}</Text> : null}
                <Button label={busy ? 'Sending' : 'Send application'} icon="send" disabled={busy} onPress={send} style={{ marginTop: space.xl }} />
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      ) : null}
    </BottomSheet>
  );
}

/** Post a gig: an external gig, £1,000 or more, reviewed by BOA before it goes live. */
function PostSheet({ open, onClose, onPosted, onSignIn }) {
  const { stage, userId } = useHub();
  const [form, setForm] = useState({ title: '', role: null, description: '', budget: '', location: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const post = async () => {
    setError(null);
    if (form.title.trim().length < 3) return setError('Give the gig a title.');
    if (!form.role) return setError('Choose the role you need.');
    if (form.description.trim().length < 10) return setError('Describe the gig: the project, the dates, what you need.');
    if (form.location.trim().length < 2) return setError('Where is it?');
    // BOA's minimum, checked here so the message comes at once.
    const problem = casting.budgetProblem({ isBoaOriginal: false, budget: casting.parseBudget(form.budget) });
    if (problem) return setError(problem);
    setBusy(true);
    try {
      await casting.postCastingCall({
        producerId: userId,
        title: form.title,
        description: form.description,
        roleNeeded: ROLES.find((r) => r.id === form.role)?.label ?? form.role,
        budget: form.budget,
        location: form.location,
      });
      haptics.success();
      setForm({ title: '', role: null, description: '', budget: '', location: '' });
      onPosted();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet open={open} onClose={onClose} dragAnywhere={false}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.sheet} keyboardShouldPersistTaps="handled" style={{ maxHeight: 620 }}>
          <Slate dot color={colors.gold}>
            Post a gig
          </Slate>
          <Text style={[type.h1, { marginTop: space.sm }]}>
            Hire from the <Text style={type.serif}>Hub.</Text>
          </Text>
          <Text style={[type.bodyMuted, { marginTop: space.sm }]}>Paid work only, £1,000 or more. BOA reviews every gig before it goes live.</Text>
          {stage !== 'ready' ? (
            <Button label="Join the Hub to post" icon="arrow-forward" onPress={onSignIn} style={{ marginTop: space.xl }} />
          ) : (
            <>
              <Field label="Title" value={form.title} onChangeText={(t) => set('title')(t.slice(0, 120))} placeholder="e.g. Lead for a music video" testID="post-title" style={{ marginTop: space.xl }} />
              <Text style={styles.label}>Role needed</Text>
              <View style={styles.roles}>
                {ROLES.map((r) => (
                  <Chip key={r.id} label={r.label} selected={form.role === r.id} onPress={() => set('role')(r.id)} testID={`post-role-${r.id}`} />
                ))}
              </View>
              <Field
                label="Budget (£)"
                value={form.budget}
                onChangeText={(t) => set('budget')(t.replace(/[^\d.,£]/g, '').slice(0, 12))}
                keyboardType="decimal-pad"
                placeholder="1,000 or more"
                testID="post-budget"
                style={{ marginTop: space.lg }}
              />
              <Field label="Location" value={form.location} onChangeText={(t) => set('location')(t.slice(0, 120))} placeholder="City, or Remote" testID="post-location" style={{ marginTop: space.lg }} />
              <Field
                label="Description"
                value={form.description}
                onChangeText={(t) => set('description')(t.slice(0, 4000))}
                multiline
                placeholder="The project, the dates, what you need from them."
                testID="post-description"
                style={{ marginTop: space.lg }}
              />
              {error ? (
                <Text style={styles.error} testID="post-error">
                  {error}
                </Text>
              ) : null}
              <Button label={busy ? 'Sending' : 'Send to BOA for review'} icon="shield-checkmark" disabled={busy} onPress={post} style={{ marginTop: space.xl }} />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </BottomSheet>
  );
}

/**
 * Casting & Gigs, on the Talent tab: BOA's own productions first (with the
 * cinematic BOA ORIGINAL PRODUCTION badge and no budget), then external
 * gigs that pay £1,000 or more (gold BOA VERIFIED). Apply with a self-tape
 * link or a cover note; Hub members can post a gig for BOA to review.
 */
export default function CastingBoard({ navigation }) {
  const { userId, stage } = useHub();
  const [calls, setCalls] = useState(null); // null loading | [] | rows
  const [mine, setMine] = useState([]);
  const [applied, setApplied] = useState({});
  const [error, setError] = useState(null);
  const [applying, setApplying] = useState(null);
  const [posting, setPosting] = useState(false);
  const [notice, setNotice] = useState(null);

  const load = useCallback(async () => {
    try {
      const [live, own, apps] = await Promise.all([
        casting.listCastingCalls(),
        stage === 'ready' ? casting.myCalls(userId).catch(() => []) : [],
        stage === 'ready' ? casting.myApplications(userId).catch(() => ({})) : {},
      ]);
      setCalls(live);
      setMine(own);
      setApplied(apps);
      setError(null);
    } catch (err) {
      setCalls([]);
      setError(err.message);
    }
  }, [stage, userId]);

  useEffect(() => {
    load();
  }, [load]);

  const signIn = () => {
    setApplying(null);
    setPosting(false);
    navigation.navigate('HubWelcome', { next: 'back' });
  };

  // Live calls, plus your own gigs still awaiting review.
  const liveIds = new Set((calls ?? []).map((c) => c.id));
  const board = [...(calls ?? []), ...mine.filter((c) => !liveIds.has(c.id))];
  const mineIds = new Set(mine.map((c) => c.id));

  return (
    <View style={styles.section} testID="casting-board">
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Slate dot color={colors.gold}>
            Casting & Gigs
          </Slate>
          <Text style={[type.h1, { marginTop: space.sm }]}>
            Get <Text style={type.serif}>booked.</Text>
          </Text>
          <Text style={[type.bodyMuted, { marginTop: space.xs }]}>Real roles, real pay. Every gig is checked by BOA.</Text>
        </View>
        <Button label="Post a gig" icon="add" variant="ghost" onPress={() => setPosting(true)} />
      </View>

      {notice ? (
        <View style={styles.notice} testID="casting-notice">
          <Ionicons name="shield-checkmark" size={16} color={colors.gold} />
          <Text style={styles.noticeText}>{notice}</Text>
        </View>
      ) : null}

      {calls === null ? (
        <ActivityIndicator color={colors.gold} style={{ marginVertical: space.xl }} />
      ) : error ? (
        <Text style={[type.bodyMuted, styles.empty]}>Casting couldn't load just now. {error}</Text>
      ) : board.length === 0 ? (
        <Text style={[type.bodyMuted, styles.empty]}>No open calls right now. New roles land here first.</Text>
      ) : (
        board.map((call, i) =>
          call.is_boa_original ? (
            <OriginalCard key={call.id} call={call} index={i} applied={applied[call.id]} onApply={setApplying} />
          ) : (
            <GigCard key={call.id} call={call} index={i} applied={applied[call.id]} mine={mineIds.has(call.id)} onApply={setApplying} />
          ),
        )
      )}

      <ApplySheet
        call={applying}
        onClose={() => setApplying(null)}
        onSignIn={signIn}
        onSent={(id) => {
          setApplied((a) => ({ ...a, [id]: 'submitted' }));
          setApplying(null);
          setNotice('Application sent. Casting will be in touch through the Hub.');
        }}
      />
      <PostSheet
        open={posting}
        onClose={() => setPosting(false)}
        onSignIn={signIn}
        onPosted={() => {
          setPosting(false);
          setNotice('Gig sent to BOA for review. It goes live once approved.');
          load();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingHorizontal: space.xl, paddingTop: space.lg, paddingBottom: space.xl, gap: space.lg },
  head: { flexDirection: 'row', alignItems: 'flex-end', gap: space.md },
  notice: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md, borderRadius: radius.lg, backgroundColor: 'rgba(226,168,75,0.12)', borderWidth: 1, borderColor: 'rgba(226,168,75,0.4)' },
  noticeText: { flex: 1, fontFamily: fonts.medium, fontSize: 13, color: colors.text },
  empty: { paddingVertical: space.lg },
  originalCard: {
    minHeight: 460,
    padding: space.xl,
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(226,168,75,0.55)',
    backgroundColor: colors.surface,
    boxShadow: '0px 18px 40px rgba(0,0,0,0.55), 0px 0px 30px rgba(226,168,75,0.18)',
  },
  originalBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.pill,
    boxShadow: '0px 0px 24px rgba(226,168,75,0.6)',
  },
  originalBadgeText: { fontFamily: fonts.bold, fontSize: 14, letterSpacing: 2.4, color: colors.bg },
  originalTitle: { fontFamily: fonts.semibold, fontSize: 32, lineHeight: 36, letterSpacing: -1.2, color: colors.text },
  originalBody: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 20, color: 'rgba(243,239,232,0.82)', marginTop: space.md },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, marginTop: space.sm },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '100%' },
  metaText: { fontFamily: fonts.medium, fontSize: 13, color: colors.textMuted },
  cardFoot: { flexDirection: 'row', marginTop: space.lg },
  gigCard: {
    padding: space.xl,
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: 'rgba(18,18,22,0.6)',
  },
  gigHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  gigBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.gold, backgroundColor: 'rgba(226,168,75,0.12)' },
  gigBadgeText: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 1.2, color: colors.gold },
  budget: { fontFamily: fonts.semibold, fontSize: 22, letterSpacing: -0.6, color: colors.text },
  gigTitle: { fontFamily: fonts.semibold, fontSize: 20, letterSpacing: -0.5, color: colors.text, marginTop: space.md },
  gigBody: { fontFamily: fonts.medium, fontSize: 13.5, lineHeight: 19, color: colors.textMuted, marginTop: space.sm },
  mine: { fontFamily: fonts.mono, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: colors.gold },
  applied: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: 'rgba(226,168,75,0.14)' },
  appliedText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.gold },
  sheet: { paddingHorizontal: space.xl, paddingBottom: space.xl },
  label: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1.8, textTransform: 'uppercase', color: colors.textMuted, marginTop: space.lg, marginBottom: 8 },
  roles: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  error: { fontFamily: fonts.medium, fontSize: 13, color: '#FF8A8A', marginTop: space.md },
});
