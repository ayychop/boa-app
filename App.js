import { useCallback, useEffect, useState } from 'react';
import * as Linking from 'expo-linking';
import { StatusBar } from 'expo-status-bar';
import { Alert, Platform, StyleSheet, Text, View } from 'react-native';
import { DarkTheme, NavigationContainer, useIsFocused } from '@react-navigation/native';
import { BottomTabBar, createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { Easing, FadeIn, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import * as SplashScreen from 'expo-splash-screen';
import { Ionicons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import { Manrope_200ExtraLight, Manrope_300Light, Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold } from '@expo-google-fonts/manrope';
import { JetBrainsMono_400Regular, JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono';
import { InstrumentSerif_400Regular_Italic } from '@expo-google-fonts/instrument-serif';
import { PlusJakartaSans_500Medium, PlusJakartaSans_700Bold } from '@expo-google-fonts/plus-jakarta-sans';
import { SpaceGrotesk_500Medium } from '@expo-google-fonts/space-grotesk';
import { PlayerProvider } from './src/context/PlayerContext';
import { MediaProvider } from './src/context/MediaContext';
import { FormsProvider } from './src/context/FormsContext';
import { UserProvider, useUser } from './src/context/UserContext';
import { PremiumProvider } from './src/context/PremiumContext';
import CarActions from './src/components/CarActions';
import { SleepTimerProvider } from './src/context/SleepTimerContext';
import { ZenProvider, useZen } from './src/context/ZenContext';
import { WeatherProvider } from './src/context/WeatherContext';
import { AlarmProvider, useAlarms } from './src/context/AlarmContext';
import { HubProvider } from './src/context/HubContext';
import { CallProvider } from './src/context/CallContext';
import { FontProvider } from './src/context/FontContext';
import CallWakeUpPrompt from './src/components/calls/CallWakeUpPrompt';
import { reportDeviceThreats } from './src/security/integrity';
import { currentTab, goToTab, navigationRef, openPage } from './src/navigation/ref';
import { completeAuthLink, profileIdByUsername } from './src/api/hub';
import OnboardingScreen from './src/screens/OnboardingScreen';
import Intro from './src/components/Intro';
import MiniPlayer from './src/components/MiniPlayer';
import RecordArtwork from './src/components/RecordArtwork';
import FirstRun from './src/components/FirstRun';
import HomeScreen from './src/screens/HomeScreen';
import RadioScreen from './src/screens/RadioScreen';
import ZenScreen from './src/screens/ZenScreen';
import OriginalsScreen from './src/screens/OriginalsScreen';
import TalentScreen from './src/screens/TalentScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import ChatScreen from './src/screens/ChatScreen';
import ForecastScreen from './src/screens/ForecastScreen';
import AlarmSettingsScreen from './src/screens/AlarmSettingsScreen';
import AlarmRingingScreen from './src/screens/AlarmRingingScreen';
import HubWelcomeScreen from './src/screens/hub/HubWelcomeScreen';
import HubDirectoryScreen from './src/screens/hub/HubDirectoryScreen';
import HubProfileScreen from './src/screens/hub/HubProfileScreen';
import HubSettingsScreen from './src/screens/hub/HubSettingsScreen';
import ChatAppearanceScreen from './src/screens/hub/ChatAppearanceScreen';
import RingtoneScreen from './src/screens/hub/RingtoneScreen';
import HubChatsScreen from './src/screens/hub/HubChatsScreen';
import NewChatScreen from './src/screens/hub/NewChatScreen';
import AdminDashboard from './src/screens/admin/AdminDashboard';
import HubNewPostScreen from './src/screens/hub/HubNewPostScreen';
import HubPostScreen from './src/screens/hub/HubPostScreen';
import HubSplitsScreen from './src/screens/hub/HubSplitsScreen';
import HubSplitSheetScreen from './src/screens/hub/HubSplitSheetScreen';
import HubInvoiceScreen from './src/screens/hub/HubInvoiceScreen';
import HubHeartsScreen from './src/screens/hub/HubHeartsScreen';
import PublicProfileScreen from './src/screens/PublicProfileScreen';
import { profileHandleFromPath } from './src/web/seo';
import { colors, fonts } from './src/theme';
import ErrorBoundary from './src/components/ErrorBoundary';
import { installCrashGuard } from './src/utils/crashGuard';
import { haptics } from './src/utils/haptics';
import useLayout from './src/hooks/useLayout';
import SafeBottomFloor, { ANDROID_MIN_BOTTOM_INSET } from './src/components/SafeBottomFloor';

// The native splash stays up until the intro is on screen, then dissolves
// into it.
SplashScreen.preventAutoHideAsync().catch(() => {});
SplashScreen.setOptions({ fade: true, duration: 500 });

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.gold,
    background: colors.bg,
    card: colors.bg,
    text: colors.text,
    border: colors.border,
  },
};

const TAB_TITLES = { Originals: 'BOA Originals' };

const ICONS = {
  Home: ['home', 'home-outline'],
  Originals: ['film', 'film-outline'],
  Radio: ['radio', 'radio-outline'],
  Chat: ['chatbubbles', 'chatbubbles-outline'],
  Talent: ['people', 'people-outline'],
  Zen: ['sparkles', 'sparkles-outline'],
  Profile: ['person', 'person-outline'],
};

// easeOutExpo: nearly all of the movement happens in the first third, so the
// new tab is readable almost at once and then just settles.
const EASE_OUT_EXPO = Easing.bezier(0.16, 1, 0.3, 1);

// Tabs are switched constantly, so this stays small: a short fade, and
// opacity only, so a tab's buttons are where they'll stay from the first
// frame (nothing slides into place). Also keeps every screen clear of a
// notch or camera cutout when the phone is on its side.
function TabTransition({ children }) {
  const focused = useIsFocused();
  const { side } = useLayout();
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(focused ? 1 : 0);

  useEffect(() => {
    if (!focused) progress.value = 0;
    else progress.value = withTiming(1, { duration: reduceMotion ? 180 : 340, easing: EASE_OUT_EXPO });
  }, [focused, reduceMotion, progress]);

  // The tab settles in: it fades up from a touch lower and a hair smaller.
  // Reduced motion keeps the fade alone.
  const style = useAnimatedStyle(() => ({
    flex: 1,
    opacity: progress.value,
    transform: reduceMotion ? [] : [{ translateY: (1 - progress.value) * 10 }, { scale: 0.985 + progress.value * 0.015 }],
  }));

  return <Animated.View style={[style, { paddingHorizontal: side }]}>{children}</Animated.View>;
}

// Dynamic Island-style pop on the icon that just became active: a quick dip
// then an under-damped overshoot back to size.
function TabIcon({ name, focused, color, size }) {
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);
  useEffect(() => {
    if (!focused || reduceMotion) return;
    scale.value = withSequence(withTiming(0.8, { duration: 90, easing: Easing.bezier(0.23, 1, 0.32, 1) }), withSpring(1, { duration: 480, dampingRatio: 0.42 }));
  }, [focused, reduceMotion, scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  // BOA Originals is the premium headline: a slow gold gleam swells behind its
  // icon and rests, so it stands out as the marquee tab. Off under Reduce
  // Motion, and only ever on this one tab.
  const premium = name === 'Originals';
  const gleam = useSharedValue(0);
  useEffect(() => {
    if (!premium || reduceMotion) return;
    gleam.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 900, easing: Easing.inOut(Easing.quad) }),
        withDelay(2600, withTiming(0, { duration: 0 })),
      ),
      -1,
      false,
    );
  }, [premium, reduceMotion, gleam]);
  const gleamStyle = useAnimatedStyle(() => ({ opacity: gleam.value * 0.7 }));
  return (
    <Animated.View style={style}>
      {premium ? (
        <Animated.View pointerEvents="none" style={[styles.tabGleam, { width: size * 1.7, height: size * 1.7, borderRadius: size, left: -size * 0.35, top: -size * 0.35 }, gleamStyle]} />
      ) : null}
      <Ionicons name={ICONS[name][focused ? 0 : 1]} size={size} color={color} />
    </Animated.View>
  );
}

