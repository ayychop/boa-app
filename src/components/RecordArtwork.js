import { useEffect, useRef, useState } from 'react';
import { Image, Platform, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient as SvgLinear, Path, RadialGradient as SvgRadial, Stop } from 'react-native-svg';
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
//
// Drawn in SVG at 1024 px so the edges stay smooth however large the lock
// screen shows it: a brushed-silver rim, deep vinyl with fine grooves and
// the wider gaps between tracks, the two crossed streaks of light a real
// record catches, a glossy label and a machined metal spindle. The
// proportions (rim, vinyl, label) are the same as ever, so the record
// fills its frame exactly as before.
const SIZE = 1024;
const R = SIZE / 2;
const RIM = Math.round(SIZE * (12 / 512)); // the silver edge
const VINYL = R - RIM;
const LABEL = Math.round(SIZE * 0.42);
const LABEL_R = LABEL / 2;
const LABEL_EDGE = Math.round(SIZE * (4 / 512));
// Fine grooves from just outside the label to the lead-in at the edge.
const GROOVES = Array.from({ length: 64 }, (_, i) => LABEL_R + 18 + i * ((VINYL - LABEL_R - 30) / 63));
// The quiet gaps between tracks: a dark band with a bright hairline.
const TRACK_GAPS = [0.58, 0.69, 0.8, 0.9].map((f) => LABEL_R + (VINYL - LABEL_R) * f);
// Give up on a logo that never loads, and print the record without it.
const LOGO_TIMEOUT_MS = 6000;
// A loaded logo gets this long to be drawn before the snapshot.
const PAINT_MS = 250;
// The light across the vinyl: [centre angle, width, strength]. Each streak
// is feathered from thin slices whose brightness follows a bell curve, so
// it fades in and out like real light on a record, with no hard edges.
const STREAKS = [
  [-45, 44, 1],
  [135, 44, 1],
  [31, 30, 0.45],
  [211, 30, 0.45],
];
const SLICES = 14;
const SHEEN = STREAKS.flatMap(([centre, width, strength]) =>
  Array.from({ length: SLICES }, (_, i) => {
    const x = -1 + (2 * (i + 0.5)) / SLICES;
    const from = centre - width / 2 + (i * width) / SLICES;
    return { from, to: from + width / SLICES + 0.4, opacity: strength * Math.exp(-(x * x) / (2 * 0.38 * 0.38)) };
  }),
);

// A wedge from the centre between two angles (degrees, 0 = 3 o'clock).
function wedge(from, to, radius) {
  const rad = (d) => (d * Math.PI) / 180;
  const x1 = R + radius * Math.cos(rad(from));
  const y1 = R + radius * Math.sin(rad(from));
  const x2 = R + radius * Math.cos(rad(to));
  const y2 = R + radius * Math.sin(rad(to));
  return `M ${R} ${R} L ${x1} ${y1} A ${radius} ${radius} 0 0 1 ${x2} ${y2} Z`;
}

/** The vinyl, rim, grooves and light: everything under the label. */
function Vinyl() {
  return (
    <Svg width={SIZE} height={SIZE} style={StyleSheet.absoluteFill}>
      <Defs>
        <SvgLinear id="rim" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#F4F4F6" />
          <Stop offset="0.22" stopColor="#8C8C92" />
          <Stop offset="0.42" stopColor="#FBFBFC" />
          <Stop offset="0.6" stopColor="#5C5C62" />
          <Stop offset="0.8" stopColor="#DADADF" />
          <Stop offset="1" stopColor="#6E6E74" />
        </SvgLinear>
        <SvgRadial id="vinyl" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#1C1C20" />
          <Stop offset="0.55" stopColor="#111114" />
          <Stop offset="1" stopColor="#050506" />
        </SvgRadial>
        <SvgRadial id="sheen" cx="50%" cy="50%" r="50%">
          <Stop offset="0.38" stopColor="#FFFFFF" stopOpacity="0" />
          <Stop offset="0.7" stopColor="#FFFFFF" stopOpacity="0.16" />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0.02" />
        </SvgRadial>
      </Defs>
      {/* Brushed silver rim, with a dark seam where it meets the vinyl. */}
      <Circle cx={R} cy={R} r={R} fill="url(#rim)" />
      <Circle cx={R} cy={R} r={VINYL + 1} fill="#0A0A0C" />
      <Circle cx={R} cy={R} r={VINYL} fill="url(#vinyl)" />
      {/* The grooves: fine rings, alternately catching and losing the light. */}
      {GROOVES.map((r, i) => (
        <Circle key={r} cx={R} cy={R} r={r} fill="none" stroke={i % 3 === 0 ? 'rgba(255,255,255,0.075)' : 'rgba(255,255,255,0.035)'} strokeWidth={1.2} />
      ))}
      {TRACK_GAPS.map((r) => (
        <G key={r}>
          <Circle cx={R} cy={R} r={r} fill="none" stroke="#040405" strokeWidth={7} />
          <Circle cx={R} cy={R} r={r + 4} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth={1} />
        </G>
      ))}
      {/* The smooth run-out by the label, and the lead-in at the edge. */}
      <Circle cx={R} cy={R} r={LABEL_R + 12} fill="none" stroke="#0A0A0C" strokeWidth={14} />
      <Circle cx={R} cy={R} r={VINYL - 6} fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth={1.5} />
      {/* Light across the record: two bright opposite streaks, two faint ones. */}
      {SHEEN.map((slice) => (
        <Path key={slice.from} d={wedge(slice.from, slice.to, VINYL)} fill="url(#sheen)" opacity={slice.opacity} />
      ))}
    </Svg>
  );
}

