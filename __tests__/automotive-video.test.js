import * as fs from 'fs';
import * as path from 'path';

// The Android Automotive OS build (BOA_AUTOMOTIVE=1): the parked-only
// player, its playback service (sound on, picture off while driving) and
// Google's parked-app manifest rules (plugins/withAutomotiveVideo.js).

const { applyAutomotive, VIDEO_SERVICE, CAR_PERMISSIONS } = require('../plugins/withAutomotiveVideo');

function manifest() {
  return { $: {}, application: [{ $: {}, activity: [{ $: {}, 'meta-data': [{ $: { 'android:name': 'distractionOptimized' } }] }] }] };
}

describe('the car build manifest', () => {
  test('is a video app, automotive only, with no distraction optimised screens', () => {
    const m = applyAutomotive(manifest());
    expect(m.application[0].$['android:appCategory']).toBe('video');
    expect(m['uses-feature']).toContainEqual({ $: expect.objectContaining({ 'android:name': 'android.hardware.type.automotive', 'android:required': 'true' }) });
    expect(m.application[0].activity[0]['meta-data']).toEqual([]);
    expect(m['uses-permission'].map((p) => p.$['android:name'])).toEqual(expect.arrayContaining(CAR_PERMISSIONS));
  });

  test('declares the video playback service once, as a media playback session', () => {
    const m = applyAutomotive(applyAutomotive(manifest()));
    const services = m.application[0].service.filter((s) => s.$['android:name'] === VIDEO_SERVICE);
    expect(services).toHaveLength(1);
    expect(services[0].$['android:foregroundServiceType']).toBe('mediaPlayback');
    expect(services[0]['intent-filter'][0].action[0].$['android:name']).toBe('androidx.media3.session.MediaSessionService');
  });

  test('the phone build never gets the service: the module manifest leaves it out', () => {
    const own = fs.readFileSync(path.join(__dirname, '..', 'modules', 'boa-car-video', 'android', 'src', 'main', 'AndroidManifest.xml'), 'utf8');
    expect(own).not.toContain('CarVideoService');
  });
});

describe('the parked-only player', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'modules', 'boa-car-video', 'android', 'src', 'main', 'java', 'expo', 'modules', 'boacarvideo', 'CarVideoActivity.kt'), 'utf8');
  test('drops the picture and switches the video track off whenever it holds', () => {
    expect(src).toMatch(/private fun dropPicture\(\) \{\n.*setPicture\(it, false\).*\n\s*view\.player = null\n/);
    expect(src).toContain('setTrackTypeDisabled(C.TRACK_TYPE_VIDEO, !on)');
  });

  test('only ever shows the picture while parked', () => {
    expect(src).toMatch(/private fun show\(\) \{[^}]*if \(!ParkedMonitor\.state\.parked\) return/s);
  });
});
