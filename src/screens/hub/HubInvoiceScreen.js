import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useHub } from '../../context/HubContext';
import { getProfile } from '../../api/hub';
import * as splits from '../../api/splits';
import { Avatar, Chip, Field, IconButton, PageHeader, Segmented } from '../../components/kit';
import PersonPicker from '../../components/hub/PersonPicker';
import BoaLogo from '../../components/BoaLogo';
import { Button, Slate } from '../../components/ui';
import { colors, fonts, radius, space, type } from '../../theme';

const DUE = [
  { id: 0, label: 'On receipt' },
  { id: 14, label: '14 days' },
  { id: 30, label: '30 days' },
];
const isoIn = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
const nice = (d) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : 'On receipt');

/** The invoice as a document: BOA HUB letterhead, who to, the lines and the total. */
function InvoiceDoc({ inv, issuer }) {
  return (
    <View style={styles.doc} testID="invoice-doc">
      <LinearGradient colors={['rgba(226,168,75,0.16)', 'rgba(255,255,255,0.02)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={styles.docHead}>
        <View style={{ flex: 1 }}>
          <Slate color={colors.gold}>Invoice</Slate>
          <Text style={styles.docNumber}>{inv.number}</Text>
        </View>
        <View style={[styles.stamp, inv.status === 'paid' && styles.stampPaid]}>
          <Text style={[styles.stampText, inv.status === 'paid' && { color: colors.live }]}>{(inv.status ?? 'draft').toUpperCase()}</Text>
        </View>
      </View>
      <View style={styles.parties}>
        <View style={{ flex: 1 }}>
          <Text style={styles.partyLabel}>FROM</Text>
          <Text style={styles.partyName} numberOfLines={2}>
            {issuer ? issuer.display_name || `@${issuer.username}` : ''}
          </Text>
          {issuer?.username ? <Text style={styles.partyDetail}>@{issuer.username} · BOA HUB</Text> : null}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.partyLabel}>TO</Text>
          <Text style={styles.partyName} numberOfLines={2}>
            {inv.client_name}
          </Text>
          {inv.client_email ? (
            <Text style={styles.partyDetail} numberOfLines={1}>
              {inv.client_email}
            </Text>
          ) : null}
        </View>
      </View>
      <Text style={styles.partyLabel}>DUE · {nice(inv.due_date).toUpperCase()}</Text>
      <View style={styles.table}>
        {inv.items.map((i, n) => (
          <View key={n} style={styles.tableRow}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.itemName}>{i.description}</Text>
              <Text style={styles.itemDetail}>
                {i.qty} × {splits.money(i.rate, inv.currency)}
              </Text>
            </View>
            <Text style={styles.itemTotal}>{splits.money(splits.lineTotal(i), inv.currency)}</Text>
          </View>
        ))}
      </View>
      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>Total</Text>
        <Text style={styles.totalValue} numberOfLines={1} adjustsFontSizeToFit>
          {splits.money(inv.total ?? splits.invoiceTotal(inv.items), inv.currency)}
        </Text>
      </View>
      {inv.notes ? <Text style={[type.bodyMuted, { marginTop: space.md }]}>{inv.notes}</Text> : null}
      <View style={styles.docFoot}>
        <BoaLogo height={14} />
        <Text style={styles.footText}>Raised on BOA HUB</Text>
      </View>
    </View>
  );
}

