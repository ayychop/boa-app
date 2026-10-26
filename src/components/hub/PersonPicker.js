import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { searchProfiles, roleLabel } from '../../api/hub';
import BottomSheet from '../BottomSheet';
import { Avatar, BoaStarBadge, Field } from '../kit';
import { colors, fonts, space, type } from '../../theme';

/** A sheet to find a Hub member by name or @username. Calls onPick(profile). */
export default function PersonPicker({ open, onClose, onPick, excludeIds = [], title = 'Add a creative' }) {
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    setBusy(true);
    const id = setTimeout(() => {
      searchProfiles({ query })
        .then(({ rows: found }) => alive && setRows(found))
        .catch(() => alive && setRows([]))
        .finally(() => alive && setBusy(false));
    }, 250);
    return () => {
      alive = false;
      clearTimeout(id);
    };
  }, [open, query]);

  const shown = rows.filter((p) => !excludeIds.includes(p.id));
  return (
    <BottomSheet open={open} onClose={onClose} glass>
      <View style={{ paddingHorizontal: space.lg }} testID="person-picker">
        <Text style={type.title}>{title}</Text>
        <Field value={query} onChangeText={setQuery} placeholder="Search names or @usernames" autoCapitalize="none" autoCorrect={false} style={{ marginTop: space.md }} />
        <View style={{ minHeight: 160, marginTop: space.md }}>
          {busy ? <ActivityIndicator color={colors.gold} style={{ marginTop: space.lg }} /> : null}
          {!busy && !shown.length ? <Text style={[type.bodyMuted, { textAlign: 'center', marginTop: space.lg }]}>Nobody found. Try their @username.</Text> : null}
          {shown.slice(0, 8).map((p) => (
            <Pressable
              key={p.id}
              onPress={() => {
                onPick(p);
                setQuery('');
              }}
              accessibilityRole="button"
              accessibilityLabel={p.display_name || p.username}
              style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceRaised }]}
              testID={`pick-${p.id}`}
            >
              <Avatar uri={p.avatar_url} name={p.display_name || p.username} size={40} ring={!!p.is_boa_star} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.name} numberOfLines={1}>
                  {p.display_name || `@${p.username}`}
                </Text>
                <Text style={styles.detail} numberOfLines={1}>
                  @{p.username}
                  {p.roles?.[0] ? ` · ${roleLabel(p.roles[0])}` : ''}
                </Text>
              </View>
              {p.is_boa_star ? <BoaStarBadge size={15} /> : null}
            </Pressable>
          ))}
        </View>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 10, paddingHorizontal: space.sm, borderRadius: 12 },
  name: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
  detail: { fontFamily: fonts.medium, fontSize: 12.5, color: colors.textFaint, marginTop: 1 },
});
