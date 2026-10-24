import { useCallback, useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import { DarkTheme, NavigationContainer, useIsFocused } from '@react-navigation/native';
import { BottomTabBar, createBottomTabNavigator } from '@react-navigation/bottom-tabs';
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
import { DisplayProvider } from './src/context/DisplayContext';
import OnboardingScreen from './src/screens/OnboardingScreen';
import Intro from './src/components/Intro';
import MiniPlayer from './src/components/MiniPlayer';
import RecordArtwork from './src/components/RecordArtwork';
import HomeScreen from './src/screens/HomeScreen';
import RadioScreen from './src/screens/RadioScreen';
import OriginalsScreen from './src/screens/OriginalsScreen';
import TalentScreen from './src/screens/TalentScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import { colors, fonts } from './src/theme';
import { haptics } from './src/utils/haptics';
import useLayout from './src/hooks/useLayout';

// The native splash stays up until the intro is on screen, then dissolves
// into it.
SplashScreen.preventAutoHideAsync().catch(() => {});
SplashScreen.setOptions({ fade: true, duration: 500 });

const Tab = createBottomTabNavigator();

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

const ICONS = {
  Home: ['home', 'home-outline'],
  Radio: ['radio', 'radio-outline'],
  Originals: ['film', 'film-outline'],
  Talent: ['people', 'people-outline'],
  Profile: ['person', 'person-outline'],
};

// easeOutExpo: nearly all of the movement happens in the first third, so the
// new tab is readable almost at once and then just settles.
const EASE_OUT_EXPO = Easing.bezier(0.16, 1, 0.3, 1);

// Tabs are switched constantly, so this stays small: a short fade and an 8pt
// rise, opacity-only under Reduce Motion. Also keeps every screen clear of a
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

  const style = useAnimatedStyle(() => ({
    flex: 1,
    opacity: progress.value,
    transform: [{ translateY: reduceMotion ? 0 : (1 - progress.value) * 8 }],
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
    scale.value = withSequence(
      withTiming(0.8, { duration: 90, easing: Easing.bezier(0.23, 1, 0.32, 1) }),
      withSpring(1, { duration: 480, dampingRatio: 0.42 }),
    );
  }, [focused, reduceMotion, scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View style={style}>
      <Ionicons name={ICONS[name][focused ? 0 : 1]} size={size - 3} color={color} />
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
const Originals = withTransition(OriginalsScreen);
const Talent = withTransition(TalentScreen);
const Profile = withTransition(ProfileScreen);

// Tab bar and mini player float over the screens so content scrolls beneath
// the blur; screens pad themselves with useBottomSpace().
function FloatingTabBar(props) {
  // Home docks the mini player at its top instead, clear of its content.
  const onHome = props.state.routes[props.state.index]?.name === 'Home';
  return (
    <View style={styles.tabBarWrap} pointerEvents="box-none">
      {!onHome && <MiniPlayer onOpenRadio={() => props.navigation.navigate('Radio')} />}
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

function MainTabs({ narrow }) {
  const insets = useSafeAreaInsets();
  const { side, short } = useLayout();
  // The tab bar pads itself by this, so its icons and labels always sit
  // above the system gesture bar or navigation buttons.
  const bottomInset =
    Platform.OS === 'android' ? Math.max(insets.bottom, ANDROID_MIN_BOTTOM_INSET) + ANDROID_BOTTOM_COMFORT : insets.bottom;
  return (
    <NavigationContainer theme={navTheme}>
      <StatusBar style="light" />
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
          tabBarBackground: () => <TabBarBackground />,
          // Five tabs: step the labels down on narrow phones so
          // "BOA Originals" fits without truncating.
          tabBarLabelStyle: { fontFamily: fonts.semibold, fontSize: narrow ? 9.5 : 10, letterSpacing: -0.1 },
          tabBarIcon: ({ focused, color, size }) => (
            <TabIcon name={route.name} focused={focused} color={color} size={size} />
          ),
        })}
        screenListeners={{ tabPress: () => haptics.selection() }}
      >
        <Tab.Screen name="Home" component={Home} />
        <Tab.Screen name="Radio" component={Radio} />
        <Tab.Screen name="Originals" component={Originals} options={{ title: 'BOA Originals' }} />
        <Tab.Screen name="Talent" component={Talent} />
        <Tab.Screen name="Profile" component={Profile} />
      </Tab.Navigator>
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
              <DisplayProvider>
                <MediaProvider>
                  <PremiumProvider>
                    <FormsProvider>
                      {booted ? <Gate narrow={narrow} /> : <Intro onDone={finishBoot} />}
                    </FormsProvider>
                  </PremiumProvider>
                </MediaProvider>
              </DisplayProvider>
            </SleepTimerProvider>
          </PlayerProvider>
        </UserProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  tabBarWrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
});
