import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useUser } from './UserContext';
import BottomSheet from '../components/BottomSheet';
import PremiumScreen, { PRICE } from '../components/premium/PremiumScreen';
import { Button, Slate } from '../components/ui';
import { colors, space, type } from '../theme';

const PremiumContext = createContext(null);

/**
 * BOA Premium surfaces: the full Premium screen and the paywall sheet that
 * intercepts locked actions. `requirePremium(action, message)` runs the
 * action for Premium listeners and shows the paywall to everyone else.
 */
export function PremiumProvider({ children }) {
  const { isPremium } = useUser();
  const [screenOpen, setScreenOpen] = useState(false);
  const [paywall, setPaywall] = useState({ open: false, message: '' });

  const openPremium = useCallback(() => setScreenOpen(true), []);

  const requirePremium = useCallback(
    (action, message) => {
      if (isPremium) action();
      else setPaywall({ open: true, message });
    },
    [isPremium],
  );

  const value = useMemo(() => ({ openPremium, requirePremium }), [openPremium, requirePremium]);

  return (
    <PremiumContext.Provider value={value}>
      {children}
      <BottomSheet open={paywall.open} onClose={() => setPaywall((p) => ({ ...p, open: false }))}>
        <View style={styles.sheet}>
          <Animated.View entering={ZoomIn.springify().damping(12)} style={styles.lock}>
            <Ionicons name="heart" size={26} color={colors.bg} />
          </Animated.View>
          <Slate dot style={{ marginTop: space.lg }}>
            BOA Premium
          </Slate>
          <Text style={[type.h1, styles.title]}>{paywall.message}</Text>
          <Text style={[type.bodyMuted, styles.body]}>
            Premium also unlocks ad-free listening, Hi-Fi audio, early access and offline downloads, for {PRICE}/month.
          </Text>
          <Button
            label="Go Premium"
            icon="diamond"
            onPress={() => {
              setPaywall((p) => ({ ...p, open: false }));
              setScreenOpen(true);
            }}
            style={{ alignSelf: 'stretch', marginTop: space.xl }}
          />
        </View>
      </BottomSheet>
      <PremiumScreen open={screenOpen} onClose={() => setScreenOpen(false)} />
    </PremiumContext.Provider>
  );
}

export function usePremium() {
  const ctx = useContext(PremiumContext);
  if (!ctx) throw new Error('usePremium must be used inside <PremiumProvider>');
  return ctx;
}

const styles = StyleSheet.create({
  sheet: { alignItems: 'center', paddingHorizontal: space.xl, paddingBottom: space.md },
  lock: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.gold,
    boxShadow: '0px 10px 30px rgba(226,168,75,0.45)',
  },
  title: { textAlign: 'center', marginTop: space.sm },
  body: { textAlign: 'center', marginTop: space.md, maxWidth: 420 },
});
