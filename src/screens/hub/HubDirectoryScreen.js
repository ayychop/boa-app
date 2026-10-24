import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useHub } from '../../context/HubContext';
import { roleLabel, ROLES, searchProfiles } from '../../api/hub';
import { Avatar, Chip, Field, IconButton, PageHeader } from '../../components/kit';
import { lastSeen, statusLine } from '../../components/hub/hubNav';
import { GoldBadge } from '../../components/ui';
import { colors, fonts, radius, space, type } from '../../theme';

function PersonRow({ person, online, onPress, index }) {
  const status = statusLine(person);
  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index, 8) * 40).springify().damping(20)}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${person.display_name || person.username}, ${person.roles.map(roleLabel).join(', ')}${person.open_for_work ? ', open for work' : ''}${online ? ', online' : ''}`}
        style={({ pressed }) => [styles.person, pressed && { backgroundColor: colors.surfaceRaised }]}
        testID={`hub-person-${person.username}`}
      >
        <Avatar uri={person.avatar_url} name={person.display_name || person.username} size={54} online={online} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>
              {person.display_name || `@${person.username}`}
            </Text>
            {person.open_for_work && <GoldBadge label="OPEN FOR WORK" />}
          </View>
          <Text style={styles.roles} numberOfLines={1}>
            {person.roles.map(roleLabel).join(' · ') || `@${person.username}`}
          </Text>
          {status ? (
            <View style={styles.statusRow}>
              <Ionicons name={person.status_kind === 'watching' ? 'film-outline' : 'musical-notes'} size={11} color={colors.gold} />
              <Text style={styles.status} numberOfLines={1}>
                {status}
              </Text>
            </View>
          ) : (
            <Text style={styles.seen}>{lastSeen(person.last_seen_at, online)}</Text>
          )}
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
      </Pressable>
    </Animated.View>
  );
}

/**
 * Talent search: everyone visible on the Hub, filtered by role (or open
 * for work, or a name), twenty at a time as you scroll.
 */
export default function HubDirectoryScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { userId, isOnline, blocked } = useHub();
  const [role, setRole] = useState(null);
  const [openOnly, setOpenOnly] = useState(false);
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(0);
  const [more, setMore] = useState(true);
  const [state, setState] = useState('loading'); // loading | ready | error | paging
  const [error, setError] = useState(null);
  const request = useRef(0);

  const load = useCallback(
    async (nextPage) => {
      const id = ++request.current;
      setState(nextPage === 0 ? 'loading' : 'paging');
      try {
        const res = await searchProfiles({ role, query, openOnly, page: nextPage, excludeId: userId });
        if (id !== request.current) return;
        setRows((r) => (nextPage === 0 ? res.rows : [...r, ...res.rows.filter((p) => !r.some((x) => x.id === p.id))]));
        setPage(nextPage);
        setMore(res.more);
        setState('ready');
      } catch (err) {
        if (id !== request.current) return;
        setError(err.message);
        setState('error');
      }
    },
    [role, query, openOnly, userId],
  );

  // A new filter starts from the top (the search box waits for a pause in typing).
  useEffect(() => {
    const t = setTimeout(() => load(0), query ? 350 : 0);
    return () => clearTimeout(t);
  }, [load, query]);

  const visible = rows.filter((p) => !blocked.has(p.id));

  return (
    <View style={styles.screen} testID="hub-directory">
      <PageHeader
        kicker="Creative Hub"
        title="Find talent"
        onBack={() => navigation.goBack()}
        right={<IconButton icon="chatbubbles-outline" label="Messages" onPress={() => navigation.navigate('HubChats')} />}
      />
      <FlatList
        data={visible}
        keyExtractor={(p) => p.id}
        renderItem={({ item, index }) => (
          <PersonRow person={item} index={index} online={isOnline(item.id)} onPress={() => navigation.navigate('HubProfile', { id: item.id })} />
        )}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (more && state === 'ready') load(page + 1);
        }}
        contentContainerStyle={{ paddingBottom: insets.bottom + space.xxl }}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={styles.filters}>
            <Field value={query} onChangeText={setQuery} placeholder="Search by name or @username" autoCapitalize="none" returnKeyType="search" testID="hub-search" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              <Chip label="Open for work" icon="briefcase-outline" selected={openOnly} onPress={() => setOpenOnly(!openOnly)} />
              <Chip label="All roles" selected={!role} onPress={() => setRole(null)} />
              {ROLES.map((r) => (
                <Chip key={r.id} label={r.label} selected={role === r.id} onPress={() => setRole(role === r.id ? null : r.id)} testID={`hub-role-${r.id}`} />
              ))}
            </ScrollView>
          </View>
        }
        ListEmptyComponent={
          state === 'loading' ? (
            <ActivityIndicator color={colors.gold} style={{ marginTop: space.xxxl }} />
          ) : (
            <View style={styles.empty}>
              <Ionicons name={state === 'error' ? 'cloud-offline-outline' : 'people-outline'} size={30} color={colors.gold} />
              <Text style={[type.title, { marginTop: space.md, textAlign: 'center' }]}>
                {state === 'error' ? "Couldn't reach the Hub" : 'No one here yet'}
              </Text>
              <Text style={[type.bodyMuted, { textAlign: 'center', marginTop: space.sm }]}>
                {state === 'error' ? error : role ? `No ${roleLabel(role).toLowerCase()}s match. Try another role.` : 'Try a different search.'}
              </Text>
            </View>
          )
        }
        ListFooterComponent={state === 'paging' ? <ActivityIndicator color={colors.gold} style={{ margin: space.xl }} /> : null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  filters: { paddingHorizontal: space.xl, paddingBottom: space.md, gap: space.md },
  chips: { gap: space.sm },
  person: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginHorizontal: space.lg,
    padding: space.md,
    borderRadius: radius.lg,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  name: { fontFamily: fonts.semibold, fontSize: 16, color: colors.text, flexShrink: 1 },
  roles: { fontFamily: fonts.medium, fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  status: { fontFamily: fonts.medium, fontSize: 11.5, color: colors.gold, flexShrink: 1 },
  seen: { fontFamily: fonts.medium, fontSize: 11.5, color: colors.textFaint, marginTop: 4 },
  empty: { alignItems: 'center', padding: space.xxl },
});