/** Over the label: a soft gloss, the label's edge and the metal spindle. */
function Spindle() {
  return (
    <Svg width={SIZE} height={SIZE} style={StyleSheet.absoluteFill}>
      <Defs>
        <SvgRadial id="gloss" cx="35%" cy="28%" r="70%">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.22" />
          <Stop offset="0.6" stopColor="#FFFFFF" stopOpacity="0" />
        </SvgRadial>
        <SvgRadial id="steel" cx="38%" cy="32%" r="70%">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="0.35" stopColor="#C9CACF" />
          <Stop offset="0.75" stopColor="#6F7076" />
          <Stop offset="1" stopColor="#2C2C30" />
        </SvgRadial>
      </Defs>
      <Circle cx={R} cy={R} r={LABEL_R} fill="url(#gloss)" />
      <Circle cx={R} cy={R} r={LABEL_R - LABEL_EDGE / 2} fill="none" stroke="#1A1A1D" strokeWidth={LABEL_EDGE} />
      {/* The spindle: a polished steel post through the centre hole. */}
      <Circle cx={R} cy={R} r={30} fill="#0B0B0D" />
      <Circle cx={R} cy={R} r={24} fill="url(#steel)" stroke="#1A1A1D" strokeWidth={2} />
      <Circle cx={R} cy={R} r={9} fill="#3A3A3F" />
      <Circle cx={R - 7} cy={R - 8} r={4} fill="#FFFFFF" opacity={0.85} />
    </Svg>
  );
}

export function RecordFace({ station, logo = station?.logo, onLogoSettled }) {
  // A logo that won't load gives way to the BOA logo: never a blank label.
  const [failed, setFailed] = useState(false);
  const showLogo = !!logo && !failed;
  return (
    <View style={styles.record} collapsable={false}>
      <Vinyl />
      <View style={styles.label}>
        {showLogo ? (
          <Image
            source={{ uri: logo }}
            testID="record-artwork-logo"
            style={styles.logo}
            resizeMode="cover"
            onLoad={onLogoSettled}
            onError={() => {
              setFailed(true);
              onLogoSettled?.();
            }}
          />
        ) : (
          <View style={styles.boa} testID="record-artwork-boa">
            <BoaLogo height={LABEL * 0.26} color="#050506" />
          </View>
        )}
      </View>
      <Spindle />
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
    let raf = null;
    // Time for the logo to be drawn, then a frame, then the snapshot.
    const wait = setTimeout(() => {
      raf = requestAnimationFrame(() => {
        captureRef(ref, { format: 'png', quality: 1, width: SIZE, height: SIZE, result: 'tmpfile' })
          .then((uri) => {
            if (!alive) return;
            done.current.add(station.id);
            engine.setArtwork(station.id, uri);
            widget.setArtwork(station.id, uri);
          })
          .catch((err) => console.warn('[artwork] record capture failed', err?.message ?? err));
      });
    }, PAINT_MS);
    return () => {
      alive = false;
      clearTimeout(wait);
      if (raf != null) cancelAnimationFrame(raf);
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
  record: { width: SIZE, height: SIZE, borderRadius: R, overflow: 'hidden', backgroundColor: '#111' },
  label: {
    position: 'absolute',
    left: R - LABEL_R,
    top: R - LABEL_R,
    width: LABEL,
    height: LABEL,
    borderRadius: LABEL_R,
    overflow: 'hidden',
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: { ...StyleSheet.absoluteFillObject },
  boa: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'flex-start', paddingTop: LABEL * 0.16 },
});