const withTransition = (Screen) =>
  function TransitionedScreen(props) {
    return (
      <TabTransition>
        <Screen {...props} />
      </TabTransition>
    );
  };

const Home = withTransition(HomeScreen);
const Radio = withTransition(RadioScreen);
const Zen = withTransition(ZenScreen);
const Originals = withTransition(OriginalsScreen);
const Talent = withTransition(TalentScreen);
const Profile = withTransition(ProfileScreen);
const Chat = withTransition(ChatScreen);

// Tab bar and mini player float over the screens so content scrolls beneath
// the blur; screens pad themselves with useBottomSpace().
function FloatingTabBar(props) {
  const { ambient } = useZen();
  const route = props.state.routes[props.state.index]?.name;
  // The Zen screensaver is the whole screen: no tab bar, no mini player.
  if (route === 'Zen' && ambient) return null;
  // Home docks the mini player at its top instead, clear of its content;
  // Zen has its own controls for what's playing.
  const showMini = route !== 'Home' && route !== 'Zen';
  return (
    <View style={styles.tabBarWrap} pointerEvents="box-none">
      {showMini && <MiniPlayer onOpenRadio={() => props.navigation.navigate('Radio')} />}
      <BottomTabBar {...props} />
    </View>
  );
}

function TabBarBackground() {
  return (
    <View style={StyleSheet.absoluteFill}>
      <BlurView intensity={70} tint="dark" experimentalBlurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} />
      {/* Dense enough that round artwork scrolling under the bar (station logos)
          never reads as dark discs behind the icons where the blur is weak. */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(5,5,6,0.86)' }]} />
    </View>
  );
}

