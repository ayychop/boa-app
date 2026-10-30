import fs from 'fs';
import path from 'path';

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

// The Kotlin can't run here (jest-expo mocks the native side), so the car and
// heat rules are guarded at the source, the way the rest of BOA Hi-Fi is.

describe('BOA Hi-Fi in the car (Android Auto)', () => {
  const kt = read('modules/boa-eq/android/src/main/java/expo/modules/boaeq/BoaEqModule.kt');

  test('it asks Android Auto itself, and car mode, and follows the car connecting or leaving', () => {
    expect(kt).toMatch(/content:\/\/androidx\.car\.app\.connection/);
    expect(kt).toMatch(/CarConnectionState/);
    expect(kt).toMatch(/UI_MODE_TYPE_CAR/);
    expect(kt).toMatch(/registerContentObserver\(CAR_URI/);
    expect(kt).toMatch(/ACTION_ENTER_CAR_MODE/);
    expect(kt).toMatch(/ACTION_EXIT_CAR_MODE/);
    expect(read('modules/boa-eq/android/src/main/AndroidManifest.xml')).toMatch(/com\.google\.android\.projection\.gearhead/);
  });

  test('the car gets more bass and treble past Signature, the sub-bass weighted up, a louder ceiling and the wraparound stage', () => {
    expect(kt).toMatch(/CAR_EXTRA_BASS_DB = 6\.0/);
    expect(kt).toMatch(/CAR_EXTRA_TREBLE_DB = 3\.0/);
    expect(kt).toMatch(/CAR_EXTRA_GAIN_MILLIBELS = 500/);
    expect(kt).toMatch(/EXTRA_BASS_DB \+ if \(car\) CAR_EXTRA_BASS_DB else 0\.0/);
    expect(kt).toMatch(/val sub = if \(car && hz <= 120\) CAR_SUB_WEIGHT else 1\.0/);
    expect(kt).toMatch(/if \(spatial \|\| car\)/);
    expect(kt).toMatch(/val lowsPast = if \(car && lows > -1\.0\) max\(lows, CAR_MIN_PAST\)/);
    // Flat is still flat, and the phone's own sound is untouched off the car.
    expect(kt).toMatch(/val flat = lows <= -1\.0 && treble <= -1\.0/);
    expect(kt).toMatch(/val gain = if \(car && base > 0\) base \+ CAR_EXTRA_GAIN_MILLIBELS else base/);
  });

  test('the limiter still sits at the end of the chain, so the extra can not clip', () => {
    expect(kt).toMatch(/LIMITER_THRESHOLD_DB = -1f/);
    expect(kt.indexOf('loudness = make("loudness enhancer")')).toBeGreaterThan(kt.indexOf('virtualizer = make("virtualizer")'));
  });
});

describe('a hot phone, hotter while charging: the call camera steps down sooner', () => {
  const kt = read('modules/boa-call/android/src/main/java/expo/modules/boacall/BoaCallModule.kt');

  test('Android\'s thermal steps are shifted one down: LIGHT is FAIR, MODERATE is WARNING, SEVERE and up is CRITICAL', () => {
    expect(kt).toMatch(/THERMAL_STATUS_LIGHT -> 1/);
    expect(kt).toMatch(/THERMAL_STATUS_MODERATE -> 2/);
    expect(kt).toMatch(/else -> 3/);
  });

  test('the battery temperature counts too, a couple of degrees stricter while charging, and one step more when already hot', () => {
    expect(kt).toMatch(/FROM = doubleArrayOf\(0\.0, 38\.0, 41\.0, 44\.0\)/);
    expect(kt).toMatch(/CHARGING_BIAS = 2\.0/);
    expect(kt).toMatch(/ACTION_BATTERY_CHANGED/);
    expect(kt).toMatch(/if \(charging && level in 1\.\.2\) level \+= 1/);
    // Cooling holds the hotter step a degree longer, so the picture doesn't flap.
    expect(kt).toMatch(/t > FROM\[held\] - HOLD/);
    // Only a change is sent to JS.
    expect(kt).toMatch(/if \(now == lastHeat\) return/);
  });
});

describe('a GIF is never a raw address in a notification or the inbox', () => {
  const { previewText } = require('../src/chat/gifs');
  const { previewOf } = require('../src/chat/notifications');
  const raw = 'https://media3.giphy.com/media/v1.Yz/abc/giphy.gif';

  test('the app', () => {
    expect(previewOf({ kind: 'text', body: raw })).toBe('[GIF]');
    expect(previewOf({ kind: 'gif', body: raw })).toBe('[GIF]');
    expect(previewOf({ kind: 'text', body: `lol ${raw}` })).toBe('lol [GIF]');
    expect(previewText(raw)).toBe('[GIF]');
    expect(previewText('http://i.giphy.com/x.gif')).toBe('[GIF]');
    expect(previewOf({ kind: 'text', body: 'hello' })).toBe('hello');
  });

  test('the push function does the same (it builds the text the phone shows when the app is closed)', () => {
    const ts = read('supabase/functions/message-push/index.ts');
    expect(ts).toMatch(/GIF_IN_TEXT = \/https\?:\\\/\\\/\(\?:media\\d\*\\\.giphy\\\.com\|i\\\.giphy\\\.com\)\\\/\\S\+\/gi/);
    expect(ts).toMatch(/replace\(GIF_IN_TEXT, '\[GIF\]'\)/);
  });
});

describe('the notification icon fills its circle', () => {
  test('the glyph is scaled up to fill the 96px canvas (it used to leave about 9px of space round it)', () => {
    const png = fs.readFileSync(path.join(__dirname, '../assets/notification-small-icon.png'));
    expect(png.readUInt32BE(16)).toBe(96);
    expect(png.readUInt32BE(20)).toBe(96);
    // Colour type 6: still white on transparent, which Android tints.
    expect(png[25]).toBe(6);
  });
});
