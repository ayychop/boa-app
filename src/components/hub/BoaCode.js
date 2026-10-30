import { useMemo } from 'react';
import { Share, StyleSheet, View } from 'react-native';
import Text from '../ScopedText';
import Svg, { Rect } from 'react-native-svg';
import QRCode from 'qrcode/lib/core/qrcode';
import BottomSheet from '../BottomSheet';
import { Avatar } from '../kit';
import { Button } from '../ui';
import { profileUrl } from '../../web/seo';
import { colors, fonts, radius, space, type } from '../../theme';

/** What a BOA Code holds: opens the app straight on this profile. */
export const boaCodeLink = (username) => `network.boa://u/${username}`;

/** The QR's modules as a size x size grid of booleans. */
export function qrMatrix(text) {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: 'M' });
  return { size: modules.size, on: (x, y) => !!modules.get(y, x) };
}

/** A QR code drawn with plain SVG squares: near-black on cream, so every camera reads it. */
export function QrCode({ value, size = 220 }) {
  const qr = useMemo(() => qrMatrix(value), [value]);
  // Four modules of quiet zone round the code, as scanners expect.
  const cells = qr.size + 8;
  const cell = size / cells;
  const squares = [];
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (qr.on(x, y)) squares.push(<Rect key={`${x}-${y}`} x={(x + 4) * cell} y={(y + 4) * cell} width={cell + 0.3} height={cell + 0.3} fill="#0B0B0D" />);
    }
  }
  return (
    <Svg width={size} height={size} accessibilityLabel="BOA Code" testID="boa-code-qr">
      <Rect width={size} height={size} rx={18} fill="#F3EFE8" />
      {squares}
    </Svg>
  );
}

/**
 * Your BOA Code: a QR of your Hub profile. Someone points their phone's
 * camera at it, BOA opens on your profile, and they tap Message. No
 * spelling out usernames. Share sends your profile link instead.
 */
export default function BoaCodeSheet({ open, onClose, profile }) {
  if (!profile) return null;
  const name = profile.display_name || `@${profile.username}`;
  const share = () => Share.share({ message: `Find me on BOA HUB: ${profileUrl(profile.username)}` }).catch(() => {});
  return (
    <BottomSheet open={open} onClose={onClose} glass>
      <View style={styles.sheet} testID="boa-code-sheet">
        <Text style={styles.kicker}>Your BOA Code</Text>
        <View style={styles.card}>
          <QrCode value={boaCodeLink(profile.username)} />
          <View style={styles.who}>
            <Avatar uri={profile.avatar_url} name={name} size={36} ring={!!profile.is_boa_star} />
            <View style={{ flexShrink: 1 }}>
              <Text style={styles.name} numberOfLines={1}>
                {name}
              </Text>
              <Text style={styles.handle} numberOfLines={1}>
                @{profile.username}
              </Text>
            </View>
          </View>
        </View>
        <Text style={[type.bodyMuted, styles.hint]}>Point a phone camera here. BOA opens on your profile, one tap from a chat.</Text>
        <Button label="Share profile link" icon="share-outline" variant="ghost" onPress={share} style={{ marginTop: space.lg }} testID="boa-code-share" />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheet: { paddingHorizontal: space.xl, paddingTop: space.sm, alignItems: 'center' },
  kicker: { fontFamily: fonts.mono, fontSize: 11, letterSpacing: 1.8, textTransform: 'uppercase', color: colors.gold, marginBottom: space.lg },
  card: {
    alignItems: 'center',
    padding: space.lg,
    borderRadius: radius.lg + 8,
    backgroundColor: 'rgba(18,18,22,0.7)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(226,168,75,0.45)',
    boxShadow: '0px 10px 34px rgba(226,168,75,0.22)',
  },
  who: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.lg, maxWidth: 240 },
  name: { fontFamily: fonts.semibold, fontSize: 16, color: colors.text },
  handle: { fontFamily: fonts.medium, fontSize: 12.5, color: colors.textMuted },
  hint: { textAlign: 'center', marginTop: space.lg, maxWidth: 300 },
});
