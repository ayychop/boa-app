import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import { DarkTheme, NavigationContainer, useIsFocused } from '@react-navigation/native';
import { BottomTabBar, createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  Easing,
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
import MiniPlayer from './src/components/MiniPlayer';
import HomeScreen from './src/screens/HomeScreen';
import RadioScreen from './src/screens/RadioScreen';
import OriginalsScreen from './src/screens/OriginalsScreen';
import TalentScreen from './src/screens/TalentScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import { colors, fonts } from './src/theme';
import { haptics } from './src/utils/haptics';

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
// rise, opacity-only under Reduce Motion.
function TabTransition({ children }) {
  const focused = useIsFocused();
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

  return <Animated.View style={style}>{children}</Animated.View>;
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

export default function App() {
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

  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaProvider>
        <PlayerProvider>
          <MediaProvider>
            <FormsProvider>
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
                    },
                    tabBarBackground: () => <TabBarBackground />,
                    tabBarLabelStyle: { fontFamily: fonts.semibold, fontSize: 10.5, letterSpacing: 0.2 },
                    tabBarIcon: ({ focused, color, size }) => (
                      <TabIcon name={route.name} focused={focused} color={color} size={size} />
                    ),
                  })}
                  screenListeners={{ tabPress: () => haptics.selection() }}
                >
                  <Tab.Screen name="Home" component={Home} />
                  <Tab.Screen name="Radio" component={Radio} />
                  <Tab.Screen name="Originals" component={Originals} options={{ title: 'Originals' }} />
                  <Tab.Screen name="Talent" component={Talent} />
                  <Tab.Screen name="Profile" component={Profile} />
                </Tab.Navigator>
              </NavigationContainer>
            </FormsProvider>
          </MediaProvider>
        </PlayerProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  tabBarWrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
});
