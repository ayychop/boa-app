import { useCallback, useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Platform, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { DarkTheme, NavigationContainer, useIsFocused } from '@react-navigation/native';
import { BottomTabBar, createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import * as SplashScreen from 'expo-splash-screen';
import { Ionicons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import {
  Manrope_200ExtraLight,
  Manrope_300Light,
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
} from '@expo-google-fonts/manrope';
import { JetBrainsMono_400Regular, JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono';
import { InstrumentSerif_400Regular_Italic } from '@expo-google-fonts/instrument-serif';
import { PlayerProvider } from './src/context/PlayerContext';
import { MediaProvider } from './src/context/MediaContext';
import { FormsProvider } from './src/context/FormsContext';
import { UserProvider, useUser } from './src/context/UserContext';
import { PremiumProvider } from './src/context/PremiumContext';
import { SleepTimerProvider } from './src/context/SleepTimerContext';
import { ZenProvider, useZen } from './src/context/ZenContext';
import { WeatherProvider } from './src/context/WeatherContext';
import { AlarmProvider, useAlarms } from './src/context/AlarmContext';
import { HubProvider } from './src/context/HubContext';
import { currentTab, navigationRef, openPage } from './src/navigation/ref';
import OnboardingScreen from './src/screens/OnboardingScreen';
import Intro from './src/components/Intro';
import MiniPlayer from './src/components/MiniPlayer';
import RecordArtwork from './src/components/RecordArtwork';
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
import HubChatsScreen from './src/screens/hub/HubChatsScreen';
import HubThreadScreen from './src/screens/hub/HubThreadScreen';
import { colors, fonts } from './src/theme';
import { haptics } from './src/utils/haptics';
import useLayout from './src/hooks/useLayout';

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

  const style = useAnimatedStyle(() => ({ flex: 1, opacity: progress.value }));

  return <Animated.View style={[style, { paddingHorizontal: side }]}>{children}</Animated.View>;
}

// Dynamic Island-style pop on the icon that just became active: a quick dip
// then an under-damped overshoot back to size.
function TabIcon({ name, focused, color, size }) {
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);
  useEffect(() => {
    if (!focused || reduceMotion) return;
    scale.value = withSequence(
      withTiming(0.8, { duration: 90, easing: Easing.bezier(0.23, 1, 0.32, 1) }),
      withSpring(1, { duration: 480, dampingRatio: 0.42 }),
    );
  }, [focused, reduceMotion, scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View style={style}>
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
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(5,5,6,0.62)' }]} />
    </View>
  );
}

// Android's gesture bar needs at least this much clear space, even on a
// device that reports no bottom inset in edge-to-edge mode, plus some
// breathing room so the labels never sit right on the bar.
const ANDROID_MIN_BOTTOM_INSET = 20;
const ANDROID_BOTTOM_COMFORT = 10;

// Seven tabs share the bar, so the icons and labels are sized from each
// tab's slot: 18pt icons on the narrowest phones up to 24pt on tablets.
const TAB_COUNT = 7;
const tabSizing = (slot) => ({
  icon: Math.round(Math.min(24, Math.max(18, slot * 0.36))),
  label: slot < 54 ? 9 : slot < 70 ? 9.5 : 10.5,
});

function Tabs({ narrow }) {
  const insets = useSafeAreaInsets();
  const { side, short, width } = useLayout();
  // useLayout's width is already inside the side gutters the bar pads by.
  const sizing = tabSizing(width / TAB_COUNT);
  // The tab bar pads itself by this, so its icons and labels always sit
  // above the system gesture bar or navigation buttons.
  const bottomInset =
    Platform.OS === 'android' ? Math.max(insets.bottom, ANDROID_MIN_BOTTOM_INSET) + ANDROID_BOTTOM_COMFORT : insets.bottom;
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
          ...(short && { height: 40 + bottomInset }),
        },
        tabBarItemStyle: { paddingHorizontal: 0 },
        tabBarBackground: () => <TabBarBackground />,
        // Seven tabs: each label stays on one line and shrinks to fit its
        // slot (down to 65%) rather than wrapping into the icon or
        // clipping, so "BOA Originals" fits on the narrowest phones.
        // Spelled out for screen readers: a custom label means React
        // Navigation no longer builds one.
        tabBarAccessibilityLabel: `${TAB_TITLES[route.name] ?? route.name}, tab`,
        tabBarLabel: ({ color, children }) => (
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.65}
            allowFontScaling={false}
            style={[styles.tabLabel, { color, fontSize: narrow ? Math.min(9, sizing.label) : sizing.label }]}
          >
            {children}
          </Text>
        ),
        tabBarIcon: ({ focused, color }) => (
          <TabIcon name={route.name} focused={focused} color={color} size={sizing.icon} />
        ),
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

const PAGE_OPTIONS = { headerShown: false, animation: 'slide_from_right', contentStyle: { backgroundColor: colors.bg } };

// The tabs, with the full-screen pages (the forecast, alarms, the Creative
// Hub) stacked over them.
function MainTabs({ narrow }) {
  const [navReady, setNavReady] = useState(false);
  return (
    <NavigationContainer ref={navigationRef} theme={navTheme} onReady={() => setNavReady(true)}>
      <StatusBar style="light" />
      <Stack.Navigator screenOptions={PAGE_OPTIONS}>
        <Stack.Screen name="Tabs">{() => <Tabs narrow={narrow} />}</Stack.Screen>
        <Stack.Screen name="Forecast" component={ForecastScreen} />
        <Stack.Screen name="AlarmSettings" component={AlarmSettingsScreen} />
        <Stack.Screen
          name="AlarmRinging"
          component={AlarmRingingScreen}
          options={{ presentation: 'fullScreenModal', animation: 'fade', gestureEnabled: false }}
        />
        <Stack.Screen name="HubWelcome" component={HubWelcomeScreen} options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="HubDirectory" component={HubDirectoryScreen} />
        <Stack.Screen name="HubProfile" component={HubProfileScreen} />
        <Stack.Screen name="HubSettings" component={HubSettingsScreen} />
        <Stack.Screen name="HubChats" component={HubChatsScreen} />
        <Stack.Screen name="HubThread" component={HubThreadScreen} />
      </Stack.Navigator>
      <AlarmRinger navReady={navReady} />
      {/* Draws the lock screen's record artwork for the station playing. */}
      <RecordArtwork />
    </NavigationContainer>
  );
}

// One screen at a time: each one unmounts before the next mounts, and the
// next fades in on its own. Returning listeners go straight to the app.
function Gate({ narrow }) {
  const { ready, onboarded } = useUser();
  // The profile almost always loads during the boot loader; if not, this
  // holds on the stage colour for the moment it takes.
  if (!ready) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  return onboarded ? (
    <Animated.View key="app" entering={FadeIn.duration(450)} style={{ flex: 1 }}>
      <MainTabs narrow={narrow} />
    </Animated.View>
  ) : (
    <Animated.View key="onboarding" entering={FadeIn.duration(450)} style={{ flex: 1 }}>
      <StatusBar style="light" />
      <OnboardingScreen />
    </Animated.View>
  );
}

export default function App() {
  const narrow = useWindowDimensions().width < 380;
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
    // Every icon is a glyph in this font. Loaded with the rest, so icons
    // (Shazam, YouTube Music, the tab bar) draw on their first frame rather
    // than popping in once the font arrives.
    ...Ionicons.font,
  });

  // The native splash covers the wait for the fonts; the intro takes over
  // from it. A font that fails to load falls back rather than hanging here.
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {(fontsLoaded || fontError) && <Root narrow={narrow} />}
    </View>
  );
}

function Root({ narrow }) {
  // The boot loader plays first, on its own; the app (the vibe check on a
  // first run) mounts once it has gone. The providers mount straight away,
  // so the stored profile loads while the boot loader plays.
  const [booted, setBooted] = useState(false);
  const finishBoot = useCallback(() => setBooted(true), []);
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaProvider>
        <UserProvider>
          <PlayerProvider>
            <SleepTimerProvider>
              <ZenProvider>
                <MediaProvider>
                  <WeatherProvider>
                    <AlarmProvider>
                      <HubProvider>
                        <PremiumProvider>
                          <FormsProvider>
                            {booted ? <Gate narrow={narrow} /> : <Intro onDone={finishBoot} />}
                          </FormsProvider>
                        </PremiumProvider>
                      </HubProvider>
                    </AlarmProvider>
                  </WeatherProvider>
                </MediaProvider>
              </ZenProvider>
            </SleepTimerProvider>
          </PlayerProvider>
        </UserProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  tabBarWrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  tabLabel: { fontFamily: fonts.semibold, letterSpacing: -0.1, textAlign: 'center', maxWidth: '100%', paddingHorizontal: 1 },
});
