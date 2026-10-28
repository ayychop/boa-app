import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useHub } from '../../context/HubContext';
import { listInvoices, listSheets, money, sheetStatus, WORK_TYPES } from '../../api/splits';
import { PageHeader, Segmented } from '../../components/kit';
import { Slate } from '../../components/ui';
import { colors, fonts, radius, space, type } from '../../theme';
import { CardsSkeleton } from '../../components/Skeleton';

const TONE = { signed: colors.live, you: colors.gold, others: colors.textMuted };

/** A share bar: each party's slice in its own shade of gold. */
export function ShareBar({ parties, height = 8 }) {
  const shades = [colors.gold, '#F6D38A', colors.goldDeep, '#C98F3A', '#FFE6A8', '#7A5420'];
  return (
    <View style={[styles.bar, { height, borderRadius: height / 2 }]}>
      {parties.map((p, i) => (
        <View key={p.id ?? i} style={{ flex: Math.max(0.0001, Number(p.share) || 0), backgroundColor: shades[i % shades.length] }} />
      ))}
    </View>
  );
}

function SheetCard({ sheet, myId, onPress, index }) {
  const s = sheetStatus(sheet, myId);
  const work = WORK_TYPES.find((w) => w.id === sheet.work_type)?.label ?? 'Work';
  return (
    <Animated.View
      entering={FadeInDown.delay(Math.min(index, 6) * 50)
        .springify()
        .damping(18)}
    >
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${sheet.title}, ${s.label}`}
        style={({ pressed }) => [styles.card, pressed && { transform: [{ scale: 0.98 }] }]}
        testID={`sheet-${sheet.id}`}
      >
        <LinearGradient colors={['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.02)']} style={StyleSheet.absoluteFill} />
        <View style={styles.cardTop}>
          <Text style={styles.cardKicker}>{work.toUpperCase()}</Text>
          <View style={[styles.status, { borderColor: TONE[s.tone] }]}>
            <Ionicons name={s.tone === 'signed' ? 'checkmark-circle' : 'time-outline'} size={12} color={TONE[s.tone]} />
            <Text style={[styles.statusText, { color: TONE[s.tone] }]}>{s.label}</Text>
          </View>
        </View>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {sheet.title}
        </Text>
        <ShareBar parties={sheet.parties} />
        <Text style={styles.cardDetail} numberOfLines={1}>
          {sheet.parties.map((p) => `${p.role} ${Number(p.share)}%`).join('  ·  ')}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

function InvoiceCard({ invoice, myId, onPress, index }) {
  const incoming = invoice.issuer_id !== myId;
  return (
    <Animated.View
      entering={FadeInDown.delay(Math.min(index, 6) * 50)
        .springify()
        .damping(18)}
    >
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Invoice ${invoice.number}`}
        style={({ pressed }) => [styles.card, styles.invoice, pressed && { transform: [{ scale: 0.98 }] }]}
        testID={`invoice-${invoice.id}`}
      >
        <View style={styles.invoiceIcon}>
          <Ionicons name={incoming ? 'arrow-down' : 'document-text'} size={18} color={colors.gold} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.invoiceTitle} numberOfLines={1}>
            {incoming ? 'To you' : invoice.client_name}
          </Text>
          <Text style={styles.cardDetail} numberOfLines={1}>
            {invoice.number} · {invoice.status === 'paid' ? 'Paid' : invoice.status === 'sent' ? 'Sent' : 'Draft'}
          </Text>
        </View>
        <Text style={styles.amount} numberOfLines={1}>
          {money(invoice.total, invoice.currency)}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

/**
 * Splits: your split sheets (who owns what share of a work, agreed by
 * everyone on it) and the invoices you've raised or been sent.
 */
