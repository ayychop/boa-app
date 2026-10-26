import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useHub } from '../../context/HubContext';
import { getProfile, roleLabel } from '../../api/hub';
import * as splits from '../../api/splits';
import { supabase } from '../../lib/supabase';
import { ownChannel } from '../../lib/realtime';
import { Avatar, Chip, Field, IconButton, PageHeader } from '../../components/kit';
import PersonPicker from '../../components/hub/PersonPicker';
import { ShareBar } from './HubSplitsScreen';
import { Button, Slate } from '../../components/ui';
import { colors, fonts, radius, space, type } from '../../theme';

const nameOf = (p) => (p ? p.display_name || `@${p.username}` : 'Hub member');
const when = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/** The running total: gold while it's short or over, green at exactly 100%. */
function TotalMeter({ parties }) {
  const total = splits.totalShare(parties);
  const ok = total === 100;
  return (
    <View style={[styles.meter, ok && { borderColor: 'rgba(30,215,96,0.5)' }]} testID="split-total">
      <View style={{ flex: 1 }}>
        <Slate>Total</Slate>
        <Text style={[styles.meterValue, { color: ok ? colors.live : total > 100 ? '#FF8A8A' : colors.gold }]}>{total}%</Text>
      </View>
      <Ionicons name={ok ? 'checkmark-circle' : 'alert-circle-outline'} size={22} color={ok ? colors.live : colors.gold} />
    </View>
  );
}

function PartyEditor({ party, person, onChange, onRemove, removable }) {
  return (
    <View style={styles.party}>
      <View style={styles.partyTop}>
        <Avatar uri={person?.avatar_url} name={nameOf(person)} size={36} ring={!!person?.is_boa_star} />
        <Text style={styles.partyName} numberOfLines={1}>
          {nameOf(person)}
        </Text>
        <View style={styles.shareBox}>
          <TextInput
            value={String(party.share ?? '')}
            onChangeText={(t) => onChange({ share: t.replace(/[^0-9.]/g, '').slice(0, 6) })}
            keyboardType="decimal-pad"
            selectionColor={colors.gold}
            style={styles.shareInput}
            accessibilityLabel={`${nameOf(person)}'s share`}
            testID={`share-${party.user_id}`}
          />
          <Text style={styles.sharePct}>%</Text>
        </View>
        {removable ? <IconButton icon="close" label={`Remove ${nameOf(person)}`} onPress={onRemove} /> : null}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm, paddingTop: space.md }}>
        {splits.SPLIT_ROLES.map((r) => (
          <Chip key={r} label={r} selected={party.role === r} onPress={() => onChange({ role: r })} />
        ))}
      </ScrollView>
    </View>
  );
}

/**
 * A split sheet: who's on a work and what share each owns. New or a draft
 * you made: edit it. Otherwise: read it, and agree to it. Once everyone has
 * agreed it's signed and can't change.
 */
