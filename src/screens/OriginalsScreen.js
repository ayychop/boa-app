import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { featuredProduction, productions } from '../data/boaContent';
import { useMedia } from '../context/MediaContext';
import Poster, { metaLine } from '../components/Poster';
import { Button, Fog, SectionHeader, Slate, Tappable, Viewfinder } from '../components/ui';
import useBottomSpace from '../hooks/useBottomSpace';
import { colors, fonts, space, type } from '../theme';

const GAP = 14;

function Featured({ production, width }) {
  const insets = useSafeAreaInsets();
  const media = useMedia();
  const wide = width >= 900;
  // Mobile gets a tall cinematic crop; desktop goes full 2.39:1 scope.
  const height = wide ? Math.round(width / 2.39) + insets.top : Math.round(width * 1.2) + insets.top;

  return (
    <View style={{ width, height }}>
      <Animated.Image
        entering={FadeInDown.duration(600)}
        source={{ uri: production.image }}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
      />
      <LinearGradient
        colors={['rgba(5,5,6,0.55)', 'rgba(5,5,6,0)', 'rgba(5,5,6,0.65)', colors.bg]}
        locations={[0, 0.3, 0.7, 1]}
        style={StyleSheet.absoluteFill}
      />
      <Viewfinder inset={16} />
      <View style={[styles.featuredTop, { top: insets.top + space.xl }]}>
        <Slate dot>02 · Productions</Slate>
        <Slate>The slate</Slate>
      </View>
      <View style={styles.featuredBody}>
        <Slate color={colors.gold} lines={2}>
          Featured · {metaLine(production)}
        </Slate>
        <Text style={[type.display, styles.featuredTitle]}>{production.title}</Text>
        <Text style={[type.bodyMuted, styles.logline]} numberOfLines={wide ? 3 : 4}>
          {production.logline}
        </Text>
        <View style={styles.actions}>
          {production.episodes[0] && (
            <Button label="Play Episode 1" icon="play" onPress={() => media.openEpisode(production)} />
          )}
          <Button label="Watch Trailer" icon="film-outline" variant="ghost" onPress={() => media.openTrailer(production)} />
        </View>
      </View>
    </View>
  );
}

function EpisodeCard({ production, episode, width }) {
  const media = useMedia();
  return (
    <Tappable onPress={() => media.openEpisode(production, episode)} accessibilityRole="button" accessibilityLabel={`Play ${episode.title}`}>
      <Poster production={{ ...production, image: episode.image, status: 'available' }} width={width} showTitle={false} />
      <View style={styles.episodeCaption}>
        <Slate>Ep 01</Slate>
        <Text style={styles.episodeTitle}>{episode.title}</Text>
      </View>
    </Tappable>
  );
}

export default function OriginalsScreen() {
  const { width } = useWindowDimensions();
  const media = useMedia();
  const bottom = useBottomSpace(space.xxl);
  const contentWidth = Math.min(width, 1200);
  const columns = contentWidth < 640 ? 2 : contentWidth < 1000 ? 3 : 4;
  const posterWidth = Math.floor((contentWidth - space.xl * 2 - GAP * (columns - 1)) / columns);
  const featured = featuredProduction;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingBottom: bottom }} showsVerticalScrollIndicator={false}>
        <Featured production={featured} width={width} />

        <View style={[styles.block, { width: contentWidth }]}>
          <SectionHeader index="01" kicker={featured.title} title="Episodes" />
          <View style={styles.row}>
            {featured.episodes.map((ep) => (
              <EpisodeCard key={ep.id} production={featured} episode={ep} width={Math.min(posterWidth * 1.6, 360)} />
            ))}
          </View>
        </View>

        <View style={[styles.block, { width: contentWidth }]}>
          <View style={{ overflow: 'hidden' }}>
            <SectionHeader index="02" kicker="All productions" title="Stories worth the big screen." />
          </View>
          <View style={[styles.grid, { gap: GAP }]}>
            {productions.map((p, i) => (
              <Animated.View key={p.id} entering={FadeInDown.delay(80 * i).springify().damping(18)}>
                <Tappable
                  onPress={() => (p.episodes[0] ? media.openEpisode(p) : media.openTrailer(p))}
                  accessibilityRole="button"
                  accessibilityLabel={`${p.title}${p.status === 'coming-soon' ? ', coming soon' : ''}`}
                >
                  <Poster production={p} width={posterWidth} ratio={2 / 3} />
                </Tappable>
              </Animated.View>
            ))}
          </View>
        </View>

        <View style={[styles.casting, { width: contentWidth - space.xl * 2 }]}>
          <Fog opacity={0.28} />
          <Slate dot>Casting</Slate>
          <Text style={[type.h1, { marginTop: space.md }]}>
            There is a role with <Text style={type.serif}>your name</Text> on it.
          </Text>
          <Text style={[type.bodyMuted, { marginTop: space.sm }]}>
            Every production on this slate is casting, or will be. Get on our radar before the call goes out.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  featuredTop: { position: 'absolute', left: space.xl + 8, right: space.xl + 8, flexDirection: 'row', justifyContent: 'space-between' },
  featuredBody: { position: 'absolute', left: space.xl, right: space.xl, bottom: space.xl, maxWidth: 680 },
  featuredTitle: { fontSize: 48, lineHeight: 50, marginTop: space.md },
  logline: { marginTop: space.md },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, marginTop: space.xl },
  block: { alignSelf: 'center', marginTop: space.xxl },
  row: { flexDirection: 'row', gap: GAP, paddingHorizontal: space.xl },
  episodeCaption: { paddingTop: 10, gap: 4 },
  episodeTitle: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: space.xl },
  casting: {
    marginTop: space.xxxl,
    padding: space.xl,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignSelf: 'center',
  },
});
