import { useMemo, useState } from 'react';
import { Alert, Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown, LinearTransition } from 'react-native-reanimated';
import { PageHeader } from '../components/kit';
import { EmptyState, Slate, Tappable } from '../components/ui';
import { DownloadBar, DownloadStatus, confirmRemove } from '../components/offline/DownloadButton';
import { usePlayer } from '../context/PlayerContext';
import { useMedia } from '../context/MediaContext';
import { podcastById } from '../data/podcasts';
import { productions } from '../data/boaContent';
import { cancelDownload, formatBytes, localUriFor, removeAllDownloads, startDownload, useDownloads } from '../offline/downloads';
import { useOffline } from '../offline/network';
import useBottomSpace from '../hooks/useBottomSpace';
import { toSource } from '../components/HeroArt';
import { haptics } from '../utils/haptics';
import { colors, fonts, radius, space } from '../theme';

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'audio', label: 'Audio' },
  { id: 'video', label: 'Video' },
];

/** The picture for a download: the saved cover, the cover it came with, or an Original's own art. */
function artFor(entry) {
  if (entry.art) return { uri: entry.art };
  if (entry.kind === 'video') {
    const production = productions.find((p) => p.id === entry.meta?.productionId);
    const episode = production?.episodes.find((e) => e.id === entry.meta?.episodeId);
    return toSource(episode?.image ?? production?.backdrop ?? production?.poster) ?? null;
  }
  return entry.image ? { uri: entry.image } : null;
}

/** "Audio · 24.1 MB" */
const detail = (e) => [e.kind === 'video' ? 'Video' : 'Audio', e.status === 'done' ? formatBytes(e.bytes) : null].filter(Boolean).join(' · ');

function Row({ entry, index, onPlay }) {
  const art = artFor(entry);
  const done = entry.status === 'done';
  const busy = entry.status === 'queued' || entry.status === 'downloading';
  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index, 8) * 40).duration(320)} layout={LinearTransition} testID={`download-row-${entry.id}`}>
      <View style={styles.row}>
        <Pressable
          onPress={done ? onPlay : undefined}
          disabled={!done}
          accessibilityRole="button"
          accessibilityLabel={done ? `Play ${entry.title} offline` : entry.title}
          style={({ pressed }) => [styles.main, pressed && done && { opacity: 0.7 }]}
        >
          <View style={styles.art}>
            {art ? <Image source={art} style={StyleSheet.absoluteFill} resizeMode="cover" /> : <Ionicons name={entry.kind === 'video' ? 'film-outline' : 'musical-notes-outline'} size={22} color={colors.textMuted} />}
            {done ? (
              <View style={styles.playBadge}>
                <Ionicons name="play" size={13} color={colors.bg} style={{ marginLeft: 1 }} />
              </View>
            ) : null}
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.title} numberOfLines={2}>
              {entry.title}
            </Text>
            <Text style={styles.sub} numberOfLines={1}>
              {[entry.subtitle, detail(entry)].filter(Boolean).join(' · ')}
            </Text>
            <DownloadStatus entry={entry} style={{ marginTop: 4 }} />
          </View>
        </Pressable>
        {busy ? (
          <Pressable onPress={() => cancelDownload(entry.id)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Cancel download of ${entry.title}`} style={styles.iconBtn}>
            <Ionicons name="close" size={20} color={colors.text} />
          </Pressable>
        ) : entry.status === 'error' ? (
          <Pressable onPress={() => startDownload({ ...entry })} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Retry ${entry.title}`} style={styles.iconBtn}>
            <Ionicons name="refresh" size={20} color={colors.text} />
          </Pressable>
        ) : null}
        <Pressable
          onPress={() => (busy ? cancelDownload(entry.id) : confirmRemove(entry))}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={`Delete ${entry.title}`}
          testID={`download-delete-${entry.id}`}
          style={styles.iconBtn}
        >
          <Ionicons name="trash-outline" size={19} color={colors.textMuted} />
        </Pressable>
      </View>
      <DownloadBar id={entry.id} style={{ marginTop: 10 }} />
    </Animated.View>
  );
}

/**
 * Downloads (Profile > Downloads): everything saved for offline, with what it
 * takes up. Tap one to play it from the phone (it works with no signal), the
 * bin deletes it to free the space.
 */
