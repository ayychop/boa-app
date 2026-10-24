import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useRoute } from '@react-navigation/native';
import { usePlayer } from '../context/PlayerContext';
import { useMiniPlayerSpace } from '../components/MiniPlayer';

// The tab bar is translucent and floats over content, as does the mini
// player once something is playing (except on Home, where it docks at the
// top, and Zen); scroll views pad by this much.
export default function useBottomSpace(extra = 0) {
  const tabBar = useBottomTabBarHeight();
  const { current } = usePlayer();
  const miniPlayer = useMiniPlayerSpace();
  // Home docks the mini player at the top; Zen has its own controls.
  const route = useRoute().name;
  const docked = route === 'Home' || route === 'Zen';
  return tabBar + (current && !docked ? miniPlayer : 0) + extra;
}
