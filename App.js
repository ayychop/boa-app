import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import { DarkTheme, NavigationContainer, useIsFocused } from '@react-navigation/native';
import { BottomTabBar, createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';
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
import MiniPlayer from './src/components/MiniPlayer';
import HomeScreen from './src/screens/HomeScreen';
import RadioScreen from './src/screens/RadioScreen';
import OriginalsScreen from './src/screens/OriginalsScreen';
import TalentScreen from './src/screens/TalentScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import { colors, fonts } from './src/theme';

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

// Each tab rises and fades in on a soft spring when it gains focus.
function TabTransition({ children }) {
  const focused = useIsFocused();
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(focused ? 1 : 0);

  useEffect(() => {
    if (!focused) progress.value = 0;
    else progress.value = reduceMotion ? 1 : withSpring(1, { stiffness: 210, damping: 26, mass: 0.9 });
  }, [focused, reduceMotion, progress]);

  const style = useAnimatedStyle(() => ({
    flex: 1,
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 14 }, { scale: 0.985 + progress.value * 0.015 }],
  }));

  return <Animated.View style={style}>{children}</Animated.View>;
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
      <MiniPlayer onOpen={() => props.navigation.navigate('Radio')} />
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
                    <Ionicons name={ICONS[route.name][focused ? 0 : 1]} size={size - 3} color={color} />
                  ),
                })}
              >
                <Tab.Screen name="Home" component={Home} />
                <Tab.Screen name="Radio" component={Radio} />
                <Tab.Screen name="Originals" component={Originals} options={{ title: 'Originals' }} />
                <Tab.Screen name="Talent" component={Talent} />
                <Tab.Screen name="Profile" component={Profile} />
              </Tab.Navigator>
            </NavigationContainer>
          </MediaProvider>
        </PlayerProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  tabBarWrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
});