// Breathing room above the gesture bar or navigation buttons, so the
// labels never sit right on it. The inset itself is floored for Android
// (SafeBottomFloor).
const ANDROID_BOTTOM_COMFORT = 10;

// Seven tabs share the bar. Phones scale everything to the width of one
// tab's slot, so a standard phone (360 to 412pt) and the Fold's narrow
// cover screen (about 344pt) each get icons and labels in proportion, in a
// bar only as tall as they need. Tablets and unfolded phones have room to
// spare, so they keep a slim bar.
const TAB_COUNT = 7;
export const TAB_BAR_HEIGHT = 66;
export const TAB_BAR_HEIGHT_PHONE = 64;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const tabSizing = (slot, phone = false) => {
  if (!phone) {
    return {
      icon: Math.round(Math.min(28, Math.max(24, slot * 0.44))),
      label: slot < 54 ? 11 : slot < 70 ? 11.5 : 13,
      height: TAB_BAR_HEIGHT,
    };
  }
  const icon = Math.round(clamp(slot * 0.44, 22, 27));
  const label = slot < 52 ? 11 : slot < 60 ? 11.5 : 12.5;
  // Top padding, icon, label line and a little air under it.
  return { icon, label, height: Math.min(TAB_BAR_HEIGHT_PHONE, Math.round(icon + label * 1.35 + 22)) };
};

// "BOA Originals" can't fit a phone's tab slot at a readable size, so
// phones say "Originals" (screen readers still hear "BOA Originals").
export const tabLabel = (name, phone) => (name === 'Originals' && phone ? 'Originals' : (TAB_TITLES[name] ?? name));