export default function DownloadsScreen({ navigation }) {
  const bottom = useBottomSpace(space.xxl);
  const downloads = useDownloads();
  const offline = useOffline();
  const player = usePlayer();
  const media = useMedia();
  const [tab, setTab] = useState('all');

  const shown = useMemo(() => downloads.filter((d) => tab === 'all' || d.kind === tab), [downloads, tab]);
  const used = useMemo(() => downloads.reduce((n, d) => n + (d.status === 'done' ? d.bytes || 0 : 0), 0), [downloads]);
  const saved = downloads.filter((d) => d.status === 'done').length;
  const counts = { all: downloads.length, audio: downloads.filter((d) => d.kind === 'audio').length, video: downloads.filter((d) => d.kind === 'video').length };

  const play = (entry) => {
    haptics.tap();
    if (!localUriFor(entry.id)) {
      Alert.alert('File missing', 'This download is no longer on your phone. It has been removed from the list.');
      return;
    }
    if (entry.kind === 'video') {
      const production = productions.find((p) => p.id === entry.meta?.productionId);
      const episode = production?.episodes.find((e) => e.id === entry.meta?.episodeId);
      if (production && episode) media.openEpisode(production, episode);
      return;
    }
    const item = entry.meta?.item;
    if (!item) return;
    player.play(item);
    const podcast = podcastById(entry.meta?.podcastId);
    if (podcast) media.openPodcast(podcast, { autoplay: false });
  };

  const clearAll = () => {
    const go = () => removeAllDownloads();
    if (Platform.OS === 'web') return go();
    Alert.alert('Delete all downloads?', `This frees ${formatBytes(used)} on your phone.`, [
      { text: 'Keep', style: 'cancel' },
      { text: 'Delete all', style: 'destructive', onPress: go },
    ]);
  };

  return (
    <View style={styles.screen} testID="downloads-screen">
      <PageHeader
        kicker="Profile"
        title="Downloads"
        onBack={() => navigation.goBack()}
        right={
          downloads.length ? (
            <Pressable onPress={clearAll} hitSlop={10} accessibilityRole="button" accessibilityLabel="Delete all downloads" testID="downloads-clear" style={styles.clear}>
              <Text style={styles.clearText}>Delete all</Text>
            </Pressable>
          ) : null
        }
      />
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.xl, paddingTop: space.sm, paddingBottom: bottom, gap: space.md }}>
        {offline ? (
          <Animated.View entering={FadeIn} style={styles.offline} testID="downloads-offline">
            <Ionicons name="cloud-offline-outline" size={16} color={colors.gold} />
            <Text style={styles.offlineText}>Offline Mode. These play from your phone, no signal needed.</Text>
          </Animated.View>
        ) : null}

        <View style={styles.summary}>
          <Slate dot>{saved ? `${saved} saved · ${formatBytes(used)}` : 'Listen and watch offline'}</Slate>
        </View>

        <View style={styles.tabs} accessibilityRole="tablist">
          {TABS.map((t) => {
            const on = tab === t.id;
            return (
              <Tappable
                key={t.id}
                onPress={() => setTab(t.id)}
                scaleTo={0.96}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${t.label}, ${counts[t.id]}`}
                testID={`downloads-tab-${t.id}`}
                style={[styles.tab, on && styles.tabOn]}
              >
                <Text style={[styles.tabText, on && { color: colors.bg }]}>
                  {t.label} {counts[t.id] ? counts[t.id] : ''}
                </Text>
              </Tappable>
            );
          })}
        </View>

        {shown.length ? (
          shown.map((e, i) => <Row key={e.id} entry={e} index={i} onPlay={() => play(e)} />)
        ) : (
          <EmptyState
            title={tab === 'all' ? 'No downloads yet' : `No ${tab} downloads yet`}
            body="Tap the cloud with the arrow next to a podcast episode or an Original to save it for Flight Mode."
          />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  summary: { marginTop: space.xs },
  clear: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: 'rgba(243,239,232,0.08)' },
  clearText: { fontFamily: fonts.semibold, fontSize: 12.5, color: colors.text },
  offline: { flexDirection: 'row', gap: space.sm, alignItems: 'center', padding: space.md, borderRadius: radius.md, backgroundColor: colors.goldSoft },
  offlineText: { flex: 1, fontFamily: fonts.medium, fontSize: 12.5, color: colors.text },
  tabs: { flexDirection: 'row', gap: space.sm },
  tab: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: radius.pill, backgroundColor: 'rgba(243,239,232,0.08)' },
  tabOn: { backgroundColor: colors.gold },
  tabText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  main: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: space.md },
  art: {
    width: 64,
    height: 64,
    borderRadius: radius.md,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
  },
  playBadge: { position: 'absolute', right: 5, bottom: 5, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.gold },
  title: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20, color: colors.text },
  sub: { fontFamily: fonts.medium, fontSize: 12, color: colors.textFaint, marginTop: 2 },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(243,239,232,0.06)' },
});
