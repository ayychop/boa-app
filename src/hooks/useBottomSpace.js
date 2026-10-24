import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useRoute } from '@react-navigation/native';
import { useMiniPlayerShown, useMiniPlayerSpace } from '../components/MiniPlayer';

// The tab bar is translucent and floats over content, as does the mini
// player once something is on (the radio, a podcast or a Zen sound; except
// on Home, where it docks at the top, and Zen); scroll views pad by this
// much.
export default function useBottomSpace(extra = 0) {
  const tabBar = useBottomTabBarHeight();
  const shown = useMiniPlayerShown();
  const miniPlayer = useMiniPlayerSpace();
  // Home docks the mini player at the top; Zen has its own controls.
  const route = useRoute().name;
  const docked = route === 'Home' || route === 'Zen';
  return tabBar + (shown && !docked ? miniPlayer : 0) + extra;
}
