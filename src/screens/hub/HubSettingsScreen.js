import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useHub } from '../../context/HubContext';
import * as hub from '../../api/hub';
import { Avatar, Chip, Field, PageHeader, SettingRow, Toggle } from '../../components/kit';
import { Button, Slate } from '../../components/ui';
import { haptics } from '../../utils/haptics';
import { QUOTE_CATEGORIES } from '../../data/quotes';
import { CHAT_SOUNDS } from '../../chat/sounds';
import useChatVibe from '../../chat/vibes';
import VibePicker from '../../components/chat/VibePicker';
import { colors, fonts, radius, space } from '../../theme';

/**
 * Your Hub profile and privacy: name, photo, bio and roles; your Daily
 * Spark's kind; whether you're
 * visible on the Hub and open for work; whether your listening / watching
 * shows; chat (its vibe, the new-message sound, disappearing messages); the people
 * you've blocked; and your data (export or delete).
 */
export default function HubSettingsScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const {
    userId,
    profile,
    saveProfile,
    shareStatus,
    setShareStatus,
    blocked,
    unblock,
    signOut,
    deleteAccount,
    chatSound,
    setChatSound,
    disappearing,
    setDisappearing,
  } = useHub();
  const [form, setForm] = useState(() => ({
    display_name: profile?.display_name ?? '',
    bio: profile?.bio ?? '',
    roles: profile?.roles ?? [],
  }));
  const { vibe, setVibe } = useChatVibe();
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(null);
  const [blockedPeople, setBlockedPeople] = useState([]);
  const [privacy, setPrivacy] = useState('everyone');
  const [searchable, setSearchableState] = useState(true);

  useEffect(() => {
    let alive = true;
    hub
      .getMessagePrivacy(userId)
      .then((v) => alive && setPrivacy(v))
      .catch(() => {});
    hub
      .getSearchable(userId)
      .then((v) => alive && setSearchableState(v))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [userId]);

  const chooseSearchable = async (value) => {
    setSearchableState(value);
    try {
      await hub.setSearchable(userId, value);
    } catch (err) {
      setSearchableState(!value);
      Alert.alert("Couldn't save", err.message);
    }
  };

  const choosePrivacy = async (value) => {
    const before = privacy;
    haptics.selection();
    setPrivacy(value);
    try {
      await hub.setMessagePrivacy(userId, value);
    } catch (err) {
      setPrivacy(before);
      Alert.alert("Couldn't save", err.message);
    }
  };

  useEffect(() => {
    let alive = true;
    Promise.all([...blocked].map((id) => hub.getProfile(id).catch(() => null))).then((list) => alive && setBlockedPeople(list.filter(Boolean)));
    return () => {
      alive = false;
    };
  }, [blocked]);

  if (!profile) return null;
  const dirty = form.display_name !== (profile.display_name ?? '') || form.bio !== (profile.bio ?? '') || form.roles.join() !== profile.roles.join();

  const flip = (key) => async (value) => {
    try {
      await saveProfile({ [key]: value });
    } catch (err) {
      Alert.alert("Couldn't save", err.message);
    }
  };

  const changePhoto = async () => {
    let res;
    try {
      res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    } catch {
      return Alert.alert("Couldn't open your photos", 'Check that BOA can access your photos, then try again.');
    }
    if (res?.canceled || !res?.assets?.[0]) return;
    setBusy('photo');
    try {
      const url = await hub.uploadAvatar(userId, res.assets[0]);
      await saveProfile({ avatar_url: url });
    } catch (err) {
      Alert.alert('Upload failed', err.message);
    } finally {
      setBusy(null);
    }
  };

  const exportData = async () => {
    setBusy('export');
    try {
      const data = await hub.exportMyData();
      await Share.share({ title: 'My BOA HUB data', message: JSON.stringify(data, null, 2) });
    } catch (err) {
      Alert.alert('Export failed', err.message);
    } finally {
      setBusy(null);
    }
  };

  const confirmDelete = () =>
    Alert.alert(
      'Delete your Hub account?',
      'This permanently erases your profile, photo, conversations and messages from BOA HUB. It cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete everything',
          style: 'destructive',
          onPress: async () => {
            setBusy('delete');
            try {
              await deleteAccount();
              navigation.popToTop();
            } catch (err) {
              Alert.alert('Delete failed', err.message);
              setBusy(null);
            }
          },
        },
      ],
    );

  return (
    <View style={styles.screen} testID="hub-settings">
      <PageHeader kicker="Creative Hub" title="Hub settings" onBack={() => navigation.goBack()} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: space.lg, paddingTop: 0, paddingBottom: insets.bottom + space.xxl }} keyboardShouldPersistTaps="handled">
          <View style={styles.photoRow}>
            <Pressable onPress={changePhoto} accessibilityRole="button" accessibilityLabel="Change profile photo">
              <Avatar uri={profile.avatar_url} name={profile.display_name || profile.username} size={76} ring />
              {busy === 'photo' && <ActivityIndicator color={colors.gold} style={StyleSheet.absoluteFill} />}
            </Pressable>
            <Button label="Change photo" icon="camera-outline" variant="ghost" onPress={changePhoto} />
          </View>

          <Field label="Display name" value={form.display_name} onChangeText={(t) => setForm((f) => ({ ...f, display_name: t.slice(0, 50) }))} style={{ marginTop: space.xl }} />
          <Field
            label="Bio"
            value={form.bio}
            onChangeText={(t) => setForm((f) => ({ ...f, bio: t.slice(0, 280) }))}
            multiline
            hint={`${form.bio.length}/280`}
            style={{ marginTop: space.lg }}
          />
          <Slate style={styles.section}>Roles</Slate>
          <View style={styles.chips}>
            {hub.ROLES.map((r) => (
              <Chip
                key={r.id}
                label={r.label}
                selected={form.roles.includes(r.id)}
                onPress={() =>
                  setForm((f) => ({
                    ...f,
                    roles: f.roles.includes(r.id) ? f.roles.filter((x) => x !== r.id) : f.roles.length < 6 ? [...f.roles, r.id] : f.roles,
                  }))
                }
              />
            ))}
          </View>
          {dirty && (
            <Button
              label={saving ? 'Saving' : 'Save profile'}
              icon="checkmark"
              disabled={saving || !form.roles.length}
              onPress={async () => {
                setSaving(true);
                try {
                  await saveProfile({ display_name: form.display_name.trim() || null, bio: form.bio.trim() || null, roles: form.roles });
                  haptics.success();
                } catch (err) {
                  Alert.alert("Couldn't save", err.message);
                } finally {
                  setSaving(false);
                }
              }}
              style={{ marginTop: space.lg, alignSelf: 'flex-start' }}
            />
          )}

          {/* The Daily Spark on Profile: saved as soon as it's picked. */}
          <Slate style={styles.section}>Daily Spark</Slate>
          <View style={styles.chips}>
            {QUOTE_CATEGORIES.map((c) => (
              <Chip
                key={c.id}
                label={`${c.label} · ${c.theme}`}
                selected={profile.quote_category === c.id}
                onPress={() => {
                  haptics.selection();
                  flip('quote_category')(c.id);
                }}
              />
            ))}
          </View>

          <Slate style={styles.section}>Presence</Slate>
          <View style={styles.group}>
            <SettingRow icon="eye-outline" title="Visible on Hub" detail="Show up in Find talent and appear online. Off: only people you already talk to can see you.">
              <Toggle value={profile.visible_on_hub} onChange={flip('visible_on_hub')} label="Visible on Hub" testID="hub-visible" />
            </SettingRow>
            <SettingRow icon="briefcase-outline" title="Open for work" detail="A gold badge on your profile, and you're listed first.">
              <Toggle value={profile.open_for_work} onChange={flip('open_for_work')} label="Open for work" testID="hub-open-for-work" />
            </SettingRow>
            <SettingRow icon="musical-notes-outline" title="Show what I'm playing" detail="'Listening to' a station or 'Watching' a BOA Original, on your profile.">
              <Toggle value={shareStatus} onChange={setShareStatus} label="Show what I'm playing" testID="hub-share-status" />
            </SettingRow>
            <SettingRow
              icon="globe-outline"
              title="Show my profile in search"
              detail="Google can list your name and picture. Your posts and reels are only ever shown to people with an account."
              last
            >
              <Toggle value={searchable && profile.visible_on_hub} onChange={chooseSearchable} label="Show my profile in search" testID="hub-searchable" />
            </SettingRow>
          </View>

          <Slate style={styles.section}>Who can message you</Slate>
          <View style={styles.group} accessibilityRole="radiogroup">
            {hub.MESSAGE_PRIVACY.map((o, i) => (
              <SettingRow key={o.id} icon={o.icon} title={o.label} detail={o.detail} onPress={() => choosePrivacy(o.id)} last={i === hub.MESSAGE_PRIVACY.length - 1}>
                <Ionicons
                  name={privacy === o.id ? 'radio-button-on' : 'radio-button-off'}
                  size={22}
                  color={privacy === o.id ? colors.gold : colors.textFaint}
                  accessibilityLabel={privacy === o.id ? 'Selected' : undefined}
                  testID={`message-privacy-${o.id}${privacy === o.id ? '-selected' : ''}`}
                />
              </SettingRow>
            ))}
          </View>

          <Slate style={styles.section}>Chat vibe</Slate>
          <VibePicker value={vibe.id} onChange={setVibe} />

          <Slate style={styles.section}>Chat</Slate>
          <View style={styles.group}>
            <SettingRow
              icon="timer-outline"
              title="Disappearing messages"
              detail="Messages you send vanish for both of you after 24 hours."
            >
              <Toggle
                value={!!disappearing}
                onChange={(on) => setDisappearing?.(on).catch((err) => Alert.alert("Couldn't save", err.message))}
                label="Disappearing messages"
                testID="hub-disappearing"
              />
            </SettingRow>
            {CHAT_SOUNDS.map((s, i) => (
              <SettingRow
                key={s.id}
                icon={s.icon}
                title={s.label}
                detail={s.detail}
                onPress={() => {
                  haptics.selection();
                  setChatSound?.(s.id);
                }}
                last={i === CHAT_SOUNDS.length - 1}
              >
                {chatSound === s.id ? (
                  <Ionicons name="checkmark-circle" size={20} color={colors.gold} accessibilityLabel="Selected" testID={`chat-sound-${s.id}-selected`} />
                ) : (
                  <Ionicons name="play-circle-outline" size={20} color={colors.textFaint} />
                )}
              </SettingRow>
            ))}
          </View>
          <Text style={styles.credit}>
            New-message sound. {CHAT_SOUNDS.filter((s) => s.source).map((s) => `${s.label}: ${s.license.toLowerCase()} recording via Wikimedia Commons`).join(' · ')}. The rest are BOA originals.
          </Text>

          {blockedPeople.length > 0 && (
            <>
              <Slate style={styles.section}>Blocked</Slate>
              <View style={styles.group}>
                {blockedPeople.map((p, i) => (
                  <SettingRow key={p.id} title={p.display_name || `@${p.username}`} detail={`@${p.username}`} last={i === blockedPeople.length - 1}>
                    <Button label="Unblock" variant="ghost" onPress={() => unblock(p.id).catch(() => {})} />
                  </SettingRow>
                ))}
              </View>
            </>
          )}

          <Slate style={styles.section}>Your data</Slate>
          <View style={styles.group}>
            <SettingRow icon="download-outline" title="Export my data" detail="Everything the Hub holds about you, as JSON." onPress={exportData}>
              {busy === 'export' ? <ActivityIndicator color={colors.gold} /> : <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />}
            </SettingRow>
            <SettingRow icon="log-out-outline" title="Sign out" onPress={() => signOut().then(() => navigation.popToTop())} />
            <SettingRow icon="trash-outline" title="Delete my Hub account" detail="Erases your profile and all your conversations." danger onPress={confirmDelete} last>
              {busy === 'delete' ? <ActivityIndicator color="#FF6B6B" /> : null}
            </SettingRow>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  section: { marginTop: space.xl, marginBottom: space.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  group: { borderRadius: radius.lg, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  credit: { fontFamily: fonts.regular, fontSize: 11, lineHeight: 16, color: colors.textFaint, marginTop: space.sm },
});