export default function HubSplitSheetScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { userId, profile } = useHub();
  const id = route.params?.id ?? null;
  const [sheet, setSheet] = useState(null);
  const [people, setPeople] = useState(() => (profile ? { [profile.id]: profile } : {}));
  const [editing, setEditing] = useState(!id);
  const [form, setForm] = useState(() => ({
    title: route.params?.title ?? '',
    workType: 'song',
    notes: '',
    parties: [{ user_id: userId, role: profile?.roles?.includes('music_producer') || profile?.roles?.includes('producer') ? 'Producer' : 'Songwriter', share: '100' }],
  }));
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(id ? 'loading' : 'ready');

  const learn = useCallback((ids) => {
    ids.forEach((uid) =>
      getProfile(uid)
        .then((p) => p && setPeople((m) => ({ ...m, [uid]: p })))
        .catch(() => {}),
    );
  }, []);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const s = await splits.getSheet(id);
      setSheet(s);
      setStatus(s ? 'ready' : 'gone');
      if (s) learn(s.parties.map((p) => p.user_id));
    } catch (err) {
      setStatus('gone');
    }
  }, [id, learn]);
  useEffect(() => {
    load();
  }, [load]);

  // Someone agreeing (or the sheet being signed) shows up at once.
  useEffect(() => {
    if (!supabase || !id) return undefined;
    const channel = ownChannel(`hub:split:${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'split_parties', filter: `sheet_id=eq.${id}` }, load)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'split_sheets', filter: `id=eq.${id}` }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, load]);

  const startEditing = () => {
    setForm({ title: sheet.title, workType: sheet.work_type, notes: sheet.notes ?? '', parties: sheet.parties.map((p) => ({ user_id: p.user_id, role: p.role, share: String(Number(p.share)) })) });
    setEditing(true);
  };

  const setParty = (i, patch) => setForm((f) => ({ ...f, parties: f.parties.map((p, j) => (j === i ? { ...p, ...patch } : p)) }));
  const addParty = (p) => {
    setPicking(false);
    setPeople((m) => ({ ...m, [p.id]: p }));
    setForm((f) => {
      const parties = [...f.parties, { user_id: p.id, role: p.roles?.includes('singer') ? 'Vocalist' : p.roles?.some((r) => r.includes('producer')) ? 'Producer' : 'Songwriter', share: '' }];
      const even = splits.evenShares(parties.length);
      return { ...f, parties: parties.map((x, i) => ({ ...x, share: String(even[i]) })) };
    });
  };
  const evenOut = () => setForm((f) => {
    const even = splits.evenShares(f.parties.length);
    return { ...f, parties: f.parties.map((x, i) => ({ ...x, share: String(even[i]) })) };
  });

  const save = async () => {
    const problem = splits.splitProblem(form);
    if (problem) return Alert.alert('Not yet', problem);
    setBusy(true);
    try {
      if (id) {
        setSheet(await splits.updateSheet(id, form));
        setEditing(false);
      } else {
        const created = await splits.createSheet(userId, form);
        navigation.replace('HubSplitSheet', { id: created.id });
      }
    } catch (err) {
      Alert.alert("Couldn't save", err.message);
    } finally {
      setBusy(false);
    }
  };

  const agree = async () => {
    setBusy(true);
    try {
      const res = await splits.agreeToSheet(id);
      await load();
      if (res?.signed) Alert.alert('Signed', 'Everyone has agreed. This split sheet is now signed.');
    } catch (err) {
      Alert.alert("Couldn't agree", err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = () =>
    Alert.alert('Delete this draft?', 'It goes for everyone on it.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => splits.deleteSheet(id).then(() => navigation.goBack()).catch((e) => Alert.alert("Couldn't delete", e.message)) },
    ]);

  if (status !== 'ready') {
    return (
      <View style={styles.screen}>
        <PageHeader kicker="Splits" title="Split sheet" onBack={() => navigation.goBack()} />
        {status === 'loading' ? <ActivityIndicator color={colors.gold} style={{ marginTop: space.xxxl }} /> : <Text style={[type.bodyMuted, { textAlign: 'center', marginTop: space.xxxl }]}>This split sheet isn't available.</Text>}
      </View>
    );
  }

  if (editing) {
    return (
      <View style={styles.screen} testID="split-editor">
        <PageHeader kicker="Splits" title={id ? 'Edit split' : 'New split sheet'} backIcon="close" onBack={() => (id ? setEditing(false) : navigation.goBack())} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: insets.bottom + space.xxl }} keyboardShouldPersistTaps="handled">
            <Field label="The work" value={form.title} onChangeText={(t) => setForm((f) => ({ ...f, title: t.slice(0, 120) }))} placeholder="Night Bus (feat. Ama)" testID="split-title" />
            <Text style={styles.label}>What it is</Text>
            <View style={styles.chips}>
              {splits.WORK_TYPES.map((w) => (
                <Chip key={w.id} label={w.label} selected={form.workType === w.id} onPress={() => setForm((f) => ({ ...f, workType: w.id }))} />
              ))}
            </View>

            <View style={styles.partiesHead}>
              <Text style={[styles.label, { marginTop: 0, marginBottom: 0, flex: 1 }]}>Who owns what</Text>
              {form.parties.length > 1 ? (
                <Pressable onPress={evenOut} accessibilityRole="button" hitSlop={8}>
                  <Text style={styles.link}>Split evenly</Text>
                </Pressable>
              ) : null}
            </View>
            <ShareBar parties={form.parties.map((p) => ({ ...p, share: splits.parseShare(p.share) || 0 }))} height={10} />
            <View style={{ gap: space.md, marginTop: space.md }}>
              {form.parties.map((p, i) => (
                <PartyEditor key={p.user_id} party={p} person={people[p.user_id]} onChange={(patch) => setParty(i, patch)} removable={p.user_id !== userId} onRemove={() => setForm((f) => ({ ...f, parties: f.parties.filter((_, j) => j !== i) }))} />
              ))}
            </View>
            <Button label="Add a creative" icon="person-add-outline" variant="ghost" onPress={() => setPicking(true)} testID="split-add-party" style={{ marginTop: space.md, alignSelf: 'stretch' }} />
            <TotalMeter parties={form.parties} />
            <Field label="Notes (optional)" value={form.notes} onChangeText={(t) => setForm((f) => ({ ...f, notes: t.slice(0, 1000) }))} placeholder="Publishing and master splits are the same." multiline style={{ marginTop: space.lg }} />
            <Text style={styles.fine}>Saving sends it to everyone on it to agree. Changing a share later clears everyone's agreement.</Text>
            <Button label={busy ? 'Saving' : id ? 'Save changes' : 'Create split sheet'} icon="checkmark" onPress={save} disabled={busy} style={{ marginTop: space.lg, alignSelf: 'stretch' }} />
          </ScrollView>
        </KeyboardAvoidingView>
        <PersonPicker open={picking} onClose={() => setPicking(false)} onPick={addParty} excludeIds={form.parties.map((p) => p.user_id)} />
      </View>
    );
  }

  const signed = sheet.status === 'signed';
  const mineParty = sheet.parties.find((p) => p.user_id === userId);
  const creator = sheet.created_by === userId;
  const work = splits.WORK_TYPES.find((w) => w.id === sheet.work_type)?.label ?? 'Work';
  return (
    <View style={styles.screen} testID="split-sheet">
      <PageHeader
        kicker={`Split sheet · ${work}`}
        title={sheet.title}
        onBack={() => navigation.goBack()}
        right={creator && !signed ? <IconButton icon="create-outline" label="Edit split" onPress={startEditing} testID="split-edit" /> : undefined}
      />
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: insets.bottom + space.xxl }}>
        <Animated.View entering={FadeIn} style={[styles.doc, signed && styles.docSigned]}>
          <LinearGradient colors={signed ? ['rgba(30,215,96,0.12)', 'rgba(255,255,255,0.02)'] : ['rgba(226,168,75,0.14)', 'rgba(255,255,255,0.02)']} style={StyleSheet.absoluteFill} />
          <View style={styles.docTop}>
            <Slate dot color={signed ? colors.live : colors.gold}>
              {signed ? `Signed ${when(sheet.signed_at)}` : 'Awaiting agreement'}
            </Slate>
            <Text style={styles.docDate}>{when(sheet.created_at)}</Text>
          </View>
          <Text style={styles.docTitle}>{sheet.title}</Text>
          <ShareBar parties={sheet.parties} height={12} />
          <View style={{ marginTop: space.lg }}>
            {sheet.parties.map((p, i) => {
              const person = people[p.user_id];
              return (
                <View key={p.id} style={[styles.line, i === sheet.parties.length - 1 && { borderBottomWidth: 0 }]}>
                  <Pressable onPress={() => navigation.navigate('HubProfile', { id: p.user_id })} accessibilityRole="button">
                    <Avatar uri={person?.avatar_url} name={nameOf(person)} size={40} ring={!!person?.is_boa_star} />
                  </Pressable>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.lineName} numberOfLines={1}>
                      {p.user_id === userId ? 'You' : nameOf(person)}
                    </Text>
                    <Text style={styles.lineRole} numberOfLines={1}>
                      {p.role}
                      {person?.roles?.[0] ? ` · ${roleLabel(person.roles[0])}` : ''}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.lineShare}>{Number(p.share)}%</Text>
                    <Text style={[styles.lineAgreed, { color: p.agreed_at ? colors.live : colors.textFaint }]}>{p.agreed_at ? 'Agreed' : 'Pending'}</Text>
                  </View>
                </View>
              );
            })}
          </View>
          {sheet.notes ? <Text style={[type.bodyMuted, { marginTop: space.md }]}>{sheet.notes}</Text> : null}
        </Animated.View>

        {!signed && mineParty && !mineParty.agreed_at ? (
          <Button label={busy ? 'Agreeing' : 'I agree to this split'} icon="checkmark-done" onPress={agree} disabled={busy} style={{ marginTop: space.xl, alignSelf: 'stretch' }} />
        ) : null}
        {!signed && mineParty?.agreed_at ? <Text style={[styles.fine, { textAlign: 'center' }]}>You've agreed. It's signed once everyone else does.</Text> : null}
        <Button label="Invoice for this work" icon="document-text-outline" variant="ghost" onPress={() => navigation.navigate('HubInvoice', { sheetId: sheet.id, title: sheet.title })} style={{ marginTop: space.md, alignSelf: 'stretch' }} />
        {creator && !signed ? <Button label="Delete draft" icon="trash-outline" variant="ghost" onPress={remove} style={{ marginTop: space.md, alignSelf: 'stretch' }} /> : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  label: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1.8, textTransform: 'uppercase', color: colors.textMuted, marginTop: space.lg, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  partiesHead: { flexDirection: 'row', alignItems: 'center', marginTop: space.xl, marginBottom: space.md },
  link: { fontFamily: fonts.semibold, fontSize: 13, color: colors.gold },
  party: { padding: space.md, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  partyTop: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  partyName: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text, flex: 1 },
  shareBox: { flexDirection: 'row', alignItems: 'center', height: 44, paddingHorizontal: space.md, borderRadius: radius.md, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: 'rgba(226,168,75,0.45)' },
  shareInput: { minWidth: 44, color: colors.text, fontFamily: fonts.bold, fontSize: 17, textAlign: 'right', padding: 0 },
  sharePct: { fontFamily: fonts.bold, fontSize: 15, color: colors.gold, marginLeft: 2 },
  meter: { flexDirection: 'row', alignItems: 'center', marginTop: space.lg, padding: space.md, borderRadius: radius.lg, borderWidth: 1, borderColor: 'rgba(226,168,75,0.4)', backgroundColor: 'rgba(18,18,22,0.6)' },
  meterValue: { fontFamily: fonts.bold, fontSize: 24, letterSpacing: -0.6, marginTop: 2 },
  fine: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 18, color: colors.textFaint, marginTop: space.md },
  doc: { padding: space.lg, borderRadius: radius.xl, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(226,168,75,0.4)', backgroundColor: 'rgba(18,18,22,0.7)' },
  docSigned: { borderColor: 'rgba(30,215,96,0.45)' },
  docTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  docDate: { fontFamily: fonts.mono, fontSize: 10, color: colors.textFaint },
  docTitle: { fontFamily: fonts.semibold, fontSize: 22, lineHeight: 27, letterSpacing: -0.6, color: colors.text, marginTop: space.md, marginBottom: space.md },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  lineName: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
  lineRole: { fontFamily: fonts.medium, fontSize: 12.5, color: colors.textMuted, marginTop: 1 },
  lineShare: { fontFamily: fonts.bold, fontSize: 18, color: colors.text },
  lineAgreed: { fontFamily: fonts.semibold, fontSize: 11.5, marginTop: 1 },
});