function Tabs() {
  const insets = useSafeAreaInsets();
  const { side, short, width, wide } = useLayout();
  const phone = !wide;
  // useLayout's width is already inside the side gutters the bar pads by.
  const sizing = tabSizing(width / TAB_COUNT, phone);
  // The tab bar pads itself by this, so its icons and labels always sit
  // above the system gesture bar or navigation buttons.
  const bottomInset = Platform.OS === 'android' ? Math.max(insets.bottom, ANDROID_MIN_BOTTOM_INSET) + ANDROID_BOTTOM_COMFORT : insets.bottom;
  return (
    <Tab.Navigator
      initialRouteName="Home"
      tabBar={(props) => <FloatingTabBar {...props} />}
      safeAreaInsets={{ bottom: bottomInset }}
      screenOptions={({ route }) => ({
        headerShown: false,
        // Tabs you aren't looking at are frozen: folding or unfolding the
        // phone only re-renders the tab on screen.
        freezeOnBlur: true,
        tabBarActiveTintColor: colors.gold,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarStyle: {
          backgroundColor: 'transparent',
          borderTopColor: colors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          elevation: 0,
          paddingLeft: side,
          paddingRight: side,
          // Landscape phones: a slim bar (labels sit beside the icons) so
          // it takes as little of the short screen as it can.
          height: (short ? 44 : sizing.height) + bottomInset,
        },
        tabBarItemStyle: { paddingHorizontal: 0, paddingTop: short ? 0 : 8 },
        tabBarBackground: () => <TabBarBackground />,
        // Seven tabs: each label stays on one line and shrinks to fit its
        // slot (down to 65%) rather than wrapping into the icon or
        // clipping.
        // Spelled out for screen readers: a custom label means React
        // Navigation no longer builds one.
        tabBarAccessibilityLabel: `${TAB_TITLES[route.name] ?? route.name}, tab`,
        tabBarLabel: ({ color }) => (
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65} allowFontScaling={false} style={[styles.tabLabel, { color, fontSize: sizing.label }]}>
            {tabLabel(route.name, phone)}
          </Text>
        ),
        tabBarIcon: ({ focused, color }) => <TabIcon name={route.name} focused={focused} color={color} size={sizing.icon} />,
      })}
      screenListeners={{ tabPress: () => haptics.selection() }}
    >
      <Tab.Screen name="Home" component={Home} />
      <Tab.Screen name="Originals" component={Originals} options={{ title: 'BOA Originals' }} />
      <Tab.Screen name="Radio" component={Radio} />
      <Tab.Screen name="Chat" component={Chat} />
      <Tab.Screen name="Talent" component={Talent} />
      {/* Not frozen on blur: Zen unmounts its room when you leave, which a
          frozen screen would never get to do. */}
      <Tab.Screen name="Zen" component={Zen} options={{ freezeOnBlur: false }} />
      <Tab.Screen name="Profile" component={Profile} />
    </Tab.Navigator>
  );
}

// An alarm going off brings up its ringing screen over whatever is open.
function AlarmRinger({ navReady }) {
  const { ringing } = useAlarms();
  useEffect(() => {
    if (navReady && ringing && currentTab() !== 'AlarmRinging') openPage('AlarmRinging');
  }, [navReady, ringing]);
  return null;
}

/**
 * Where a network.boa:// link goes: `weather` (the widget's weather) to the
 * forecast, `now-playing` (the rest of the widget) to the Radio tab, and
 * `auth-callback` (the confirmation email) signs you in, then opens the
 * Chat tab to set up your Hub profile, and `u/<username>` (a BOA Code)
 * opens that person's Hub profile. Anything else just opens the app.
 * Exported for the tests.
 */
