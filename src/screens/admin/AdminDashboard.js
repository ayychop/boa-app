import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useHub } from '../../context/HubContext';
import * as admin from '../../api/admin';
import { formatBudget } from '../../api/casting';
import { ROLES } from '../../api/hub';
import BottomSheet from '../../components/BottomSheet';
import { Avatar, BoaStarBadge, Field, PageHeader, Toggle } from '../../components/kit';
import { Button, PulseDot } from '../../components/ui';
import { haptics } from '../../utils/haptics';
import { colors, fonts, radius, space, type } from '../../theme';

const TABS = [
  { id: 'talent', label: 'Talent', icon: 'star-outline' },
  { id: 'moderation', label: 'Moderation', icon: 'shield-outline' },
  { id: 'casting', label: 'Casting', icon: 'film-outline' },
  { id: 'pulse', label: 'Pulse', icon: 'pulse-outline' },
];
const MONO_GOLD = 'rgba(226,168,75,0.9)';
const roleLabel = (id) => ROLES.find((r) => r.id === id)?.label ?? id;
const nameOf = (p) => (p ? p.display_name || `@${p.username}` : 'Deleted account');

// The control room's backdrop: a faint grid and a gold horizon glow.
function Grid() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {Array.from({ length: 24 }, (_, i) => (
        <View key={`h${i}`} style={[styles.gridLine, { top: i * 44, left: 0, right: 0, height: StyleSheet.hairlineWidth }]} />
      ))}
      {Array.from({ length: 12 }, (_, i) => (
        <View key={`v${i}`} style={[styles.gridLine, { left: i * 44, top: 0, bottom: 0, width: StyleSheet.hairlineWidth }]} />
      ))}
      <LinearGradient colors={['rgba(226,168,75,0.14)', 'rgba(5,5,6,0)']} locations={[0, 0.5]} style={StyleSheet.absoluteFill} />
    </View>
  );
}

function Readout({ label, value, tone = colors.text, testID }) {
  return (
    <View style={styles.readout} testID={testID}>
      <Text style={[styles.readoutValue, { color: tone }]}>{value ?? '--'}</Text>
      <Text style={styles.readoutLabel}>{label}</Text>
    </View>
  );
}

function Panel({ children, style, testID }) {
  return (
    <Animated.View entering={FadeInDown.springify().damping(20)} style={[styles.panel, style]} testID={testID}>
      {children}
    </Animated.View>
  );
}

