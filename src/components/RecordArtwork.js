import { useEffect, useRef, useState } from 'react';
import { Image, Platform, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { captureRef } from 'react-native-view-shot';
import { usePlayer } from '../context/PlayerContext';
import * as engine from '../audio/engine';
import * as widget from '../../modules/boa-widget';
import { useStationLogo } from '../api/stationArt';
import BoaLogo from './BoaLogo';
import { colors } from '../theme';

// The lock screen and media notification show this as the album art: a
// vinyl record with the station's logo as its centre label, like a record
// on a turntable. It's drawn once per station, off screen, captured to a
// PNG in the cache and handed to the media session and the home screen
// widget. (Lock screens show a still image; the record can't spin there.)
// The label is the station's logo (api/stationArt.js finds one when the
// listed logo is dead), else the BOA Network logo, so it is never blank.
const SIZE = 512;
const LABEL = Math.round(SIZE * 0.42);
const GROOVES = [0.95, 0.89, 0.83, 0.77, 0.71, 0.65, 0.59, 0.53];
const METAL = ['#F2F2F4', '#8A8A90', '#FAFAFB', '#5E5E64', '#D9D9DD', '#77777D'];
// Give up on a logo that never loads, and print the record without it.
const LOGO_TIMEOUT_MS = 6000;

export function RecordFace({ station, logo = station?.logo, onLogoSettled }) {
  return (
    <View style={styles.record} collapsable={false}>
      <LinearGradient colors={METAL} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={styles.disc}>
        {GROOVES.map((r, i) => (
          <View
            key={r}
            style={[
              styles.groove,
              {
                width: SIZE * r,
                height: SIZE * r,
                borderRadius: (SIZE * r) / 2,
                borderColor: i % 2 ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.11)',
              },
            ]}
          />
        ))}
        {/* A soft sheen across the vinyl, as light catches a record. */}
        <LinearGradient
          colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.10)', 'rgba(255,255,255,0)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.label}>
          {logo ? (
            <Image
              source={{ uri: logo }}
              testID="record-artwork-logo"
              style={styles.logo}
              resizeMode="cover"
              onLoad={onLogoSettled}
              onError={onLogoSettled}
            />
          ) : (
            <View style={styles.boa} testID="record-artwork-boa">
              <BoaLogo height={LABEL * 0.26} color="#050506" />
            </View>
          )}
          <View style={styles.spindle} />
        </View>
      </View>
    </View>
  );
}

export default function RecordArtwork() {
  const { current } = usePlayer();
  const station = current?.kind === 'radio' ? current : null;
  const ref = useRef(null);
  const done = useRef(new Set());
  const [ready, setReady] = useState(null); // station id whose logo has settled
  // undefined while it's still being looked for; null means the BOA logo.
  const logo = useStationLogo(station);

  useEffect(() => {
    if (!station || done.current.has(station.id) || logo === undefined) return;
    if (!logo) {
      setReady(station.id);
      return;
    }
    const id = setTimeout(() => setReady(station.id), LOGO_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [station, logo]);

  useEffect(() => {
    if (!station || ready !== station.id || done.current.has(station.id)) return;
    let alive = true;
    // One frame for the logo to be drawn before the snapshot.
    const raf = requestAnimationFrame(() => {
      captureRef(ref, { format: 'png', quality: 1, width: SIZE, height: SIZE, result: 'tmpfile' })
        .then((uri) => {
          if (!alive) return;
          done.current.add(station.id);
          engine.setArtwork(station.id, uri);
          widget.setArtwork(station.id, uri);
        })
        .catch((err) => console.warn('[artwork] record capture failed', err?.message ?? err));
    });
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, [ready, station]);

  // The browser's media session uses the logo; nothing to render there.
  if (Platform.OS === 'web' || !station || done.current.has(station.id)) return null;
  return (
    <View pointerEvents="none" style={styles.offscreen} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View ref={ref} collapsable={false} testID="record-artwork">
        <RecordFace key={station.id} station={station} logo={logo} onLogoSettled={() => setReady(station.id)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Laid out and drawn (so it can be captured) but well off screen.
  offscreen: { position: 'absolute', left: -SIZE * 3, top: 0, width: SIZE, height: SIZE },
  record: { width: SIZE, height: SIZE, borderRadius: SIZE / 2, overflow: 'hidden', backgroundColor: '#111' },
  disc: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    bottom: 12,
    borderRadius: SIZE / 2,
    backgroundColor: '#0B0B0D',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  groove: { position: 'absolute', borderWidth: 1.5 },
  label: {
    width: LABEL,
    height: LABEL,
    borderRadius: LABEL / 2,
    overflow: 'hidden',
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: '#1A1A1D',
  },
  logo: { ...StyleSheet.absoluteFillObject },
  boa: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'flex-start', paddingTop: LABEL * 0.16 },
  spindle: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#050506', borderWidth: 2, borderColor: '#2A2A2E' },
});
