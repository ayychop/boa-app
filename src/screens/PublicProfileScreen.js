import { useEffect, useState } from 'react';
import { Image, Platform, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '../lib/supabase';
import { applyMeta, BRAND, missingMeta, profileMeta } from '../web/seo';
import { productions } from '../data/boaContent';
import { Avatar } from '../components/kit';
import StationLogo from '../components/StationLogo';
import BoaLogo from '../components/BoaLogo';
import { Button, Slate } from '../components/ui';
import { colors, fonts, radius, space, type } from '../theme';
import { ProfileSkeleton } from '../components/Skeleton';

const MAX_WIDTH = 720;
const CARD = 120;

/**
 * What anyone with a profile link may see without an account: the display
 * picture, name, handle and Favourites. Null if there's no such profile.
 * Posts and reels are never here; they need an account.
 */
export async function getPublicProfile(username) {
  if (!supabase) throw new Error(`${BRAND} isn't connected yet.`);
  const { data, error } = await supabase.rpc('public_profile', { handle: username });
  if (error) throw new Error(error.message || "Couldn't load this profile");
  return data ?? null;
}

/** Off to the BOA HUB web app to join or sign in. */
function openApp(mode) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') window.location.assign(`/?hub=${mode}`);
}

/** Their hearted stations and BOA Originals, to look at (playing them needs an account). */
function PublicFavourites({ items }) {
  const shown = items
    .map((f) => (f.target_kind === 'original' ? { ...f, production: productions.find((p) => p.id === f.target_id) } : f))
    .filter((f) => (f.target_kind === 'station' ? f.target_meta?.name || f.target_label : f.production));
  if (!shown.length) return null;
  return (
    <View testID="public-favourites">
      <Slate dot color={colors.gold} style={{ marginTop: space.xl, marginBottom: space.md }}>
        Favourites
      </Slate>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.md }}>
        {shown.map((f) => (
          <View key={`${f.target_kind}:${f.target_id}`} style={{ width: CARD }}>
            <View style={styles.favArt}>
              {f.target_kind === 'station' ? (
                <>
                  <LinearGradient colors={['#1D1710', '#0B0B0D']} style={StyleSheet.absoluteFill} />
                  <StationLogo station={{ id: f.target_id, name: f.target_label, ...f.target_meta }} size={CARD - 36} rounded={14} />
                </>
              ) : (
                <Image source={f.production.poster} style={StyleSheet.absoluteFill} resizeMode="cover" />
              )}
              <View style={styles.favKind}>
                <Ionicons name={f.target_kind === 'station' ? 'radio' : 'film'} size={11} color="#fff" />
              </View>
            </View>
            <Text style={styles.favTitle} numberOfLines={2}>
              {f.target_label || (f.target_kind === 'station' ? 'Station' : f.production.title)}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

/**
 * A Hub profile opened from a link on the web, at /u/<username>, by
 * someone without an account (and what Google indexes). Public or private,
 * it shows only the display picture, name and Favourites; posts and reels
 * stay locked until you sign up or sign in. It sets the page's title,
 * description, preview image and schema.org data as it loads.
 */
export default function PublicProfileScreen({ username }) {
  const window = useWindowDimensions();
  const width = Math.min(window.width, MAX_WIDTH);
  const [state, setState] = useState({ status: 'loading', profile: null });

  useEffect(() => {
    let alive = true;
    getPublicProfile(username)
      .then((profile) => {
        if (!alive) return;
        setState({ status: profile ? 'ready' : 'missing', profile });
        applyMeta(profile ? profileMeta(profile) : missingMeta());
      })
      .catch(() => {
        if (!alive) return;
        setState({ status: 'missing', profile: null });
        applyMeta(missingMeta());
      });
    return () => {
      alive = false;
    };
  }, [username]);

  const { status, profile } = state;
  const name = profile ? profile.display_name || `@${profile.username}` : '';

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} testID="public-profile">
      <View style={{ width, paddingHorizontal: space.lg }}>
        <View style={styles.top}>
          <BoaLogo height={26} />
          <Button label="Sign in" variant="ghost" onPress={() => openApp('signin')} testID="public-sign-in-top" />
        </View>

        {/* The prompt: the link shows a profile, an account shows the rest. */}
        <View style={styles.banner} testID="public-join-banner">
          <LinearGradient colors={['rgba(226,168,75,0.22)', 'rgba(255,255,255,0.02)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          <Ionicons name="sparkles" size={18} color={colors.gold} />
          <Text style={styles.bannerText}>Sign in or sign up to enjoy {BRAND} fully.</Text>
        </View>

        {status === 'loading' ? (
          <ProfileSkeleton />
        ) : status === 'missing' ? (
          <View style={styles.missing}>
            <Text style={type.title} accessibilityRole="header">
              This profile isn't available
            </Text>
            <Text style={[type.bodyMuted, { marginTop: space.sm, textAlign: 'center' }]}>The link may be wrong, or the account may be gone.</Text>
          </View>
        ) : (
          <>
            <View style={styles.hero}>
              <Avatar uri={profile.avatar_url} name={name} size={104} />
              {/* The page's one heading: the name people search for. */}
              <Text style={styles.name} accessibilityRole="header" aria-level={1}>
                {name}
              </Text>
              <Text style={styles.handle}>@{profile.username}</Text>
            </View>

            <PublicFavourites items={profile.favourites ?? []} />

            <View style={styles.locked} testID="public-media-locked">
              <View style={styles.lockRing}>
                <Ionicons name="lock-closed" size={22} color={colors.gold} />
              </View>
              <Text style={[type.title, { textAlign: 'center', marginTop: space.md }]}>Posts and reels are for members</Text>
              <Text style={[type.bodyMuted, { textAlign: 'center', marginTop: space.sm }]}>
                Create a free {BRAND} account to see {name}'s posts and reels, and to message them.
              </Text>
              <View style={styles.lockedActions}>
                <Button label="Sign up" icon="arrow-forward" onPress={() => openApp('join')} testID="public-sign-up" />
                <Button label="Sign in" variant="ghost" onPress={() => openApp('signin')} testID="public-sign-in" />
              </View>
            </View>
          </>
        )}
        <Text style={styles.footer}>© 2026 BOA Network · {BRAND}, the home for creatives</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { alignItems: 'center', paddingBottom: space.xxxl },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: space.lg },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(226,168,75,0.45)',
  },
  bannerText: { flex: 1, fontFamily: fonts.semibold, fontSize: 14, color: colors.text },
  missing: { alignItems: 'center', marginTop: space.xxxl },
  hero: { alignItems: 'center', paddingTop: space.xxl },
  name: { fontFamily: fonts.semibold, fontSize: 30, letterSpacing: -0.8, color: colors.text, marginTop: space.lg, textAlign: 'center' },
  handle: { fontFamily: fonts.semibold, fontSize: 14, color: colors.textMuted, marginTop: space.xs },
  favArt: {
    width: CARD,
    height: CARD,
    borderRadius: radius.lg,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  favKind: { position: 'absolute', top: 8, left: 8, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(5,5,6,0.6)' },
  favTitle: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 17, color: colors.text, marginTop: space.sm },
  locked: {
    alignItems: 'center',
    marginTop: space.xxl,
    padding: space.xl,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  lockRing: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(226,168,75,0.5)', backgroundColor: colors.goldSoft },
  lockedActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: space.md, marginTop: space.xl },
  footer: { fontFamily: fonts.medium, fontSize: 12, color: colors.textFaint, textAlign: 'center', marginTop: space.xxxl },
});
