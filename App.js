import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { DarkTheme, NavigationContainer } from '@react-navigation/native';
import { BottomTabBar, createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { PlayerProvider } from './src/context/PlayerContext';
import MiniPlayer from './src/components/MiniPlayer';
import HomeScreen from './src/screens/HomeScreen';
import RadioScreen from './src/screens/RadioScreen';
import OriginalsScreen from './src/screens/OriginalsScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import { colors } from './src/theme';

const Tab = createBottomTabNavigator();

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.text,
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
  Profile: ['person', 'person-outline'],
};

// Mini player sits in the tab bar slot so it stays pinned directly above the
// tabs on every screen, like Spotify.
function TabBarWithPlayer(props) {
  return (
    <View style={{ backgroundColor: colors.bg }}>
      <MiniPlayer />
      <BottomTabBar {...props} />
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <PlayerProvider>
        <NavigationContainer theme={navTheme}>
          <StatusBar style="light" />
          <Tab.Navigator
            initialRouteName="Radio"
            tabBar={(props) => <TabBarWithPlayer {...props} />}
            screenOptions={({ route }) => ({
              headerShown: false,
              tabBarActiveTintColor: colors.text,
              tabBarInactiveTintColor: colors.textFaint,
              tabBarStyle: { backgroundColor: colors.bg, borderTopColor: colors.border },
              tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
              tabBarIcon: ({ focused, color, size }) => (
                <Ionicons name={ICONS[route.name][focused ? 0 : 1]} size={size - 2} color={color} />
              ),
            })}
          >
            <Tab.Screen name="Home" component={HomeScreen} />
            <Tab.Screen name="Radio" component={RadioScreen} />
            <Tab.Screen name="Originals" component={OriginalsScreen} options={{ title: 'BOA Originals' }} />
            <Tab.Screen name="Profile" component={ProfileScreen} />
          </Tab.Navigator>
        </NavigationContainer>
      </PlayerProvider>
    </SafeAreaProvider>
  );
}