export default function HubSplitsScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { userId } = useHub();
  const [view, setView] = useState('sheets');
  const [data, setData] = useState({ sheets: [], invoices: [], status: 'loading', error: null });
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [sheets, invoices] = await Promise.all([listSheets(), listInvoices()]);
      setData({ sheets, invoices, status: 'ready', error: null });
    } catch (err) {
      setData((d) => ({ ...d, status: 'error', error: err.message }));
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
  const sheets = view === 'sheets';
  const list = sheets ? data.sheets : data.invoices;
  const waiting = data.sheets.filter((s) => sheetStatus(s, userId).tone === 'you').length;
  const owed = data.invoices.filter((i) => i.issuer_id === userId && i.status !== 'paid');

  return (
    <View style={styles.screen} testID="hub-splits">
      <PageHeader kicker="Creative Hub · Money" title="Splits" onBack={() => navigation.goBack()} />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: insets.bottom + space.xxl }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
            tintColor={colors.gold}
          />
        }
      >
        <View style={styles.hero}>
          <LinearGradient colors={['rgba(226,168,75,0.22)', 'rgba(255,255,255,0.02)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          <Slate dot color={colors.gold}>
            Get it in writing
          </Slate>
          <Text style={styles.heroTitle}>Agree the split before the drop.</Text>
          <Text style={styles.heroBody}>Make a split sheet with everyone on the track, then invoice for the work. Signed once every party agrees.</Text>
          <View style={styles.heroStats}>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatValue}>{waiting}</Text>
              <Text style={styles.heroStatLabel}>Waiting on you</Text>
            </View>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatValue} numberOfLines={1} adjustsFontSizeToFit>
                {owed.length
                  ? money(
                      owed.reduce((s, i) => s + Number(i.total), 0),
                      owed[0].currency,
                    )
                  : money(0)}
              </Text>
              <Text style={styles.heroStatLabel}>Outstanding</Text>
            </View>
          </View>
          <View style={styles.heroActions}>
            <Pressable
              onPress={() => navigation.navigate('HubSplitSheet', {})}
              accessibilityRole="button"
              style={({ pressed }) => [styles.heroBtn, styles.heroBtnGold, pressed && { opacity: 0.85 }]}
              testID="splits-new-sheet"
            >
              <Ionicons name="pie-chart" size={16} color={colors.bg} />
              <Text style={[styles.heroBtnText, { color: colors.bg }]}>New split sheet</Text>
            </Pressable>
            <Pressable
              onPress={() => navigation.navigate('HubInvoice', {})}
              accessibilityRole="button"
              style={({ pressed }) => [styles.heroBtn, pressed && { opacity: 0.85 }]}
              testID="splits-new-invoice"
            >
              <Ionicons name="document-text-outline" size={16} color={colors.text} />
              <Text style={styles.heroBtnText}>New invoice</Text>
            </Pressable>
          </View>
        </View>

        <Segmented
          options={[
            { id: 'sheets', label: `Split sheets${data.sheets.length ? ` · ${data.sheets.length}` : ''}`, icon: 'pie-chart-outline' },
            { id: 'invoices', label: `Invoices${data.invoices.length ? ` · ${data.invoices.length}` : ''}`, icon: 'document-text-outline' },
          ]}
          value={view}
          onChange={setView}
        />
        <View style={{ marginTop: space.lg, gap: space.md }}>
          {data.status === 'loading' ? (
            <CardsSkeleton count={3} height={120} style={{ paddingHorizontal: 0, alignSelf: 'stretch' }} />
          ) : data.status === 'error' ? (
            <Text style={[type.bodyMuted, { textAlign: 'center' }]}>{data.error}</Text>
          ) : !list.length ? (
            <View style={styles.empty} testID={`splits-empty-${view}`}>
              <Ionicons name={sheets ? 'pie-chart-outline' : 'document-text-outline'} size={28} color={colors.gold} />
              <Text style={[type.title, { marginTop: space.md, textAlign: 'center' }]}>{sheets ? 'No split sheets yet' : 'No invoices yet'}</Text>
              <Text style={[type.bodyMuted, { marginTop: space.sm, textAlign: 'center' }]}>
                {sheets ? 'Producer and singer, director and editor: settle who owns what while the work is fresh.' : 'Bill for a session, a mix or a shoot in under a minute.'}
              </Text>
            </View>
          ) : sheets ? (
            data.sheets.map((s, i) => <SheetCard key={s.id} sheet={s} myId={userId} index={i} onPress={() => navigation.navigate('HubSplitSheet', { id: s.id })} />)
          ) : (
            data.invoices.map((inv, i) => <InvoiceCard key={inv.id} invoice={inv} myId={userId} index={i} onPress={() => navigation.navigate('HubInvoice', { invoice: inv })} />)
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  hero: {
    padding: space.xl,
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(226,168,75,0.4)',
    backgroundColor: 'rgba(18,18,22,0.6)',
    marginBottom: space.xl,
  },
  heroTitle: { fontFamily: fonts.semibold, fontSize: 26, lineHeight: 31, letterSpacing: -1, color: colors.text, marginTop: space.md },
  heroBody: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 21, color: colors.textMuted, marginTop: space.sm },
  heroStats: { flexDirection: 'row', gap: space.md, marginTop: space.lg },
  heroStat: { flex: 1, padding: space.md, borderRadius: radius.md, backgroundColor: 'rgba(5,5,6,0.45)', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  heroStatValue: { fontFamily: fonts.bold, fontSize: 20, color: colors.text, letterSpacing: -0.5 },
  heroStatLabel: { fontFamily: fonts.medium, fontSize: 12, color: colors.textMuted, marginTop: 2 },
  heroActions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.lg },
  heroBtn: {
    flexGrow: 1,
    height: 44,
    flexDirection: 'row',
    gap: 7,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  heroBtnGold: { backgroundColor: colors.gold, borderColor: colors.gold, boxShadow: '0px 6px 20px rgba(226,168,75,0.35)' },
  heroBtnText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.text },
  card: {
    padding: space.lg,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(18,18,22,0.7)',
    gap: space.sm,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  cardKicker: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1.8, color: colors.textMuted },
  status: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, borderWidth: 1 },
  statusText: { fontFamily: fonts.semibold, fontSize: 11.5 },
  cardTitle: { fontFamily: fonts.semibold, fontSize: 18, letterSpacing: -0.4, color: colors.text },
  cardDetail: { fontFamily: fonts.medium, fontSize: 12.5, color: colors.textMuted },
  bar: { flexDirection: 'row', overflow: 'hidden', backgroundColor: colors.surfaceRaised, gap: 2 },
  invoice: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  invoiceIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.goldSoft },
  invoiceTitle: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
  amount: { fontFamily: fonts.bold, fontSize: 16, color: colors.text, maxWidth: '40%' },
  empty: { alignItems: 'center', padding: space.xl, borderRadius: radius.xl, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(226,168,75,0.35)', backgroundColor: 'rgba(18,18,22,0.6)' },
});
