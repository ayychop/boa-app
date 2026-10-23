import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useRoute } from '@react-navigation/native';
import { usePlayer } from '../context/PlayerContext';
import { useMiniPlayerSpace } from '../components/MiniPlayer';

// The tab bar is translucent and floats over content, as does the mini
// player once something is playing (except on Home, where it docks at the
// top); scroll views pad by this much.
export default function useBottomSpace(extra = 0) {
  const tabBar = useBottomTabBarHeight();
  const { current } = usePlayer();
  const miniPlayer = useMiniPlayerSpace();
  const onHome = useRoute().name === 'Home';
  return tabBar + (current && !onHome ? miniPlayer : 0) + extra;
}
