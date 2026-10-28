import { useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useHub } from '../../context/HubContext';
import { mediaKind, MEDIA_QUALITY } from '../../api/hub';
import { CAPTION_MAX, createPost, parseTags, postProblem, resolveUsernames } from '../../api/posts';
import { Field, PageHeader } from '../../components/kit';
import { Button, Slate } from '../../components/ui';
import { colors, fonts, radius, space } from '../../theme';
import { LoadingDots } from '../../components/Skeleton';

function VideoPreview({ uri }) {
  const player = useVideoPlayer({ uri }, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });
  return <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />;
}

/** A new post: pick a photo or video, add a caption and tag people. */
export default function HubNewPostScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { userId } = useHub();
  const [asset, setAsset] = useState(null);
  const [caption, setCaption] = useState('');
  const [tags, setTags] = useState('');
  const [busy, setBusy] = useState(false);

  const pick = async () => {
    let res;
    try {
      res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: MEDIA_QUALITY, videoMaxDuration: 180, allowsEditing: false });
    } catch {
      return Alert.alert("Couldn't open your photos", 'Check that BOA can access your photos and videos, then try again.');
    }
    const next = res?.canceled ? null : res?.assets?.[0];
    if (!next) return;
    const problem = postProblem(next);
    if (problem) return Alert.alert("Can't post that", problem);
    setAsset(next);
  };

  const share = async () => {
    if (!asset) return pick();
    setBusy(true);
    try {
      const names = parseTags(tags);
      const found = await resolveUsernames(names);
      const missing = names.filter((n) => !found.some((f) => f.username === n));
      if (missing.length) {
        setBusy(false);
        return Alert.alert('Not on the Hub', `There's nobody on the Hub called ${missing.map((m) => `@${m}`).join(', ')}.`);
      }
      await createPost(userId, asset, { caption, tagged: found.map((f) => f.id).filter((id) => id !== userId) });
      navigation.goBack();
    } catch (err) {
      Alert.alert("Couldn't post", err.message);
      setBusy(false);
    }
  };

  const video = asset && mediaKind(asset) === 'video';
  return (
    <View style={styles.screen} testID="hub-new-post">
      <PageHeader kicker="Your profile" title="New post" backIcon="close" onBack={() => navigation.goBack()} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: insets.bottom + space.xxl }} keyboardShouldPersistTaps="handled">
          <Pressable onPress={pick} accessibilityRole="button" accessibilityLabel={asset ? 'Choose a different photo or video' : 'Choose a photo or video'} style={styles.media} testID="new-post-pick">
            {asset ? (
              video ? (
                <VideoPreview uri={asset.uri} />
              ) : (
                <Image source={{ uri: asset.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
              )
            ) : (
              <LinearGradient colors={['rgba(226,168,75,0.16)', 'rgba(255,255,255,0.02)']} style={[StyleSheet.absoluteFill, styles.mediaEmpty]}>
                <View style={styles.mediaRing}>
                  <Ionicons name="images-outline" size={30} color={colors.gold} />
                </View>
                <Text style={styles.mediaTitle}>Choose a photo or video</Text>
                <Text style={styles.mediaBody}>Photos up to 16 MB, videos up to 64 MB.</Text>
              </LinearGradient>
            )}
            {asset ? (
              <View style={styles.swap}>
                <Ionicons name="swap-horizontal" size={14} color="#fff" />
                <Text style={styles.swapText}>Change</Text>
              </View>
            ) : null}
          </Pressable>

          <Field
            label="Caption"
            value={caption}
            onChangeText={(t) => setCaption(t.slice(0, CAPTION_MAX))}
            placeholder="What's the story?"
            multiline
            hint={`${caption.length}/${CAPTION_MAX}`}
            style={{ marginTop: space.xl }}
          />
          <Field
            label="Tag people"
            value={tags}
            onChangeText={setTags}
            placeholder="@ama @kofi.beats"
            autoCapitalize="none"
            autoCorrect={false}
            hint="Their usernames, with spaces between. Tagged posts show on their profile too."
            style={{ marginTop: space.lg }}
          />
          <Slate style={{ marginTop: space.xl }}>Shared on your Hub profile</Slate>
          <Button
            label={busy ? 'Posting' : asset ? 'Share' : 'Choose a photo or video'}
            icon={asset ? 'paper-plane' : 'images-outline'}
            onPress={share}
            disabled={busy}
            style={{ marginTop: space.md, alignSelf: 'stretch' }}
          />
          {busy ? <LoadingDots style={{ marginTop: space.lg }} /> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  media: {
    aspectRatio: 1,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    borderRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(226,168,75,0.35)',
  },
  mediaEmpty: { alignItems: 'center', justifyContent: 'center', padding: space.xl },
  mediaRing: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'rgba(226,168,75,0.55)', backgroundColor: colors.goldSoft },
  mediaTitle: { fontFamily: fonts.semibold, fontSize: 18, color: colors.text, marginTop: space.lg, textAlign: 'center' },
  mediaBody: { fontFamily: fonts.regular, fontSize: 13, color: colors.textMuted, marginTop: 4, textAlign: 'center' },
  swap: {
    position: 'absolute',
    right: space.md,
    bottom: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(5,5,6,0.6)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  swapText: { fontFamily: fonts.semibold, fontSize: 12.5, color: '#fff' },
});
