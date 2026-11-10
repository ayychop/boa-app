import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import Text from '../../components/ScopedText';
import { Ionicons } from '@expo/vector-icons';
import { SettingRow } from '../../components/kit';
import { Button, Slate } from '../../components/ui';
import { CHAT_SOUNDS } from '../../chat/sounds';
import { MAX_CUSTOM_BYTES, pickCustomSound, playCustomSound, setCustomSound, setSoundMode, stopCustomSound, useSoundPrefs } from '../../chat/soundPrefs';
import { previewNotificationSound } from '../../chat/notifications';
import { haptics } from '../../utils/haptics';
import { colors, fonts, radius, space } from '../../theme';

/**
 * Settings > Notification sound. One choice for every message, heart and
 * missed call notification, and for pushes: the phone's default sound, a clip
 * of your own, or one of BOA's alert sounds.
 */
export default function NotificationSoundSection({ chatSound, setChatSound }) {
  const { mode, custom } = useSoundPrefs();
  const [busy, setBusy] = useState(false);

  const choosePhone = () => {
    haptics.selection();
    setSoundMode('system');
    previewNotificationSound();
  };

  const chooseOwn = async () => {
    haptics.selection();
    // A clip already chosen: use it. Otherwise open the phone's files.
    if (custom) {
      await setSoundMode('custom');
      stopCustomSound();
      playCustomSound({ force: true });
      return;
    }
    await pickOwn();
  };

  const pickOwn = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const song = await pickCustomSound();
      if (song) {
        stopCustomSound();
        playCustomSound({ force: true });
      }
    } catch (err) {
      Alert.alert("Couldn't use that file", err?.message ?? 'Choose a short audio clip instead.');
    } finally {
      setBusy(false);
    }
  };

  const removeOwn = () => {
    stopCustomSound();
    setCustomSound(null);
  };

  const tick = (on, id) =>
    on ? (
      <Ionicons name="checkmark-circle" size={20} color={colors.gold} accessibilityLabel="Selected" testID={id} />
    ) : (
      <Ionicons name="play-circle-outline" size={20} color={colors.textFaint} />
    );

  return (
    <View testID="notification-sound-section">
      <Slate style={styles.section}>Notification sound</Slate>
      <View style={styles.group}>
        <SettingRow icon="notifications-outline" title="Phone default" detail="The sound your phone uses for notifications" onPress={choosePhone}>
          {tick(mode === 'system', 'notif-sound-system-selected')}
        </SettingRow>
        <SettingRow
          icon="folder-open-outline"
          title="Your own sound"
          detail={custom ? custom.name : `Choose a short clip from your phone, up to ${Math.round(MAX_CUSTOM_BYTES / (1024 * 1024))} MB`}
          onPress={chooseOwn}
          last={!custom}
        >
          {tick(mode === 'custom', 'notif-sound-custom-selected')}
        </SettingRow>
        {custom ? (
          <View style={styles.ownActions}>
            <Button label="Choose another" variant="ghost" onPress={pickOwn} testID="notif-sound-change" />
            <Button label="Remove" variant="ghost" onPress={removeOwn} testID="notif-sound-remove" />
          </View>
        ) : null}
      </View>
      <Text style={styles.note} testID="notif-sound-note">
        Your own sound plays while BOA is open. With BOA closed, your phone plays its default sound.
      </Text>

      <Slate style={styles.section}>BOA alert sounds</Slate>
      <View style={styles.group}>
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
            {tick(mode === 'boa' && chatSound === s.id, `chat-sound-${s.id}-selected`)}
          </SettingRow>
        ))}
      </View>
      <Text style={styles.credit}>
        {CHAT_SOUNDS.filter((s) => s.source)
          .map((s) => `${s.label}: ${s.license.toLowerCase()} recording via Wikimedia Commons`)
          .join(' · ')}
        . The rest are BOA originals.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: space.xl, marginBottom: space.md },
  group: { borderRadius: radius.lg, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  ownActions: { flexDirection: 'row', gap: space.sm, padding: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  note: { fontFamily: fonts.regular, fontSize: 12.5, lineHeight: 18, color: colors.textMuted, marginTop: space.sm },
  credit: { fontFamily: fonts.regular, fontSize: 11, lineHeight: 16, color: colors.textFaint, marginTop: space.sm },
});