export function routeLink(url) {
  // The web app, from a public profile's Sign up / Sign in buttons.
  if (/^https?:\/\/[^?#]*\?(?:[^#]*&)?hub=(join|signin)\b/i.test(url || '')) return openPage('HubWelcome', { next: 'back' });
  const m = /^network\.boa:\/\/+([^/?#]+)/i.exec(url || '');
  const target = m?.[1]?.toLowerCase();
  if (target === 'weather') return openPage('Forecast');
  if (target === 'now-playing') return goToTab('Radio');
  // A BOA Code (the QR on someone's Hub profile), scanned with the
  // camera: their profile, one tap from a chat.
  if (target === 'u') {
    const handle = /^network\.boa:\/\/+u\/([a-z0-9_.]{3,24})/i.exec(url)?.[1];
    if (!handle) return false;
    profileIdByUsername(handle)
      .then((id) => (id ? openPage('HubProfile', { id }) : Alert.alert('Profile not found', `There's no one on the Hub called @${handle.toLowerCase()}.`)))
      .catch(() => openPage('HubWelcome', { next: 'back' }));
    return true;
  }
  if (target === 'auth-callback') {
    completeAuthLink(url)
      .then(() => goToTab('Chat'))
      .catch((err) => {
        goToTab('Chat');
        Alert.alert(err.code === 'confirmed_sign_in' ? 'Email confirmed' : "That link didn't work", err.message);
      });
    return true;
  }
  return false;
}

// Links that open the app (cold) or arrive while it runs.
function DeepLinks({ navReady }) {
  useEffect(() => {
    if (!navReady) return;
    Linking.getInitialURL()
      .then((url) => url && routeLink(url))
      .catch(() => {});
    const sub = Linking.addEventListener('url', (e) => routeLink(e?.url));
    return () => sub?.remove?.();
  }, [navReady]);
  return null;
}

// Pages push in like iOS on every phone: the new page slides over while the
// one under it eases back a little and dims (Android's own slide is flat).
// Native, so it stays smooth however busy JS is.
const PAGE_OPTIONS = { headerShown: false, animation: 'ios_from_right', contentStyle: { backgroundColor: colors.bg } };
// A photo or reel rises into view, the way media opens in a gallery.
const MEDIA_OPTIONS = { animation: 'fade_from_bottom' };

// The tabs, with the full-screen pages (the forecast, alarms, the Creative
// Hub) stacked over them.
function MainTabs({ freshInstall = false }) {
  const [navReady, setNavReady] = useState(false);
  return (
    <NavigationContainer ref={navigationRef} theme={navTheme} onReady={() => setNavReady(true)}>
      <StatusBar style="light" />
      <Stack.Navigator screenOptions={PAGE_OPTIONS}>
        <Stack.Screen name="Tabs">{() => <Tabs />}</Stack.Screen>
        <Stack.Screen name="Forecast" component={ForecastScreen} />
        <Stack.Screen name="AlarmSettings" component={AlarmSettingsScreen} />
        <Stack.Screen name="AlarmRinging" component={AlarmRingingScreen} options={{ presentation: 'fullScreenModal', animation: 'fade', gestureEnabled: false }} />
        <Stack.Screen name="HubWelcome" component={HubWelcomeScreen} options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="HubDirectory" component={HubDirectoryScreen} />
        <Stack.Screen name="HubProfile" component={HubProfileScreen} />
        <Stack.Screen name="HubSettings" component={HubSettingsScreen} />
        <Stack.Screen name="ChatAppearance" component={ChatAppearanceScreen} />
        <Stack.Screen name="Ringtone" component={RingtoneScreen} />
        <Stack.Screen name="HubChats" component={HubChatsScreen} />
        <Stack.Screen name="HubThread" component={NewChatScreen} />
        <Stack.Screen name="AdminDashboard" component={AdminDashboard} />
        <Stack.Screen name="HubNewPost" component={HubNewPostScreen} options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="HubPost" component={HubPostScreen} options={MEDIA_OPTIONS} />
        <Stack.Screen name="HubSplits" component={HubSplitsScreen} />
        <Stack.Screen name="HubSplitSheet" component={HubSplitSheetScreen} />
        <Stack.Screen name="HubInvoice" component={HubInvoiceScreen} />
        <Stack.Screen name="HubHearts" component={HubHeartsScreen} />
      </Stack.Navigator>
      <AlarmRinger navReady={navReady} />
      <DeepLinks navReady={navReady} />
      {/* Draws the lock screen's record artwork for the station playing. */}
      <RecordArtwork />
      {/* The welcome tour and "What's New", each once. */}
      <FirstRun freshInstall={freshInstall} />
    </NavigationContainer>
  );
}

// One screen at a time: each one unmounts before the next mounts, and the
// next fades in on its own. Returning listeners go straight to the app.
function Gate() {
  const { ready, onboarded } = useUser();
  // Whether this launch started with the vibe check (a fresh install), as
  // it was when the profile loaded: "What's New" skips fresh installs.
  const [freshInstall, setFreshInstall] = useState(null);
  useEffect(() => {
    if (ready && freshInstall === null) setFreshInstall(!onboarded);
  }, [ready, onboarded, freshInstall]);
  // The profile almost always loads during the boot loader; if not, this
  // holds on the stage colour for the moment it takes.
  if (!ready) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  return onboarded ? (
    <Animated.View key="app" entering={FadeIn.duration(450)} style={{ flex: 1 }}>
      <MainTabs freshInstall={!!freshInstall} />
    </Animated.View>
  ) : (
    <Animated.View key="onboarding" entering={FadeIn.duration(450)} style={{ flex: 1 }}>
      <StatusBar style="light" />
      <OnboardingScreen />
    </Animated.View>
  );
}

// A button or timer that throws shows an alert instead of closing the app.
installCrashGuard();

/** The last line of defence: if the app itself fails to draw, say so and offer a fresh start. */
function AppFallback({ error, retry }) {
  return (
    <View style={styles.crash} testID="app-fallback">
      <Text style={styles.crashTitle}>Something went wrong</Text>
      <Text style={styles.crashBody} numberOfLines={3}>
        {String(error?.message ?? error ?? '')}
      </Text>
      <Text onPress={retry} accessibilityRole="button" style={styles.crashRetry}>
        Start again
      </Text>
    </View>
  );
}

// On the web, /u/<username> is a public profile: it opens on its own,
// without the boot loader or the vibe check.
const publicHandle = Platform.OS === 'web' && typeof window !== 'undefined' ? profileHandleFromPath(window.location.pathname) : null;

export default function App() {
  // Root, hooks, emulators and debuggers: logged once per launch, nothing blocked yet (SECURITY.md).
  useEffect(() => {
    reportDeviceThreats().catch(() => {});
  }, []);
  const [fontsLoaded, fontError] = useFonts({
    Manrope_200ExtraLight,
    Manrope_300Light,
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
    InstrumentSerif_400Regular_Italic,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_700Bold,
    SpaceGrotesk_500Medium,
    // Every icon is a glyph in this font. Loaded with the rest, so icons
    // (Shazam, YouTube Music, the tab bar) draw on their first frame rather
    // than popping in once the font arrives.
    ...Ionicons.font,
  });

  // The native splash covers the wait for the fonts; the intro takes over
  // from it. A font that fails to load falls back rather than hanging here.
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {(fontsLoaded || fontError) && (
        <ErrorBoundary name="app" fallback={(f) => <AppFallback {...f} />}>
          {publicHandle ? (
            <SafeAreaProvider>
              <PublicProfileScreen username={publicHandle} />
            </SafeAreaProvider>
          ) : (
            <Root />
          )}
        </ErrorBoundary>
      )}
    </View>
  );
}

function Root() {
  // The boot loader plays first, on its own; the app (the vibe check on a
  // first run) mounts once it has gone. The providers mount straight away,
  // so the stored profile loads while the boot loader plays.
  const [booted, setBooted] = useState(false);
  const finishBoot = useCallback(() => setBooted(true), []);
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaProvider>
        <SafeBottomFloor>
          <FontProvider>
            <UserProvider>
              <PlayerProvider>
                <SleepTimerProvider>
                  <ZenProvider>
                    <MediaProvider>
                      <WeatherProvider>
                        <AlarmProvider>
                          <HubProvider>
                            <PremiumProvider>
                              <CarActions />
                              <CallWakeUpPrompt />
                              <CallProvider>
                                <FormsProvider>{booted ? <Gate /> : <Intro onDone={finishBoot} />}</FormsProvider>
                              </CallProvider>
                            </PremiumProvider>
                          </HubProvider>
                        </AlarmProvider>
                      </WeatherProvider>
                    </MediaProvider>
                  </ZenProvider>
                </SleepTimerProvider>
              </PlayerProvider>
            </UserProvider>
          </FontProvider>
        </SafeBottomFloor>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  tabBarWrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  tabLabel: { fontFamily: fonts.semibold, letterSpacing: -0.1, textAlign: 'center', maxWidth: '100%', paddingHorizontal: 1, marginTop: 3 },
  // The gold gleam behind the BOA Originals tab icon: a soft radial glow.
  tabGleam: { position: 'absolute', backgroundColor: 'rgba(226,168,75,0.5)', boxShadow: '0px 0px 14px rgba(226,168,75,0.85)' },
  crash: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12, backgroundColor: colors.bg },
  crashTitle: { fontSize: 20, fontWeight: '600', color: colors.text, textAlign: 'center' },
  crashBody: { fontSize: 13, color: colors.textMuted, textAlign: 'center' },
  crashRetry: { marginTop: 8, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 999, overflow: 'hidden', backgroundColor: colors.text, color: colors.bg, fontWeight: '600' },
});
