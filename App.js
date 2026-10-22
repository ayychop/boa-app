import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { DarkTheme, NavigationContainer, useIsFocused } from '@react-navigation/native';
import { BottomTabBar, createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import {
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
import { DisplayButton } from './src/components/display/DisplayMenu';
import OnboardingScreen from './src/screens/OnboardingScreen';
import BoaLogo from './src/components/BoaLogo';
import { PulseDot } from './src/components/ui';
import MiniPlayer from './src/components/MiniPlayer';
import HomeScreen from './src/screens/HomeScreen';
import RadioScreen from './src/screens/RadioScreen';
import OriginalsScreen from './src/screens/OriginalsScreen';
import TalentScreen from './src/screens/TalentScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import { colors, fonts } from './src/theme';
import { haptics } from './src/utils/haptics';
import useLayout from './src/hooks/useLayout';

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
  return (
    <View style={styles.tabBarWrap} pointerEvents="box-none">
      <MiniPlayer onOpenRadio={() => props.navigation.navigate('Radio')} />
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

function MainTabs({ narrow }) {
  const insets = useSafeAreaInsets();
  const { side, short } = useLayout();
  return (
    <NavigationContainer theme={navTheme}>
      <StatusBar style="light" />
      <Tab.Navigator
        initialRouteName="Home"
        tabBar={(props) => <FloatingTabBar {...props} />}
        screenOptions={({ route }) => ({
          headerShown: false,
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
            ...(short && { height: 40 + insets.bottom }),
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
      <DisplayButton />
    </NavigationContainer>
  );
}

// Shown while fonts and the saved profile load: the splash screen's own
// layout (gold wordmark on charcoal) with the Vyb dot, so the native splash
// hands over without a visible change.
function BootScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <BoaLogo height={130} />
        <PulseDot size={8} style={{ marginLeft: 10, marginTop: 4 }} />
      </View>
    </View>
  );
}

// First run shows the vibe check; after that, straight to the app. Waits for
// the stored profile so returning listeners never see onboarding flash past.
function Gate({ narrow }) {
  const { ready, onboarded } = useUser();
  if (!ready) return <BootScreen />;
  return onboarded ? (
    <Animated.View key="app" entering={FadeIn.duration(450)} style={{ flex: 1 }}>
      <MainTabs narrow={narrow} />
    </Animated.View>
  ) : (
    <Animated.View key="onboarding" exiting={FadeOut.duration(300)} style={{ flex: 1 }}>
      <StatusBar style="light" />
      <OnboardingScreen />
    </Animated.View>
  );
}

export default function App() {
  const narrow = useWindowDimensions().width < 380;
  const [fontsLoaded] = useFonts({
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

  if (!fontsLoaded) return <BootScreen />;

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
                      <Gate narrow={narrow} />
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