function Action({ label, icon, onPress, tone = colors.text, testID }) {
  return (
    <Pressable
      onPress={() => {
        haptics.selection();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      style={({ pressed }) => [styles.action, { borderColor: tone }, pressed && { opacity: 0.7 }]}
    >
      <Ionicons name={icon} size={14} color={tone} />
      <Text style={[styles.actionText, { color: tone }]}>{label}</Text>
    </Pressable>
  );
}

// ------------------------------------------------------------ the sections

function TalentDirectory({ users, query, setQuery, onToggleStar }) {
  return (
    <>
      <Field value={query} onChangeText={setQuery} placeholder="Search by name or @username" autoCapitalize="none" testID="admin-search" />
      {users.map((u) => (
        <Panel key={u.id} testID={`admin-user-${u.username}`}>
          <View style={styles.userRow}>
            <Avatar uri={u.avatar_url} name={nameOf(u)} size={52} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={styles.nameRow}>
                <Text style={styles.name} numberOfLines={1}>
                  {nameOf(u)}
                </Text>
                {u.is_boa_star ? <BoaStarBadge size={16} /> : null}
              </View>
              <Text style={styles.mono} numberOfLines={1}>
                @{u.username}
                {u.banned_at ? ' · BANNED' : ''}
              </Text>
              <Text style={styles.sub} numberOfLines={1}>
                {u.roles?.length ? u.roles.map(roleLabel).join(' · ') : 'No roles yet'}
              </Text>
            </View>
          </View>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>Badge as BOA Star</Text>
            <Toggle value={!!u.is_boa_star} onChange={(v) => onToggleStar(u, v)} label={`Badge ${nameOf(u)} as BOA Star`} testID={`admin-star-${u.username}`} />
          </View>
        </Panel>
      ))}
      {users.length === 0 ? <Text style={styles.empty}>No members match.</Text> : null}
    </>
  );
}

const REPORT_TONE = { open: '#FF6B6B', reviewing: colors.gold, actioned: colors.live, dismissed: colors.textFaint };

function Moderation({ reports, onBan, onDismiss, onUnban }) {
  if (reports.length === 0) return <Text style={styles.empty}>No reports. All quiet.</Text>;
  return reports.map((r) => (
    <Panel key={r.id} testID={`admin-report-${r.id}`}>
      <View style={styles.nameRow}>
        <PulseDot color={REPORT_TONE[r.status]} size={7} />
        <Text style={[styles.mono, { color: REPORT_TONE[r.status] }]}>
          {r.status.toUpperCase()} · {r.reason.toUpperCase()}
        </Text>
      </View>
      <Text style={styles.name}>
        {nameOf(r.reported)} <Text style={styles.sub}>reported by {nameOf(r.reporter)}</Text>
      </Text>
      {r.message_excerpt ? (
        <View style={styles.quote}>
          <Text style={styles.quoteText}>{`"${r.message_excerpt}"`}</Text>
        </View>
      ) : null}
      {r.details ? <Text style={styles.sub}>{r.details}</Text> : null}
      <View style={styles.actions}>
        {r.reported && !r.reported.banned_at ? (
          <Action label="Ban user" icon="ban" tone="#FF6B6B" onPress={() => onBan(r)} testID={`admin-ban-${r.id}`} />
        ) : null}
        {r.reported?.banned_at ? <Action label="Lift ban" icon="refresh" onPress={() => onUnban(r)} testID={`admin-unban-${r.id}`} /> : null}
        {r.status !== 'dismissed' && r.status !== 'actioned' ? (
          <Action label="Dismiss" icon="close" tone={colors.textMuted} onPress={() => onDismiss(r)} testID={`admin-dismiss-${r.id}`} />
        ) : null}
      </View>
    </Panel>
  ));
}

function CastingManager({ calls, onApprove, onEdit, onDelete }) {
  if (calls.length === 0) return <Text style={styles.empty}>No casting calls yet.</Text>;
  return calls.map((c) => (
    <Panel key={c.id} testID={`admin-call-${c.id}`}>
      <View style={styles.nameRow}>
        <PulseDot color={c.approved ? colors.live : colors.gold} size={7} />
        <Text style={[styles.mono, { color: c.approved ? colors.live : colors.gold }]}>
          {c.is_boa_original ? 'BOA ORIGINAL' : formatBudget(c.budget_amount)} · {c.approved ? 'LIVE' : 'AWAITING REVIEW'}
          {c.is_open ? '' : ' · CLOSED'}
        </Text>
      </View>
      <Text style={styles.name}>{c.title}</Text>
      <Text style={styles.sub}>
        {c.role_needed} · {c.location}
      </Text>
      <View style={styles.actions}>
        <Action
          label={c.approved ? 'Unpublish' : 'Approve'}
          icon={c.approved ? 'eye-off-outline' : 'checkmark-done'}
          tone={c.approved ? colors.textMuted : colors.live}
          onPress={() => onApprove(c, !c.approved)}
          testID={`admin-approve-${c.id}`}
        />
        <Action label="Edit" icon="create-outline" onPress={() => onEdit(c)} testID={`admin-edit-${c.id}`} />
        <Action label="Delete" icon="trash-outline" tone="#FF6B6B" onPress={() => onDelete(c)} testID={`admin-delete-${c.id}`} />
      </View>
    </Panel>
  ));
}

function PulseManager({ users, onToggleFeature }) {
  const sorted = [...users].sort((a, b) => Number(b.is_featured) - Number(a.is_featured));
  return sorted.map((u) => (
    <Panel key={u.id} testID={`admin-pulse-${u.username}`}>
      <View style={styles.userRow}>
        <Avatar uri={u.avatar_url} name={nameOf(u)} size={44} ring={u.is_featured} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.name} numberOfLines={1}>
            {nameOf(u)}
          </Text>
          <Text style={styles.mono}>{u.is_featured ? 'FEATURED IN THE PULSE' : u.visible_on_hub ? 'NOT FEATURED' : 'HIDDEN FROM HUB'}</Text>
        </View>
        <Toggle value={!!u.is_featured} onChange={(v) => onToggleFeature(u, v)} label={`Feature ${nameOf(u)}`} testID={`admin-feature-${u.username}`} />
      </View>
    </Panel>
  ));
}

function EditCallSheet({ call, onClose, onSave }) {
  const [form, setForm] = useState(null);
  useEffect(() => {
    if (call) setForm({ title: call.title, description: call.description, location: call.location, is_open: call.is_open });
  }, [call]);
  return (
    <BottomSheet open={!!call} onClose={onClose} dragAnywhere={false}>
      {call && form ? (
        <ScrollView contentContainerStyle={{ paddingHorizontal: space.xl, paddingBottom: space.xl }} keyboardShouldPersistTaps="handled">
          <Text style={styles.mono}>EDIT CASTING CALL</Text>
          <Field label="Title" value={form.title} onChangeText={(t) => setForm((f) => ({ ...f, title: t }))} testID="admin-edit-title" style={{ marginTop: space.lg }} />
          <Field label="Location" value={form.location} onChangeText={(t) => setForm((f) => ({ ...f, location: t }))} style={{ marginTop: space.lg }} />
          <Field label="Description" value={form.description} onChangeText={(t) => setForm((f) => ({ ...f, description: t }))} multiline style={{ marginTop: space.lg }} />
          <View style={[styles.toggleRow, { marginTop: space.lg }]}>
            <Text style={styles.toggleLabel}>Open for applications</Text>
            <Toggle value={form.is_open} onChange={(v) => setForm((f) => ({ ...f, is_open: v }))} label="Open for applications" />
          </View>
          <Button label="Save changes" icon="checkmark" onPress={() => onSave(call, form)} style={{ marginTop: space.xl }} />
        </ScrollView>
      ) : null}
    </BottomSheet>
  );
}

/**
 * The Admin Portal: BOA's control room. Talent (search every member, badge
 * BOA Stars), Moderation (reports: ban or dismiss), Casting (approve, edit,
 * delete) and the Community Pulse (who's featured). Only for admins; the
 * database refuses everyone else's admin calls whatever the app shows.
 */
export default function AdminDashboard({ navigation }) {
  const insets = useSafeAreaInsets();
  const { isAdmin } = useHub();
  const [tab, setTab] = useState('talent');
  const [query, setQuery] = useState('');
  const [data, setData] = useState({ users: [], reports: [], calls: [], ready: false });
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    try {
      const [users, reports, calls] = await Promise.all([admin.listUsers(query), admin.listReports(), admin.listAllCalls()]);
      setData({ users, reports, calls, ready: true });
      setError(null);
    } catch (err) {
      setError(err.message);
      setData((d) => ({ ...d, ready: true }));
    }
  }, [query]);

  useEffect(() => {
    if (!isAdmin) return undefined;
    const t = setTimeout(load, query ? 300 : 0);
    return () => clearTimeout(t);
  }, [isAdmin, load, query]);

  // Every change: do it, then show the room as it now is.
  const run = async (fn) => {
    try {
      await fn();
      haptics.success();
      await load();
    } catch (err) {
      Alert.alert("Couldn't do that", err.message);
    }
  };

  if (!isAdmin) {
    return (
      <View style={[styles.screen, styles.locked]} testID="admin-locked">
        <Ionicons name="lock-closed" size={30} color={colors.gold} />
        <Text style={[type.title, { marginTop: space.md }]}>Admins only</Text>
        <Text style={[type.bodyMuted, { textAlign: 'center', marginTop: space.sm }]}>This room is for the BOA team.</Text>
        <Button label="Go back" icon="arrow-back" variant="ghost" onPress={() => navigation.goBack()} style={{ marginTop: space.xl }} />
      </View>
    );
  }

  const openReports = data.reports.filter((r) => r.status === 'open' || r.status === 'reviewing').length;
  const pending = data.calls.filter((c) => !c.approved).length;
  const stars = data.users.filter((u) => u.is_boa_star).length;
  const featured = data.users.filter((u) => u.is_featured).length;

  return (
    <View style={styles.screen} testID="admin-dashboard">
      <Grid />
      <PageHeader kicker="BOA Control Room" title="Admin Portal" onBack={() => navigation.goBack()} />
      <View style={styles.readouts}>
        <Readout label="OPEN REPORTS" value={data.ready ? openReports : null} tone={openReports ? '#FF6B6B' : colors.live} testID="admin-count-reports" />
        <Readout label="AWAITING REVIEW" value={data.ready ? pending : null} tone={pending ? colors.gold : colors.text} testID="admin-count-pending" />
        <Readout label="BOA STARS" value={data.ready ? stars : null} tone={colors.gold} />
        <Readout label="FEATURED" value={data.ready ? featured : null} />
      </View>
      <View style={styles.tabs}>
        {TABS.map((t) => {
          const on = t.id === tab;
          return (
            <Pressable
              key={t.id}
              onPress={() => setTab(t.id)}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              testID={`admin-tab-${t.id}`}
              style={[styles.tab, on && styles.tabOn]}
            >
              <Ionicons name={t.icon} size={15} color={on ? colors.bg : MONO_GOLD} />
              <Text style={[styles.tabText, on && { color: colors.bg }]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <ScrollView
        contentContainerStyle={{ padding: space.lg, paddingBottom: insets.bottom + space.xxl, gap: space.md }}
        keyboardShouldPersistTaps="handled"
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
        {!data.ready ? (
          <ActivityIndicator color={colors.gold} style={{ marginTop: space.xxl }} />
        ) : error ? (
          <Animated.View entering={FadeIn}>
            <Text style={styles.empty}>The control room couldn't load: {error}</Text>
          </Animated.View>
        ) : tab === 'talent' ? (
          <TalentDirectory
            users={data.users}
            query={query}
            setQuery={setQuery}
            onToggleStar={(u, star) => run(() => admin.setBoaStar(u.id, star))}
          />
        ) : tab === 'moderation' ? (
          <Moderation
            reports={data.reports}
            onDismiss={(r) => run(() => admin.setReportStatus(r.id, 'dismissed'))}
            onUnban={(r) => run(() => admin.setBanned(r.reported.id, false))}
            onBan={(r) =>
              Alert.alert(`Ban ${nameOf(r.reported)}?`, "They won't be able to message, post gigs or apply, and they leave the directory. You can lift it later.", [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Ban',
                  style: 'destructive',
                  onPress: () =>
                    run(async () => {
                      await admin.setBanned(r.reported.id, true);
                      await admin.setReportStatus(r.id, 'actioned');
                    }),
                },
              ])
            }
          />
        ) : tab === 'casting' ? (
          <CastingManager
            calls={data.calls}
            onApprove={(c, approved) => run(() => admin.setCallApproved(c.id, approved))}
            onEdit={setEditing}
            onDelete={(c) =>
              Alert.alert(`Delete "${c.title}"?`, 'Its applications are deleted with it.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: () => run(() => admin.deleteCall(c.id)) },
              ])
            }
          />
        ) : (
          <PulseManager users={data.users} onToggleFeature={(u, f) => run(() => admin.setFeatured(u.id, f))} />
        )}
      </ScrollView>
      <EditCallSheet
        call={editing}
        onClose={() => setEditing(null)}
        onSave={(c, form) =>
          run(async () => {
            await admin.updateCall(c.id, form);
            setEditing(null);
          })
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#030304' },
  locked: { alignItems: 'center', justifyContent: 'center', padding: space.xl },
  gridLine: { position: 'absolute', backgroundColor: 'rgba(226,168,75,0.07)' },
  readouts: { flexDirection: 'row', gap: space.sm, paddingHorizontal: space.lg },
  readout: {
    flex: 1,
    paddingVertical: space.md,
    paddingHorizontal: space.sm,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(226,168,75,0.35)',
    backgroundColor: 'rgba(12,12,14,0.8)',
  },
  readoutValue: { fontFamily: fonts.mono, fontSize: 22, fontVariant: ['tabular-nums'] },
  readoutLabel: { fontFamily: fonts.mono, fontSize: 8.5, letterSpacing: 1.2, color: colors.textFaint, marginTop: 4 },
  tabs: { flexDirection: 'row', gap: space.xs, paddingHorizontal: space.lg, marginTop: space.lg },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    height: 38,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(226,168,75,0.4)',
  },
  tabOn: { backgroundColor: colors.gold, borderColor: colors.gold, boxShadow: '0px 0px 16px rgba(226,168,75,0.45)' },
  tabText: { fontFamily: fonts.semibold, fontSize: 12, color: MONO_GOLD },
  panel: {
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(226,168,75,0.28)',
    backgroundColor: 'rgba(12,12,14,0.86)',
    gap: 6,
  },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontFamily: fonts.semibold, fontSize: 16, color: colors.text, flexShrink: 1 },
  mono: { fontFamily: fonts.mono, fontSize: 10.5, letterSpacing: 1.2, color: MONO_GOLD },
  sub: { fontFamily: fonts.medium, fontSize: 12.5, color: colors.textMuted },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.sm },
  toggleLabel: { fontFamily: fonts.semibold, fontSize: 13.5, color: colors.text },
  quote: { borderLeftWidth: 2, borderLeftColor: colors.gold, paddingLeft: space.md, marginVertical: 4 },
  quoteText: { fontFamily: fonts.serif, fontSize: 16, color: colors.text },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm },
  action: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, height: 34, borderRadius: radius.pill, borderWidth: 1 },
  actionText: { fontFamily: fonts.semibold, fontSize: 12.5 },
  empty: { fontFamily: fonts.medium, fontSize: 14, color: colors.textMuted, textAlign: 'center', marginTop: space.xl },
});
