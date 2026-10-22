import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { usePlayer } from '../context/PlayerContext';
import { useMiniPlayerSpace } from '../components/MiniPlayer';

// The tab bar is translucent and floats over content, as does the mini
// player once something is playing; scroll views pad by this much.
export default function useBottomSpace(extra = 0) {
  const tabBar = useBottomTabBarHeight();
  const { current } = usePlayer();
  const miniPlayer = useMiniPlayerSpace();
  return tabBar + (current ? miniPlayer : 0) + extra;
}