/** A new invoice (optionally for a split sheet's work), or one you've raised or been sent. */
export default function HubInvoiceScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { userId, profile } = useHub();
  const [invoice, setInvoice] = useState(route.params?.invoice ?? null);
  const [issuer, setIssuer] = useState(invoice && invoice.issuer_id !== userId ? null : profile);
  const [form, setForm] = useState({
    number: '',
    client: null,
    clientName: '',
    clientEmail: '',
    currency: 'GBP',
    due: 14,
    notes: '',
    items: [{ description: route.params?.title ? `${route.params.title}: ` : '', qty: '1', rate: '' }],
  });
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (invoice) {
      if (invoice.issuer_id !== userId) getProfile(invoice.issuer_id).then(setIssuer).catch(() => {});
      return;
    }
    splits
      .listInvoices()
      .then((rows) => setForm((f) => ({ ...f, number: splits.nextInvoiceNumber(rows.filter((r) => r.issuer_id === userId)) })))
      .catch(() => setForm((f) => ({ ...f, number: splits.nextInvoiceNumber([]) })));
  }, [invoice, userId]);

  const setItem = (i, patch) => setForm((f) => ({ ...f, items: f.items.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));

  const save = async () => {
    const draft = { clientName: form.clientName, clientEmail: form.clientEmail, items: form.items };
    const problem = splits.invoiceProblem(draft);
    if (problem) return Alert.alert('Not yet', problem);
    setBusy(true);
    try {
      const saved = await splits.createInvoice(userId, {
        number: form.number || splits.nextInvoiceNumber([]),
        clientId: form.client?.id ?? null,
        clientName: form.clientName,
        clientEmail: form.clientEmail,
        sheetId: route.params?.sheetId ?? null,
        items: form.items,
        currency: form.currency,
        notes: form.notes,
        dueDate: form.due ? isoIn(form.due) : null,
      });
      setInvoice(saved);
    } catch (err) {
      Alert.alert("Couldn't save the invoice", err.message);
    } finally {
      setBusy(false);
    }
  };

  if (invoice) {
    const mine = invoice.issuer_id === userId;
    const setStatus = (status) =>
      splits
        .setInvoiceStatus(invoice.id, status)
        .then(setInvoice)
        .catch((e) => Alert.alert("Couldn't update", e.message));
    const remove = () =>
      Alert.alert('Delete this invoice?', "It can't be undone.", [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => splits.deleteInvoice(invoice.id).then(() => navigation.goBack()).catch((e) => Alert.alert("Couldn't delete", e.message)) },
      ]);
    return (
      <View style={styles.screen} testID="invoice-view">
        <PageHeader kicker="Splits · Invoice" title={invoice.number} onBack={() => navigation.goBack()} right={mine ? <IconButton icon="trash-outline" label="Delete invoice" onPress={remove} /> : undefined} />
        <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: insets.bottom + space.xxl }}>
          <InvoiceDoc inv={invoice} issuer={issuer} />
          {mine ? (
            <>
              <Text style={styles.label}>Status</Text>
              <Segmented
                options={[
                  { id: 'draft', label: 'Draft' },
                  { id: 'sent', label: 'Sent' },
                  { id: 'paid', label: 'Paid' },
                ]}
                value={invoice.status}
                onChange={setStatus}
              />
            </>
          ) : null}
          <Button
            label="Share invoice"
            icon="share-outline"
            onPress={() => Share.share({ title: `Invoice ${invoice.number}`, message: splits.invoiceText(invoice, issuer) }).catch(() => {})}
            style={{ marginTop: space.xl, alignSelf: 'stretch' }}
          />
        </ScrollView>
      </View>
    );
  }

  const total = splits.invoiceTotal(form.items);
  return (
    <View style={styles.screen} testID="invoice-editor">
      <PageHeader kicker="Splits" title="New invoice" backIcon="close" onBack={() => navigation.goBack()} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: insets.bottom + space.xxl }} keyboardShouldPersistTaps="handled">
          <Text style={[styles.label, { marginTop: 0 }]}>Bill to</Text>
          {form.client ? (
            <View style={styles.client}>
              <Avatar uri={form.client.avatar_url} name={form.client.display_name || form.client.username} size={40} />
              <Text style={styles.clientName} numberOfLines={1}>
                {form.client.display_name || `@${form.client.username}`}
              </Text>
              <IconButton icon="close" label="Clear" onPress={() => setForm((f) => ({ ...f, client: null, clientName: '' }))} />
            </View>
          ) : (
            <Pressable onPress={() => setPicking(true)} accessibilityRole="button" style={({ pressed }) => [styles.client, pressed && { opacity: 0.8 }]}>
              <Ionicons name="person-add-outline" size={18} color={colors.gold} />
              <Text style={[styles.clientName, { color: colors.gold }]}>Choose someone on the Hub</Text>
            </Pressable>
          )}
          {!form.client ? <Field label="Or their name" value={form.clientName} onChangeText={(t) => setForm((f) => ({ ...f, clientName: t.slice(0, 120) }))} placeholder="Northside Records Ltd" style={{ marginTop: space.md }} testID="invoice-client" /> : null}
          <Field label="Their email (optional)" value={form.clientEmail} onChangeText={(t) => setForm((f) => ({ ...f, clientEmail: t.slice(0, 200) }))} placeholder="accounts@label.com" autoCapitalize="none" keyboardType="email-address" style={{ marginTop: space.md }} />

          <Text style={styles.label}>Currency</Text>
          <View style={styles.chips}>
            {splits.CURRENCIES.map((c) => (
              <Chip key={c.id} label={`${c.symbol} ${c.id}`} selected={form.currency === c.id} onPress={() => setForm((f) => ({ ...f, currency: c.id }))} />
            ))}
          </View>

          <Text style={styles.label}>The work</Text>
          <View style={{ gap: space.md }}>
            {form.items.map((item, i) => (
              <View key={i} style={styles.item}>
                <TextInput value={item.description} onChangeText={(t) => setItem(i, { description: t.slice(0, 200) })} placeholder="Mix and master, 1 track" placeholderTextColor={colors.textFaint} selectionColor={colors.gold} style={styles.itemInput} testID={`item-desc-${i}`} />
                <View style={styles.itemRow}>
                  <View style={styles.small}>
                    <Text style={styles.smallLabel}>Qty</Text>
                    <TextInput value={item.qty} onChangeText={(t) => setItem(i, { qty: t.replace(/[^0-9.]/g, '').slice(0, 6) })} keyboardType="decimal-pad" selectionColor={colors.gold} style={styles.smallInput} testID={`item-qty-${i}`} />
                  </View>
                  <View style={[styles.small, { flex: 1 }]}>
                    <Text style={styles.smallLabel}>Rate ({splits.symbolOf(form.currency)})</Text>
                    <TextInput value={item.rate} onChangeText={(t) => setItem(i, { rate: t.replace(/[^0-9.]/g, '').slice(0, 10) })} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.textFaint} selectionColor={colors.gold} style={styles.smallInput} testID={`item-rate-${i}`} />
                  </View>
                  <Text style={styles.itemSum} numberOfLines={1}>
                    {splits.money(splits.lineTotal(item), form.currency)}
                  </Text>
                  {form.items.length > 1 ? <IconButton icon="close" label="Remove line" onPress={() => setForm((f) => ({ ...f, items: f.items.filter((_, j) => j !== i) }))} /> : null}
                </View>
              </View>
            ))}
          </View>
          <Button label="Add a line" icon="add" variant="ghost" onPress={() => setForm((f) => ({ ...f, items: [...f.items, { description: '', qty: '1', rate: '' }] }))} style={{ marginTop: space.md, alignSelf: 'stretch' }} />

          <Text style={styles.label}>Due</Text>
          <View style={styles.chips}>
            {DUE.map((d) => (
              <Chip key={d.id} label={d.label} selected={form.due === d.id} onPress={() => setForm((f) => ({ ...f, due: d.id }))} />
            ))}
          </View>
          <Field label="Notes (optional)" value={form.notes} onChangeText={(t) => setForm((f) => ({ ...f, notes: t.slice(0, 1000) }))} placeholder="Bank details, or how you'd like to be paid." multiline style={{ marginTop: space.lg }} />

          <View style={styles.summary}>
            <View style={{ flex: 1 }}>
              <Slate>{form.number || 'Invoice'}</Slate>
              <Text style={styles.summaryTotal} numberOfLines={1} adjustsFontSizeToFit testID="invoice-total">
                {splits.money(total, form.currency)}
              </Text>
            </View>
            <Button label={busy ? 'Saving' : 'Create invoice'} icon="document-text" onPress={save} disabled={busy} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      <PersonPicker
        open={picking}
        title="Bill someone on the Hub"
        onClose={() => setPicking(false)}
        excludeIds={[userId]}
        onPick={(p) => {
          setPicking(false);
          setForm((f) => ({ ...f, client: p, clientName: p.display_name || `@${p.username}` }));
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  label: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1.8, textTransform: 'uppercase', color: colors.textMuted, marginTop: space.xl, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  client: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 56, paddingHorizontal: space.md, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: 'rgba(226,168,75,0.35)' },
  clientName: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text, flex: 1 },
  item: { padding: space.md, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  itemInput: { fontFamily: fonts.medium, fontSize: 15.5, color: colors.text, paddingVertical: 6 },
  itemRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space.md, marginTop: space.sm },
  small: { minWidth: 64 },
  smallLabel: { fontFamily: fonts.mono, fontSize: 9, letterSpacing: 1.2, textTransform: 'uppercase', color: colors.textFaint, marginBottom: 4 },
  smallInput: { height: 40, paddingHorizontal: space.sm, borderRadius: radius.sm, backgroundColor: colors.surfaceRaised, color: colors.text, fontFamily: fonts.semibold, fontSize: 15 },
  itemSum: { fontFamily: fonts.bold, fontSize: 15, color: colors.text, paddingBottom: 10, maxWidth: 120 },
  summary: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.xl, padding: space.lg, borderRadius: radius.xl, borderWidth: 1, borderColor: 'rgba(226,168,75,0.45)', backgroundColor: 'rgba(18,18,22,0.7)' },
  summaryTotal: { fontFamily: fonts.bold, fontSize: 26, letterSpacing: -0.8, color: colors.text, marginTop: 2 },
  doc: { padding: space.lg, borderRadius: radius.xl, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(226,168,75,0.4)', backgroundColor: 'rgba(18,18,22,0.75)' },
  docHead: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  docNumber: { fontFamily: fonts.semibold, fontSize: 22, letterSpacing: -0.6, color: colors.text, marginTop: 4 },
  stamp: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.sm, borderWidth: 1.5, borderColor: 'rgba(226,168,75,0.7)', transform: [{ rotate: '-4deg' }] },
  stampPaid: { borderColor: 'rgba(30,215,96,0.7)' },
  stampText: { fontFamily: fonts.monoMedium, fontSize: 11, letterSpacing: 2, color: colors.gold },
  parties: { flexDirection: 'row', gap: space.lg, marginTop: space.xl, marginBottom: space.lg },
  partyLabel: { fontFamily: fonts.mono, fontSize: 9.5, letterSpacing: 1.8, color: colors.textFaint },
  partyName: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text, marginTop: 4 },
  partyDetail: { fontFamily: fonts.medium, fontSize: 12, color: colors.textMuted, marginTop: 2 },
  table: { marginTop: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderStrong },
  tableRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  itemName: { fontFamily: fonts.semibold, fontSize: 14.5, color: colors.text },
  itemDetail: { fontFamily: fonts.medium, fontSize: 12, color: colors.textMuted, marginTop: 2 },
  itemTotal: { fontFamily: fonts.bold, fontSize: 15, color: colors.text },
  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md, marginTop: space.lg },
  totalLabel: { fontFamily: fonts.semibold, fontSize: 15, color: colors.textMuted },
  totalValue: { fontFamily: fonts.bold, fontSize: 28, letterSpacing: -1, color: colors.gold, flexShrink: 1 },
  docFoot: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.xl, opacity: 0.7 },
  footText: { fontFamily: fonts.mono, fontSize: 9.5, letterSpacing: 1.4, color: colors.textFaint },
});
